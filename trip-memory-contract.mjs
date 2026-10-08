export const MEMORY_VERSION = 1;

export class MemoryCompatibilityError extends Error {
  constructor(code, message) { super(message); this.name = 'MemoryCompatibilityError'; this.code = code; }
}
const fail = (code, message) => { throw new MemoryCompatibilityError(code, message); };
const counter = value => Number.isSafeInteger(value) && value >= 0;

// IndexedDB's structural version and the data format are independent. Legacy
// records have no memoryVersion; adding it never rewrites their Trip fields.
export function checkMemoryClock(clock) {
  if (clock == null) return;
  if (clock.memoryVersion !== undefined && clock.memoryVersion !== MEMORY_VERSION)
    fail('newer-memory', 'Поездка сохранена другой версией сайта. Обновите страницу или скачайте исходную копию.');
  if (!counter(clock.revision) || !counter(clock.generation))
    fail('damaged-clock', 'Не удалось прочитать версию сохранённой поездки. Исходную копию можно скачать.');
}

export function checkMemoryTrip(state) {
  if (!state || typeof state !== 'object' || state.version !== 1)
    fail('unsupported-trip', 'Формат сохранённой поездки пока не поддерживается. Исходную копию можно скачать.');
  if (!Array.isArray(state.places) || !Array.isArray(state.routes)
    || ![...state.places, ...state.routes].every(id => typeof id === 'string'))
    fail('damaged-trip', 'Не удалось прочитать сохранённую поездку. Исходную копию можно скачать.');
}

export function checkMemoryRecord(record, clock) {
  if (record == null) return;
  checkMemoryClock(record); checkMemoryTrip(record.state);
  if (clock && (clock.revision !== record.revision || clock.generation !== record.generation))
    fail('mismatched-clock', 'Версии сохранённой поездки не совпадают. Исходную копию можно скачать.');
}

export const memoryClock = record => ({memoryVersion: MEMORY_VERSION, revision: record.revision, generation: record.generation});
export const versionMemoryRecord = record => ({...record, memoryVersion: MEMORY_VERSION});
