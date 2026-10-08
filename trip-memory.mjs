import {TRIP_KEY, cleanTrip, emptyTrip} from './trip-state.mjs?v=27';
import {MemoryCompatibilityError, checkMemoryClock, checkMemoryTrip, checkMemoryRecord, memoryClock, versionMemoryRecord} from './trip-memory-contract.mjs';

export const MEMORY_DB = 'godune-trip-memory';
const STORE = 'draft', HISTORY = 'revisions', META = 'meta';
const LOCAL_RECORD = 'godune-memory-clock';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The transaction reads the latest draft before applying an action. A page's
// rendered copy is never used as the starting point of another tab's write.
class TripActionError extends Error {
  constructor(cause) { super('Trip action rejected'); this.cause = cause; }
}
export function createTripMemory(catalog, initial, storage, environment = globalThis) {
  let current = {state: cleanTrip(initial.state, catalog), revision: 0, generation: 0};
  let saved = initial.available, db, mode = 'loading', queue = Promise.resolve();
  let compatibility = null, reconnect = Promise.resolve(), initialSource = initial.rawText;
  const listeners = new Set();
  let channel;
  try { channel = new environment.BroadcastChannel('godune-trip-memory'); } catch { /* storage events still work */ }
  const mirror = record => {
    try { storage.setItem(TRIP_KEY, JSON.stringify(record.state)); return true; } catch { return false; }
  };
  function localRecord() {
    let raw;
    try { raw = storage.getItem(LOCAL_RECORD); } catch { return null; }
    if (raw == null) return null;
    try {
      const record = JSON.parse(raw);
      if (record == null) throw Error('Empty record');
      checkMemoryRecord(record); return record;
    } catch (error) {
      if (error instanceof MemoryCompatibilityError) throw error;
      throw new MemoryCompatibilityError('damaged-local', 'Не удалось прочитать запасную копию поездки. Исходную копию можно скачать.');
    }
  }
  function mirrorClock(record) {
    try { storage.setItem(LOCAL_RECORD, JSON.stringify({...record, source:'indexeddb'})); } catch { /* IndexedDB is authoritative */ }
  }
  function adopt(record, persisted = true) {
    if (record.revision < current.revision) return;
    const cleared = record.generation !== current.generation;
    current = {...record, state: cleanTrip(record.state, catalog)}; saved = persisted;
    for (const callback of listeners) callback({state: structuredClone(current.state), saved, cleared, compatibility});
  }
  function recovery(error) {
    compatibility = {code: error.code || 'database-unavailable', message: error.message || 'Хранилище поездки пока недоступно.'};
    mode = error instanceof MemoryCompatibilityError ? 'recovery' : 'unavailable';
    adopt(current, false);
  }
  function pageDraft(update) {
    const before = current.state;
    adopt({...current, state: cleanTrip(update(structuredClone(before)), catalog)}, false);
    return {before, saved: false, fullyCleared: false, state: structuredClone(current.state), revision: current.revision, compatibility};
  }
  function transaction(update, options = {}) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, HISTORY, META], 'readwrite');
      const drafts = tx.objectStore(STORE), history = tx.objectStore(HISTORY), meta = tx.objectStore(META);
      const request = meta.get('clock'); let result, actionError;
      request.onsuccess = () => {
        const clock = request.result || {revision: 0, generation: 0};
        const draft = drafts.get('current');
        draft.onsuccess = () => {
          const before = draft.result || {...clock, state: emptyTrip()};
          if (!options.clear) {
            try { checkMemoryClock(clock); checkMemoryRecord(draft.result, clock); }
            catch (error) { actionError = error; tx.abort(); return; }
          }
          if ((options.expectedRevision !== undefined && options.expectedRevision !== before.revision)
            || (options.generation !== undefined && options.generation !== clock.generation)) {
            result = {record: before, before: before.state, conflict: true}; return;
          }
          const base = !saved && before.revision === current.revision && !options.clear ? current.state : before.state;
          let next;
          try { next = cleanTrip(update(structuredClone(base)), catalog); }
          catch (error) { actionError = new TripActionError(error); tx.abort(); return; }
          if (!options.clear && same(next, before.state)) {
            result = {record: before, before: before.state}; return;
          }
          const record = versionMemoryRecord({revision: (Number.isSafeInteger(clock.revision) ? clock.revision : current.revision) + 1,
            generation: (Number.isSafeInteger(clock.generation) ? clock.generation : current.generation) + (options.clear ? 1 : 0),
            state: next, savedAt: new Date().toISOString(), label: options.label || 'Черновик изменён'});
          if (options.clear) { drafts.clear(); history.clear(); meta.clear(); }
          else {
            if (draft.result) history.put(before, before.revision);
            drafts.put(record, 'current');
          }
          meta.put(memoryClock(record), 'clock');
          result = {record, before: before.state};
        };
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(actionError || tx.error || Error('Запись прервана'));
      tx.onerror = () => { /* onabort owns the failure */ };
    });
  }
  async function connect() {
      db = await new Promise((resolve, reject) => {
        // Open the current structural version. A compatible database can have
        // extra stores added by a newer release without changing the Trip format.
        const request = environment.indexedDB.open(MEMORY_DB);
        request.onupgradeneeded = () => {
          for (const name of [STORE, HISTORY, META]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => { request.onsuccess = () => request.result.close(); reject(Error('Хранилище занято другой версией сайта')); };
      });
      db.onversionchange = () => {
        db.close(); db = null; mode = 'reconnecting';
        // The opening request queues behind the upgrading transaction. Writes
        // await it, then read the new clock before applying the user's action.
        reconnect = connect().catch(recovery);
      };
      if (![STORE, HISTORY, META].every(name => db.objectStoreNames.contains(name)))
        throw new MemoryCompatibilityError('database-layout', 'Структура памяти поездки изменилась. Исходную копию можно скачать.');
      // Import a fallback edit only when it is newer than the database. A newer
      // deletion generation also clears old versions when IndexedDB returns.
      const fallback = localRecord();
      const tx = db.transaction([STORE, HISTORY, META], 'readwrite'), store = tx.objectStore(STORE), meta = tx.objectStore(META), history = tx.objectStore(HISTORY);
      let restored, migrationError;
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve; tx.onabort = () => reject(migrationError || tx.error || Error('Обновление памяти прервано')); tx.onerror = () => {};
      });
      const request = meta.get('clock');
      request.onsuccess = () => {
          const draft = store.get('current');
          draft.onsuccess = () => {
           try {
            let clock = request.result;
            checkMemoryClock(clock); checkMemoryRecord(draft.result, clock);
            if (!clock) {
              if (!draft.result && !fallback && initialSource !== undefined) {
                if (initial.rawState === undefined) throw new MemoryCompatibilityError('damaged-import', 'Не удалось прочитать исходную поездку. Её копию можно скачать.');
                checkMemoryTrip(initial.rawState);
              }
              const candidate = draft.result || fallback || {...current, state: initial.rawState || current.state};
              const populated = !same(candidate.state, emptyTrip());
              restored = versionMemoryRecord({...candidate, revision: candidate.revision || (populated ? 1 : 0),
                savedAt: candidate.savedAt || new Date().toISOString(), label: candidate.label || 'Сохранённый черновик'});
              clock = memoryClock(restored); meta.put(clock, 'clock');
              if (populated) store.put(restored, 'current');
              return;
            }
            restored = draft.result || {...clock, state: emptyTrip()};
            if (fallback?.source === 'fallback' && (fallback.generation > clock.generation
              || (fallback.generation === clock.generation && fallback.revision > clock.revision))) {
              if (fallback.generation > clock.generation) history.clear();
              else if (draft.result) history.put(restored, restored.revision);
              restored = versionMemoryRecord({...fallback, savedAt: fallback.savedAt || new Date().toISOString(), label: 'Черновик из запасного хранилища'});
              if (same(restored.state, emptyTrip())) store.delete('current');
              else store.put(restored, 'current');
            }
            // Atomic, additive migration: do not pass existing data through a
            // catalog-dependent normalizer or change its revision/generation.
            if (restored.memoryVersion === undefined) {
              restored = versionMemoryRecord(restored);
              if (draft.result) store.put(restored, 'current');
            }
            meta.put(memoryClock(restored), 'clock');
           } catch (error) { migrationError = error; tx.abort(); }
          };
      };
      await done; compatibility = null; mode = 'indexeddb';
      if (restored.revision && !same(restored.state, emptyTrip())) mirror(restored);
      else if (restored.generation) try { storage.removeItem(TRIP_KEY); } catch { /* database remains empty */ }
      mirrorClock(restored);
      adopt(restored);
  }
  const ready = connect().catch(error => {
    if (db || error instanceof MemoryCompatibilityError) { recovery(error); return; }
    mode = 'local';
    try { current = localRecord() || current; if (initialSource !== undefined) checkMemoryTrip(initial.rawState); adopt(current, initial.available); }
    catch (problem) { recovery(problem); }
  });
  async function sync() {
    await ready; await reconnect;
    if (!db && mode !== 'local') {
      try { await connect(); } catch (error) { recovery(error); }
    }
    if (!db) {
      try {
        const record = localRecord();
        if (record) {
          if (record.revision !== current.revision || saved) adopt(record);
        }
      }
      catch (error) { recovery(error); }
      return;
    }
    await new Promise(resolve => {
      const tx = db.transaction([STORE, META]), draft = tx.objectStore(STORE).get('current'), clock = tx.objectStore(META).get('clock');
      tx.oncomplete = () => {
        try {
        const record = draft.result || {...clock.result, state: emptyTrip()};
        checkMemoryClock(clock.result); checkMemoryRecord(draft.result, clock.result);
        compatibility = null; mode = 'indexeddb';
        if (record.revision !== current.revision || saved) adopt(record);
        } catch (error) { recovery(error); }
        resolve();
      };
      tx.onabort = resolve; tx.onerror = () => {};
    }).catch(recovery);
  }
  if (channel) channel.onmessage = () => { sync(); };
  function change(update, options = {}) {
    const generation = current.generation;
    const work = async () => {
      await ready; await reconnect;
      if (db) {
        try {
          const result = await transaction(update, {...options, generation: options.clear ? undefined : generation});
          if (!result.conflict) {
            if (options.clear) { compatibility = null; mode = 'indexeddb'; initialSource = undefined; }
            if (!options.clear) mirror(result.record);
            mirrorClock(result.record);
          }
          adopt(result.record); channel?.postMessage({revision: current.revision});
          return {...result, saved: true, fullyCleared: Boolean(options.clear && !result.conflict), state: structuredClone(current.state), revision: current.revision};
        } catch (error) {
          // A rejected edit is not a storage failure and must not be reapplied.
          if (error instanceof TripActionError) throw error.cause;
          if (error instanceof MemoryCompatibilityError) recovery(error);
          // Keep the durable record intact. The changed draft remains exportable
          // in this page, with an explicit failure notice.
          return pageDraft(update);
        }
      }
      if (mode !== 'local' && !options.clear) return pageDraft(update);
      const local = () => {
        let latest = current.state;
        let clock = current;
        try {
          clock = localRecord() || clock;
          if (!saved && clock.revision < current.revision && clock.generation === current.generation) clock = current;
          if (saved || clock.revision !== current.revision) latest = cleanTrip(clock.state, catalog);
        } catch (error) { if (!options.clear) { recovery(error); return pageDraft(update); } }
        if ((options.expectedRevision !== undefined && options.expectedRevision !== clock.revision) || (!options.clear && generation !== clock.generation)) {
          adopt(clock); return {conflict: true, before: latest, state: structuredClone(current.state), revision: current.revision, saved};
        }
        const record = versionMemoryRecord({...clock, revision: clock.revision + 1, generation: clock.generation + (options.clear ? 1 : 0), state: cleanTrip(update(structuredClone(latest)), catalog), source:'fallback', savedAt:new Date().toISOString()});
        let written = false;
        try { storage.setItem(LOCAL_RECORD, JSON.stringify(record)); written = true; } catch { /* truthful failure */ }
        if (written && options.clear) { compatibility = null; mode = 'local'; initialSource = undefined; }
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
    get compatibility() {return compatibility ? {...compatibility} : null;},
    async backup() {
      await ready; await reconnect;
      const local = {};
      for (const [key, name] of [[TRIP_KEY,'trip'],[LOCAL_RECORD,'clock']]) {
        try { local[name] = storage.getItem(key); } catch { local[name] = null; }
      }
      if (initialSource !== undefined) local.openedTrip = initialSource;
      let database = null;
      if (db) {
        const names = [STORE, HISTORY, META].filter(name => db.objectStoreNames.contains(name));
        database = {version: db.version, stores: {}};
        if (names.length) await new Promise((resolve, reject) => {
          const tx = db.transaction(names), requests = names.map(name => [name, tx.objectStore(name).getAll(), tx.objectStore(name).getAllKeys()]);
          tx.oncomplete = () => {
            for (const [name, values, keys] of requests) database.stores[name] = values.result.map((value, i) => ({key: keys.result[i], value}));
            resolve();
          };
          tx.onabort = () => reject(tx.error || Error('Не удалось прочитать исходную копию')); tx.onerror = () => {};
        });
      }
      return {format: 'godune.memory-backup', version: 1, createdAt: new Date().toISOString(), database, local,
        pageDraft: structuredClone(current.state)};
    },
    close() { db?.close(); db = null; channel?.close(); },
    async history() {
      await ready; await reconnect; if (!db || !db.objectStoreNames.contains(HISTORY)) return [];
      return new Promise(resolve => {
        const tx = db.transaction(HISTORY), request = tx.objectStore(HISTORY).getAll();
        tx.oncomplete = () => resolve(request.result.filter(record => {
          try { checkMemoryRecord(record); return true; } catch { return false; }
        }).map(record => ({...record, state: cleanTrip(record.state, catalog)})).sort((a,b) => b.revision-a.revision));
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
