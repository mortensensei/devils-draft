import { LEAGUE as cfg } from './config.js';
import { CONTESTANTS, RULES_HTML } from './data.js';
import { A, CAST, EVENT, EVENT_TYPES, evPts, evLabel, newEpisode, compute, onClock, snakeManager, moteTally, effectiveElimPick, parseTime, fmtTime } from './engine.js';
import { createStore } from './store.js';

// ------------------------------------------------------------------ state
const S = { L: null, C: null, store: null, f: {}, pendingRender: false };
const $view = document.getElementById('view');
const MGR = Object.fromEntries(cfg.managers.map(m => [m.id, m]));
const mname = id => MGR[id]?.name || (id === 'admin' ? 'Commissioner' : id || '—');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const session = {
  get me() { const v = lsGet('dd.me'); return v && MGR[v.id]?.pinHash === v.h ? v.id : null; },
  get admin() { return lsGet('dd.admin') === cfg.adminHash; },
  get actAs() { return session.admin ? (lsGet('dd.actAs') || session.me) : session.me; },
};
const actor = () => session.actAs;

// ------------------------------------------------------------------ helpers
const avatar = (cid, cls = '') => {
  const c = CAST[cid]; if (!c) return `<span class="av ${cls} empty"></span>`;
  const out = S.C?.elim[cid] ? ' out' : '';
  return `<img class="av ${cls}${out}" src="${c.img}" alt="${esc(c.name)}" title="${esc(c.name)}" loading="lazy">`;
};
const cname = cid => esc(CAST[cid]?.name || '—');
const pts = n => `<span class="pts ${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">${n > 0 ? '+' : ''}${n}</span>`;
const bind = (key, def = '') => esc(S.f[key] ?? def);
const sel = (key, opts, def = '', placeholder = 'Choose…') =>
  `<select data-bind="${key}"><option value="">${placeholder}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${(S.f[key] ?? def) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const castOpts = ids => ids.map(id => [id, CAST[id].name]);
const inGame = () => CONTESTANTS.map(c => c.id).filter(c => !S.C.elim[c]);
const timeAgo = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(t).toLocaleDateString(); };

function toast(msg, bad = false) {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, bad ? 4200 : 2600);
}

function modal({ title, html = '', ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal-bg';
    m.innerHTML = `<form class="modal" method="dialog"><h3>${title}</h3><div class="mbody">${html}</div>
      <div class="row end">${cancel ? `<button type="button" class="btn ghost" data-x>${cancel}</button>` : ''}<button class="btn ${danger ? 'danger' : 'primary'}">${ok}</button></div></form>`;
    document.body.appendChild(m);
    const f = m.querySelector('form');
    const done = v => { m.remove(); res(v); };
    m.querySelector('[data-x]')?.addEventListener('click', () => done(null));
    m.addEventListener('click', e => e.target === m && done(null));
    f.addEventListener('submit', e => { e.preventDefault(); done(Object.fromEntries(new FormData(f))); });
    setTimeout(() => (f.querySelector('input,select') || f.querySelector('.btn.primary,.btn.danger'))?.focus(), 30);
  });
}
const confirmBox = (title, html, ok = 'Confirm', danger = false) => modal({ title, html, ok, danger });

async function act(fn, success) {
  try {
    await S.store.mutate(L => fn(L));
    if (success) toast(success);
    return true;
  } catch (e) { console.error(e); toast(e.message || 'Something went wrong.', true); return false; }
}

async function requireActor(why = 'do that') {
  if (actor()) return actor();
  await signIn(`Sign in to ${why}`);
  return actor();
}

async function signIn(title = 'Sign in') {
  const r = await modal({
    title, ok: 'Sign in',
    html: `<label>Who are you?<select name="id" required><option value="">Choose…</option>${cfg.managers.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
      <label>Your PIN<input name="pin" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxlength="8" required></label>
      <p class="muted small">Your commissioner gave you a 4-digit PIN. You only need to enter it once on this device.</p>`
  });
  if (!r) return false;
  const h = await sha(`dd|${r.id}|${r.pin.trim()}`);
  if (MGR[r.id]?.pinHash !== h) { toast('That PIN doesn’t match.', true); return false; }
  lsSet('dd.me', { id: r.id, h }); toast(`Welcome, ${mname(r.id)}!`); render(); return true;
}

// ------------------------------------------------------------------ banner / CTAs
function ctas() {
  const L = S.L, me = actor(), out = [];
  if (L.phase === 'predraft') out.push({ txt: L.draftOrder ? 'Draft order is set. The draft opens soon.' : 'The draft hasn’t started yet.', href: '#/moves', cta: 'Draft room' });
  if (L.phase === 'draft') { const oc = onClock(L); out.push({ hot: oc === me, txt: oc === me ? `You’re on the clock! Pick ${L.draftPicks.length + 1} of ${L.draftOrder.length * 2}.` : `${mname(oc)} is on the clock (pick ${L.draftPicks.length + 1} of ${L.draftOrder.length * 2}).`, href: '#/moves', cta: oc === me ? 'Make your pick' : 'Watch the draft' }); }
  if (L.phase === 'shared') { const need = me && L.santa && !L.shared[me]; out.push({ hot: need, txt: !L.santa ? 'Draft complete! Waiting for the Secret Santa draw.' : need ? `Secret Santa: choose one of ${mname(L.santa[me])}’s contestants to share.` : 'Secret Santa shared picks in progress.', href: '#/moves', cta: need ? 'Choose' : 'View' }); }
  if (!L.winnerLocked && me && !L.winnerPicks[me]) out.push({ hot: true, txt: 'Predict the season winner (+5 if you’re right).', href: '#/picks', cta: 'Predict' });
  const E = L.episodes[L.currentEp] || newEpisode(L.currentEp);
  if (L.phase === 'season' && E.status === 'open' && me && !E.picks[me]) out.push({ hot: true, txt: `Make your Episode ${L.currentEp} picks: intro time & next elimination.`, href: '#/picks', cta: 'Pick' });
  for (const [n, X] of Object.entries(L.episodes)) if (X.mote?.open && me && !X.mote.votes[me]) out.push({ hot: true, txt: `Vote for the Moment of Episode ${n}.`, href: '#/picks', cta: 'Vote' });
  if (L.trade?.open) { const t = L.trade.order[L.trade.turn]; const pend = L.proposals.filter(p => p.status === 'pending' && p.to === me).length; out.push({ hot: t === me || pend, txt: pend ? `You have ${pend} trade offer${pend > 1 ? 's' : ''} waiting.` : t === me ? 'It’s your turn in the trade window.' : `Trade window open: ${mname(t)}’s turn.`, href: '#/moves', cta: 'Trades' }); }
  return out;
}
const bannerHTML = () => ctas().map(c => `<a class="cta ${c.hot ? 'hot' : ''}" href="${c.href}"><span>${esc(c.txt)}</span><b>${c.cta} →</b></a>`).join('');

// ------------------------------------------------------------------ views
function viewStandings() {
  const { L, C } = S;
  const started = L.phase === 'season';
  const rows = C.standings.map(m => {
    const r = C.roster(m), me = m === actor();
    const team = [...r.active, ...r.eliminated].map(c => avatar(c, 'sm')).join('') + (r.shared ? `<span class="shared-ring">${avatar(r.shared, 'sm')}</span>` : '');
    return `<a class="lb-row ${me ? 'me' : ''}" href="#/team/${m}">
      <span class="rank">${started ? C.rank[m] : '·'}</span>
      <span class="who"><b>${esc(mname(m))}</b><span class="team">${team || '<span class="muted small">No roster yet</span>'}</span></span>
      <span class="total">${C.totals[m]}</span></a>`;
  }).join('');
  const lastFinal = Object.values(L.episodes).filter(e => e.status === 'final' && e.n >= cfg.scoringStartEp).sort((a, b) => b.n - a.n)[0];
  return `<div class="ctas">${bannerHTML()}</div>
  <section class="card"><div class="card-h"><h2>Standings</h2><span class="muted small">${lastFinal ? `Through Episode ${lastFinal.n}` : `Scoring starts with Episode ${cfg.scoringStartEp}`}</span></div>
  <div class="lb">${rows}</div>
  <p class="muted small legend"><span class="shared-ring inline">${avatar(CONTESTANTS[0].id, 'xs')}</span> = shared contestant · faded = eliminated</p></section>
  ${recentActivity(6)}`;
}

function recentActivity(n) {
  const items = S.L.log.slice(0, n);
  if (!items.length) return '';
  return `<section class="card"><h2>Latest</h2><ul class="feed">${items.map(i => `<li><span>${esc(i.text)}</span><time>${timeAgo(i.at)}</time></li>`).join('')}</ul></section>`;
}

function viewTeam(id) {
  const { L, C } = S; if (!MGR[id]) return notFound();
  const r = C.roster(id);
  const led = C.ledger.filter(l => l.mgr === id);
  const byEp = {}; led.forEach(l => (byEp[l.ep] ||= []).push(l));
  const card = (cid, tag) => `<a class="mini" href="#/c/${cid}">${avatar(cid)}<span><b>${cname(cid)}</b><small>${tag}${C.elim[cid] ? ` · Out (Ep ${C.elim[cid].ep})` : ''}</small></span><span class="total">${C.cidPts[cid]}</span></a>`;
  const showWinner = L.winnerLocked || id === actor();
  return `<a class="back" href="#/">← Standings</a>
  <section class="card hero-team"><h1>${esc(mname(id))}</h1><div class="big">${C.totals[id]}<small> pts</small></div><div class="muted">${L.phase === 'season' ? `Rank #${C.rank[id]} of ${cfg.managers.length}` : ''}</div></section>
  <section class="card"><h2>Roster</h2>
    ${r.active.map(c => card(c, 'Drafted')).join('') || '<p class="muted">No active contestants.</p>'}
    ${r.shared ? card(r.shared, `Shared (owned by ${esc(mname(C.owner[r.shared]) || 'free agent')})${r.sharedActive ? '' : ' · done scoring'}`) : ''}
    ${r.eliminated.map(c => card(c, 'Drafted')).join('')}
    ${showWinner && L.winnerPicks[id] ? `<p class="muted small">Season winner prediction: <b>${cname(L.winnerPicks[id])}</b></p>` : ''}
  </section>
  <section class="card"><h2>Points by episode</h2>${Object.keys(byEp).length ? Object.keys(byEp).sort((a, b) => b - a).map(e => `
    <details ${e == Math.max(...Object.keys(byEp)) ? 'open' : ''}><summary><b>Episode ${e}</b>${pts(byEp[e].reduce((s, l) => s + l.pts, 0))}</summary>
    <ul class="ledger">${byEp[e].map(l => `<li>${l.cid ? avatar(l.cid, 'xs') : '<span class="av xs icon">★</span>'}<span>${l.cid ? `<b>${cname(l.cid)}</b>${l.shared ? ' <em>(shared)</em>' : ''}: ` : ''}${esc(l.label)}</span>${pts(l.pts)}</li>`).join('')}</ul></details>`).join('') : '<p class="muted">No points yet.</p>'}</section>`;
}

// ---------------- Draft
function viewDraft() {
  const { L, C } = S, me = actor(), adm = session.admin;
  const n = cfg.managers.length, total = n * 2;
  const oc = onClock(L);
  const board = L.draftOrder ? [0, 1].map(r => `<div class="round"><div class="round-h">Round ${r + 1} ${r ? '↩' : '→'}</div>${Array.from({ length: n }, (_, k) => {
    const i = r * n + k, m = snakeManager(L.draftOrder, i), cid = L.draftPicks[i];
    return `<div class="slot ${i === L.draftPicks.length && L.phase === 'draft' ? 'clock' : ''} ${m === me ? 'mine' : ''}"><small>${i + 1}. ${esc(mname(m))}</small>${cid ? `${avatar(cid, 'sm')}<span>${cname(cid)}</span>` : `<span class="muted">${i === L.draftPicks.length && L.phase === 'draft' ? 'On the clock' : '—'}</span>`}</div>`;
  }).join('')}</div>`).join('') : '<p class="muted">The draft order hasn’t been drawn yet.</p>';

  const avail = CONTESTANTS.filter(c => !L.draftPicks.includes(c.id) && !C.elim[c.id]);
  const canPick = L.phase === 'draft' && (oc === me || adm);
  const pool = L.phase === 'draft' || L.phase === 'predraft' ? `<section class="card"><div class="card-h"><h2>Available (${avail.length})</h2>${canPick ? `<span class="pill hot">${oc === me ? 'Your pick' : `Picking for ${esc(mname(oc))}`}</span>` : ''}</div>
    <div class="grid">${avail.map(c => castCard(c.id, canPick ? `<button class="btn primary sm" data-act="draft" data-cid="${c.id}">Draft</button>` : '')).join('')}</div></section>` : '';

  let shared = '';
  if (L.phase === 'shared' || L.phase === 'season') {
    const rows = cfg.managers.map(({ id }) => {
      const drawn = L.santa?.[id];
      const theirs = drawn ? L.draftPicks.filter((c, i) => snakeManager(L.draftOrder, i) === drawn) : [];
      const chosen = L.shared[id];
      const mine = (id === me || adm) && drawn && !chosen && L.phase === 'shared';
      return `<div class="santa ${id === me ? 'mine' : ''}"><div><b>${esc(mname(id))}</b> <span class="muted">drew</span> <b>${drawn ? esc(mname(drawn)) : '?'}</b></div>
        ${chosen ? `<div class="chosen">${avatar(chosen, 'sm')} ${cname(chosen)}</div>` : mine ? `<div class="row">${theirs.map(c => `<button class="btn sm" data-act="shared" data-drawer="${id}" data-cid="${c}">${avatar(c, 'xs')} ${cname(c)}</button>`).join('')}</div>` : `<div class="muted small">${drawn ? 'Choosing…' : ''}</div>`}</div>`;
    }).join('');
    shared = `<section class="card"><div class="card-h"><h2>Secret Santa shared picks</h2></div>
      <p class="muted small">Each manager draws another manager and picks one of their two contestants. That contestant scores for both of you until they're eliminated.</p>
      ${L.santa ? rows : `<p class="muted">Waiting for the commissioner to draw pairings.</p>`}
      ${adm && L.phase === 'shared' && !L.santa ? `<button class="btn primary" data-act="drawSanta">Draw Secret Santa pairings</button>` : ''}</section>`;
  }

  const adminBar = adm ? `<section class="card admin-inline"><h3>Commissioner</h3><div class="row wrap">
    ${L.phase === 'predraft' ? `<button class="btn" data-act="randomize">${L.draftOrder ? 'Re-draw' : 'Draw'} draft order</button>${L.draftOrder ? `<button class="btn primary" data-act="startDraft">Open the draft</button>` : ''}` : ''}
    ${['draft', 'shared'].includes(L.phase) && L.draftPicks.length && !L.santa ? `<button class="btn" data-act="undoPick">Undo last pick</button>` : ''}
    ${L.santa && L.phase !== 'season' ? `<button class="btn" data-act="resetSanta">Re-draw pairings</button>` : ''}
  </div></section>` : '';

  const order = L.draftOrder ? `<div class="order">${L.draftOrder.map((m, i) => `<span class="${m === me ? 'mine' : ''}">${i + 1}. ${esc(mname(m))}</span>`).join('')}</div>` : '';
  return `<div class="ctas">${bannerHTML()}</div>
    <section class="card"><div class="card-h"><h2>Draft board</h2><span class="muted small">${L.draftPicks.length}/${total} picks · snake</span></div>${order}<div class="board">${board}</div></section>
    ${adminBar}${shared}${pool}
    ${L.phase === 'season' ? `<p class="center"><a href="#/moves">← Back to trades</a></p>` : ''}`;
}

function castCard(cid, extra = '') {
  const { C, L } = S, c = CAST[cid];
  const o = C.owner[cid], sh = C.sharedBy[cid];
  const status = C.elim[cid] ? `<span class="pill out">Out · Ep ${C.elim[cid].ep}</span>` : L.phase === 'season' && !o ? '<span class="pill fa">Free agent</span>' : '';
  return `<div class="ccard ${C.elim[cid] ? 'is-out' : ''}"><a href="#/c/${cid}"><img src="${c.img}" alt="" loading="lazy"><div class="ccap"><b>${esc(c.name)}</b><small>${esc(c.job)}</small></div></a>
    <div class="cmeta">${status}${o ? `<span class="pill">${esc(mname(o))}</span>` : ''}${sh ? `<span class="pill shared">♦ ${esc(mname(sh))}</span>` : ''}${L.phase === 'season' ? `<span class="cp">${C.cidPts[cid]} pt${C.cidPts[cid] === 1 ? '' : 's'}</span>` : ''}</div>${extra ? `<div class="cact">${extra}</div>` : ''}</div>`;
}

// ---------------- Trades
function viewTrades() {
  const { L, C } = S, me = actor(), adm = session.admin, T = L.trade;
  const finals = Object.values(L.episodes).filter(e => e.status === 'final').map(e => e.n);
  const lastFinal = Math.max(1, ...finals);
  const nextWin = cfg.tradeWindows.find(w => w > lastFinal) ?? cfg.tradeWindows.find(w => w >= lastFinal);
  let body = '';
  if (!T?.open) {
    body = `<section class="card"><h2>Trades & free agents</h2><p>${nextWin ? `The next trade window opens after <b>Episode ${nextWin}</b>.` : 'No trade windows left this season.'} Windows: after Episodes ${cfg.tradeWindows.join(', ')}.</p>
      ${adm && lastFinal >= cfg.scoringStartEp ? `<div class="row"><button class="btn ${cfg.tradeWindows.includes(lastFinal) ? 'primary' : ''}" data-act="openTrade" data-ep="${lastFinal}">Open trade window (after Ep ${lastFinal})</button></div>` : ''}</section>`;
  } else {
    const turn = T.order[T.turn], myTurn = me === turn, used = T.used[turn] || {};
    const actingFor = adm && !myTurn ? turn : (myTurn ? me : null);
    const order = `<ol class="turns">${T.order.map((m, i) => `<li class="${i < T.turn ? 'done' : i === T.turn ? 'now' : ''}">${esc(mname(m))} <small>${C.totals[m]} pts</small></li>`).join('')}</ol>`;
    let tools = '';
    if (actingFor) {
      const a = actingFor, ra = C.roster(a);
      const others = cfg.managers.map(m => m.id).filter(x => x !== a);
      const to = S.f.tTo || '';
      const rb = to ? C.roster(to) : null;
      const chk = (side, cid) => `<label class="chk"><input type="checkbox" data-tb="${side}" value="${cid}" ${(S.f['tb_' + side] || []).includes(cid) ? 'checked' : ''}>${avatar(cid, 'xs')} ${cname(cid)}</label>`;
      const fa = C.freeAgents.filter(c => c !== L.shared[a]);
      tools = `<section class="card"><div class="card-h"><h2>${a === me ? 'Your turn' : `Acting for ${esc(mname(a))}`}</h2></div>
        <h3>Propose a trade</h3>
        <label>Trade with ${sel('tTo', others.map(o => [o, mname(o)]))}</label>
        ${to ? `<div class="tb"><div><h4>You give</h4>${ra.active.map(c => chk('give', c)).join('') || '<p class="muted small">No active contestants</p>'}</div>
          <div><h4>You get</h4>${rb.active.map(c => chk('get', c)).join('') || '<p class="muted small">No active contestants</p>'}</div></div>
          <button class="btn primary" data-act="propose" data-from="${a}">Send offer to ${esc(mname(to))}</button>` : ''}
        <h3>Free agents</h3>
        ${fa.length ? `${!used.swap && ra.active.length ? `<div class="row wrap">Swap ${sel('swOut', castOpts(ra.active))} for ${sel('swIn', castOpts(fa))}<button class="btn" data-act="faSwap" data-mgr="${a}">Swap</button></div>` : used.swap ? '<p class="muted small">Free-agent swap used this window.</p>' : ''}
          ${ra.eliminated.length && ra.active.length < 2 && !used.add ? `<div class="row wrap">Draft a free agent ${sel('faIn', castOpts(fa))}<button class="btn" data-act="faAdd" data-mgr="${a}">Add to roster</button></div>` : ''}` : '<p class="muted">The free agent pool is empty.</p>'}
        <div class="row end"><button class="btn ghost" data-act="endTurn" data-mgr="${a}">I’m done, end my turn</button></div></section>`;
    }
    const pend = L.proposals.filter(p => p.status === 'pending');
    const offers = pend.length ? `<section class="card"><h2>Open offers</h2>${pend.map(p => `<div class="offer">
      <div><b>${esc(mname(p.from))}</b> gives ${p.give.map(c => `${avatar(c, 'xs')} ${cname(c)}`).join(' + ') || 'nothing'}<br><b>${esc(mname(p.to))}</b> gives ${p.get.map(c => `${avatar(c, 'xs')} ${cname(c)}`).join(' + ') || 'nothing'}</div>
      <div class="row">${me === p.to || adm ? `<button class="btn primary sm" data-act="respond" data-id="${p.id}" data-yes="1" data-as="${p.to}">Accept${me !== p.to ? ` for ${esc(mname(p.to))}` : ''}</button><button class="btn sm" data-act="respond" data-id="${p.id}" data-as="${p.to}">Decline</button>` : ''}
      ${me === p.from ? `<button class="btn ghost sm" data-act="respond" data-id="${p.id}" data-as="${p.from}">Withdraw</button>` : ''}</div></div>`).join('')}</section>` : '';
    body = `<section class="card"><div class="card-h"><h2>Trade window</h2><span class="pill hot">After Episode ${T.afterEp}</span></div>
      <p class="muted small">Lowest score goes first. On your turn: propose trades (the other manager must accept), swap one contestant for a free agent, or draft a free agent if one of yours was eliminated. New players score from Episode ${T.afterEp + 1}.</p>${order}
      ${adm ? `<div class="row wrap"><button class="btn sm" data-act="endTurn">Skip ${esc(mname(turn))}</button><button class="btn sm danger" data-act="closeTrade">Close window</button></div>` : ''}</section>${offers}${tools}`;
  }
  const fa = C.freeAgents;
  return `<div class="ctas">${bannerHTML()}</div>${body}
    <section class="card"><h2>Free agents (${fa.length})</h2>${fa.length ? `<div class="grid">${fa.map(c => castCard(c)).join('')}</div>` : '<p class="muted">None left.</p>'}</section>
    ${txnHistory()}
    <p class="center"><a href="#/draft">View draft board & shared picks →</a></p>`;
}

function txnHistory() {
  const { L } = S; if (!L.txns.length) return '';
  const adm = session.admin;
  const d = t => t.kind === 'trade' ? `<b>${esc(mname(t.a))}</b> traded ${t.aGives.map(cname).join(' + ') || 'nothing'} to <b>${esc(mname(t.b))}</b> for ${t.bGives.map(cname).join(' + ') || 'nothing'}`
    : t.kind === 'fa_swap' ? `<b>${esc(mname(t.mgr))}</b> swapped ${cname(t.out)} for free agent ${cname(t.in)}` : `<b>${esc(mname(t.mgr))}</b> picked up free agent ${cname(t.in)}`;
  return `<section class="card"><h2>Roster moves</h2><ul class="feed">${[...L.txns].reverse().map((t, i) => `<li><span>${d(t)} <small class="muted">(after Ep ${t.afterEp})</small></span>${adm && i === 0 ? `<button class="btn ghost sm" data-act="undoTxn" data-id="${t.id}">Undo</button>` : ''}</li>`).join('')}</ul></section>`;
}

// ---------------- Picks
function viewPicks() {
  const { L, C } = S, me = actor(), adm = session.admin;
  const n = L.currentEp, E = L.episodes[n] || newEpisode(n);
  const who = me ? `<p class="muted small">${adm && me !== session.me ? `Entering picks for <b>${esc(mname(me))}</b> (change in Admin).` : `Signed in as <b>${esc(mname(me))}</b>.`}</p>` : `<p><button class="btn primary" data-act="signin">Sign in to make picks</button></p>`;
  const status = (map, revealed, fmt) => `<ul class="subs">${cfg.managers.map(({ id }) => `<li class="${map[id] ? 'ok' : ''}"><span>${esc(mname(id))}</span><span>${map[id] ? (revealed ? fmt(map[id], id) : '✓ submitted') : '—'}</span></li>`).join('')}</ul>`;

  // Episode picks
  let epCard = '';
  if (L.phase !== 'season') {
    epCard = `<section class="card"><h2>Episode ${n} picks</h2><p class="muted">Episode picks open once the draft and shared picks are done.</p></section>`;
  } else if (E) {
    const mine = me ? E.picks[me] : null, open = E.status === 'open';
    const carry = me && !mine?.elim ? effectiveElimPick(L, me, n - 1, cfg.scoringStartEp) : null;
    const fk = `ep${n}_${me}_`;
    epCard = `<section class="card"><div class="card-h"><h2>Episode ${n} picks</h2><span class="pill ${open ? 'hot' : ''}">${open ? 'Open' : 'Locked'}</span></div>
      ${open && me ? `<div class="form">
        <label>Guess the intro time <span class="muted small">(timestamp, e.g. 14:05) · closest wins +1</span><input data-bind="${fk}intro" value="${bind(fk + 'intro', mine?.intro || '')}" placeholder="mm:ss" inputmode="numeric"></label>
        <label>Who goes home next? <span class="muted small">+3 if right</span>${sel(fk + 'elim', castOpts(inGame()), mine?.elim || '', carry ? `Keep ${CAST[carry]?.name} (carried over)` : 'Choose…')}</label>
        <button class="btn primary" data-act="savePicks" data-ep="${n}">${mine ? 'Update picks' : 'Submit picks'}</button>
        ${mine ? `<p class="ok small">✓ Saved: intro ${esc(mine.intro || '—')}, elimination ${mine.elim ? cname(mine.elim) : carry ? `${cname(carry)} (carried)` : '—'}. Picks stay hidden until they lock.</p>` : ''}</div>` : open ? who : ''}
      <h4>${open ? 'Who’s in' : 'Everyone’s picks'}</h4>
      ${status(E.picks, !open, p => `${esc(p.intro || '—')} · ${p.elim ? cname(p.elim) : '<span class="muted">carry</span>'}`)}</section>`;
  }

  // Moment of the Episode
  const motes = Object.values(L.episodes).filter(X => X.mote && (X.mote.open || (X.mote.closed && X.n >= L.currentEp - 1))).sort((a, b) => b.n - a.n);
  const moteCards = motes.map(X => {
    const M = X.mote, tally = moteTally(M), my = me ? M.votes[me] : null;
    return `<section class="card"><div class="card-h"><h2>Moment of Episode ${X.n}</h2><span class="pill ${M.open ? 'hot' : ''}">${M.open ? `Voting · ${Object.keys(M.votes).length}/${cfg.managers.length}` : 'Closed'}</span></div>
      <div class="noms">${M.nominees.map(nm => `<button class="nom ${my === nm.id ? 'picked' : ''} ${M.winner === nm.id ? 'winner' : ''}" ${M.open && me ? `data-act="vote" data-ep="${X.n}" data-id="${nm.id}"` : 'disabled'}>
        ${nm.cid ? avatar(nm.cid, 'xs') : ''}<span>${esc(nm.text)}${nm.by !== 'admin' ? ` <small class="muted">(added by ${esc(mname(nm.by))})</small>` : ''}</span>${M.closed ? `<b>${tally[nm.id] || 0}</b>` : my === nm.id ? '<b>✓</b>' : ''}</button>`).join('') || '<p class="muted">No nominees yet.</p>'}</div>
      ${M.open && me ? `<details><summary>Missing a moment? Add one</summary><div class="form">${`<input data-bind="nom${X.n}" value="${bind('nom' + X.n)}" placeholder="Describe the moment">`}${sel('nomc' + X.n, castOpts(CONTESTANTS.map(c => c.id)), '', 'Contestant (optional)')}<button class="btn" data-act="addNom" data-ep="${X.n}">Add nominee</button></div></details>` : ''}
      ${M.closed && M.winner ? `<p class="ok small">Winner: ${esc(M.nominees.find(x => x.id === M.winner)?.text)}${M.nominees.find(x => x.id === M.winner)?.cid ? ` (+3 to ${cname(M.nominees.find(x => x.id === M.winner).cid)})` : ''}</p>` : ''}</section>`;
  }).join('');

  // Winner prediction
  const wp = me ? L.winnerPicks[me] : null;
  const winCard = `<section class="card"><div class="card-h"><h2>Season winner prediction</h2><span class="pill ${L.winnerLocked ? '' : 'hot'}">${L.winnerLocked ? 'Locked' : 'Open'}</span></div>
    <p class="muted small">+5 if your pick wins the season. Picks stay hidden until the commissioner locks them.</p>
    ${!L.winnerLocked && me ? `<div class="form">${sel('winner_' + me, castOpts(inGame()), wp || '')}<button class="btn primary" data-act="saveWinner">${wp ? 'Update' : 'Submit'} prediction</button>${wp ? `<p class="ok small">✓ Your pick: ${cname(wp)}</p>` : ''}</div>` : !me ? who : ''}
    ${status(L.winnerPicks, L.winnerLocked, c => `${avatar(c, 'xs')} ${cname(c)}`)}</section>`;
  return `${me ? who : ''}${!me ? `<section class="card">${who}</section>` : ''}${moteCards}${epCard}${winCard}`;
}

// ---------------- Cast
function viewCast() {
  const { C, L } = S;
  const filter = S.f.castFilter || 'all';
  const list = CONTESTANTS.filter(c => filter === 'all' || (filter === 'in' ? !C.elim[c.id] : filter === 'fa' ? !C.owner[c.id] && !C.elim[c.id] : C.elim[c.id]));
  const sorted = L.phase === 'season' ? [...list].sort((a, b) => !!C.elim[a.id] - !!C.elim[b.id] || C.cidPts[b.id] - C.cidPts[a.id]) : list;
  const tabs = [['all', 'All'], ['in', 'Still in'], ['fa', 'Free agents'], ['out', 'Eliminated']];
  return `<section class="card"><div class="card-h"><h2>The players</h2><span class="muted small">${CONTESTANTS.length - Object.keys(C.elim).length} still in the game</span></div>
    <div class="seg">${tabs.map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-act="castFilter" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="grid">${sorted.map(c => castCard(c.id)).join('') || '<p class="muted">Nobody here.</p>'}</div></section>`;
}

function viewContestant(cid) {
  const { C, L } = S, c = CAST[cid]; if (!c) return notFound();
  const tl = (C.timeline[cid] || []).map(t => `<li>${t.mgr ? `<b>${esc(mname(t.mgr))}</b>` : 'Free agent pool'} <span class="muted">from Ep ${t.from}</span></li>`).join('');
  const byEp = {}; C.cidLog[cid].forEach(l => (byEp[l.ep] ||= []).push(l));
  return `<a class="back" href="#/cast">← Players</a>
  <section class="card profile"><img src="${c.img}" alt="" class="${C.elim[cid] ? 'out' : ''}"><div><h1>${esc(c.name)}</h1><p class="muted">${esc(c.job)}</p>
    <div class="cmeta">${C.elim[cid] ? `<span class="pill out">Eliminated · Ep ${C.elim[cid].ep}</span>` : '<span class="pill">Still in</span>'}${C.owner[cid] ? `<span class="pill">Managed by ${esc(mname(C.owner[cid]))}</span>` : L.phase === 'season' && !C.elim[cid] ? '<span class="pill fa">Free agent</span>' : ''}${C.sharedBy[cid] ? `<span class="pill shared">♦ Shared by ${esc(mname(C.sharedBy[cid]))}</span>` : ''}</div>
    <div class="big">${C.cidPts[cid]}<small> pts</small></div></div></section>
  <section class="card"><h2>About</h2><ul class="facts">${c.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></section>
  <section class="card"><h2>Scoring</h2>${Object.keys(byEp).length ? Object.keys(byEp).sort((a, b) => b - a).map(e => `<div class="ep-pts"><b>Ep ${e}</b><ul class="ledger">${byEp[e].map(l => `<li><span>${esc(l.label)}</span>${pts(l.pts)}</li>`).join('')}</ul></div>`).join('') : '<p class="muted">No points yet.</p>'}</section>
  ${tl ? `<section class="card"><h2>Ownership</h2><ul class="feed">${tl}</ul></section>` : ''}`;
}

// ---------------- Episodes
function viewEpisodes() {
  const { L, C } = S;
  const eps = Object.values(L.episodes).sort((a, b) => b.n - a.n);
  return `<a class="back" href="#/more">← More</a>` + eps.map(E => {
    const final = E.status === 'final';
    const mgrPts = {}; C.ledger.filter(l => l.ep === E.n).forEach(l => mgrPts[l.mgr] = (mgrPts[l.mgr] || 0) + l.pts);
    const introWinners = C.ledger.filter(l => l.ep === E.n && l.label.startsWith('Closest intro')).map(l => mname(l.mgr));
    const mw = E.mote?.winner && E.mote.nominees.find(x => x.id === E.mote.winner);
    const evs = {}; (E.events || []).forEach(ev => (evs[ev.cid] ||= []).push(ev));
    return `<section class="card"><div class="card-h"><h2>Episode ${E.n}</h2><span class="pill ${final ? '' : 'hot'}">${final ? (E.n < cfg.scoringStartEp ? 'Pre-draft' : 'Final') : E.status === 'locked' ? 'Picks locked' : 'Upcoming'}</span></div>
      ${final ? `
      ${E.eliminated.length ? `<p><b>Eliminated:</b> ${E.eliminated.map(c => `${avatar(c, 'xs')} ${cname(c)}`).join(', ')}</p>` : E.n >= cfg.scoringStartEp ? '<p class="muted">No elimination.</p>' : ''}
      ${E.returned?.length ? `<p><b>Returned:</b> ${E.returned.map(cname).join(', ')}</p>` : ''}
      ${E.introActual ? `<p><b>Intro at</b> ${esc(E.introActual)}${introWinners.length ? ` · closest: ${introWinners.map(esc).join(', ')}` : ''}</p>` : ''}
      ${mw ? `<p><b>Moment of the Episode:</b> ${esc(mw.text)}</p>` : ''}
      ${Object.keys(evs).length ? `<ul class="ledger">${Object.entries(evs).map(([cid, list]) => list.map(ev => `<li>${avatar(cid, 'xs')}<span><b>${cname(cid)}</b>: ${esc(evLabel(ev))}${ev.note ? ` <small class="muted">(${esc(ev.note)})</small>` : ''}</span>${pts(evPts(ev))}</li>`).join('')).join('')}</ul>` : ''}
      ${E.n >= cfg.scoringStartEp ? `<div class="epm">${cfg.managers.map(({ id }) => `<span><b>${esc(mname(id))}</b> ${pts(mgrPts[id] || 0)}</span>`).join('')}</div>` : ''}` : '<p class="muted">Results will appear here once the commissioner publishes them.</p>'}</section>`;
  }).join('');
}

// ---------------- League / rules
function viewLeague() {
  const { L } = S;
  return `<a class="back" href="#/more">← More</a>
  <section class="card"><h2>Activity log</h2>${L.log.length ? `<ul class="feed">${L.log.slice(0, 60).map(i => `<li><span>${esc(i.text)}</span><time>${timeAgo(i.at)}</time></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}</section>
  ${txnHistory()}
  <section class="card rules"><h2>Rules</h2>${RULES_HTML}</section>`;
}

function viewMore() {
  const me = session.me;
  return `<section class="card"><h2>More</h2><nav class="menu">
    <a href="#/episodes">📺 Episodes & results</a>
    <a href="#/draft">🗂 Draft board & shared picks</a>
    <a href="#/league">📜 Rules & activity</a>
    <a href="#/admin">🔐 Commissioner</a></nav></section>
  <section class="card"><h2>You</h2>${me ? `<p>Signed in as <b>${esc(mname(me))}</b>.</p><button class="btn" data-act="signout">Sign out</button>` : `<button class="btn primary" data-act="signin">Sign in</button>`}
  <p class="muted small">Tip: add this page to your home screen so it opens like an app. In Safari, tap Share → Add to Home Screen. In Chrome, open the ⋮ menu → Add to Home screen.</p></section>
  ${S.store.demo ? `<section class="card warn"><h2>Demo mode</h2><p class="small">No database is connected, so everything is saved only in this browser. See SETUP.md to connect Firebase.</p></section>` : ''}`;
}

// ---------------- Admin
function viewAdmin() {
  const { L, C } = S;
  if (!session.admin) return `<section class="card"><h2>Commissioner login</h2><div class="form"><input type="password" data-bind="adminPw" placeholder="Admin password" autocomplete="current-password"><button class="btn primary" data-act="adminLogin">Log in</button></div></section>`;
  const n = Number(S.f.admEp || L.currentEp);
  const E = L.episodes[n] || { n, status: 'open', picks: {}, events: [], eliminated: [], returned: [], mote: { nominees: [], votes: {} }, introActual: '' };
  const epOpts = [...new Set([...Object.keys(L.episodes).map(Number), L.currentEp])].sort((a, b) => a - b);
  // Preview of this episode's points if published
  const prevL = JSON.parse(JSON.stringify(L)); prevL.episodes[n] = { ...E, status: 'final' };
  const PC = compute(prevL, cfg);
  const prev = {}; PC.ledger.filter(l => l.ep === n).forEach(l => prev[l.mgr] = (prev[l.mgr] || 0) + l.pts);
  const elimCands = CONTESTANTS.map(c => c.id).filter(c => !C.elim[c] || C.elim[c].ep === n);
  const retCands = CONTESTANTS.map(c => c.id).filter(c => (C.elim[c] && C.elim[c].ep < n) || E.returned.includes(c));
  const tally = moteTally(E.mote);
  const groups = [...new Set(EVENT_TYPES.map(e => e.group))];
  return `<section class="card admin-head"><div class="card-h"><h2>Commissioner</h2><button class="btn ghost sm" data-act="adminLogout">Log out</button></div>
    <label>Act as manager <span class="muted small">(enter picks, votes, draft picks or trade replies for someone)</span>${sel('actAsSel', cfg.managers.map(m => [m.id, m.name]), lsGet('dd.actAs') || session.me || '', 'Myself / nobody')}</label></section>

  <section class="card"><div class="card-h"><h2>Episode</h2>${sel('admEp', epOpts.map(e => [String(e), `Episode ${e}`]), String(n), 'Episode…')}</div>
    <p>Status: <span class="pill hot">${E.status}</span>${n < cfg.scoringStartEp ? ' <span class="muted small">(before the draft: only record eliminations)</span>' : ''}</p>
    <div class="row wrap">
      ${E.status === 'open' ? `<button class="btn" data-act="epStatus" data-s="locked">1 · Lock picks</button>` : ''}
      ${E.status !== 'final' ? `<button class="btn primary" data-act="epStatus" data-s="final">Publish results</button>` : `<button class="btn" data-act="reopenEp">Reopen for edits</button>`}
    </div>
    <h3>Picks</h3>${E.status === 'open' && n === L.currentEp ? `<p class="muted small">Picks are hidden until you lock them (you're playing too!). Submitted: ${Object.keys(E.picks || {}).map(mname).join(', ') || 'nobody yet'}.</p>` : `<ul class="subs">${cfg.managers.map(({ id }) => { const p = E.picks?.[id]; const eff = effectiveElimPick(L, id, n, cfg.scoringStartEp); return `<li><span>${esc(mname(id))}${p?.editedAt ? ' <small class="muted">(corrected)</small>' : ''}</span><span>${p ? esc(p.intro || '—') : '—'} · ${eff ? cname(eff) + (p?.elim ? '' : ' <small class="muted">(carried)</small>') : '—'}<button class="btn ghost sm" data-act="editPick" data-mgr="${id}">Edit</button></span></li>`; }).join('')}</ul>`}
    <h3>Intro time</h3><div class="row"><input data-bind="intro${n}" value="${bind('intro' + n, E.introActual)}" placeholder="mm:ss"><button class="btn" data-act="setIntro">Save</button></div>
    <h3>Eliminated this episode</h3><div class="chips">${elimCands.map(c => `<button class="chip ${E.eliminated.includes(c) ? 'on' : ''}" data-act="toggleElim" data-cid="${c}">${avatar(c, 'xs')} ${cname(c)}</button>`).join('')}</div>
    ${retCands.length ? `<details><summary>Comebacks</summary><div class="chips">${retCands.map(c => `<button class="chip ${E.returned.includes(c) ? 'on' : ''}" data-act="toggleRet" data-cid="${c}">${cname(c)}</button>`).join('')}</div></details>` : ''}
    <h3>Scoring events</h3>
    <div class="form evform">${sel('evC', castOpts(CONTESTANTS.map(c => c.id)), '', 'Contestant…')}
      <select data-bind="evT"><option value="">Event…</option>${groups.map(g => `<optgroup label="${g}">${EVENT_TYPES.filter(e => e.group === g).map(e => `<option value="${e.key}" ${S.f.evT === e.key ? 'selected' : ''}>${e.pts > 0 ? '+' : ''}${e.pts} · ${esc(e.label)}</option>`).join('')}</optgroup>`).join('')}</select>
      <label class="qty">How many? <input type="number" min="1" max="99" step="1" inputmode="numeric" data-bind="evQ" value="${bind('evQ', '1')}"></label>
      <input data-bind="evN" value="${bind('evN')}" placeholder="Note (optional)"><button class="btn primary" data-act="addEvent">Add event</button></div>
    <p class="muted small">“How many?” multiplies the points: 3 pieces = +3. Leave it at 1 for most events.</p>
    <ul class="ledger">${E.events.map(ev => `<li>${avatar(ev.cid, 'xs')}<span><b>${cname(ev.cid)}</b>: ${esc(evLabel(ev))}${ev.note ? ` (${esc(ev.note)})` : ''}</span>${pts(evPts(ev))}<button class="x" data-act="rmEvent" data-id="${ev.id}">✕</button></li>`).join('') || '<li class="muted">No events yet. “Survived the episode” (+1) is added automatically.</li>'}</ul>
    <h3>Moment of the Episode</h3>
    <div class="form"><input data-bind="anom" value="${bind('anom')}" placeholder="Nominee description">${sel('anomc', castOpts(CONTESTANTS.map(c => c.id)), '', 'Contestant (gets +3)')}<button class="btn" data-act="adminNom">Add nominee</button></div>
    <ul class="ledger">${E.mote.nominees.map(x => `<li>${x.cid ? avatar(x.cid, 'xs') : ''}<span>${esc(x.text)} <small class="muted">${x.by !== 'admin' ? `by ${esc(mname(x.by))}` : ''}</small></span><b>${tally[x.id] || 0} votes</b>${E.mote.winner === x.id ? '<span class="pill hot">Winner</span>' : `<button class="btn ghost sm" data-act="moteWin" data-id="${x.id}">Make winner</button>`}<button class="x" data-act="rmNom" data-id="${x.id}">✕</button></li>`).join('')}</ul>
    <div class="row wrap">${!E.mote.open ? `<button class="btn" data-act="moteOpen" data-v="1" ${E.mote.nominees.length ? '' : 'disabled'}>Open voting</button>` : `<button class="btn primary" data-act="moteClose">Close voting (random tiebreak)</button>`}
      <span class="muted small">Voted: ${Object.keys(E.mote.votes).map(mname).join(', ') || 'nobody yet'}</span></div>
    ${n >= cfg.scoringStartEp ? `<h3>Points preview ${E.status === 'final' ? '' : '(if published now)'}</h3><div class="epm">${cfg.managers.map(({ id }) => `<span><b>${esc(mname(id))}</b> ${pts(prev[id] || 0)}</span>`).join('')}</div>` : ''}
  </section>

  <section class="card"><h2>Season winner predictions</h2>${Object.keys(L.winnerPicks).length}/${cfg.managers.length} submitted.
    <div class="row"><button class="btn" data-act="lockWinner" data-v="${L.winnerLocked ? '' : '1'}">${L.winnerLocked ? 'Reopen predictions' : 'Lock & reveal predictions'}</button></div></section>

  <section class="card"><h2>Draft & trades</h2><div class="row wrap"><a class="btn" href="#/draft">Draft room</a><a class="btn" href="#/moves">Trade window</a></div></section>

  <section class="card"><h2>Import episode results</h2><p class="muted small">Paste results JSON (Claude can write this for you). Event types: ${EVENT_TYPES.map(e => `<code>${e.key}</code>`).join(' ')}</p>
    <textarea data-bind="importJson" rows="6" placeholder='{"episode": 2, "introActual": "14:05", "eliminated": ["Shindong"], "events": [{"contestant": "Yurisa", "type": "main_win"}, {"contestant": "Yurisa", "type": "piece", "count": 3}], "nominees": [{"text": "…", "contestant": "Yurisa"}]}'>${bind('importJson')}</textarea>
    <button class="btn" data-act="import">Import (doesn't publish)</button></section>

  <section class="card"><h2>Backup & tools</h2><div class="row wrap"><button class="btn" data-act="backup">Download backup</button><label class="btn">Restore backup<input type="file" accept=".json" data-act-file="restore" hidden></label></div>
    <h3>Make a PIN or password hash</h3><p class="muted small">To change a PIN or the admin password, generate a hash here and paste it into <code>js/config.js</code>.</p>
    <div class="form">${sel('hashWho', [...cfg.managers.map(m => [m.id, m.name]), ['admin', 'Admin password']], '', 'For…')}<input data-bind="hashVal" value="${bind('hashVal')}" placeholder="New PIN / password"><button class="btn" data-act="makeHash">Generate</button></div>
    ${S.f.hashOut ? `<p><code class="wrap">${esc(S.f.hashOut)}</code></p>` : ''}
    <h3>Danger zone</h3><div class="row wrap"><button class="btn danger" data-act="resetDraft">Reset draft</button><button class="btn danger" data-act="resetAll">Reset entire league</button></div></section>`;
}

const notFound = () => `<section class="card"><h2>Not found</h2><a href="#/">Go home</a></section>`;

// ------------------------------------------------------------------ router / render
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  return { a: a || '', b };
}
function render() {
  if (!S.L) return;
  S.C = compute(S.L, cfg);
  const { a, b } = route();
  const movesLabel = S.L.phase === 'season' ? 'Trades' : 'Draft';
  document.querySelectorAll('[data-nav]').forEach(el => {
    const k = el.dataset.nav;
    el.classList.toggle('on', k === a || (k === '' && a === 'team') || (k === 'more' && ['episodes', 'league', 'admin'].includes(a)) || (k === 'cast' && a === 'c') || (k === 'moves' && a === 'draft'));
    if (k === 'moves') el.querySelector('span').textContent = movesLabel;
  });
  const me = session.me;
  document.getElementById('who').innerHTML = me ? `<button class="chip-me" data-act="whoami">${esc(mname(me))}${session.admin ? ' ★' : ''}</button>` : `<button class="chip-me" data-act="signin">Sign in</button>`;
  const asOther = session.admin && actor() && actor() !== me;
  document.getElementById('actas').innerHTML = asOther ? `Commissioner mode: acting as <b>${esc(mname(actor()))}</b> <button data-act="clearActAs">stop</button>` : '';
  document.getElementById('actas').hidden = !asOther;
  const views = { '': viewStandings, team: () => viewTeam(b), moves: () => (S.L.phase === 'season' ? viewTrades() : viewDraft()), draft: viewDraft, picks: viewPicks, cast: viewCast, c: () => viewContestant(b), episodes: viewEpisodes, league: viewLeague, more: viewMore, admin: viewAdmin };
  const y = window.scrollY;
  $view.innerHTML = (views[a] || notFound)();
  if (S.lastRoute === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  S.lastRoute = location.hash;
}
function safeRender() {
  const ae = document.activeElement;
  if (ae && $view.contains(ae) && /INPUT|TEXTAREA/.test(ae.tagName) && ae.type !== 'checkbox') { S.pendingRender = true; return; }
  render();
}
$view.addEventListener('focusout', () => { if (S.pendingRender) { S.pendingRender = false; setTimeout(render, 0); } });

// ------------------------------------------------------------------ events
document.addEventListener('input', e => {
  const k = e.target.dataset?.bind; if (k) S.f[k] = e.target.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset?.bind) {
    S.f[t.dataset.bind] = t.value;
    if (t.dataset.bind === 'tTo') { S.f.tb_give = []; S.f.tb_get = []; render(); }
    if (t.dataset.bind === 'admEp') render();
    if (t.dataset.bind === 'actAsSel') { lsSet('dd.actAs', t.value || null); render(); }
  }
  if (t.dataset?.tb) {
    const key = 'tb_' + t.dataset.tb, set = new Set(S.f[key] || []);
    t.checked ? set.add(t.value) : set.delete(t.value); S.f[key] = [...set];
  }
  if (t.dataset?.actFile === 'restore' && t.files[0]) restore(t.files[0]);
});

const handlers = {
  async signin() { await signIn(); },
  async signout() { lsSet('dd.me', null); lsSet('dd.admin', null); lsSet('dd.actAs', null); toast('Signed out.'); render(); },
  async whoami() { location.hash = '#/team/' + session.me; },
  clearActAs() { lsSet('dd.actAs', null); render(); },
  castFilter(d) { S.f.castFilter = d.k; render(); },
  // draft
  randomize() { return act(L => A.randomizeOrder(L, cfg), 'Draft order drawn.'); },
  async startDraft() { if (await confirmBox('Open the draft?', '<p>The draft order locks and the first manager goes on the clock.</p>', 'Open draft')) act(L => A.startDraft(L, cfg), 'The draft is open!'); },
  async draft(d) {
    const oc = onClock(S.L);
    const who = actor() === oc ? oc : session.admin ? oc : await requireActor('draft');
    if (!who) return;
    if (await confirmBox(`Draft ${CAST[d.cid].name}?`, `<div class="center">${avatar(d.cid, 'lg')}<p>${who !== actor() ? `Picking for <b>${esc(mname(who))}</b>. ` : ''}This can't be undone (except by the commissioner).</p></div>`, 'Draft'))
      act(L => A.draftPick(L, cfg, who, d.cid), `${CAST[d.cid].name} drafted!`);
  },
  async undoPick() { if (await confirmBox('Undo the last pick?', '', 'Undo', true)) act(L => A.undoDraftPick(L, cfg), 'Pick undone.'); },
  async drawSanta() { if (await confirmBox('Draw Secret Santa pairings?', '<p>Each manager randomly draws another manager. Nobody is drawn twice.</p>', 'Draw')) act(L => A.drawSanta(L, cfg), 'Pairings drawn!'); },
  async resetSanta() { if (await confirmBox('Re-draw pairings?', '<p>This clears all shared picks.</p>', 'Re-draw', true)) act(L => A.resetSanta(L, cfg), 'Pairings cleared.'); },
  async shared(d) {
    if (await confirmBox(`Share ${CAST[d.cid].name}?`, `<div class="center">${avatar(d.cid, 'lg')}<p>${CAST[d.cid].name} will score for ${esc(mname(d.drawer))} until they’re eliminated.</p></div>`, 'Choose'))
      act(L => A.pickShared(L, cfg, d.drawer, d.cid), 'Shared contestant chosen.');
  },
  // picks
  async savePicks(d) {
    const me = await requireActor('make picks'); if (!me) return;
    const n = Number(d.ep), k = `ep${n}_${me}_`, cur = S.L.episodes[n]?.picks?.[me] || {};
    const intro = (S.f[k + 'intro'] ?? cur.intro ?? '').trim(), elim = S.f[k + 'elim'] ?? cur.elim ?? '';
    act(L => A.setEpPick(L, cfg, me, n, { intro, elim }), 'Picks saved.');
  },
  async saveWinner() {
    const me = await requireActor('predict'); if (!me) return;
    const cid = S.f['winner_' + me] ?? S.L.winnerPicks[me];
    if (!cid) return toast('Choose a contestant.', true);
    act(L => A.setWinnerPick(L, cfg, me, cid), 'Prediction saved.');
  },
  async vote(d) { const me = await requireActor('vote'); if (me) act(L => A.vote(L, cfg, Number(d.ep), me, d.id), 'Vote saved.'); },
  async addNom(d) {
    const me = await requireActor('nominate'); if (!me) return;
    const n = d.ep; if (await act(L => A.addNominee(L, cfg, Number(n), me, S.f['nom' + n], S.f['nomc' + n]), 'Nominee added.')) { S.f['nom' + n] = ''; render(); }
  },
  // trades
  openTrade(d) { return confirmBox(`Open the trade window after Episode ${d.ep}?`, '<p>Turn order is set by score, lowest first.</p>', 'Open').then(ok => ok && act(L => A.openTrade(L, cfg, Number(d.ep)), 'Trade window open.')); },
  closeTrade() { return confirmBox('Close the trade window?', '<p>Pending offers expire.</p>', 'Close', true).then(ok => ok && act(L => A.closeTrade(L, cfg), 'Window closed.')); },
  async endTurn(d) { if (await confirmBox(d.mgr ? 'End your turn?' : 'Skip this manager?', '<p>Any offers you sent that are still pending will expire.</p>', 'End turn')) act(L => A.endTurn(L, cfg, d.mgr), 'Turn ended.'); },
  async propose(d) {
    const give = S.f.tb_give || [], get = S.f.tb_get || [];
    if (await act(L => A.propose(L, cfg, d.from, S.f.tTo, give, get), 'Offer sent.')) { S.f.tb_give = []; S.f.tb_get = []; render(); }
  },
  async respond(d) {
    const yes = !!d.yes;
    if (yes && !(await confirmBox('Accept this trade?', '<p>The players switch teams starting next episode. Points already earned stay put.</p>', 'Accept'))) return;
    act(L => A.respond(L, cfg, d.id, session.admin ? null : actor(), yes), yes ? 'Trade complete!' : 'Done.');
  },
  async faSwap(d) {
    const out = S.f.swOut, inn = S.f.swIn; if (!out || !inn) return toast('Choose both contestants.', true);
    if (await confirmBox('Swap for a free agent?', `<p>${cname(out)} goes to the free agent pool and ${cname(inn)} joins your roster.</p>`, 'Swap')) act(L => A.faSwap(L, cfg, d.mgr, out, inn), 'Swapped!');
  },
  async faAdd(d) {
    const inn = S.f.faIn; if (!inn) return toast('Choose a free agent.', true);
    if (await confirmBox(`Add ${CAST[inn].name}?`, '', 'Add')) act(L => A.faAdd(L, cfg, d.mgr, inn), 'Added!');
  },
  async undoTxn(d) { if (await confirmBox('Undo this roster move?', '', 'Undo', true)) act(L => A.undoTxn(L, cfg, d.id), 'Undone.'); },
  // admin
  async adminLogin() {
    const h = await sha(`dd|admin|${S.f.adminPw || ''}`);
    if (h !== cfg.adminHash) return toast('Wrong password.', true);
    lsSet('dd.admin', h); S.f.adminPw = ''; toast('Commissioner mode on.'); render();
  },
  adminLogout() { lsSet('dd.admin', null); lsSet('dd.actAs', null); render(); },
  async epStatus(d) {
    const n = Number(S.f.admEp || S.L.currentEp);
    if (d.s === 'final' && !(await confirmBox(`Publish Episode ${n}?`, '<p>Scores update for everyone. Episode picks lock and the next episode opens for picks.</p>', 'Publish'))) return;
    act(L => A.setEpStatus(L, cfg, n, d.s), d.s === 'final' ? `Episode ${n} published.` : 'Picks locked.');
    if (d.s === 'final') S.f.admEp = String(n + 1);
  },
  async editPick(d) {
    const n = Number(S.f.admEp || S.L.currentEp), p = S.L.episodes[n]?.picks?.[d.mgr] || {};
    const r = await modal({
      title: `Edit ${esc(mname(d.mgr))}'s Episode ${n} picks`, ok: 'Save',
      html: `<label>Intro time guess<input name="intro" value="${esc(p.intro || '')}" placeholder="mm:ss" autocomplete="off"></label>
        <label>Elimination pick<select name="elim"><option value="">None (carry over earlier pick)</option>${CONTESTANTS.map(c => `<option value="${c.id}" ${p.elim === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <p class="muted small">Scores recalculate automatically, including for episodes already published.</p>`
    });
    if (r) act(L => A.adminSetPick(L, cfg, d.mgr, n, { intro: r.intro.trim(), elim: r.elim }), 'Picks updated.');
  },
  reopenEp() { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.reopenEp(L, cfg, n), 'Reopened.'); },
  setIntro() { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.setIntroActual(L, cfg, n, (S.f['intro' + n] || '').trim()), 'Saved.'); },
  toggleElim(d) { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.toggleEliminated(L, cfg, n, d.cid)); },
  toggleRet(d) { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.toggleReturned(L, cfg, n, d.cid)); },
  async addEvent() {
    const n = Number(S.f.admEp || S.L.currentEp);
    const q = Number(S.f.evQ || 1);
    if (await act(L => A.addEvent(L, cfg, n, S.f.evC, S.f.evT, S.f.evN, q), 'Event added.')) { S.f.evN = ''; S.f.evQ = '1'; render(); }
  },
  rmEvent(d) { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.removeEvent(L, cfg, n, d.id)); },
  async adminNom() {
    const n = Number(S.f.admEp || S.L.currentEp);
    if (await act(L => A.addNominee(L, cfg, n, 'admin', S.f.anom, S.f.anomc), 'Nominee added.')) { S.f.anom = ''; S.f.anomc = ''; render(); }
  },
  rmNom(d) { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.removeNominee(L, cfg, n, d.id)); },
  moteOpen() { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.setMoteOpen(L, cfg, n, true), 'Voting open.'); },
  moteClose() { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.closeMote(L, cfg, n), 'Voting closed.'); },
  moteWin(d) { const n = Number(S.f.admEp || S.L.currentEp); return act(L => A.closeMote(L, cfg, n, d.id), 'Winner set.'); },
  lockWinner(d) { return act(L => A.setWinnerLocked(L, cfg, !!d.v), d.v ? 'Predictions locked & revealed.' : 'Predictions reopened.'); },
  async import() {
    let data; try { data = JSON.parse(S.f.importJson || ''); } catch { return toast('That isn’t valid JSON.', true); }
    if (await act(L => A.importEpisode(L, cfg, data), 'Imported. Review it, then publish.')) { S.f.importJson = ''; S.f.admEp = String(data.episode); render(); }
  },
  backup() {
    const blob = new Blob([JSON.stringify(S.L, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `devils-draft-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  },
  async makeHash() {
    const who = S.f.hashWho, v = (S.f.hashVal || '').trim(); if (!who || !v) return toast('Choose who and enter a value.', true);
    S.f.hashOut = await sha(`dd|${who}|${v}`); render();
  },
  async resetDraft() { if (await confirmBox('Reset the draft?', '<p>Clears draft order, picks and shared contestants. Episode data is kept.</p>', 'Reset draft', true)) act(L => A.resetDraft(L, cfg), 'Draft reset.'); },
  async resetAll() {
    const r = await modal({ title: 'Reset the entire league?', html: '<p>This erases everything. Type <b>RESET</b> to confirm.</p><input name="c" autocomplete="off">', ok: 'Erase everything', danger: true });
    if (r?.c === 'RESET') { const { emptyLeague } = await import('./engine.js'); await S.store.replace(emptyLeague()); toast('League reset.'); }
  },
};

async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data.episodes || !('phase' in data)) throw new Error('Not a Devil’s Draft backup.');
    if (await confirmBox('Restore this backup?', '<p>The current league data will be replaced.</p>', 'Restore', true)) { await S.store.replace(data); toast('Backup restored.'); }
  } catch (e) { toast(e.message, true); }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const h = handlers[el.dataset.act]; if (!h) return;
  e.preventDefault(); h(el.dataset);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset?.bind === 'adminPw') handlers.adminLogin();
});
window.addEventListener('hashchange', render);

// ------------------------------------------------------------------ boot
(async () => {
  try {
    S.store = await createStore();
    if (S.store.demo) document.getElementById('demo').hidden = false;
    S.store.subscribe(L => { S.L = L; safeRender(); }, err => { console.error(err); toast('Lost connection to the league database.', true); });
  } catch (e) {
    console.error(e);
    $view.innerHTML = `<section class="card warn"><h2>Can't connect</h2><p>${esc(e.message)}</p><p class="small muted">Check your internet connection, or the Firebase settings in js/config.js.</p></section>`;
  }
})();
