// Data store: the whole league lives in one Firestore document (leagues/<leagueId>).
// With no Firebase config, a demo store keeps everything in this browser's localStorage.
import { FIREBASE, LEAGUE } from './config.js';
import { emptyLeague } from './engine.js';

const clean = o => JSON.parse(JSON.stringify(o));
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function createStore() {
  if (!FIREBASE.apiKey) return demoStore();
  const { initializeApp } = await import(SDK + 'firebase-app.js');
  const fs = await import(SDK + 'firebase-firestore.js');
  const app = initializeApp(FIREBASE);
  const db = fs.getFirestore(app);
  const ref = fs.doc(db, 'leagues', LEAGUE.leagueId);
  return {
    demo: false,
    subscribe(cb, onErr) {
      return fs.onSnapshot(ref, s => cb(s.exists() ? s.data() : emptyLeague()), onErr);
    },
    async mutate(fn) {
      await fs.runTransaction(db, async tx => {
        const s = await tx.get(ref);
        const L = clean(s.exists() ? s.data() : emptyLeague());
        fn(L);
        L.updatedAt = Date.now();
        tx.set(ref, clean(L));
      });
    },
    async replace(data) { await fs.setDoc(ref, clean(data)); },
  };
}

function demoStore() {
  const KEY = 'dd.demo.' + LEAGUE.leagueId;
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  const subs = new Set();
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || emptyLeague(); } catch { return emptyLeague(); } };
  const emit = () => { const L = read(); subs.forEach(cb => cb(L)); };
  chan && (chan.onmessage = emit);
  window.addEventListener('storage', e => e.key === KEY && emit());
  const write = L => { localStorage.setItem(KEY, JSON.stringify(L)); chan?.postMessage('u'); emit(); };
  return {
    demo: true,
    subscribe(cb) { subs.add(cb); setTimeout(() => cb(read())); return () => subs.delete(cb); },
    async mutate(fn) { const L = clean(read()); fn(L); L.updatedAt = Date.now(); write(clean(L)); },
    async replace(data) { write(clean(data)); },
  };
}
