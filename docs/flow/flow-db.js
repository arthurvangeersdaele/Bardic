/* Bardic Flow: everything kept on the device, in IndexedDB.
 *
 * stores
 *   flows  { uid, story: <story.json>, flow: <flow.json>, files: { path: blobKey }, lengths: { path: seconds }, updated }
 *   blobs  { key, blob, size, type }   audio, shared by every flow that points to it
 *   kv     { key, value }
 */
(function (global) {
  'use strict';

  const NAME = 'bardic-flow';
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((ok, ko) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('flows')) db.createObjectStore('flows', { keyPath: 'uid' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); ok(db); };
      req.onerror = () => ko(req.error);
      req.onblocked = () => ko(new Error('The Bardic Flow storage is busy. Close other Bardic Flow windows and try again.'));
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

  async function list() {
    const { os } = await store('flows', 'readonly');
    const all = await result(os.getAll());
    return all.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }
  async function get(id) {
    const { os } = await store('flows', 'readonly');
    return result(os.get(id));
  }
  async function put(rec, touch = true) {
    if (touch) rec.updated = new Date().toISOString();
    const { tx, os } = await store('flows', 'readwrite');
    os.put(rec);
    await done(tx);
    return rec;
  }
  async function remove(id) {
    const { tx, os } = await store('flows', 'readwrite');
    os.delete(id);
    await done(tx);
    await collect();
  }

  async function putBlob(blob, key = uid()) {
    // A standalone copy: Safari keeps a slice of an archive as a pointer to the whole archive.
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
  /** Every file of a flow, as a Map(path => Blob). */
  async function filesOf(rec) {
    const out = new Map();
    for (const [p, k] of Object.entries(rec.files || {})) {
      const b = await getBlob(k);
      if (b) out.set(p, b);
    }
    return out;
  }

  async function collect() {
    const used = new Set();
    (await list()).forEach((r) => Object.values(r.files || {}).forEach((k) => used.add(k)));
    const { os } = await store('blobs', 'readonly');
    const keys = await result(os.getAllKeys());
    const dead = keys.filter((k) => !used.has(k));
    if (!dead.length) return 0;
    const w = await store('blobs', 'readwrite');
    dead.forEach((k) => w.os.delete(k));
    await done(w.tx);
    return dead.length;
  }

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

  async function wipe() {
    const db = await open();
    const tx = db.transaction(['flows', 'blobs', 'kv'], 'readwrite');
    ['flows', 'blobs', 'kv'].forEach((n) => tx.objectStore(n).clear());
    await done(tx);
  }

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

  global.FlowDB = { uid, open, list, get, put, remove, putBlob, getBlob, filesOf, collect, getKV, setKV, wipe, persistence };
})(window);
