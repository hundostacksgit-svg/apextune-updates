/*
 * Local persistence: projects and the media files they reference.
 *
 * IndexedDB rather than localStorage because media blobs are megabytes and
 * localStorage tops out around five. Everything stays on the device; nothing
 * here talks to a network.
 *
 * Media is keyed by a content hash, not a filename. That is what makes
 * "media offline" — the single most-complained-about thing in Premiere — not
 * happen here: rename or move the file and the project still finds it, because
 * what was stored is the file itself.
 */

const DB_NAME = 'omnidx-studio';
const DB_VERSION = 1;
const S_PROJECTS = 'projects';
const S_MEDIA = 'media';
const S_PREFS = 'prefs';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(S_PROJECTS)) {
        db.createObjectStore(S_PROJECTS, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(S_MEDIA)) db.createObjectStore(S_MEDIA, { keyPath: 'hash' });
      if (!db.objectStoreNames.contains(S_PREFS)) db.createObjectStore(S_PREFS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/* ------------------------------------------------------------------ */
/* projects                                                            */
/* ------------------------------------------------------------------ */

export async function saveProject(doc) {
  const record = {
    ...doc,
    updatedAt: Date.now(),
    // Runtime-only handles must never reach the database.
    media: doc.media.map(({ el: _e, blob: _b, objectUrl: _u, buffer: _f, ...rest }) => rest),
  };
  await tx(S_PROJECTS, 'readwrite', (s) => s.put(record));
  return record;
}

export function loadProject(id) {
  return tx(S_PROJECTS, 'readonly', (s) => s.get(id));
}

export async function listProjects() {
  const all = await tx(S_PROJECTS, 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function deleteProject(id) {
  return tx(S_PROJECTS, 'readwrite', (s) => s.delete(id));
}

/* ------------------------------------------------------------------ */
/* media                                                               */
/* ------------------------------------------------------------------ */

/**
 * SHA-256 of the first and last megabyte plus the size. Hashing a 4 GB file in
 * full would freeze the tab for a minute; this is enough to tell two files
 * apart while staying instant.
 */
export async function fingerprint(file) {
  const CHUNK = 1024 * 1024;
  const head = await file.slice(0, Math.min(CHUNK, file.size)).arrayBuffer();
  const tail = file.size > CHUNK
    ? await file.slice(Math.max(0, file.size - CHUNK)).arrayBuffer()
    : new ArrayBuffer(0);
  const buf = new Uint8Array(head.byteLength + tail.byteLength + 8);
  buf.set(new Uint8Array(head), 0);
  buf.set(new Uint8Array(tail), head.byteLength);
  new DataView(buf.buffer).setFloat64(buf.length - 8, file.size);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function putMedia(hash, file, meta = {}) {
  await tx(S_MEDIA, 'readwrite', (s) => s.put({ hash, blob: file, name: file.name, type: file.type, size: file.size, meta, at: Date.now() }));
  return hash;
}

export function getMedia(hash) {
  return tx(S_MEDIA, 'readonly', (s) => s.get(hash));
}

export function deleteMedia(hash) {
  return tx(S_MEDIA, 'readwrite', (s) => s.delete(hash));
}

/** Drop stored media no remaining project refers to. */
export async function pruneMedia() {
  const [projects, keys] = await Promise.all([
    listProjects(),
    tx(S_MEDIA, 'readonly', (s) => s.getAllKeys()),
  ]);
  const used = new Set(projects.flatMap((p) => (p.media || []).map((m) => m.hash)));
  const dead = (keys || []).filter((k) => !used.has(k));
  for (const k of dead) await deleteMedia(k);
  return dead.length;
}

export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const { usage: used, quota } = await navigator.storage.estimate();
  return { used, quota };
}

/**
 * Ask the browser not to evict our data when disk gets tight. Chrome grants it
 * silently for installed apps; elsewhere it may prompt or refuse, and either
 * way the editor keeps working.
 */
export async function persist() {
  try { return await navigator.storage?.persist?.() ?? false; } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* preferences                                                         */
/* ------------------------------------------------------------------ */

export function pref(key, value) {
  if (value === undefined) return tx(S_PREFS, 'readonly', (s) => s.get(key));
  return tx(S_PREFS, 'readwrite', (s) => s.put(value, key));
}

/* ------------------------------------------------------------------ */
/* crash recovery                                                      */
/* ------------------------------------------------------------------ */
/* A small, synchronous mirror of the open project. IndexedDB writes are async
   and a tab that is being killed does not get to finish one; localStorage
   writes land immediately, so this is what survives a crash. */

const CRASH_KEY = 'omnidx.studio.crash.v1';

/**
 * Mirror the open project. Written on every change, marked `clean: false`.
 *
 * The trick to not nagging people on every ordinary reload is that a clean
 * exit gets to run markClean() from pagehide, and a crash does not. So an
 * unclean record is real evidence something went wrong, and that is the only
 * time we offer to restore.
 */
export function markDirty(doc) {
  try {
    localStorage.setItem(CRASH_KEY, JSON.stringify({
      at: Date.now(),
      clean: false,
      id: doc.id,
      name: doc.name,
      doc: { ...doc, media: doc.media.map(({ el: _e, blob: _b, objectUrl: _u, buffer: _f, ...r }) => r) },
    }));
  } catch { /* quota — the IndexedDB autosave is still the main safety net */ }
}

/** Called from pagehide. Must be synchronous: the tab is going away. */
export function markClean() {
  try {
    const raw = localStorage.getItem(CRASH_KEY);
    if (!raw) return;
    const rec = JSON.parse(raw);
    rec.clean = true;
    localStorage.setItem(CRASH_KEY, JSON.stringify(rec));
  } catch { /* nothing stored, or storage is gone */ }
}

export function clearDirty() {
  try { localStorage.removeItem(CRASH_KEY); } catch { /* nothing stored */ }
}

/** A project worth offering to restore, or null. */
export function recoverable() {
  try {
    const raw = localStorage.getItem(CRASH_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (rec?.clean) return null;             // the tab closed properly
    return rec?.doc?.clips ? rec : null;
  } catch { return null; }
}
