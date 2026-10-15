const DB_NAME = 'godune-field-notes-v1';
const DB_STORE = 'drafts';
const STORAGE_PREFIX = 'godune-field-note:v1:';
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const MAX_NOTE_CHARS = 4000;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VALUES = {
  verification_type: new Set(['confirmed', 'price_update', 'friction_warning']),
  visit_period: new Set(['today', 'week', 'month']),
  context_tag: new Set(['walking', 'weekend', 'family', 'local'])
};

const TYPE_LABELS = {
  confirmed: 'Подтверждение на месте',
  price_update: 'Изменение цены',
  friction_warning: 'Что-то помешало'
};
const PERIOD_LABELS = {today: 'Сегодня', week: 'На этой неделе', month: 'В этом месяце'};
const CONTEXT_LABELS = {walking: 'Прогулка', weekend: 'Выходные', family: 'С детьми или семьёй', local: 'Местный опыт'};

function cleanText(value, limit = MAX_NOTE_CHARS) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, limit);
}

function safeNode(form) {
  const key = cleanText(form.dataset.nodeKey, 64);
  const id = cleanText(form.dataset.nodeId, 120);
  const kind = form.dataset.nodeKind;
  const name = cleanText(form.dataset.nodeName, 180);
  let url = '';
  try {
    const parsed = new URL(form.dataset.nodeUrl);
    if (parsed.protocol === 'https:') url = parsed.href;
  } catch {}
  if (!/^[a-f0-9]{16}$/i.test(key) || !id || !['Place', 'Route'].includes(kind) || !name || !url) {
    throw new Error('Не удалось определить место или маршрут для заметки. Обновите страницу и попробуйте снова.');
  }
  return {key, id, kind, name, url};
}

async function stripWebPMetadata(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  const malformed = () => new Error('Браузер создал повреждённое фото. Выберите другое изображение.');
  if (bytes.length < 12 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) {
    throw new Error('Браузер создал файл в неподдерживаемом формате. Выберите другое фото.');
  }

  const chunks = [];
  let offset = 12;
  let extendedHeader = null;
  let hasMetadata = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw malformed();
    const kind = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const paddedSize = size + (size % 2);
    const end = offset + 8 + paddedSize;
    if (end > bytes.length) throw malformed();
    if (kind === 'VP8X') {
      if (extendedHeader || size !== 10) throw malformed();
      extendedHeader = {offset, flags: bytes[offset + 8]};
    }
    if (kind === 'ICCP' || kind === 'EXIF' || kind === 'XMP ') {
      hasMetadata = true;
    } else {
      chunks.push({kind, offset, end});
    }
    offset = end;
  }
  if (offset !== bytes.length) throw malformed();

  if (extendedHeader) {
    // VP8X feature bits: ICC profile 0x20, EXIF 0x08, XMP 0x04.
    const flags = extendedHeader.flags & ~0x2c;
    if (flags !== extendedHeader.flags) hasMetadata = true;
    extendedHeader.flags = flags;
  }
  if (!hasMetadata) return blob;

  const chunkBytes = chunks.reduce((total, chunk) => total + chunk.end - chunk.offset, 0);
  const output = new Uint8Array(12 + chunkBytes);
  output.set(bytes.subarray(0, 12), 0);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(4, output.length - 8, true);
  let target = 12;
  for (const chunk of chunks) {
    const length = chunk.end - chunk.offset;
    output.set(bytes.subarray(chunk.offset, chunk.end), target);
    if (chunk.kind === 'VP8X') output[target + 8] = extendedHeader.flags;
    target += length;
  }
  return new Blob([output], {type: 'image/webp'});
}

/** Re-encodes an accepted image through canvas, removing source metadata. */
export async function stripExifAndCompress(file, environment = globalThis) {
  if (!file || !ALLOWED_TYPES.has(file.type)) {
    throw new Error('Подойдут фото в форматах JPEG, PNG или WebP.');
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_SOURCE_BYTES) {
    throw new Error('Размер фото должен быть меньше 15 МБ.');
  }
  if (typeof environment.createImageBitmap !== 'function' ||
      (typeof environment.OffscreenCanvas !== 'function' && typeof environment.document?.createElement !== 'function')) {
    throw new Error('Этот браузер не умеет безопасно подготовить фото. Текст заметки можно сохранить без снимка.');
  }
  let bitmap;
  try {
    bitmap = await environment.createImageBitmap(file, {imageOrientation: 'from-image'});
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = typeof environment.OffscreenCanvas === 'function'
      ? new environment.OffscreenCanvas(width, height)
      : environment.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', {alpha: false});
    if (!context) throw new Error('Не удалось обработать изображение. Текст заметки можно сохранить без снимка.');
    context.drawImage(bitmap, 0, 0, width, height);
    const cleaned = typeof canvas.convertToBlob === 'function'
      ? await canvas.convertToBlob({type: 'image/webp', quality: 0.82})
      : await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось обработать фото.')), 'image/webp', 0.82));
    if (cleaned.type !== 'image/webp') {
      throw new Error('Браузер не поддерживает WebP. Текст заметки можно сохранить без снимка.');
    }
    if (cleaned.size > MAX_OUTPUT_BYTES) throw new Error('Подготовленное фото больше 8 МБ. Выберите снимок поменьше.');
    return await stripWebPMetadata(cleaned);
  } catch (error) {
    if (error instanceof Error && error.message) throw error;
    throw new Error('Фото не удалось обработать. Можно сохранить заметку без снимка.');
  } finally {
    bitmap?.close?.();
  }
}

function openDatabase(environment) {
  return new Promise((resolve, reject) => {
    if (!environment.indexedDB) return reject(new Error('IndexedDB недоступна'));
    const request = environment.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE, {keyPath: 'key'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть хранилище'));
    request.onblocked = () => reject(new Error('Хранилище занято другой вкладкой'));
  });
}

async function dbRequest(environment, mode, action, record) {
  const db = await openDatabase(environment);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, mode);
      const store = transaction.objectStore(DB_STORE);
      const request = action === 'get' ? store.get(record.key) : action === 'delete' ? store.delete(record.key) : store.put(record);
      let result;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        reject(error || new Error('Не удалось завершить операцию с черновиком'));
      };
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => fail(request.error || new Error('Не удалось выполнить запрос черновика'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onerror = () => fail(new Error('Ошибка при записи черновика в хранилище браузера.'));
      transaction.onabort = () => fail(new Error('Браузер отменил транзакцию с черновиком.'));
    });
  } finally {
    db.close();
  }
}

function getStorage(environment) {
  try { return environment.localStorage; } catch { return null; }
}

function status(form, message) {
  const target = form.querySelector('[data-field-status]');
  if (target) target.textContent = message;
}

function fields(form) {
  const result = {};
  for (const name of Object.keys(VALUES)) {
    const selected = form.querySelector(`[name="${name}"]`);
    result[name] = selected && VALUES[name].has(selected.value) ? selected.value : '';
  }
  result.note = cleanText(form.querySelector('[name="note"]')?.value, MAX_NOTE_CHARS);
  return result;
}

function applyFields(form, draft) {
  for (const name of Object.keys(VALUES)) {
    const control = form.querySelector(`[name="${name}"]`);
    if (control && VALUES[name].has(draft?.[name])) control.value = draft[name];
  }
  const note = form.querySelector('[name="note"]');
  if (note) note.value = cleanText(draft?.note, MAX_NOTE_CHARS);
}

function payloadFor(form) {
  const f = fields(form);
  const key = safeNode(form).key;
  const suffix = {confirmed: 'c', price_update: 'u', friction_warning: 'w'}[f.verification_type] || 'c';
  return `fn_${key}_${suffix}`;
}

function updateTelegramLink(form) {
  const anchor = form.querySelector('[data-field-telegram]');
  if (!anchor) return;
  const username = cleanText(form.dataset.botUsername, 32).replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    anchor.removeAttribute('href');
    anchor.setAttribute('aria-disabled', 'true');
    return;
  }
  anchor.href = `https://t.me/${username}?start=${encodeURIComponent(payloadFor(form))}`;
  anchor.removeAttribute('aria-disabled');
}

function plainCard(form) {
  const node = safeNode(form);
  const f = fields(form);
  const lines = [
    `${TYPE_LABELS[f.verification_type] || 'Заметка с места'}: ${node.name}`,
    `Когда: ${PERIOD_LABELS[f.visit_period] || 'не указано'}`,
    `Контекст: ${CONTEXT_LABELS[f.context_tag] || 'не указан'}`
  ];
  if (f.note) lines.push(`Наблюдение: ${f.note}`);
  lines.push(`Карточка: ${node.url}`);
  return lines.join('\n');
}

function download(blob, filename, environment) {
  const url = environment.URL.createObjectURL(blob);
  const link = environment.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  environment.document.body.append(link);
  link.click();
  link.remove();
  environment.setTimeout(() => environment.URL.revokeObjectURL(url), 1000);
}

function makeExport(form, photoBlob) {
  const node = safeNode(form);
  const f = fields(form);
  return {
    schema: 'godune.field-note',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    node: {id: node.id, kind: node.kind, name: node.name, url: node.url},
    verification_type: f.verification_type || null,
    visit_period: f.visit_period || null,
    context_tag: f.context_tag || null,
    note: f.note,
    photo: photoBlob ? {filename: 'field-note.webp', mime_type: 'image/webp', separate_file: true} : null
  };
}

function showPhoto(form, blob, environment, state) {
  if (state.photoUrl) environment.URL.revokeObjectURL(state.photoUrl);
  state.photoUrl = '';
  const preview = form.querySelector('[data-field-photo-preview]');
  const image = preview?.matches('img') ? preview : preview?.querySelector('img');
  if (!blob || !image) {
    if (image) { image.removeAttribute('src'); image.hidden = true; }
    return;
  }
  state.photoUrl = environment.URL.createObjectURL(blob);
  image.src = state.photoUrl;
  image.alt = 'Подготовленное фото для заметки';
  image.hidden = false;
}

export async function initFieldNotes(form, environment = globalThis) {
  if (!form || form.dataset.fieldNotesReady === 'true') return null;
  form.dataset.fieldNotesReady = 'true';
  let node;
  try { node = safeNode(form); }
  catch (error) { status(form, error.message); return null; }
  const state = {photo: null, photoName: '', photoUrl: '', lastUpdatedAt: 0, saveQueue: Promise.resolve(), destroyed: false};
  const storage = getStorage(environment);
  const localKey = `${STORAGE_PREFIX}${node.key}`;
  const getDraft = async () => {
    let indexedDraft = null;
    let fallbackDraft = null;
    try {
      const record = await dbRequest(environment, 'readonly', 'get', {key: node.key});
      if (record?.version === 1 && record.key === node.key) indexedDraft = record;
    } catch {}
    try {
      const text = storage?.getItem(localKey);
      if (text) {
        const draft = JSON.parse(text);
        if (draft?.version === 1 && draft.key === node.key) fallbackDraft = {...draft, photo: null};
      }
    } catch {}
    if (!indexedDraft) return fallbackDraft;
    if (!fallbackDraft) return indexedDraft;
    const indexedTime = Number.isFinite(indexedDraft.updatedAt) ? indexedDraft.updatedAt : 0;
    const fallbackTime = Number.isFinite(fallbackDraft.updatedAt) ? fallbackDraft.updatedAt : 0;
    return fallbackTime > indexedTime ? fallbackDraft : indexedDraft;
  };
  const persistText = draft => {
    if (!storage) throw new Error('Браузер заблокировал локальное хранилище.');
    try { storage.setItem(localKey, JSON.stringify(draft)); }
    catch { throw new Error('Браузер не смог сохранить текст черновика. Освободите место в хранилище и попробуйте снова.'); }
  };
  const save = () => {
    state.saveQueue = state.saveQueue.then(async () => {
      state.lastUpdatedAt = Math.max(Date.now(), state.lastUpdatedAt + 1);
      const draft = {version: 1, key: node.key, updatedAt: state.lastUpdatedAt, ...fields(form)};
      let fallbackError = null;
      try { persistText(draft); } catch (error) { fallbackError = error; }
      try {
        await dbRequest(environment, 'readwrite', 'put', {
          ...draft, photo: state.photo, photoName: state.photoName
        });
        status(form, state.photo ? 'Черновик и подготовленное фото сохранены на этом устройстве.' : 'Черновик сохранён на этом устройстве.');
      } catch {
        if (!fallbackError) status(form, state.photo ? 'Текст сохранён. Фото не удалось сохранить в этом браузере.' : 'Текст сохранён в запасном хранилище браузера.');
        else status(form, `${fallbackError.message} Черновик не удалось сохранить.`);
      }
    }).catch(error => status(form, error.message || 'Браузер не сохранил черновик. Скопируйте или экспортируйте заметку.'));
    return state.saveQueue;
  };
  const restore = await getDraft();
  if (restore) {
    applyFields(form, restore);
    state.lastUpdatedAt = Number.isFinite(restore.updatedAt) ? restore.updatedAt : 0;
    state.photo = restore.photo instanceof Blob ? restore.photo : null;
    state.photoName = cleanText(restore.photoName, 120);
    showPhoto(form, state.photo, environment, state);
    status(form, state.photo ? 'Черновик с фото восстановлен на этом устройстве.' : 'Черновик восстановлен на этом устройстве.');
  }
  updateTelegramLink(form);

  const onChange = event => {
    if (event.target?.name === 'photo') return;
    updateTelegramLink(form);
    save();
  };
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  form.addEventListener('submit', event => event.preventDefault());
  form.querySelector('[data-field-save]')?.addEventListener('click', () => save());
  form.querySelector('[data-field-copy]')?.addEventListener('click', async () => {
    try {
      if (!environment.navigator?.clipboard?.writeText) throw new Error();
      await environment.navigator.clipboard.writeText(plainCard(form));
      status(form, 'Текст заметки скопирован. Откройте бота и вставьте его вручную.');
    } catch {
      status(form, 'Не удалось скопировать текст. Вы можете выделить его и скопировать вручную.');
    }
  });
  form.querySelector('[data-field-export]')?.addEventListener('click', async () => {
    try {
      const blob = new Blob([JSON.stringify(makeExport(form, state.photo), null, 2)], {type: 'application/json;charset=utf-8'});
      download(blob, `godune-field-note-${node.key}.json`, environment);
      status(form, state.photo ? 'JSON-файл выгружен. Фото скачайте отдельно.' : 'JSON-файл заметки выгружен.');
    } catch (error) { status(form, error.message || 'Не удалось выгрузить JSON-файл.'); }
  });
  form.querySelector('[data-field-photo-download]')?.addEventListener('click', () => {
    if (!state.photo) { status(form, 'Сначала выберите фото для заметки.'); return; }
    download(state.photo, `godune-field-note-${node.key}.webp`, environment);
    status(form, 'Подготовленное фото скачано отдельно от JSON-файла.');
  });
  form.querySelector('[data-field-clear]')?.addEventListener('click', async () => {
    try {
      await state.saveQueue;
      if (environment.indexedDB) await dbRequest(environment, 'readwrite', 'delete', {key: node.key});
      if (storage) storage.removeItem(localKey);
      for (const name of [...Object.keys(VALUES), 'note', 'photo']) {
        const control = form.querySelector(`[name="${name}"]`);
        if (!control) continue;
        if (control.type === 'file') control.value = '';
        else if (control.type === 'radio' || control.type === 'checkbox') control.checked = false;
        else control.value = '';
      }
      state.photo = null;
      state.photoName = '';
      showPhoto(form, null, environment, state);
      updateTelegramLink(form);
      status(form, 'Черновик этого места или маршрута удалён с этого устройства.');
    } catch (error) {
      status(form, error.message || 'Не удалось очистить черновик в хранилище браузера.');
    }
  });
  form.querySelector('[name="photo"]')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    status(form, 'Подготавливаем фото и удаляем метаданные…');
    try {
      state.photo = await stripExifAndCompress(file, environment);
      state.photoName = 'field-note.webp';
      showPhoto(form, state.photo, environment, state);
      await save();
    } catch (error) {
      state.photo = null;
      state.photoName = '';
      showPhoto(form, null, environment, state);
      status(form, error.message || 'Фото не удалось подготовить. Текст заметки можно сохранить без снимка.');
    }
  });
  const destroy = () => {
    if (state.destroyed) return;
    state.destroyed = true;
    if (state.photoUrl) environment.URL.revokeObjectURL(state.photoUrl);
  };
  environment.addEventListener?.('pagehide', destroy, {once: true});
  return {save, destroy, get state() { return state; }};
}

function boot() {
  document.querySelectorAll('form[data-field-note-form]').forEach(form => { void initFieldNotes(form); });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
}
