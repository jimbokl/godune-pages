import {TRIP_KEY, cleanTrip, emptyTrip} from './trip-state.mjs?v=20';

export const MEMORY_DB = 'godune-trip-memory';
const STORE = 'draft', HISTORY = 'revisions', META = 'meta';
const LOCAL_RECORD = 'godune-memory-clock';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The transaction reads the latest draft before applying an action. A page's
// rendered copy is never used as the starting point of another tab's write.
export function createTripMemory(catalog, initial, storage, environment = globalThis) {
  let current = {state: cleanTrip(initial.state, catalog), revision: 0, generation: 0};
  let saved = initial.available, db, mode = 'loading', queue = Promise.resolve();
  const listeners = new Set();
  let channel;
  try { channel = new environment.BroadcastChannel('godune-trip-memory'); } catch { /* storage events still work */ }
  const mirror = record => {
    try { storage.setItem(TRIP_KEY, JSON.stringify(record.state)); return true; } catch { return false; }
  };
  function localRecord() {
    try {
      const record = JSON.parse(storage.getItem(LOCAL_RECORD) || 'null');
      if (!record || !Number.isSafeInteger(record.revision) || record.revision < 0
        || !Number.isSafeInteger(record.generation) || record.generation < 0 || !record.state) return null;
      return {...record, state: cleanTrip(record.state, catalog)};
    } catch { return null; }
  }
  function mirrorClock(record) {
    try { storage.setItem(LOCAL_RECORD, JSON.stringify({...record, source:'indexeddb'})); } catch { /* IndexedDB is authoritative */ }
  }
  function adopt(record, persisted = true) {
    if (record.revision < current.revision) return;
    const cleared = record.generation !== current.generation;
    current = {...record, state: cleanTrip(record.state, catalog)}; saved = persisted;
    for (const callback of listeners) callback({state: structuredClone(current.state), saved, cleared});
  }
  function transaction(update, options = {}) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, HISTORY, META], 'readwrite');
      const drafts = tx.objectStore(STORE), history = tx.objectStore(HISTORY), meta = tx.objectStore(META);
      const request = meta.get('clock'); let result;
      request.onsuccess = () => {
        const clock = request.result || {revision: 0, generation: 0};
        const draft = drafts.get('current');
        draft.onsuccess = () => {
          const before = draft.result || {...clock, state: emptyTrip()};
          if ((options.expectedRevision !== undefined && options.expectedRevision !== before.revision)
            || (options.generation !== undefined && options.generation !== clock.generation)) {
            result = {record: before, before: before.state, conflict: true}; return;
          }
          const base = !saved && before.revision === current.revision && !options.clear ? current.state : before.state;
          const next = cleanTrip(update(structuredClone(base)), catalog);
          if (!options.clear && same(next, before.state)) {
            result = {record: before, before: before.state}; return;
          }
          const record = {revision: clock.revision + 1, generation: clock.generation + (options.clear ? 1 : 0),
            state: next, savedAt: new Date().toISOString(), label: options.label || 'Черновик изменён'};
          if (options.clear) { drafts.clear(); history.clear(); }
          else {
            if (draft.result) history.put(before, before.revision);
            drafts.put(record, 'current');
          }
          meta.put({revision: record.revision, generation: record.generation}, 'clock');
          result = {record, before: before.state};
        };
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || Error('Запись прервана'));
      tx.onerror = () => { /* onabort owns the failure */ };
    });
  }
  const ready = (async () => {
    try {
      db = await new Promise((resolve, reject) => {
        const request = environment.indexedDB.open(MEMORY_DB, 1);
        request.onupgradeneeded = () => {
          for (const name of [STORE, HISTORY, META]) request.result.createObjectStore(name);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => { request.onsuccess = () => request.result.close(); reject(Error('Хранилище занято другой версией сайта')); };
      });
      db.onversionchange = () => { db.close(); db = null; mode = 'local'; };
      // Import a fallback edit only when it is newer than the database. A newer
      // deletion generation also clears old versions when IndexedDB returns.
      const fallback = localRecord();
      const tx = db.transaction([STORE, HISTORY, META], 'readwrite'), store = tx.objectStore(STORE), meta = tx.objectStore(META), history = tx.objectStore(HISTORY);
      let restored;
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => {};
      });
      const request = meta.get('clock');
      request.onsuccess = () => {
        if (!request.result) {
          const candidate = fallback || current, populated = !same(candidate.state, emptyTrip());
          restored = {...candidate, revision: candidate.revision || (populated ? 1 : 0), savedAt: new Date().toISOString(), label: 'Сохранённый черновик'};
          meta.put({revision: restored.revision, generation: restored.generation}, 'clock');
          if (populated) store.put(restored, 'current');
        } else {
          const draft = store.get('current');
          draft.onsuccess = () => {
            const clock = request.result;
            restored = draft.result || {...clock, state: emptyTrip()};
            if (fallback?.source === 'fallback' && (fallback.generation > clock.generation
              || (fallback.generation === clock.generation && fallback.revision > clock.revision))) {
              if (fallback.generation > clock.generation) history.clear();
              else if (draft.result) history.put(restored, restored.revision);
              restored = {...fallback, savedAt: fallback.savedAt || new Date().toISOString(), label: 'Черновик из запасного хранилища'};
              if (same(restored.state, emptyTrip())) store.delete('current');
              else store.put(restored, 'current');
              meta.put({revision: restored.revision, generation: restored.generation}, 'clock');
            }
          };
        }
      };
      await done; mode = 'indexeddb';
      if (restored.revision && !same(restored.state, emptyTrip())) mirror(restored);
      else if (restored.generation) try { storage.removeItem(TRIP_KEY); } catch { /* database remains empty */ }
      mirrorClock(restored);
      adopt(restored);
    } catch {
      db?.close(); db = null; mode = 'local';
      current = localRecord() || current;
      adopt(current, initial.available);
    }
  })();
  async function sync() {
    await ready;
    if (!db) {
      try {
        const record = localRecord();
        if (record) {
          if (record.revision !== current.revision || saved) adopt(record);
        }
      }
      catch { saved = false; }
      return;
    }
    await new Promise(resolve => {
      const tx = db.transaction([STORE, META]), draft = tx.objectStore(STORE).get('current'), clock = tx.objectStore(META).get('clock');
      tx.oncomplete = () => {
        const record = draft.result || {...clock.result, state: emptyTrip()};
        if (record.revision !== current.revision || saved) adopt(record);
        resolve();
      };
      tx.onabort = resolve; tx.onerror = () => {};
    });
  }
  if (channel) channel.onmessage = () => { sync(); };
  function change(update, options = {}) {
    const generation = current.generation;
    const work = async () => {
      await ready;
      if (db) {
        try {
          const result = await transaction(update, {...options, generation: options.clear ? undefined : generation});
          if (!result.conflict) {
            if (!options.clear) mirror(result.record);
            mirrorClock(result.record);
          }
          adopt(result.record); channel?.postMessage({revision: current.revision});
          return {...result, saved: true, fullyCleared: Boolean(options.clear), state: structuredClone(current.state), revision: current.revision};
        } catch {
          // Keep the durable record intact. The changed draft remains exportable
          // in this page, with an explicit failure notice.
          const before = current.state;
          adopt({...current, state: update(structuredClone(before))}, false);
          return {before, saved: false, state: structuredClone(current.state), revision: current.revision};
        }
      }
      const local = () => {
        let latest = current.state;
        let clock = current;
        try {
          clock = localRecord() || clock;
          if (!saved && clock.revision < current.revision && clock.generation === current.generation) clock = current;
          if (saved || clock.revision !== current.revision) latest = cleanTrip(clock.state, catalog);
        } catch { /* use the page draft */ }
        if ((options.expectedRevision !== undefined && options.expectedRevision !== clock.revision) || (!options.clear && generation !== clock.generation)) {
          adopt(clock); return {conflict: true, before: latest, state: structuredClone(current.state), revision: current.revision, saved};
        }
        const record = {...clock, revision: clock.revision + 1, generation: clock.generation + (options.clear ? 1 : 0), state: cleanTrip(update(structuredClone(latest)), catalog), source:'fallback', savedAt:new Date().toISOString()};
        let written = false;
        try { storage.setItem(LOCAL_RECORD, JSON.stringify(record)); written = true; } catch { /* truthful failure */ }
        if (written && !options.clear) mirror(record);
        adopt(record, written); channel?.postMessage({revision: current.revision});
        return {before: latest, state: structuredClone(current.state), saved, fullyCleared:false, revision: current.revision};
      };
      return environment.navigator?.locks?.request ? environment.navigator.locks.request('godune-trip-write', local) : local();
    };
    const pending = queue.then(work, work); queue = pending.catch(() => {}); return pending;
  }
  return {ready, sync, change, subscribe(callback) {listeners.add(callback);}, get: () => structuredClone(current.state),
    get revision() {return current.revision;}, get saved() {return saved;}, get mode() {return mode;},
    async history() {
      await ready; if (!db) return [];
      return new Promise(resolve => {
        const tx = db.transaction(HISTORY), request = tx.objectStore(HISTORY).getAll();
        tx.oncomplete = () => resolve(request.result.sort((a,b) => b.revision-a.revision));
        tx.onabort = () => resolve([]); tx.onerror = () => {};
      });
    }, clear: () => change(() => emptyTrip(), {clear: true})};
}

export function removeLocalMemory(storage) {
  try {
    const clock = JSON.parse(storage.getItem(LOCAL_RECORD) || 'null');
    const keepClock = clock && same(clock.state, emptyTrip());
    const keys = Array.from({length: storage.length}, (_, i) => storage.key(i)).filter(key => key?.startsWith('godune-') && !(key === LOCAL_RECORD && keepClock));
    for (const key of keys) storage.removeItem(key);
    return !keys.some(key => storage.getItem(key) !== null);
  } catch { return false; }
}
