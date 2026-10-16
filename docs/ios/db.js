/* Bardic for iPhone: everything kept on the phone, in IndexedDB.
 *
 * stores
 *   stories  { uid, id, revision, created, bard, title, description, extra, updated, chapters: [chapter], soundbox: [sound] }
 *   blobs    { key, blob }            audio data, shared by every sound that points to it
 *   kv       { key, value }           'soundbox' = the shared soundbox (sounds), 'meta' = misc
 *
 * chapter { uid, title, extra, music: [sound], ambience: [sound], events: [sound] }
 * sound   { uid, name, blob: <blob key>, fileName, size, loop: 'once'|'twice'|'infinite', volume, duration, extra }
 */
(function (global) {
  'use strict';

  const NAME = 'bardic-ios';
  const VERSION = 1;
  const ZONES = ['music', 'ambience', 'events'];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((ok, ko) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('stories')) db.createObjectStore('stories', { keyPath: 'uid' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        ok(db);
      };
      req.onerror = () => ko(req.error);
      req.onblocked = () => ko(new Error('The Bardic storage is busy. Close other Bardic windows and try again.'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }

  const done = (tx) => new Promise((ok, ko) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error || new Error('Storage transaction aborted.'));
  });
  const result = (req) => new Promise((ok, ko) => { req.onsuccess = () => ok(req.result); req.onerror = () => ko(req.error); });

  async function store(name, mode) {
    const db = await open();
    const tx = db.transaction(name, mode);
    return { tx, os: tx.objectStore(name) };
  }

  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- stories ---------- */
  async function listStories() {
    const { os } = await store('stories', 'readonly');
    const all = await result(os.getAll());
    return all.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }
  async function getStory(id) {
    const { os } = await store('stories', 'readonly');
    return result(os.get(id));
  }
  async function putStory(story, touch = true) {
    if (touch) story.updated = new Date().toISOString();
    const { tx, os } = await store('stories', 'readwrite');
    os.put(story);
    await done(tx);
    return story;
  }
  async function deleteStory(id) {
    const { tx, os } = await store('stories', 'readwrite');
    os.delete(id);
    await done(tx);
    await collect();
  }

  /* ---------- blobs ---------- */
  async function putBlob(blob, key = uid()) {
    // Store a standalone copy of the bytes. Safari keeps a sound cut out of a .bardic archive (a Blob slice)
    // as a pointer to the whole archive, and after a relaunch gives back the start of the archive instead:
    // every sound then played the first sound of the file.
    const type = blob.type || 'audio/mpeg';
    const own = new Blob([await blob.arrayBuffer()], { type });
    const { tx, os } = await store('blobs', 'readwrite');
    os.put({ key, blob: own, size: own.size, type });
    await done(tx);
    return key;
  }
  async function getBlob(key) {
    const { os } = await store('blobs', 'readonly');
    const rec = await result(os.get(key));
    return rec ? rec.blob : null;
  }
  async function blobKeys() {
    const { os } = await store('blobs', 'readonly');
    return result(os.getAllKeys());
  }
  async function blobSizes() {
    const { os } = await store('blobs', 'readonly');
    const out = new Map();
    await new Promise((ok, ko) => {
      const req = os.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { ok(); return; }
        out.set(c.key, c.value.size || (c.value.blob && c.value.blob.size) || 0);
        c.continue();
      };
      req.onerror = () => ko(req.error);
    });
    return out;
  }

  /* ---------- key / value ---------- */
  async function getKV(key, fallback) {
    const { os } = await store('kv', 'readonly');
    const rec = await result(os.get(key));
    return rec ? rec.value : fallback;
  }
  async function setKV(key, value) {
    const { tx, os } = await store('kv', 'readwrite');
    os.put({ key, value });
    await done(tx);
  }

  /* ---------- helpers ---------- */
  function soundsOf(story) {
    const out = [];
    (story.chapters || []).forEach((c) => ZONES.forEach((z) => (c[z] || []).forEach((s) => out.push(s))));
    (story.soundbox || []).forEach((s) => out.push(s));
    return out;
  }

  /** Deletes audio no sound points to any more. */
  async function collect() {
    const used = new Set();
    (await listStories()).forEach((s) => soundsOf(s).forEach((x) => used.add(x.blob)));
    (await getKV('soundbox', [])).forEach((x) => used.add(x.blob));
    const keys = await blobKeys();
    const dead = keys.filter((k) => !used.has(k));
    if (!dead.length) return 0;
    const { tx, os } = await store('blobs', 'readwrite');
    dead.forEach((k) => os.delete(k));
    await done(tx);
    return dead.length;
  }

  async function wipe() {
    const db = await open();
    const tx = db.transaction(['stories', 'blobs', 'kv'], 'readwrite');
    ['stories', 'blobs', 'kv'].forEach((n) => tx.objectStore(n).clear());
    await done(tx);
  }

  /* ---------- persistence ---------- */
  async function persistence() {
    const out = { persisted: null, usage: null, quota: null };
    try {
      if (navigator.storage && navigator.storage.persisted) {
        out.persisted = await navigator.storage.persisted();
        if (!out.persisted && navigator.storage.persist) out.persisted = await navigator.storage.persist();
      }
    } catch (e) { /* not supported */ }
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        out.usage = e.usage; out.quota = e.quota;
      }
    } catch (e) { /* not supported */ }
    return out;
  }

  global.BardicDB = {
    ZONES, uid, open, listStories, getStory, putStory, deleteStory,
    putBlob, getBlob, blobSizes, getKV, setKV, soundsOf, collect, wipe, persistence,
  };
})(window);
