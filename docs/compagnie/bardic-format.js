/* Reads and writes .bardic files (format 2, reads 1 too) in the browser. Spec: BARDIC_FORMAT.md at the repo root.
 * A .bardic file is a ZIP archive with story.json and the audio files, written stored (no compression). */
(function (global) {
  'use strict';

  const ZONES = ['music', 'ambience', 'events'];
  const LOOPS = ['once', 'twice', 'infinite'];
  const AUDIO_EXT = ['mp3', 'ogg', 'm4a', 'wav'];
  const SHARE_LIMIT = 100 * 1024 * 1024;

  /* ---------- CRC32 ---------- */
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  /* ---------- ZIP writer (stored entries) ---------- */
  async function writeZip(entries, onProgress) {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;
    const total = entries.reduce((a, e) => a + (e.data.size ?? e.data.byteLength), 0) || 1;
    let done = 0;
    for (const e of entries) {
      const name = enc.encode(e.name);
      const bytes = e.data instanceof Blob ? new Uint8Array(await e.data.arrayBuffer()) : e.data;
      const crc = crc32(bytes);
      const size = bytes.byteLength;
      if (offset + size > 0xfffffff0) throw new Error('A .bardic file must stay under 4 GB.');
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(local.buffer, name, e.data instanceof Blob ? e.data : bytes);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, time, true);
      cd.setUint16(14, date, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, size, true);
      cd.setUint32(24, size, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(cd.buffer, name);
      offset += 30 + name.length + size;
      done += size;
      if (onProgress) onProgress(done / total);
      await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
    }
    const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  /* ---------- ZIP reader (stored and deflated entries) ---------- */
  async function readZip(blob) {
    const tailSize = Math.min(blob.size, 65557);
    const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer());
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not a .bardic file (no ZIP directory found).');
    const count = tail.getUint16(eocd + 10, true);
    const cdSize = tail.getUint32(eocd + 12, true);
    const cdOffset = tail.getUint32(eocd + 16, true);
    const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
    const dec = new TextDecoder();
    const files = new Map();
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged .bardic file.');
      const method = cd.getUint16(p + 10, true);
      const csize = cd.getUint32(p + 20, true);
      const nameLen = cd.getUint16(p + 28, true);
      const extraLen = cd.getUint16(p + 30, true);
      const commentLen = cd.getUint16(p + 32, true);
      const localOffset = cd.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      files.set(name, async () => {
        const lh = new DataView(await blob.slice(localOffset, localOffset + 30).arrayBuffer());
        const start = localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const raw = blob.slice(start, start + csize);
        if (method === 0) return raw;
        if (method === 8 && 'DecompressionStream' in global) {
          return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
        }
        throw new Error(`Unsupported compression in ${name}.`);
      });
    }
    return files;
  }

  /* ---------- Story ---------- */
  const FORMAT_VERSION = 2;
  const KNOWN_STORY = ['format', 'version', 'id', 'revision', 'bard', 'author', 'title', 'description', 'created', 'forged', 'generator', 'chapters', 'soundbox'];
  const KNOWN_SOUND = ['name', 'file', 'loop', 'volume', 'duration'];

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  function slug(s, fallback) {
    const out = (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return out || fallback;
  }
  function ext(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : 'mp3';
  }
  function isAudio(file) {
    return AUDIO_EXT.includes(ext(file.name)) || (file.type || '').startsWith('audio/');
  }
  const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  /** draft: { id, revision, created, title, description, extra, chapters: [{ title, extra, music|ambience|events: [sound] }], soundbox: [sound] }
   *  sound: { name, blob, fileName, loop, volume, duration, extra }
   *  id, revision and created are kept from an opened file and never edited by hand. */
  function validate(draft, bard) {
    const errors = [];
    if (!bard || !bard.trim()) errors.push('Set your bard name: it signs every file you forge.');
    if (!draft.title || !draft.title.trim()) errors.push('Give your story a title.');
    if (!draft.chapters.length) errors.push('Add at least one chapter.');
    draft.chapters.forEach((c, i) => { if (!c.title || !c.title.trim()) errors.push(`Chapter ${i + 1} needs a title.`); });
    const count = draft.chapters.reduce((a, c) => a + ZONES.reduce((b, z) => b + c[z].length, 0), 0) + draft.soundbox.length;
    if (!count) errors.push('Add at least one sound.');
    return errors;
  }

  /** Forges the next revision of the draft, signed by `bard`. options.generator names the tool (default: the web Story builder). */
  async function pack(draft, bard, onProgress, options) {
    const entries = [];
    const used = new Set();
    const place = (dir, index, s) => {
      let path = `${dir}/${String(index + 1).padStart(2, '0')}-${slug(s.name, 'sound')}.${ext(s.fileName)}`;
      let n = 2;
      while (used.has(path)) path = path.replace(/(\.[a-z0-9]+)$/, `-${n++}$1`);
      used.add(path);
      entries.push({ name: path, data: s.blob });
      const out = Object.assign({}, s.extra || {}, { name: s.name.trim() || 'Sound', file: path, loop: s.loop, volume: round(s.volume ?? 0.75) });
      if (s.duration) out.duration = round(s.duration, 1);
      return out;
    };
    const story = Object.assign({}, draft.extra || {}, {
      format: 'bardic',
      version: FORMAT_VERSION,
      id: draft.id || uuid(),
      revision: (draft.revision || 0) + 1,
      bard: bard.trim(),
      title: draft.title.trim(),
    });
    if (draft.description && draft.description.trim()) story.description = draft.description.trim();
    const stamp = now();
    story.created = draft.created || stamp;
    story.forged = stamp;
    story.generator = (options && options.generator) || 'Bardic Story builder (web)';
    story.chapters = draft.chapters.map((c, i) => {
      const ch = Object.assign({}, c.extra || {}, { title: c.title.trim() });
      ZONES.forEach((z) => { ch[z] = c[z].map((s, k) => place(`sounds/${i + 1}/${z}`, k, s)); });
      return ch;
    });
    story.soundbox = draft.soundbox.map((s, k) => place('sounds/soundbox', k, s));
    const json = new TextEncoder().encode(JSON.stringify(story, null, 2) + '\n');
    const blob = await writeZip([{ name: 'story.json', data: json }, ...entries], onProgress);
    return { blob, story, fileName: `${slug(story.title, 'story')}.bardic` };
  }

  /** Reads a .bardic file (format 1 or 2). onProgress(done, total) is called as sounds are read. */
  async function unpack(file, onProgress) {
    const files = await readZip(file);
    if (!files.has('story.json')) throw new Error('This .bardic file has no story.json.');
    const story = JSON.parse(await (await files.get('story.json')()).text());
    if (story.format !== 'bardic') throw new Error('story.json is not a Bardic story.');
    if (story.version !== 1 && story.version !== 2) throw new Error(`This file uses format version ${story.version}, which this builder does not know yet.`);
    const total = (story.chapters || []).reduce((a, c) => a + ZONES.reduce((b, z) => b + (c[z] || []).length, 0), 0) + (story.soundbox || []).length;
    let done = 0;
    const sound = async (s) => {
      const get = files.get(s.file);
      if (!get) throw new Error(`Missing sound in the archive: ${s.file}`);
      const blob = await get();
      const fileName = s.file.split('/').pop();
      const extra = {};
      Object.keys(s).forEach((k) => { if (!KNOWN_SOUND.includes(k)) extra[k] = s[k]; });
      done += 1;
      if (onProgress) onProgress(done, total);
      return {
        name: s.name || fileName,
        blob: new File([blob], fileName, { type: blob.type || 'audio/mpeg' }),
        fileName,
        loop: LOOPS.includes(s.loop) || s.loop === 'random' ? s.loop : 'once',
        volume: typeof s.volume === 'number' ? s.volume : 0.75,
        duration: s.duration,
        extra,
      };
    };
    const extra = {};
    Object.keys(story).forEach((k) => { if (!KNOWN_STORY.includes(k)) extra[k] = story[k]; });
    const chapters = [];
    for (const c of story.chapters || []) {
      const ch = { title: c.title || '', extra: {} };
      Object.keys(c).forEach((k) => { if (k !== 'title' && !ZONES.includes(k)) ch.extra[k] = c[k]; });
      for (const z of ZONES) {
        ch[z] = [];
        for (const s of c[z] || []) ch[z].push(await sound(s));
      }
      chapters.push(ch);
    }
    const soundbox = [];
    for (const s of story.soundbox || []) soundbox.push(await sound(s));
    const v2 = story.version === 2;
    return {
      id: (v2 && story.id) || uuid(),
      revision: v2 && Number.isInteger(story.revision) && story.revision > 0 ? story.revision : 1,
      bard: (v2 ? story.bard : story.author) || '',
      created: story.created || null,
      title: story.title || '',
      description: story.description || '',
      extra,
      chapters,
      soundbox,
    };
  }

  /* The bard name: the one registered with a GitHub account in the settings (auth/account.js),
     else "Forgotten Barde". Read straight from storage, so pages without the settings block agree. */
  const FORGOTTEN = 'Forgotten Barde';
  function bardName() {
    try { return (JSON.parse(localStorage.getItem('bardic.account') || 'null') || {}).name || FORGOTTEN; } catch (e) { return FORGOTTEN; }
  }

  function round(v, d = 2) { const f = 10 ** d; return Math.round(v * f) / f; }
  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const mb = bytes / 1048576;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  }

  global.Bardic = { ZONES, LOOPS, SHARE_LIMIT, FORMAT_VERSION, pack, unpack, validate, isAudio, formatSize, slug, bardName, FORGOTTEN };
})(window);
