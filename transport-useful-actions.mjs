const STORAGE_KEY = 'godune:transport-useful-actions';
const VERSION = 1;
const PROFILES = Object.freeze(['curonian-210', 'baltic-ferry']);
const ACTIONS = Object.freeze(['calculated', 'saved', 'pdf_ready', 'reopened']);

function emptyCounts() {
  return Object.fromEntries(PROFILES.map(profile => [profile,
    Object.fromEntries(ACTIONS.map(action => [action, 0]))]));
}

function validCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(value).length !== PROFILES.length) return false;
  return PROFILES.every(profile => {
    const counts = value[profile];
    return counts && typeof counts === 'object' && !Array.isArray(counts)
      && Object.keys(counts).length === ACTIONS.length
      && ACTIONS.every(action => Number.isSafeInteger(counts[action]) && counts[action] >= 0);
  });
}

function readStored(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return {ok: true, data: {version: VERSION, profiles: emptyCounts()}};
  let data;
  try { data = JSON.parse(raw); }
  catch { return {ok: false, reason: 'corrupt'}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !Number.isInteger(data.version) || data.version !== VERSION || !validCounts(data.profiles)
      || Object.keys(data).length !== 2 || !Object.hasOwn(data, 'profiles')) {
    return {ok: false, reason: Number.isInteger(data?.version) && data.version > VERSION ? 'future_version' : 'corrupt'};
  }
  return {ok: true, data};
}

function getStorage(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function readTransportActions(storage) {
  try {
    const result = readStored(getStorage(storage));
    if (!result.ok) return {ok: false, version: VERSION, profiles: emptyCounts(), reason: result.reason};
    return result.data;
  } catch {
    return {ok: false, version: VERSION, profiles: emptyCounts(), reason: 'unavailable'};
  }
}

export function recordTransportAction({profile, action} = {}, storage) {
  if (!PROFILES.includes(profile) || !ACTIONS.includes(action)) return {ok: false, reason: 'invalid_input'};
  try {
    const target = getStorage(storage);
    const result = readStored(target);
    if (!result.ok) return result;
    const next = result.data;
    if (next.profiles[profile][action] === Number.MAX_SAFE_INTEGER) return {ok: false, reason: 'counter_limit'};
    next.profiles[profile][action] += 1;
    target.setItem(STORAGE_KEY, JSON.stringify(next));
    return {ok: true, data: next};
  } catch {
    return {ok: false, reason: 'unavailable'};
  }
}
