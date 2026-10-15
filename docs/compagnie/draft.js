/* Bardic Story builder draft: the story being forged is kept in this browser (IndexedDB) as it changes,
 * sounds included, so leaving the page, closing the tab or a crash never loses the work.
 * Each sound file is written once, under a key of its own; the story itself is a small record rewritten on every change. */
(() => {
  'use strict';
  const DB_NAME = 'bardic-builder';
  const STORY = 'draft';
  const BLOBS = 'blobs';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORY)) db.createObjectStore(STORY);
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  const done = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
  const ask = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

  // Every sound blob gets a stable key the first time it is saved; the same File object keeps it.
  const keys = new WeakMap();
  const saved = new Set();
  let n = 0;
  const keyOf = (blob) => {
    let k = keys.get(blob);
    if (!k) { k = `b${Date.now().toString(36)}${(++n).toString(36)}${Math.random().toString(36).slice(2, 7)}`; keys.set(blob, k); }
    return k;
  };

  const strip = (s) => {
    const o = { name: s.name, fileName: s.fileName, loop: s.loop, volume: s.volume, extra: s.extra || {}, blob: keyOf(s.blob) };
    if (s.duration) o.duration = s.duration;
    return o;
  };

  /** Writes the story; only the sound files not written before are stored. Files no longer used are removed. */
  async function save(state, current) {
    const db = await open();
    const sounds = [];
    const record = {
      v: 1, savedAt: Date.now(), current,
      id: state.id, revision: state.revision, created: state.created,
      title: state.title || '', description: state.description || '', extra: state.extra || {},
      chapters: state.chapters.map((c) => {
        const out = { title: c.title, extra: c.extra || {} };
        window.Bardic.ZONES.forEach((z) => { out[z] = c[z].map((s) => { sounds.push(s); return strip(s); }); });
        return out;
      }),
      soundbox: state.soundbox.map((s) => { sounds.push(s); return strip(s); }),
    };
    const fresh = sounds.filter((s) => !saved.has(keyOf(s.blob)));
    if (fresh.length) {
      const tx = db.transaction(BLOBS, 'readwrite');
      const st = tx.objectStore(BLOBS);
      const seen = new Set();
      fresh.forEach((s) => { const k = keyOf(s.blob); if (!seen.has(k)) { seen.add(k); st.put(s.blob, k); } });
      await done(tx);
      seen.forEach((k) => saved.add(k));
    }
    const tx = db.transaction([STORY, BLOBS], 'readwrite');
    tx.objectStore(STORY).put(record, 'current');
    const used = new Set(sounds.map((s) => keyOf(s.blob)));
    const all = await ask(tx.objectStore(BLOBS).getAllKeys());
    all.forEach((k) => { if (!used.has(k)) { tx.objectStore(BLOBS).delete(k); saved.delete(k); } });
    await done(tx);
  }

  /** The saved story with its sound files back as blobs, or null. */
  async function load() {
    const db = await open();
    const tx = db.transaction([STORY, BLOBS], 'readonly');
    const record = await ask(tx.objectStore(STORY).get('current'));
    if (!record) return null;
    const blobs = new Map();
    const bs = tx.objectStore(BLOBS);
    const want = new Set();
    record.chapters.forEach((c) => window.Bardic.ZONES.forEach((z) => (c[z] || []).forEach((s) => want.add(s.blob))));
    record.soundbox.forEach((s) => want.add(s.blob));
    await Promise.all([...want].map(async (k) => { const b = await ask(bs.get(k)); if (b) blobs.set(k, b); }));
    let lost = 0;
    const back = (s) => {
      const b = blobs.get(s.blob);
      if (!b) { lost++; return null; }
      keys.set(b, s.blob); saved.add(s.blob);
      return Object.assign({}, s, { blob: b });
    };
    const story = {
      id: record.id, revision: record.revision || 0, created: record.created,
      title: record.title, description: record.description, extra: record.extra || {},
      chapters: record.chapters.map((c) => {
        const out = { title: c.title, extra: c.extra || {} };
        window.Bardic.ZONES.forEach((z) => { out[z] = (c[z] || []).map(back).filter(Boolean); });
        return out;
      }),
      soundbox: record.soundbox.map(back).filter(Boolean),
    };
    return { story, current: record.current || 0, savedAt: record.savedAt, lost };
  }

  async function clear() {
    const db = await open();
    const tx = db.transaction([STORY, BLOBS], 'readwrite');
    tx.objectStore(STORY).clear();
    tx.objectStore(BLOBS).clear();
    await done(tx);
    saved.clear();
  }

  window.BardicDraft = { save, load, clear };
})();
