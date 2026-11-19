// Devil's Draft league engine: pure functions, no DOM. Works in browsers and Node.
import { CONTESTANTS } from './data.js';

export const EVENT_TYPES = [
  // Episode scoring
  { key: 'main_win', label: 'Wins the main match outright', pts: 5, group: 'Scoring' },
  { key: 'main_team', label: 'On the winning side of the main match', pts: 3, group: 'Scoring' },
  { key: 'top_earner', label: 'Top earner of the episode', pts: 3, group: 'Scoring' },
  { key: 'side_win', label: 'Wins a side match or mini-game', pts: 1, group: 'Scoring' },
  { key: 'immunity', label: 'Earns immunity / protective advantage', pts: 3, group: 'Scoring' },
  { key: 'death_survive', label: 'Survives a death match / elimination game', pts: 3, group: 'Scoring' },
  { key: 'secret', label: 'Finds a secret', pts: 3, group: 'Scoring' },
  { key: 'big_move', label: 'Successful betrayal / big strategic move', pts: 3, group: 'Scoring' },
  { key: 'sacrifice', label: 'Sacrifices resources to save another player', pts: 1, group: 'Scoring' },
  // Penalties
  { key: 'main_last', label: 'Last / losing side of the main match', pts: -1, group: 'Penalties' },
  { key: 'death_sent', label: 'Sent to death match / prison / elimination zone', pts: -1, group: 'Penalties' },
  { key: 'duped', label: 'Publicly duped or betrayed', pts: -1, group: 'Penalties' },
  { key: 'rule_penalty', label: 'Penalized by the show for breaking a rule', pts: -3, group: 'Penalties' },
  { key: 'quit', label: 'Quits / withdraws voluntarily', pts: -7, group: 'Penalties' },
  // End of season
  { key: 'semifinalist', label: 'Semi-finalist', pts: 2, group: 'End of season' },
  { key: 'runner_up', label: 'Runner-up', pts: 3, group: 'End of season' },
  { key: 'season_winner', label: 'Season winner', pts: 5, group: 'End of season' },
];
export const EVENT = Object.fromEntries(EVENT_TYPES.map(e => [e.key, e]));
export const PTS = { survive: 1, moment: 3, intro: 1, elimPred: 3, winnerPred: 5 };

export const CAST = Object.fromEntries(CONTESTANTS.map(c => [c.id, c]));

export function emptyLeague() {
  return {
    v: 1,
    phase: 'predraft',          // predraft -> draft -> shared -> season
    draftOrder: null,
    draftPicks: [],
    santa: null,                // { drawerId: drawnId }
    shared: {},                 // { drawerId: contestantId }
    winnerPicks: {},
    winnerLocked: false,
    currentEp: 2,
    episodes: { 1: newEpisode(1, 'final'), 2: newEpisode(2) },
    txns: [],
    proposals: [],
    trade: null,
    log: [],
    seq: 1,
  };
}

export function newEpisode(n, status = 'open') {
  return { n, status, picks: {}, introActual: '', events: [], eliminated: [], returned: [], mote: { open: false, closed: false, nominees: [], votes: {}, winner: null } };
}

export const ep = (L, n) => (L.episodes[n] ||= newEpisode(n));

export function snakeManager(order, i) {
  const n = order.length, r = Math.floor(i / n), k = i % n;
  return r % 2 === 0 ? order[k] : order[n - 1 - k];
}

export function parseTime(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return null;
  return t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
}
export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const sortedEps = L => Object.keys(L.episodes).map(Number).sort((a, b) => a - b);

// ---------------------------------------------------------------- compute
export function compute(L, cfg) {
  const start = cfg.scoringStartEp;
  const mgrIds = cfg.managers.map(m => m.id);
  const owner = {};        // cid -> mgr|null (current)
  const timeline = {};     // cid -> [{mgr, from}]
  const elim = {};         // cid -> {ep, holder} (currently eliminated)
  const firstElim = {};    // cid -> first elimination ep
  const aliveAfter = {};   // ep -> Set(cid)
  const setOwner = (cid, mgr, from) => { owner[cid] = mgr; (timeline[cid] ||= []).push({ mgr, from }); };
  const activeOf = m => Object.keys(owner).filter(c => owner[c] === m && !elim[c]);

  if (L.draftOrder) L.draftPicks.forEach((cid, i) => setOwner(cid, snakeManager(L.draftOrder, i), start));

  const eps = sortedEps(L);
  const maxEp = Math.max(L.currentEp, ...eps, 1);
  for (let e = 1; e <= maxEp; e++) {
    const E = L.episodes[e];
    if (E) {
      for (const cid of E.eliminated || []) if (!elim[cid]) {
        elim[cid] = { ep: e, holder: owner[cid] || null };
        if (firstElim[cid] == null) firstElim[cid] = e;
      }
      for (const cid of E.returned || []) if (elim[cid]) {
        const holder = elim[cid].holder; delete elim[cid];
        if (holder && owner[cid] === holder && activeOf(holder).length < 2) { /* stays with holder */ }
        else if (owner[cid]) setOwner(cid, null, e);
      }
    }
    aliveAfter[e] = new Set(CONTESTANTS.map(c => c.id).filter(c => !elim[c]));
    for (const t of L.txns.filter(t => t.afterEp === e)) applyTxn(t, setOwner);
  }

  const ownerAt = (cid, e) => {
    let m = null;
    for (const s of timeline[cid] || []) if (s.from <= e) m = s.mgr;
    return m;
  };
  const sharedBy = {};
  for (const [d, cid] of Object.entries(L.shared || {})) sharedBy[cid] = d;

  const ledger = [];
  const cidPts = Object.fromEntries(CONTESTANTS.map(c => [c.id, 0]));
  const cidLog = Object.fromEntries(CONTESTANTS.map(c => [c.id, []]));
  const credit = (cid, e, pts, label) => {
    cidPts[cid] += pts; cidLog[cid].push({ ep: e, pts, label });
    if (e < start) return;
    const o = ownerAt(cid, e);
    if (o) ledger.push({ mgr: o, ep: e, pts, label, cid });
    const d = sharedBy[cid];
    if (d && (firstElim[cid] == null || e <= firstElim[cid])) ledger.push({ mgr: d, ep: e, pts, label, cid, shared: true });
  };

  let seasonWinner = null;
  for (const e of eps) {
    const E = L.episodes[e];
    if (E.status !== 'final' || e < start) continue;
    for (const cid of aliveAfter[e]) {
      const wasIn = aliveAfter[e - 1] ? aliveAfter[e - 1].has(cid) || (E.returned || []).includes(cid) : true;
      if (wasIn) credit(cid, e, PTS.survive, 'Survived the episode');
    }
    for (const ev of E.events || []) {
      const t = EVENT[ev.type]; if (!t || !CAST[ev.cid]) continue;
      credit(ev.cid, e, t.pts, t.label + (ev.note ? ` (${ev.note})` : ''));
      if (ev.type === 'season_winner') seasonWinner = ev.cid;
    }
    const mw = E.mote?.winner && E.mote.nominees.find(n => n.id === E.mote.winner);
    if (mw?.cid) credit(mw.cid, e, PTS.moment, 'Moment of the Episode');
    // Intro time
    const actual = parseTime(E.introActual);
    if (actual != null) {
      const guesses = mgrIds.map(m => [m, parseTime(E.picks?.[m]?.intro)]).filter(([, g]) => g != null);
      if (guesses.length) {
        const best = Math.min(...guesses.map(([, g]) => Math.abs(g - actual)));
        for (const [m, g] of guesses) if (Math.abs(g - actual) === best)
          ledger.push({ mgr: m, ep: e, pts: PTS.intro, label: `Closest intro guess (${fmtTime(g)})` });
      }
    }
    // Elimination prediction (carries forward)
    if ((E.eliminated || []).length) for (const m of mgrIds) {
      const p = effectiveElimPick(L, m, e, start);
      if (p && E.eliminated.includes(p)) ledger.push({ mgr: m, ep: e, pts: PTS.elimPred, label: `Predicted ${CAST[p].name}'s elimination`, cid: p });
    }
  }
  if (seasonWinner) for (const [m, cid] of Object.entries(L.winnerPicks || {}))
    if (cid === seasonWinner) ledger.push({ mgr: m, ep: maxEp, pts: PTS.winnerPred, label: `Predicted the season winner (${CAST[cid].name})`, cid });

  const totals = Object.fromEntries(mgrIds.map(m => [m, 0]));
  for (const l of ledger) totals[l.mgr] = (totals[l.mgr] || 0) + l.pts;
  const standings = [...mgrIds].sort((a, b) => totals[b] - totals[a] || cfg.managers.findIndex(x => x.id === a) - cfg.managers.findIndex(x => x.id === b));
  const rank = {}; standings.forEach((m, i) => rank[m] = i > 0 && totals[m] === totals[standings[i - 1]] ? rank[standings[i - 1]] : i + 1);

  const roster = m => ({
    active: activeOf(m),
    eliminated: Object.keys(owner).filter(c => owner[c] === m && elim[c]),
    shared: L.shared?.[m] || null,
    sharedActive: !!(L.shared?.[m] && !elim[L.shared[m]] && firstElim[L.shared[m]] == null),
  });
  const freeAgents = CONTESTANTS.map(c => c.id).filter(c => !owner[c] && !elim[c]);
  return { owner, timeline, elim, firstElim, ledger, totals, standings, rank, roster, freeAgents, cidPts, cidLog, sharedBy, ownerAt, seasonWinner, isOut: c => !!elim[c] };
}

export function effectiveElimPick(L, m, e, start) {
  for (let k = e; k >= start; k--) { const p = L.episodes[k]?.picks?.[m]?.elim; if (p) return p; }
  return null;
}

function applyTxn(t, setOwner) {
  const from = t.afterEp + 1;
  if (t.kind === 'trade') { t.aGives.forEach(c => setOwner(c, t.b, from)); t.bGives.forEach(c => setOwner(c, t.a, from)); }
  if (t.kind === 'fa_swap') { setOwner(t.out, null, from); setOwner(t.in, t.mgr, from); }
  if (t.kind === 'fa_add') setOwner(t.in, t.mgr, from);
}

// ---------------------------------------------------------------- actions
// Each action mutates a league draft L and throws Error(message) when invalid.
const fail = msg => { throw new Error(msg); };
const name = (cfg, id) => cfg.managers.find(m => m.id === id)?.name || id;
const log = (L, text) => { L.log.unshift({ at: Date.now(), text }); L.log = L.log.slice(0, 200); };
const uid = L => `x${L.seq++}`;

export function onClock(L) {
  if (L.phase !== 'draft' || !L.draftOrder) return null;
  const total = L.draftOrder.length * 2;
  return L.draftPicks.length < total ? snakeManager(L.draftOrder, L.draftPicks.length) : null;
}

export const A = {
  randomizeOrder(L, cfg) {
    if (L.phase !== 'predraft') fail('The draft has already started.');
    L.draftOrder = shuffle(cfg.managers.map(m => m.id));
    log(L, `Draft order drawn: ${L.draftOrder.map(i => name(cfg, i)).join(', ')}`);
  },
  startDraft(L, cfg) {
    if (L.phase !== 'predraft') fail('The draft has already started.');
    if (!L.draftOrder) fail('Draw the draft order first.');
    L.phase = 'draft'; log(L, 'The draft is open.');
  },
  draftPick(L, cfg, mgr, cid) {
    const C = compute(L, cfg);
    if (L.phase !== 'draft') fail('The draft is not open.');
    if (onClock(L) !== mgr) fail(`It's ${name(cfg, onClock(L))}'s pick.`);
    if (!CAST[cid]) fail('Unknown contestant.');
    if (L.draftPicks.includes(cid)) fail(`${CAST[cid].name} has already been drafted.`);
    if (C.elim[cid]) fail(`${CAST[cid].name} has been eliminated.`);
    L.draftPicks.push(cid);
    log(L, `${name(cfg, mgr)} drafted ${CAST[cid].name} (pick ${L.draftPicks.length}).`);
    if (L.draftPicks.length === L.draftOrder.length * 2) { L.phase = 'shared'; log(L, 'Draft complete. Time for Secret Santa shared picks.'); }
  },
  undoDraftPick(L, cfg) {
    if (!['draft', 'shared'].includes(L.phase) || !L.draftPicks.length) fail('Nothing to undo.');
    if (L.santa) fail('Reset the Secret Santa draw first.');
    const cid = L.draftPicks.pop(); L.phase = 'draft';
    log(L, `Admin undid the pick of ${CAST[cid].name}.`);
  },
  resetDraft(L, cfg) {
    Object.assign(L, { phase: 'predraft', draftOrder: null, draftPicks: [], santa: null, shared: {} });
    log(L, 'Admin reset the draft.');
  },
  drawSanta(L, cfg) {
    if (L.phase !== 'shared') fail('Finish the draft first.');
    if (L.santa) fail('Pairings already drawn.');
    const ids = cfg.managers.map(m => m.id);
    let perm; do perm = shuffle(ids); while (perm.some((p, i) => p === ids[i]));
    L.santa = Object.fromEntries(ids.map((id, i) => [id, perm[i]]));
    log(L, 'Secret Santa pairings drawn.');
  },
  resetSanta(L) {
    if (L.phase === 'season' && L.txns.length) fail('Trades have already happened.');
    L.santa = null; L.shared = {}; if (L.phase === 'season') L.phase = 'shared';
    log(L, 'Admin reset the Secret Santa pairings.');
  },
  pickShared(L, cfg, drawer, cid) {
    if (L.phase !== 'shared' || !L.santa) fail('Shared picks are not open.');
    if (L.shared[drawer]) fail('You already chose your shared contestant.');
    const drawn = L.santa[drawer];
    const theirs = L.draftPicks.filter((c, i) => snakeManager(L.draftOrder, i) === drawn);
    if (!theirs.includes(cid)) fail(`Pick one of ${name(cfg, drawn)}'s contestants.`);
    L.shared[drawer] = cid;
    log(L, `${name(cfg, drawer)} chose ${CAST[cid].name} (from ${name(cfg, drawn)}) as their shared contestant.`);
    if (Object.keys(L.shared).length === cfg.managers.length) { L.phase = 'season'; log(L, 'All shared contestants chosen. The season is on!'); }
  },
  setWinnerPick(L, cfg, mgr, cid) {
    if (L.winnerLocked) fail('Season winner predictions are locked.');
    if (!CAST[cid]) fail('Choose a contestant.');
    if (compute(L, cfg).elim[cid]) fail(`${CAST[cid].name} has been eliminated.`);
    L.winnerPicks[mgr] = cid;
  },
  setWinnerLocked(L, cfg, v) { L.winnerLocked = v; log(L, v ? 'Season winner predictions locked.' : 'Season winner predictions reopened.'); },
  setEpPick(L, cfg, mgr, n, { intro, elim }) {
    const E = ep(L, n);
    if (n !== L.currentEp || E.status !== 'open') fail(`Picks for Episode ${n} are closed.`);
    if (intro && parseTime(intro) == null) fail('Enter the intro time like 12:30.');
    if (elim && compute(L, cfg).elim[elim]) fail(`${CAST[elim].name} has already been eliminated.`);
    E.picks[mgr] = { intro: intro || '', elim: elim || '', at: Date.now() };
  },
  setEpStatus(L, cfg, n, status) {
    const E = ep(L, n); E.status = status;
    if (status === 'final' && n >= L.currentEp) { L.currentEp = n + 1; ep(L, n + 1); }
    log(L, `Episode ${n} ${status === 'locked' ? 'picks locked' : status === 'final' ? 'scored and published' : 'reopened'}.`);
  },
  reopenEp(L, cfg, n) { ep(L, n).status = n === L.currentEp ? 'open' : 'locked'; log(L, `Episode ${n} reopened for editing.`); },
  addEvent(L, cfg, n, cid, type, note) {
    if (!CAST[cid] || !EVENT[type]) fail('Choose a contestant and an event.');
    ep(L, n).events.push({ id: uid(L), cid, type, note: note || '' });
  },
  removeEvent(L, cfg, n, id) { const E = ep(L, n); E.events = E.events.filter(e => e.id !== id); },
  toggleEliminated(L, cfg, n, cid) {
    const E = ep(L, n);
    E.eliminated = E.eliminated.includes(cid) ? E.eliminated.filter(c => c !== cid) : [...E.eliminated, cid];
  },
  toggleReturned(L, cfg, n, cid) {
    const E = ep(L, n);
    E.returned = E.returned.includes(cid) ? E.returned.filter(c => c !== cid) : [...E.returned, cid];
  },
  setIntroActual(L, cfg, n, t) {
    if (t && parseTime(t) == null) fail('Enter the intro time like 12:30.');
    ep(L, n).introActual = t || '';
  },
  // Moment of the Episode
  addNominee(L, cfg, n, by, text, cid) {
    const M = ep(L, n).mote;
    if (M.closed) fail('Voting has closed.');
    if (!text?.trim()) fail('Describe the moment.');
    M.nominees.push({ id: uid(L), text: text.trim().slice(0, 200), cid: cid || '', by });
  },
  removeNominee(L, cfg, n, id) {
    const M = ep(L, n).mote; M.nominees = M.nominees.filter(x => x.id !== id);
    for (const [m, v] of Object.entries(M.votes)) if (v === id) delete M.votes[m];
  },
  setMoteOpen(L, cfg, n, open) { const M = ep(L, n).mote; M.open = open; if (open) M.closed = false; },
  vote(L, cfg, n, mgr, nomId) {
    const M = ep(L, n).mote;
    if (!M.open || M.closed) fail('Voting is not open.');
    if (!M.nominees.some(x => x.id === nomId)) fail('Unknown nominee.');
    M.votes[mgr] = nomId;
  },
  closeMote(L, cfg, n, winnerId) {
    const M = ep(L, n).mote;
    const tally = moteTally(M); const top = Math.max(0, ...Object.values(tally));
    const leaders = M.nominees.filter(x => (tally[x.id] || 0) === top && top > 0).map(x => x.id);
    let w = winnerId;
    if (!w) { if (!leaders.length) fail('No votes yet.'); w = leaders[Math.floor(Math.random() * leaders.length)]; }
    M.winner = w; M.open = false; M.closed = true;
    const nom = M.nominees.find(x => x.id === w);
    log(L, `Moment of Episode ${n}: ${nom.text}${leaders.length > 1 && !winnerId ? ' (tie broken by random draw)' : ''}`);
  },
  // Trades
  openTrade(L, cfg, afterEp) {
    if (L.phase !== 'season') fail('The draft is not finished.');
    if (L.trade?.open) fail('A trade window is already open.');
    const C = compute(L, cfg);
    const order = [...C.standings].reverse();
    L.trade = { open: true, afterEp, order, turn: 0, used: {} };
    log(L, `Trade window opened after Episode ${afterEp}. Order: ${order.map(i => name(cfg, i)).join(', ')}.`);
  },
  closeTrade(L, cfg) {
    if (!L.trade?.open) fail('No open trade window.');
    L.trade.open = false;
    for (const p of L.proposals) if (p.status === 'pending') p.status = 'expired';
    log(L, 'Trade window closed.');
  },
  endTurn(L, cfg, mgr) {
    const T = L.trade; if (!T?.open) fail('No open trade window.');
    if (mgr && T.order[T.turn] !== mgr) fail('It is not your turn.');
    T.turn++;
    for (const p of L.proposals) if (p.status === 'pending' && p.from === T.order[T.turn - 1]) p.status = 'expired';
    if (T.turn >= T.order.length) { A.closeTrade(L, cfg); return; }
    log(L, `${name(cfg, T.order[T.turn])} is up in the trade window.`);
  },
  propose(L, cfg, from, to, give, get) {
    const T = L.trade; if (!T?.open) fail('No open trade window.');
    if (T.order[T.turn] !== from) fail('You can only propose trades on your turn.');
    if (from === to) fail('Choose another manager.');
    validateTrade(L, cfg, from, to, give, get);
    L.proposals.push({ id: uid(L), from, to, give, get, status: 'pending', afterEp: T.afterEp, at: Date.now() });
    log(L, `${name(cfg, from)} proposed a trade to ${name(cfg, to)}.`);
  },
  respond(L, cfg, id, mgr, accept) {
    const p = L.proposals.find(x => x.id === id);
    if (!p || p.status !== 'pending') fail('This proposal is no longer open.');
    if (mgr && mgr !== p.to && mgr !== p.from) fail('Not your proposal.');
    if (mgr === p.from && accept) fail('The other manager must accept.');
    if (!accept) { p.status = mgr === p.from ? 'cancelled' : 'declined'; log(L, `Trade ${p.status} (${name(cfg, p.from)} ↔ ${name(cfg, p.to)}).`); return; }
    validateTrade(L, cfg, p.from, p.to, p.give, p.get);
    p.status = 'accepted';
    L.txns.push({ id: uid(L), kind: 'trade', afterEp: p.afterEp, a: p.from, b: p.to, aGives: p.give, bGives: p.get, at: Date.now() });
    log(L, `Trade: ${name(cfg, p.from)} sends ${p.give.map(c => CAST[c].name).join(' + ')} to ${name(cfg, p.to)} for ${p.get.map(c => CAST[c].name).join(' + ')}.`);
  },
  faSwap(L, cfg, mgr, out, inn) {
    const T = L.trade; if (!T?.open) fail('No open trade window.');
    if (T.order[T.turn] !== mgr) fail('Wait for your turn.');
    if (T.used[mgr]?.swap) fail('You already swapped for a free agent this window.');
    const C = compute(L, cfg);
    if (C.owner[out] !== mgr || C.elim[out]) fail('You can only swap out an active contestant you own.');
    checkFA(L, C, mgr, inn);
    L.txns.push({ id: uid(L), kind: 'fa_swap', afterEp: T.afterEp, mgr, out, in: inn, at: Date.now() });
    (T.used[mgr] ||= {}).swap = true;
    log(L, `${name(cfg, mgr)} swapped ${CAST[out].name} for free agent ${CAST[inn].name}.`);
  },
  faAdd(L, cfg, mgr, inn) {
    const T = L.trade; if (!T?.open) fail('No open trade window.');
    if (T.order[T.turn] !== mgr) fail('Wait for your turn.');
    if (T.used[mgr]?.add) fail('You already drafted a free agent this window.');
    const C = compute(L, cfg);
    if (!C.roster(mgr).eliminated.length) fail('You can only draft a free agent after one of your contestants is eliminated.');
    if (C.roster(mgr).active.length >= 2) fail('Your roster is full (2 active contestants).');
    checkFA(L, C, mgr, inn);
    L.txns.push({ id: uid(L), kind: 'fa_add', afterEp: T.afterEp, mgr, in: inn, at: Date.now() });
    (T.used[mgr] ||= {}).add = true;
    log(L, `${name(cfg, mgr)} picked up free agent ${CAST[inn].name}.`);
  },
  undoTxn(L, cfg, id) {
    const t = L.txns.find(x => x.id === id); if (!t) fail('Not found.');
    const later = L.txns.slice(L.txns.indexOf(t) + 1);
    if (later.length) fail('Undo the later moves first (most recent first).');
    L.txns = L.txns.filter(x => x !== t);
    if (L.trade && t.afterEp === L.trade.afterEp && t.mgr && L.trade.used[t.mgr]) delete L.trade.used[t.mgr][t.kind === 'fa_swap' ? 'swap' : 'add'];
    log(L, 'Admin undid a roster move.');
  },
  importEpisode(L, cfg, data) {
    const n = Number(data.episode); if (!n) fail('JSON needs an "episode" number.');
    const E = ep(L, n);
    const find = s => { const q = String(s).toLowerCase(); return CONTESTANTS.find(c => c.id === q || c.name.toLowerCase() === q || c.name.toLowerCase().startsWith(q))?.id || fail(`Unknown contestant "${s}".`); };
    for (const ev of data.events || []) { if (!EVENT[ev.type]) fail(`Unknown event type "${ev.type}".`); E.events.push({ id: uid(L), cid: find(ev.contestant), type: ev.type, note: ev.note || '' }); }
    for (const c of data.eliminated || []) { const id = find(c); if (!E.eliminated.includes(id)) E.eliminated.push(id); }
    for (const c of data.returned || []) { const id = find(c); if (!E.returned.includes(id)) E.returned.push(id); }
    if (data.introActual) A.setIntroActual(L, cfg, n, data.introActual);
    for (const m of data.nominees || []) E.mote.nominees.push({ id: uid(L), text: m.text, cid: m.contestant ? find(m.contestant) : '', by: 'admin' });
    log(L, `Imported results for Episode ${n}.`);
  },
};

export function moteTally(M) {
  const t = {}; for (const v of Object.values(M.votes || {})) t[v] = (t[v] || 0) + 1; return t;
}

function checkFA(L, C, mgr, inn) {
  if (!C.freeAgents.includes(inn)) fail(`${CAST[inn]?.name || 'That contestant'} is not a free agent.`);
  if (L.shared[mgr] === inn) fail("Your shared contestant can't join your roster.");
}

export function validateTrade(L, cfg, a, b, give, get) {
  const C = compute(L, cfg);
  if (!give.length && !get.length) fail('Choose at least one contestant.');
  for (const c of give) if (C.owner[c] !== a || C.elim[c]) fail(`${name(cfg, a)} doesn't have ${CAST[c].name} as an active contestant.`);
  for (const c of get) if (C.owner[c] !== b || C.elim[c]) fail(`${name(cfg, b)} doesn't have ${CAST[c].name} as an active contestant.`);
  const ra = C.roster(a).active.length - give.length + get.length;
  const rb = C.roster(b).active.length - get.length + give.length;
  if (ra > 2) fail(`${name(cfg, a)} would have more than 2 active contestants.`);
  if (rb > 2) fail(`${name(cfg, b)} would have more than 2 active contestants.`);
  if (get.includes(L.shared[a])) fail(`${name(cfg, a)} can't trade for their own shared contestant.`);
  if (give.includes(L.shared[b])) fail(`${name(cfg, b)} can't receive their own shared contestant.`);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const r = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[r]] = [a[r], a[i]];
  }
  return a;
}
