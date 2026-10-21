/* Bardic for iPhone.
 * A Home Screen web app that follows the Android app: a library of stories kept on the phone (IndexedDB),
 * a story editor (chapters, Music / Ambiances / Events, the story's soundbox), the live mixing table,
 * a shared soundbox, settings, and .bardic import and export (the format of BARDIC_FORMAT.md).
 */
(() => {
  'use strict';

  const VERSION = '261021.2';
  const root = document.documentElement;
  if (!root.classList.contains('mode-app')) {
    // In a browser tab or on another device the page only shows its notice: register nothing, store nothing.
    return;
  }

  const $ = (s) => document.querySelector(s);
  // The device the app runs on, for its texts: iPhone, iPad or tablet (Android).
  const DEV = window.BARDIC_DEVICE || 'iPhone';
  const IOS = DEV !== 'tablet';
  const DB = window.BardicDB;
  const FMT = window.Bardic;
  const ZONES = [
    { id: 'music', label: 'Music', color: 'var(--music)', loop: 2, empty: 'No music in this chapter yet.', hint: 'Add music: one track plays at a time' },
    { id: 'ambience', label: 'Ambiances', color: 'var(--amb)', loop: 2, empty: 'No ambiances in this chapter yet.', hint: 'Add ambiances: rain, fire, crowds' },
    { id: 'events', label: 'Events', color: 'var(--evt)', loop: 0, empty: 'No events in this chapter yet.', hint: 'Add events: bells, roars, explosions' },
  ];
  const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));
  const SOUNDBOX_ZONE = { id: 'soundbox', label: 'Soundbox', color: 'var(--accent)', loop: 0, hint: 'Add quick effects: critical hits, level ups' };
  const LOOP_LABELS = ['1×', '2×', '∞'];
  const LOOP_NAMES = ['once', 'twice', 'infinite', 'random'];
  const LOOP_INDEX = { once: 0, twice: 1, infinite: 2, random: 3 };
    const WIDE = matchMedia('(min-width: 1181px)');

  const svg = (d, size = 18, fill = false) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
  const ICON = {
    back: svg('<path d="M15 18l-6-6 6-6"/>', 20),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 19),
    close: svg('<path d="M18 6L6 18M6 6l12 12"/>', 18),
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', 16, true),
    pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>', 16, true),
    stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', 14, true),
    random: svg('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', 14),
    volDown: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 12h5"/>', 15),
    volUp: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 12h5M18.5 9.5v5"/>', 15),
    star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 16),
    starFill: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 16, true),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
    import: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', 16),
    share: svg('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', 18),
    edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 16),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 16),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>', 14),
    left: svg('<path d="M15 18l-6-6 6-6"/>', 14),
    right: svg('<path d="M9 18l6-6-6-6"/>', 14),
    up: svg('<path d="M18 15l-6-6-6 6"/>', 14),
    down: svg('<path d="M6 9l6 6 6-6"/>', 14),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', 18),
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>', 22),
    compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', 22),
    files: svg('<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>', 18),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16),
  };

  /* ================= Settings ================= */
  const KEY = 'bardic.settings';
  const DEFAULTS = {
    theme: 'obsidian', mode: 'dark', fade: 2000, crossfade: true, silence: false, awake: true, silent: true,
    master: 0.8, sbVol: 0.8, sbOpen: null, pins: [], randomMax: 5,
    // Volume on the table cards, per row: 'hidden' (no control, narrowest cards), 'simple' (two buttons) or 'full' (a slider).
    vol: { music: 'hidden', ambience: 'hidden', events: 'hidden' },
    landscape: true,
  };
  const settings = Object.assign({}, DEFAULTS, readJSON(KEY));
  settings.vol = Object.assign({}, DEFAULTS.vol, settings.vol || {});
  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage full */ } }

  const lightQuery = matchMedia('(prefers-color-scheme: light)');
  function applyTheme() {
    const mode = settings.mode === 'system' ? (lightQuery.matches ? 'light' : 'dark') : settings.mode;
    root.dataset.theme = BardicThemes.resolve(settings.theme);
    root.dataset.mode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bar').trim();
    document.querySelectorAll('.swatch').forEach((s) => { s.dataset.mode = mode; });
  }
  lightQuery.addEventListener?.('change', () => settings.mode === 'system' && applyTheme());

  /* ================= Small helpers ================= */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(cls, html, label, onClick) {
    const b = el('button', cls);
    b.type = 'button';
    b.innerHTML = html;
    if (label) { b.setAttribute('aria-label', label); b.title = label; }
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function setP(input) { input.style.setProperty('--p', `${(input.value - input.min) / (input.max - input.min) * 100}%`); }
  function fmt(s) { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  const size = (b) => FMT.formatSize(b || 0);
  const plural = (n, w, many) => `${n} ${n === 1 ? w : (many || `${w}s`)}`;
  function yymmdd(d = new Date()) {
    return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  const debounce = (fn, ms) => { let t = 0; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); fn(); }; return d; };

  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function busy(title, step = '', frac = null) {
    $('#busy').hidden = false;
    $('#busy-title').textContent = title;
    $('#busy-step').textContent = step;
    const bar = $('#busy-bar');
    bar.parentNode.hidden = frac == null;
    if (frac != null) bar.style.width = `${Math.round(frac * 100)}%`;
  }
  function idle() { $('#busy').hidden = true; }

  /** A small question: resolves with the value of the button tapped (null when dismissed).
   *  With `input`, resolves with { value, text }. */
  function ask(title, text, buttons, input) {
    const dlg = $('#ask');
    $('#ask-title').textContent = title;
    $('#ask-text').textContent = text || '';
    $('#ask-text').hidden = !text;
    const acts = $('#ask-acts');
    acts.textContent = '';
    let field = null;
    if (input) {
      field = el('input', 'ask-input');
      field.type = 'text';
      field.value = input.value || '';
      field.placeholder = input.placeholder || '';
      field.maxLength = input.max || 120;
      field.setAttribute('enterkeyhint', 'done');
      acts.before(field);
    }
    return new Promise((resolve) => {
      let answered = false;
      const finish = (v) => {
        if (answered) return;
        answered = true;
        if (field) field.remove();
        if (dlg.open) dlg.close();
        resolve(input ? (v == null ? null : { value: v, text: field.value.trim() }) : v);
      };
      buttons.forEach((b) => {
        const x = el('button', `btn ${b.cls || ''}`, b.label);
        x.type = 'button';
        x.onclick = () => finish(b.value);
        acts.append(x);
      });
      if (field) field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(buttons[buttons.length - 1].value); } });
      dlg.addEventListener('close', () => finish(null), { once: true });
      dlg.showModal();
      if (field) setTimeout(() => field.focus(), 50);
    });
  }

  function openSheet(title) {
    $('#sheet-title').textContent = title;
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = '';
    if (!$('#sheet').open) $('#sheet').showModal();
    return body;
  }
  function closeSheet() { if ($('#sheet').open) $('#sheet').close(); }

  /** Duration of an audio blob in seconds, or null. */
  function probeDuration(blob) {
    return new Promise((ok) => {
      const url = URL.createObjectURL(blob);
      const a = new Audio();
      let t = 0;
      const end = (v) => { clearTimeout(t); URL.revokeObjectURL(url); a.removeAttribute('src'); ok(v); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => end(isFinite(a.duration) && a.duration > 0 ? a.duration : null);
      a.onerror = () => end(null);
      t = setTimeout(() => end(null), 4000);
      a.src = url;
      a.load();
    });
  }

  async function download(file, onBytes, signal) {
    const res = await fetch(file, { signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(`Download failed (${res.status}).`);
    const type = res.headers.get('content-type') || 'audio/mpeg';
    if (!res.body || !res.body.getReader) { const b = await res.blob(); onBytes && onBytes(b.size); return b; }
    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      onBytes && onBytes(value.byteLength);
    }
    return new Blob(chunks, { type });
  }

  /* ================= Library data ================= */
  let STORIES = [];           // every story, newest first
  let SHARED = [];            // shared soundbox sounds
  let SIZES = new Map();      // blob key -> bytes

  async function refresh() {
    // Sizes come from the sounds themselves: reading every stored blob just to measure it froze Safari.
    [STORIES, SHARED] = await Promise.all([DB.listStories(), DB.getKV('soundbox', [])]);
    SIZES = new Map();
    STORIES.forEach((st) => DB.soundsOf(st).forEach((s) => { if (s.size && !SIZES.has(s.blob)) SIZES.set(s.blob, s.size); }));
    SHARED.forEach((s) => { if (s.size && !SIZES.has(s.blob)) SIZES.set(s.blob, s.size); });
  }
  function storyBytes(story) {
    const seen = new Set();
    let n = 0;
    DB.soundsOf(story).forEach((s) => { if (!seen.has(s.blob)) { seen.add(s.blob); n += SIZES.get(s.blob) || s.size || 0; } });
    return n;
  }
  function soundCount(story) { return DB.soundsOf(story).length; }

  function newSound(blobKey, name, fileName, sizeBytes, loop, duration) {
    return { uid: DB.uid(), name: (name || 'Sound').slice(0, 80), blob: blobKey, fileName: fileName || 'sound.mp3', size: sizeBytes || 0, loop, volume: 0.75, duration: duration || null, extra: {} };
  }
  const cleanName = (fileName) => (fileName || 'Sound').replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[\s._-]+/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()) || 'Sound';

  /** The story object on screen when there is one (so edits never race the database), else the stored one. */
  let lastTableStory = null;
  async function liveStory(uid) {
    if (ed && ed.story.uid === uid) return ed.story;
    if (tbl && tbl.story.uid === uid) return tbl.story;
    if (lastTableStory && lastTableStory.uid === uid) return lastTableStory;
    return DB.getStory(uid);
  }

  /* ================= Routing ================= */
  let screen = null;
  function show(id) {
    ['library', 'sbx', 'editor', 'table'].forEach((s) => { $(`#${s}`).hidden = s !== id; });
    screen = id;
  }

  async function route() {
    const h = location.hash || '#/';
    let m;
    if ((m = h.match(/^#\/play\/([^/]+)(?:\/(\d+))?/))) {
      const s = await liveStory(decodeURIComponent(m[1]));
      if (!s) { location.replace('#/'); return; }
      leaveEditor();
      openTable(s, Math.max(0, parseInt(m[2] || '1', 10) - 1));
      return;
    }
    const leaving = !!tbl;
    if (leaving) {
      // Leaving the table: show a short loading screen while the sounds are let go, instead of a frozen page.
      busy('Closing the table', tbl.story.title);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      closeTable();
    }
    try { await routeRest(h); } finally { if (leaving) setTimeout(idle, 150); }
  }

  async function routeRest(h) {
    let m;
    if ((m = h.match(/^#\/edit\/([^/]+)(?:\/(\d+|soundbox))?/))) {
      const s = await liveStory(decodeURIComponent(m[1]));
      if (!s) { location.replace('#/'); return; }
      openEditor(s, m[2] === 'soundbox' ? 'soundbox' : Math.max(0, parseInt(m[2] || '1', 10) - 1));
      return;
    }
    leaveEditor();
    await refresh();
    if (h.startsWith('#/soundbox')) { show('sbx'); renderShared(); document.title = 'Soundbox | Bardic'; }
    else { show('library'); renderLibrary(); document.title = 'Bardic'; }
    releaseWake();
  }

  /* ================= Library screen ================= */
  function renderLibrary() {
    const grid = $('#story-grid');
    grid.textContent = '';
    if (!STORIES.length) {
      const hello = el('div', 'hello');
      hello.innerHTML = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
      hello.append(el('h1', '', 'Your table awaits'), el('p', 'lead', 'Forge a story with your own sounds, import a .bardic file, or start from a tale of the Compagnie des bardes.'));
      grid.append(hello);
    }
    // Two rows of same-size tiles: the stories on the phone, then the four ways to add one.
    if (STORIES.length) {
      grid.append(el('h3', 'lib-h', STORIES.length === 1 ? 'Your story' : `Your ${STORIES.length} stories`));
      const list = el('div', 'lib-stories');
      STORIES.forEach((s, i) => list.append(storyCard(s, i)));
      grid.append(list);
    }
    grid.append(el('h3', 'lib-h', 'Add a story'));
    const doors = el('div', 'lib-doors');
    doors.append(
      door('new', ICON.plus, 'New story', 'With your own sounds, from Files', () => newStory()),
      door('discovery', ICON.compass, 'Discovery', 'Three ready stories, sounds included', () => openDiscovery()),
      door('recueil', ICON.book, 'The Recueil', 'Tales forged by other bards', () => openRecueil()),
      door('import', ICON.files, 'Import .bardic', 'From Files, iCloud Drive or AirDrop', () => pickBardic()),
    );
    grid.append(doors);
  }

  function storyCard(s, i) {
    const c = el('article', 'scard');
    c.style.setProperty('--z', ['var(--amb)', 'var(--evt)', 'var(--blue)', 'var(--music)'][i % 4]);
    const head = el('div', 'sc-top');
    head.append(el('h2', '', s.title || 'Untitled story'));
    c.append(head);
    const by = [];
    if (s.bard) by.push(`by ${s.bard}`);
    if (s.revision) by.push(`revision ${s.revision}`);
    c.append(el('p', 'by', by.join(', ') || 'Not exported yet'));
    const ol = el('ol');
    // Three lines at most, so every card has the same height.
    const shown = s.chapters.length > 3 ? 2 : 3;
    s.chapters.slice(0, shown).forEach((ch) => ol.append(el('li', '', ch.title || 'Untitled chapter')));
    if (s.chapters.length > shown) ol.append(el('li', 'more', `and ${s.chapters.length - shown} more`));
    c.append(ol);
    const meta = el('div', 'meta');
    meta.append(el('span', '', `${plural(s.chapters.length, 'chapter')}, ${plural(soundCount(s), 'sound')}, ${size(storyBytes(s))}`));
    c.append(meta);
    if (s.damaged) {
      // Imported by an older version: its sounds all play the first one. Offer to load the file again.
      c.classList.add('damaged');
      const fix = btn('btn repair', '<span>Repair the sounds</span>', null, () => repairStory(s));
      c.append(fix);
      return c;
    }
    const acts = el('div', 'acts');
    const play = btn('btn primary', `${ICON.play}<span>Play</span>`, null, () => { audio(); location.hash = `#/play/${encodeURIComponent(s.uid)}/1`; });
    const edit = btn('ico small', ICON.edit, `Edit ${s.title}`, () => { location.hash = `#/edit/${encodeURIComponent(s.uid)}/1`; });
    const share = btn('ico small', ICON.share, `Export ${s.title}`, () => exportStories([s]));
    const del = btn('ico small', ICON.trash, `Delete ${s.title}`, () => deleteStory(s));
    acts.append(play, edit, share, del);
    c.append(acts);
    return c;
  }

  function door(kind, icon, title, text, onClick) {
    const d = el('button', `ldoor d-${kind}`);
    d.type = 'button';
    d.innerHTML = `<span class="di">${icon}</span>`;
    d.append(el('b', '', title), el('span', '', text));
    d.onclick = onClick;
    return d;
  }

  async function newStory() {
    const a = await ask('New story', 'Give your story a name. You can change it later.', [
      { label: 'Cancel', value: null }, { label: 'Create', value: 'ok', cls: 'primary' },
    ], { placeholder: 'The Drowned Abbey', max: 120 });
    if (!a || !a.value) return;
    const story = {
      uid: DB.uid(), id: null, revision: 0, created: null, bard: '', title: a.text || 'Untitled story', description: '', extra: {},
      chapters: [{ uid: DB.uid(), title: 'Chapter 1', extra: {}, music: [], ambience: [], events: [] }], soundbox: [], source: 'new',
    };
    await DB.putStory(story);
    location.hash = `#/edit/${encodeURIComponent(story.uid)}/1`;
  }

  async function deleteStory(s) {
    const n = soundCount(s);
    const v = await ask(`Delete “${s.title}”?`, `Its ${plural(s.chapters.length, 'chapter')} and ${plural(n, 'sound')} leave this ${DEV}. Export it first if you want to keep a copy.`, [
      { label: 'Cancel', value: null }, { label: 'Delete', value: 'del', cls: 'danger' },
    ]);
    if (v !== 'del') return;
    await DB.deleteStory(s.uid);
    if (lastTableStory && lastTableStory.uid === s.uid) lastTableStory = null;
    settings.pins = settings.pins.filter((p) => !DB.soundsOf(s).some((x) => x.uid === p));
    save();
    await refresh();
    renderLibrary();
    toast(`“${s.title}” deleted.`);
  }

  /* ================= Import ================= */
  function pickBardic() { $('#pick-bardic').click(); }
  $('#pick-bardic').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/\.(bardic|zip)$/i.test(f.name)) {
      toast('Choose a .bardic file.');
      return;
    }
    const r = repairUid;
    repairUid = null;
    await importFile(f, f.name, r);
  });

  async function importFile(blob, label, repairUid = null) {
    try {
      busy('Opening the tale', label, 0);
      const d = await FMT.unpack(blob, (done, total) => busy('Opening the tale', `Reading sound ${done} of ${total}`, done / total));
      idle();
      const added = await importDraft(d, {}, repairUid);
      if (added && repairUid) { await DB.collect(); toast(`“${added.title}” is repaired.`); }
      if (added) { await refresh(); if (screen === 'library') renderLibrary(); toast(`“${added.title}” is on your table.`); }
      return added;
    } catch (err) {
      idle();
      await ask('This file could not be opened', err.message || String(err), [{ label: 'OK', value: 'ok', cls: 'primary' }]);
      return null;
    }
  }

  /** Stores an unpacked .bardic draft (see bardic-format.js unpack). Asks before replacing a story it already has. */
  async function importDraft(d, extra = {}, repairUid = null) {
    if (!d.chapters.length) throw new Error('This tale has no chapter.');
    const stories = await DB.listStories();
    const twin = stories.find((s) => s.id && s.id === d.id);
    let uid = DB.uid();
    let id = d.id;
    if (repairUid) {
      uid = repairUid; // repairing a damaged story: replace it without asking
    } else if (twin) {
      const newer = d.revision > (twin.revision || 0);
      const v = await ask(`You already have “${twin.title}”`, newer
        ? `Yours is revision ${twin.revision}, this file is revision ${d.revision}. Replace yours with it?`
        : `Yours is revision ${twin.revision}, this file is revision ${d.revision}, not newer. Replace yours anyway, or keep both?`, [
        { label: 'Cancel', value: null }, { label: 'Keep both', value: 'both' }, { label: 'Replace', value: 'replace', cls: 'primary' },
      ]);
      if (!v) return null;
      if (v === 'replace') uid = twin.uid;
      else id = null; // the copy becomes a story of its own, with a new id at its next export
    }
    const total = d.chapters.reduce((a, c) => a + DB.ZONES.reduce((b, z) => b + c[z].length, 0), 0) + d.soundbox.length;
    let n = 0;
    const store = async (s) => {
      busy('Storing the sounds', `${++n} of ${total}`, n / Math.max(1, total));
      const key = await DB.putBlob(s.blob);
      const out = newSound(key, s.name, s.fileName, s.blob.size, s.loop, s.duration);
      out.volume = typeof s.volume === 'number' ? s.volume : 0.75;
      out.extra = s.extra || {};
      return out;
    };
    try {
      const chapters = [];
      for (const c of d.chapters) {
        const ch = { uid: DB.uid(), title: c.title || `Chapter ${chapters.length + 1}`, extra: c.extra || {}, music: [], ambience: [], events: [] };
        for (const z of DB.ZONES) for (const s of c[z]) ch[z].push(await store(s));
        chapters.push(ch);
      }
      const soundbox = [];
      for (const s of d.soundbox) soundbox.push(await store(s));
      const story = Object.assign({
        audioChecked: true, damaged: false,
        uid, id, revision: id ? d.revision : 0, created: id ? d.created : null, bard: d.bard || '',
        title: d.title || 'Untitled tale', description: d.description || '', extra: d.extra || {}, chapters, soundbox, source: 'import',
      }, extra);
      await DB.putStory(story);
      if (twin && uid === twin.uid) await DB.collect();
      idle();
      return story;
    } catch (err) {
      idle();
      await DB.collect().catch(() => {});
      throw quotaMessage(err);
    }
  }

  function quotaMessage(err) {
    if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''))) {
      return new Error(`Your ${DEV} has no room left for these sounds. Free some space, or delete a story you no longer play.`);
    }
    return err;
  }

  /* ---------- Repairing stories imported before 261016.2 ---------- */
  // A sound stored by those versions may give back the start of its .bardic archive: its first bytes are then
  // the ZIP signature "PK\x03\x04" instead of audio. Each story is checked once, by reading 4 bytes per sound.
  async function scanDamage() {
    let found = false;
    for (const s of await DB.listStories()) {
      if (s.audioChecked) continue;
      let bad = false;
      for (const x of DB.soundsOf(s)) {
        try {
          const b = await DB.getBlob(x.blob);
          if (!b) continue;
          const h = new Uint8Array(await b.slice(0, 4).arrayBuffer());
          if (h[0] === 0x50 && h[1] === 0x4B && h[2] === 0x03 && h[3] === 0x04) { bad = true; break; }
        } catch (e) { /* unreadable: leave it */ }
      }
      s.audioChecked = true;
      s.damaged = bad;
      found = found || bad;
      await DB.putStory(s, false);
    }
    if (found) { await refresh(); if (screen === 'library') renderLibrary(); }
  }

  let repairUid = null;
  async function repairStory(s) {
    // A tale of the Recueil downloads again by itself; any other story needs its .bardic file.
    let tale = null;
    if (s.id) {
      try {
        const data = await fetch('../recueil/index.json', { cache: 'no-cache' }).then((r) => r.json());
        tale = (data.tales || []).find((t) => t.id === s.id) || null;
      } catch (e) { /* offline */ }
    }
    const v = await ask(`Repair “${s.title}”`, tale
      ? `An older version of Bardic stored its sounds wrongly: they all play the first sound. Bardic downloads this tale from the Recueil again. Changes you made to it on this ${DEV} are lost.`
      : `An older version of Bardic stored its sounds wrongly: they all play the first sound. Choose its .bardic file again (from Files or iCloud Drive) to repair it. Changes you made to it on this ${DEV} are lost.`, [
      { label: 'Cancel', value: null }, { label: tale ? 'Download again' : 'Choose the file', value: 'go', cls: 'primary' },
    ]);
    if (!v) return;
    if (tale) {
      try {
        let got = 0;
        busy('Fetching the tale', tale.title, 0);
        const blob = await download(`../recueil/${encodeURIComponent(tale.file)}`, (n) => { got += n; busy('Fetching the tale', `${tale.title}, ${size(got)}`, tale.size ? Math.min(1, got / tale.size) : null); });
        await importFile(blob, tale.title, s.uid);
      } catch (e) {
        idle();
        ask('The tale could not be downloaded', 'Check your connection and try again.', [{ label: 'OK', value: 'ok', cls: 'primary' }]);
      }
      return;
    }
    repairUid = s.uid;
    pickBardic();
  }

  /* ---------- The Recueil ---------- */
  async function openRecueil() {
    const body = openSheet('The Recueil');
    body.className = 'rec-sheet';
    body.append(el('p', 'muted', `Tales forged by the Compagnie des bardes. Adding one downloads it to your ${DEV}, sounds included: it then plays without a connection.`));
    const list = el('div', 'rlist');
    list.append(el('p', 'muted', 'Fetching the Recueil…'));
    body.append(list);
    let data;
    try {
      data = await fetch('../recueil/index.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    } catch (e) {
      list.textContent = '';
      list.append(el('p', 'muted', `The Recueil needs a connection. Try again once your ${DEV} is online.`));
      return;
    }
    await refresh();
    const tales = (data.tales || []).slice().sort((a, b) => a.title.localeCompare(b.title));
    list.textContent = '';
    if (!tales.length) list.append(el('p', 'muted', 'The Recueil is empty for now.'));
    tales.forEach((t) => {
      const row = el('div', 'rrow');
      const txt = el('div', 'rt');
      txt.append(el('b', '', t.title));
      const by = [t.bard ? `by ${t.bard}` : null, plural((t.chapters || []).length, 'chapter'), t.sounds ? plural(t.sounds, 'sound') : null, t.size ? size(t.size) : null].filter(Boolean).join(', ');
      txt.append(el('small', '', by));
      if (t.description) txt.append(el('p', '', t.description));
      const have = STORIES.find((s) => s.id && s.id === t.id);
      const label = !have ? 'Add' : (t.revision > (have.revision || 0) ? 'Update' : 'Added');
      const b = btn(`btn ${label === 'Added' ? '' : 'primary'}`, label === 'Added' ? `${ICON.check}<span>Added</span>` : `<span>${label}</span>`, null, async () => {
        if (label === 'Added') { const v = await ask(`“${t.title}” is already on your table`, 'Download it again and replace yours?', [{ label: 'Cancel', value: null }, { label: 'Download again', value: 'go', cls: 'primary' }]); if (!v) return; }
        closeSheet();
        try {
          let got = 0;
          busy('Fetching the tale', t.title, 0);
          const blob = await download(`../recueil/${encodeURIComponent(t.file)}`, (n) => { got += n; busy('Fetching the tale', `${t.title}, ${size(got)}`, t.size ? Math.min(1, got / t.size) : null); });
          await importFile(blob, t.title);
        } catch (e) {
          idle();
          ask('The tale could not be downloaded', 'Check your connection and try again.', [{ label: 'OK', value: 'ok', cls: 'primary' }]);
        }
      });
      row.append(txt, b);
      list.append(row);
    });
  }

  /* ---------- Discovery stories (the web edition's three stories) ---------- */
  async function openDiscovery() {
    const body = openSheet('Discovery stories');
    body.append(el('p', 'muted', `The three stories of the web edition, with their sounds. Each one downloads once, then lives on your ${DEV} like any story you forge, ready to edit and play offline.`));
    const list = el('div', 'rlist');
    list.append(el('p', 'muted', 'Fetching the stories…'));
    body.append(list);
    let stories, library;
    try {
      [stories, library] = await Promise.all([
        fetch('../play/stories.json', { cache: 'no-cache' }).then((r) => r.json()),
        fetch('../play/library.json', { cache: 'no-cache' }).then((r) => r.json()),
      ]);
    } catch (e) {
      list.textContent = '';
      list.append(el('p', 'muted', `These stories need a connection to download. Try again once your ${DEV} is online.`));
      return;
    }
    await refresh();
    list.textContent = '';
    stories.stories.forEach((meta) => {
      const files = [];
      meta.chapters.forEach((c) => { const z = library.chapters[`${meta.id}/${c.id}`] || {}; DB.ZONES.forEach((k) => (z[k] || []).forEach((s) => files.push(s))); });
      if (!files.length) return;
      const bytes = files.reduce((a, s) => a + (s.size || 0), 0);
      const have = STORIES.find((s) => s.source === `discovery:${meta.id}`);
      const row = el('div', 'rrow');
      const txt = el('div', 'rt');
      txt.append(el('b', '', meta.title), el('small', '', `${plural(meta.chapters.length, 'chapter')}, ${plural(files.length, 'sound')}, ${size(bytes)}`));
      if (meta.blurb) txt.append(el('p', '', meta.blurb));
      const b = have
        ? btn('btn', `${ICON.check}<span>Added</span>`, null, () => { closeSheet(); location.hash = `#/edit/${encodeURIComponent(have.uid)}/1`; })
        : btn('btn primary', '<span>Add</span>', null, () => { closeSheet(); addDiscovery(meta, library); });
      row.append(txt, b);
      list.append(row);
    });
  }

  async function addDiscovery(meta, library) {
    const chapters = meta.chapters.map((c) => ({ uid: DB.uid(), title: c.title, extra: {}, music: [], ambience: [], events: [], src: library.chapters[`${meta.id}/${c.id}`] || {} }));
    const jobs = [];
    chapters.forEach((ch) => DB.ZONES.forEach((z) => (ch.src[z] || []).forEach((s) => jobs.push({ ch, z, s }))));
    const shared = await DB.getKV('soundbox', []);
    const sharedFiles = new Set(shared.map((x) => x.extra && x.extra.web));
    const sbJobs = (library.soundbox || []).filter((s) => !sharedFiles.has(s.file));
    const total = jobs.length + sbJobs.length;
    const totalBytes = jobs.concat(sbJobs.map((s) => ({ s }))).reduce((a, j) => a + (j.s.size || 0), 0) || 1;
    let doneBytes = 0, n = 0;
    try {
      const fetchOne = async (s) => {
        const blob = await download(`../play/${s.file}`, (b) => { doneBytes += b; busy(`Adding ${meta.title}`, `Sound ${n + 1} of ${total}, ${size(doneBytes)} of ${size(totalBytes)}`, doneBytes / totalBytes); });
        n += 1;
        return blob;
      };
      busy(`Adding ${meta.title}`, 'Starting', 0);
      for (const j of jobs) {
        const blob = await fetchOne(j.s);
        const key = await DB.putBlob(blob);
        const zone = ZONE[j.z];
        j.ch[j.z].push(newSound(key, j.s.name, j.s.file.split('/').pop(), blob.size, LOOP_NAMES[zone.loop], null));
      }
      for (const s of sbJobs) {
        const blob = await fetchOne(s);
        const key = await DB.putBlob(blob);
        const x = newSound(key, s.name, s.file.split('/').pop(), blob.size, 'once', null);
        x.extra = { web: s.file };
        shared.push(x);
      }
      chapters.forEach((c) => { delete c.src; });
      const story = {
        uid: DB.uid(), id: null, revision: 0, created: null, bard: 'Bardic', title: meta.title, description: meta.blurb || '', extra: {},
        chapters, soundbox: [], source: `discovery:${meta.id}`,
      };
      await DB.setKV('soundbox', shared);
      await DB.putStory(story);
      idle();
      await refresh();
      renderLibrary();
      toast(`${meta.title} is on your table.`);
    } catch (err) {
      idle();
      await DB.collect().catch(() => {});
      const e = quotaMessage(err);
      ask('The story could not be added', e.message === err.message ? 'Check your connection and try again.' : e.message, [{ label: 'OK', value: 'ok', cls: 'primary' }]);
    }
  }

  /* ================= Export ================= */
  /** The bard name that signs exports: registered with GitHub in Settings, else Forgotten Barde. */
  async function ensureBard() {
    return window.Bardic.bardName();
  }

  async function draftOf(story) {
    const conv = async (s) => {
      const blob = await DB.getBlob(s.blob);
      if (!blob) throw new Error(`The sound “${s.name}” is missing from this ${DEV}.`);
      return { name: s.name, blob, fileName: s.fileName || `${FMT.slug(s.name, 'sound')}.mp3`, loop: s.loop, volume: s.volume, duration: s.duration, extra: s.extra || {} };
    };
    const chapters = [];
    for (const c of story.chapters) {
      const ch = { title: c.title, extra: c.extra || {} };
      for (const z of DB.ZONES) { ch[z] = []; for (const s of c[z]) ch[z].push(await conv(s)); }
      chapters.push(ch);
    }
    const soundbox = [];
    for (const s of story.soundbox) soundbox.push(await conv(s));
    return { id: story.id, revision: story.revision || 0, created: story.created, title: story.title, description: story.description, extra: story.extra || {}, chapters, soundbox };
  }

  /** Forges each story as its next revision, then offers the share sheet (it needs a fresh tap on iPhone). */
  async function exportStories(list) {
    if (!list.length) { toast('No story to export yet.'); return; }
    const bard = await ensureBard();
    if (!bard) return;
    const files = [];
    try {
      for (let i = 0; i < list.length; i++) {
        if (ed && ed.story.uid === list[i].uid) saveSoon.flush();
        const story = (await liveStory(list[i].uid)) || list[i];
        const label = list.length > 1 ? `${story.title} (${i + 1} of ${list.length})` : story.title;
        busy('Forging the .bardic', label, 0);
        const draft = await draftOf(story);
        const errors = FMT.validate(draft, bard);
        if (errors.length) { idle(); await ask(`“${story.title}” cannot be exported yet`, errors.join(' '), [{ label: 'OK', value: 'ok', cls: 'primary' }]); continue; }
        const out = await FMT.pack(draft, bard, (f) => busy('Forging the .bardic', label, f), { generator: `Bardic web app (${DEV}) ${VERSION}` });
        story.id = out.story.id;
        story.revision = out.story.revision;
        story.created = out.story.created;
        story.bard = bard;
        await DB.putStory(story, false);
        files.push(new File([out.blob], `${yymmdd()}_${FMT.slug(story.title, 'story')}.bardic`, { type: 'application/octet-stream' }));
      }
    } catch (err) {
      idle();
      await ask('The export stopped', (quotaMessage(err).message) || String(err), [{ label: 'OK', value: 'ok', cls: 'primary' }]);
      return;
    }
    idle();
    if (!files.length) return;
    await refresh();
    if (screen === 'library') renderLibrary();
    offerFiles(files);
  }

  function offerFiles(files) {
    const body = openSheet(files.length > 1 ? `${files.length} stories forged` : 'Your .bardic is ready');
    const total = files.reduce((a, f) => a + f.size, 0);
    body.append(el('p', 'muted', `${files.map((f) => f.name).join(', ')} (${size(total)}). Save it to Files or iCloud Drive as a backup, or AirDrop it to another bard.`));
    if (files.some((f) => f.size > FMT.SHARE_LIMIT)) body.append(el('p', 'warn', 'Over 100 MB: fine for a backup or AirDrop, too big for the Recueil.'));
    const acts = el('div', 'set-acts');
    const canShare = navigator.canShare && navigator.canShare({ files });
    if (canShare) {
      acts.append(btn('btn primary', `${ICON.share}<span>Share or save</span>`, null, async () => {
        try { await navigator.share({ files, title: files.length > 1 ? 'Bardic stories' : files[0].name }); closeSheet(); }
        catch (e) { if (e.name !== 'AbortError') toast('Sharing did not work. Try Download.'); }
      }));
    }
    files.forEach((f) => {
      const a = el('a', `btn ${canShare ? '' : 'primary'}`, files.length > 1 ? f.name : 'Download');
      const url = URL.createObjectURL(f);
      a.href = url;
      a.download = f.name;
      $('#sheet').addEventListener('close', () => setTimeout(() => URL.revokeObjectURL(url), 60000), { once: true });
      acts.append(a);
    });
    body.append(acts);
  }

  /* ================= Story editor ================= */
  let ed = null; // { story, ch: index | 'soundbox' }
  const saveSoon = debounce(async () => {
    if (!ed) return;
    try { await DB.putStory(ed.story); $('#ed-saved').textContent = 'Saved'; }
    catch (e) { $('#ed-saved').textContent = 'Not saved'; toast(quotaMessage(e).message); }
  }, 500);
  function openEditor(story, ch) {
    const fresh = !ed || ed.story.uid !== story.uid;
    if (fresh) { stopPreview(); ed = { story, ch: 0 }; forgeTip(); }
    ed.ch = ch === 'soundbox' ? 'soundbox' : Math.min(ch, story.chapters.length - 1);
    show('editor');
    document.title = `${story.title} | Bardic`;
    const t = $('#ed-title');
    if (document.activeElement !== t) t.value = story.title;
    $('#ed-saved').textContent = '';
    renderEdRail();
    renderEdMain();
    acquireWake();
  }
  /* On a phone or a tablet, building a story is easier in the website's Story builder: say so on entering the editor. */
  const tipShown = new Set();
  async function forgeTip() {
    // Once per story each time the app opens (not again when coming back from the table).
    if (settings.noForgeTip || !ed || tipShown.has(ed.story.uid)) return;
    tipShown.add(ed.story.uid);
    const v = await ask('Forging a story?', 'For creating a story, the Story builder of the Bardic website, on a computer, is the most comfortable: room for every chapter and your MP3s dropped in with the mouse. Forge it there, then import the .bardic here. The editor of this app is made for quick changes.', [
      { label: 'Do not show again', value: 'never' }, { label: 'Got it', value: 'ok', cls: 'primary' },
    ]);
    if (v === 'never') { settings.noForgeTip = true; save(); }
  }

  function leaveEditor() {
    if (!ed) return;
    saveSoon.flush();
    stopPreview();
    ed = null;
  }
  function goEd(ch) {
    if (!ed) return;
    history.replaceState(null, '', `#/edit/${encodeURIComponent(ed.story.uid)}/${ch === 'soundbox' ? 'soundbox' : ch + 1}`);
    openEditor(ed.story, ch);
  }

  $('#ed-title').addEventListener('input', (e) => { if (!ed) return; ed.story.title = e.target.value.slice(0, 120) || ''; dirty(); });
  $('#ed-title').addEventListener('blur', (e) => { if (ed && !ed.story.title.trim()) { ed.story.title = 'Untitled story'; e.target.value = ed.story.title; dirty(); } });
  $('#ed-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  function renderEdRail() {
    const rail = $('#ed-rail');
    rail.textContent = '';
    rail.append(el('h3', '', 'Chapters'));
    ed.story.chapters.forEach((c, i) => {
      const count = DB.ZONES.reduce((a, z) => a + c[z].length, 0);
      const b = el('div', 'chap');
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.setAttribute('aria-current', String(ed.ch === i));
      const t = el('span', 't');
      t.append(el('span', '', c.title || `Chapter ${i + 1}`), el('div', 'cnt', plural(count, 'sound')));
      const mv = el('span', 'mv');
      const up = btn('', ICON.up, 'Move chapter up', (e) => { e.stopPropagation(); moveChapter(i, -1); });
      const dn = btn('', ICON.down, 'Move chapter down', (e) => { e.stopPropagation(); moveChapter(i, 1); });
      up.disabled = i === 0;
      dn.disabled = i === ed.story.chapters.length - 1;
      mv.append(up, dn);
      b.append(el('span', 'n', String(i + 1)), t, mv);
      b.onclick = () => goEd(i);
      rail.append(b);
    });
    const add = btn('btn add-chap', `${ICON.plus}<span>Add a chapter</span>`, null, () => {
      ed.story.chapters.push({ uid: DB.uid(), title: `Chapter ${ed.story.chapters.length + 1}`, extra: {}, music: [], ambience: [], events: [] });
      dirty();
      goEd(ed.story.chapters.length - 1);
      setTimeout(() => $('.chap-title')?.select(), 30);
    });
    rail.append(add);
    const sb = el('div', 'chap sbchap');
    sb.setAttribute('role', 'button');
    sb.tabIndex = 0;
    sb.setAttribute('aria-current', String(ed.ch === 'soundbox'));
    sb.innerHTML = `<span class="n">${ICON.starFill}</span>`;
    const t = el('span', 't');
    t.append(el('span', '', 'Soundbox'), el('div', 'cnt', plural(ed.story.soundbox.length, 'effect')));
    sb.append(t);
    sb.onclick = () => goEd('soundbox');
    rail.append(sb);
    rail.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function moveChapter(i, d) {
    const list = ed.story.chapters;
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    dirty();
    goEd(ed.ch === i ? j : ed.ch === j ? i : ed.ch);
  }

  function renderEdMain() {
    const main = $('#ed-main');
    main.textContent = '';
    if (ed.ch === 'soundbox') {
      const top = el('div', 'ed-top');
      top.innerHTML = `<span class="n star-n">${ICON.starFill}</span>`;
      top.append(el('h2', 'ed-h', 'Story soundbox'));
      main.append(top);
      main.append(el('p', 'muted small ed-note', 'Quick effects for this story only. They sit next to your shared soundbox on the table.'));
      main.append(zoneRow(SOUNDBOX_ZONE, ed.story.soundbox));
      return;
    }
    const ch = ed.story.chapters[ed.ch];
    const top = el('div', 'ed-top');
    top.append(el('span', 'n', String(ed.ch + 1)));
    const t = el('input', 'chap-title');
    t.value = ch.title;
    t.maxLength = 120;
    t.setAttribute('aria-label', `Title of chapter ${ed.ch + 1}`);
    t.setAttribute('enterkeyhint', 'done');
    t.oninput = () => { ch.title = t.value; const r = $('#ed-rail .chap[aria-current="true"] .t span'); if (r) r.textContent = t.value || `Chapter ${ed.ch + 1}`; dirty(); };
    t.onkeydown = (e) => { if (e.key === 'Enter') t.blur(); };
    top.append(t);
    const del = btn('btn del slim', `${ICON.trash}<span class="long">Remove</span>`, null, async () => {
      const n = DB.ZONES.reduce((a, z) => a + ch[z].length, 0);
      if (n) {
        const v = await ask(`Remove “${ch.title}”?`, `Its ${plural(n, 'sound')} go with it.`, [{ label: 'Cancel', value: null }, { label: 'Remove', value: 'rm', cls: 'danger' }]);
        if (v !== 'rm') return;
      }
      stopPreview();
      ed.story.chapters.splice(ed.ch, 1);
      dirty();
      goEd(Math.max(0, ed.ch - 1));
    });
    del.disabled = ed.story.chapters.length === 1;
    top.append(del);
    main.append(top);
    ZONES.forEach((z) => main.append(zoneRow(z, ch[z.id])));
  }

  function zoneRow(zone, list) {
    const row = el('div', 'zrow');
    row.style.setProperty('--z', zone.color);
    const label = el('div', 'zl');
    label.append(el('span', '', zone.label));
    const dz = el('div', 'dz');
    dz.style.setProperty('--z', zone.color);
    list.forEach((s, i) => dz.append(editCard(s, i, list, zone, () => { renderEdRail(); renderEdMain(); })));
    const hint = el('button', 'hint');
    hint.type = 'button';
    hint.innerHTML = `${ICON.plus}<span>${list.length ? 'Add more' : zone.hint}</span>`;
    hint.onclick = () => openPicker(zone, list);
    dz.append(hint);
    row.append(label, dz);
    return row;
  }

  function editCard(s, i, list, zone, rerender) {
    const c = el('div', 'sc');
    c.style.setProperty('--z', zone.color);
    const top = el('div', 'row');
    const name = el('input');
    name.value = s.name;
    name.maxLength = 80;
    name.setAttribute('aria-label', 'Sound name');
    name.setAttribute('enterkeyhint', 'done');
    name.oninput = () => { s.name = name.value; dirty(); };
    name.onblur = () => { if (!s.name.trim()) { s.name = cleanName(s.fileName); name.value = s.name; dirty(); } };
    name.onkeydown = (e) => { if (e.key === 'Enter') name.blur(); };
    const x = btn('x', ICON.x, `Remove ${s.name}`, () => {
      if (preview.uid === s.uid) stopPreview();
      list.splice(i, 1);
      dirty();
      rerender();
    });
    top.append(name, x);
    const bottom = el('div', 'row');
    const play = btn('pb play', preview.uid === s.uid ? ICON.pause : ICON.play, `Listen to ${s.name}`, () => togglePreview(s, c, play));
    if (preview.uid === s.uid) { c.classList.add('playing'); preview.card = c; preview.btn = play; }
    const meta = el('span', 'meta');
    [s.duration ? fmt(s.duration) : null, size(SIZES.get(s.blob) || s.size)].filter(Boolean).forEach((t) => meta.append(el('span', '', t)));
    const mv = el('span', 'mvh');
    const l = btn('', ICON.left, 'Move earlier', () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; dirty(); rerender(); } });
    const r = btn('', ICON.right, 'Move later', () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; dirty(); rerender(); } });
    l.disabled = i === 0;
    r.disabled = i === list.length - 1;
    mv.append(l, r);
    const loop = el('button', 'loop');
    loop.type = 'button';
    loop.title = zone.id !== 'music' ? 'Loop: once, twice, forever, random' : 'Loop: once, twice, forever';
    const paintLoop = () => {
      if (s.loop === 'random') loop.innerHTML = ICON.random; else loop.textContent = LOOP_LABELS[LOOP_INDEX[s.loop] ?? 0];
      loop.classList.toggle('inf', s.loop === 'infinite');
      loop.classList.toggle('rnd', s.loop === 'random');
    };
    paintLoop();
    loop.onclick = () => { s.loop = LOOP_NAMES[((LOOP_INDEX[s.loop] ?? 0) + 1) % (zone.id !== 'music' ? 4 : 3)]; paintLoop(); dirty(); };
    // Soundbox effects fire once per tap: no loop button for them.
    bottom.append(play, meta, mv);
    if (zone.id !== 'soundbox') bottom.append(loop);
    // Default volume of the sound: the level it starts at on the table.
    const volRow = el('label', 'row edvol');
    volRow.append(el('span', 'vl', 'Volume'));
    const vr = el('input');
    vr.type = 'range'; vr.min = 0; vr.max = 1; vr.step = 0.05; vr.value = typeof s.volume === 'number' ? s.volume : 0.75;
    vr.setAttribute('aria-label', `Default volume of ${s.name}`);
    vr.style.setProperty('--z', zone.color); setP(vr);
    const vp = el('b', 'vp', `${Math.round(+vr.value * 100)}`);
    vr.addEventListener('input', () => {
      s.volume = Math.round(+vr.value * 100) / 100;
      vp.textContent = `${Math.round(s.volume * 100)}`;
      setP(vr);
      dirty();
    });
    volRow.append(vr, vp);
    c.append(top, bottom, volRow);
    return c;
  }

  /* Listening to one sound in the editor. */
  const preview = { uid: null, el: null, url: null, card: null, btn: null };
  async function togglePreview(s, card, b) {
    if (preview.uid === s.uid) { stopPreview(); return; }
    stopPreview();
    const blob = await DB.getBlob(s.blob);
    if (!blob) { toast('This sound is missing.'); return; }
    applyAudioSession();
    preview.uid = s.uid;
    preview.url = URL.createObjectURL(blob);
    preview.el = new Audio(preview.url);
    preview.el.volume = Math.min(1, s.volume ?? 0.75);
    preview.el.onended = stopPreview;
    preview.card = card; preview.btn = b;
    card.classList.add('playing');
    b.innerHTML = ICON.pause;
    preview.el.play().catch(() => stopPreview());
    if (!s.duration) {
      preview.el.addEventListener('loadedmetadata', () => {
        if (isFinite(preview.el.duration)) { s.duration = preview.el.duration; dirty(); }
      }, { once: true });
    }
  }
  function stopPreview() {
    if (preview.el) { preview.el.pause(); preview.el.removeAttribute('src'); preview.el.load(); }
    if (preview.url) URL.revokeObjectURL(preview.url);
    if (preview.card) preview.card.classList.remove('playing');
    if (preview.btn) preview.btn.innerHTML = ICON.play;
    Object.assign(preview, { uid: null, el: null, url: null, card: null, btn: null });
  }

  /* Story details: description, bard and revision. */
  function openStoryInfo() {
    if (!ed) return;
    const s = ed.story;
    const body = openSheet('Story details');
    const f = el('label', 'field');
    f.append(el('span', '', 'A few words for other bards'));
    const ta = el('textarea');
    ta.rows = 3;
    ta.maxLength = 400;
    ta.placeholder = 'A flooded monastery, a choir of ghosts and a very angry abbot.';
    ta.value = s.description || '';
    ta.oninput = () => { s.description = ta.value; dirty(); };
    f.append(ta);
    body.append(f);
    const facts = [];
    facts.push(s.revision ? `Exported as revision ${s.revision}${s.bard ? `, signed by ${s.bard}` : ''}.` : 'Not exported yet: the first export forges revision 1.');
    if (s.source && s.source.startsWith('discovery')) facts.push('A discovery story of the web edition.');
    facts.push(`${plural(s.chapters.length, 'chapter')}, ${plural(soundCount(s), 'sound')}, ${size(storyBytes(s))} on this ${DEV}.`);
    body.append(el('p', 'muted small', facts.join(' ')));
    const acts = el('div', 'set-acts');
    acts.append(
      btn('btn', `${ICON.share}<span>Export as .bardic</span>`, null, () => { closeSheet(); saveSoon.flush(); exportStories([s]); }),
      btn('btn danger', `${ICON.trash}<span>Delete this story</span>`, null, async () => {
        closeSheet();
        await refresh();
        const fresh = STORIES.find((x) => x.uid === s.uid) || s;
        const before = STORIES.length;
        await deleteStory(fresh);
        await refresh();
        if (STORIES.length < before) { ed = null; location.hash = '#/'; }
      }),
    );
    body.append(acts);
  }

  /* ================= Sound picker ================= */
  let pickTarget = null; // { zone, list, after }
  function openPicker(zone, list, after) {
    pickTarget = { zone, list, after };
    const body = openSheet(`Add to ${zone.label}`);
    body.className = 'picker';
    const fromFiles = btn('btn primary big-pick', `${ICON.files}<span>Choose from Files</span>`, null, () => $('#pick-audio').click());
    const top = el('div', 'pick-top');
    top.append(fromFiles, el('p', 'muted small', `MP3, M4A, WAV or OGG, from your ${DEV}, iCloud Drive or any Files location. Choose several at once.`));
    body.append(top);

    // Sounds already on this iPhone (from any story or the shared soundbox): reusing one takes no extra space.
    const seen = new Map();
    const sources = STORIES.map((st) => (ed && st.uid === ed.story.uid ? ed.story : st));
    if (ed && !sources.includes(ed.story)) sources.unshift(ed.story);
    sources.forEach((st) => DB.soundsOf(st).forEach((s) => { if (!seen.has(s.blob)) seen.set(s.blob, { s, from: st.title }); }));
    SHARED.forEach((s) => { if (!seen.has(s.blob)) seen.set(s.blob, { s, from: 'Shared soundbox' }); });
    const inList = new Set(list.map((s) => s.blob));
    const all = [...seen.values()].filter((x) => !inList.has(x.s.blob)).sort((a, b) => a.s.name.localeCompare(b.s.name));
    if (!all.length) return;
    body.append(el('h3', 'pick-h', `Or reuse a sound already on this ${DEV}`));
    const q = el('input', 'pick-q');
    q.type = 'search';
    q.placeholder = `Search ${plural(all.length, 'sound')}`;
    q.setAttribute('enterkeyhint', 'search');
    body.append(q);
    const ul = el('div', 'pick-list');
    const chosen = new Set();
    const addBtn = btn('btn primary', 'Add', null, async () => {
      const picked = all.filter((x) => chosen.has(x.s.blob));
      picked.forEach((x) => {
        const n = newSound(x.s.blob, x.s.name, x.s.fileName, SIZES.get(x.s.blob) || x.s.size, LOOP_NAMES[zone.loop], x.s.duration);
        list.push(n);
      });
      closeSheet();
      afterAdd(picked.length);
    });
    addBtn.disabled = true;
    const paintAdd = () => { addBtn.disabled = !chosen.size; addBtn.textContent = chosen.size ? `Add ${plural(chosen.size, 'sound')}` : 'Add'; };
    const draw = () => {
      ul.textContent = '';
      const term = q.value.trim().toLowerCase();
      all.filter((x) => !term || x.s.name.toLowerCase().includes(term) || x.from.toLowerCase().includes(term)).slice(0, 200).forEach((x) => {
        const row = el('label', 'pick-row');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = chosen.has(x.s.blob);
        cb.onchange = () => { cb.checked ? chosen.add(x.s.blob) : chosen.delete(x.s.blob); paintAdd(); };
        const t = el('span', 'pt');
        t.append(el('b', '', x.s.name), el('small', '', [x.from, x.s.duration ? fmt(x.s.duration) : null].filter(Boolean).join(', ')));
        row.append(cb, el('i'), t);
        ul.append(row);
      });
    };
    q.oninput = draw;
    draw();
    const bar = el('div', 'pick-bar');
    bar.append(addBtn);
    body.append(ul, bar);
  }

  $('#pick-audio').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!pickTarget || !files.length) return;
    const { zone, list } = pickTarget;
    closeSheet();
    let n = 0, skipped = 0;
    try {
      for (const f of files) {
        if (!FMT.isAudio(f)) { skipped += 1; continue; }
        busy('Adding sounds', `${f.name} (${n + 1} of ${files.length})`, n / files.length);
        const duration = await probeDuration(f);
        const key = await DB.putBlob(f);
        SIZES.set(key, f.size);
        list.push(newSound(key, cleanName(f.name), f.name, f.size, LOOP_NAMES[zone.loop], duration));
        n += 1;
      }
    } catch (err) {
      toast(quotaMessage(err).message, 4000);
    }
    idle();
    if (skipped) toast(`${plural(skipped, 'file')} skipped: not audio.`);
    afterAdd(n);
  });

  function afterAdd(n) {
    if (!n || !pickTarget) return;
    if (pickTarget.after) { pickTarget.after(); return; }
    if (ed) { dirty(); renderEdRail(); renderEdMain(); }
  }

  /* ================= Shared soundbox screen ================= */
  const saveShared = debounce(() => DB.setKV('soundbox', SHARED).catch((e) => toast(quotaMessage(e).message)), 400);
  function renderShared() {
    const box = $('#shared-list');
    box.textContent = '';
    const zone = { ...SOUNDBOX_ZONE, hint: 'Add your first effects: critical hits, level ups, explosions' };
    const dz = el('div', 'dz');
    dz.style.setProperty('--z', zone.color);
    SHARED.forEach((s, i) => dz.append(editCard(s, i, SHARED, zone, renderShared)));
    const hint = el('button', 'hint');
    hint.type = 'button';
    hint.innerHTML = `${ICON.plus}<span>${SHARED.length ? 'Add more' : zone.hint}</span>`;
    hint.onclick = () => openPicker(zone, SHARED, () => { saveShared(); renderShared(); });
    dz.append(hint);
    box.append(dz);
  }
  // Cards call dirty() when they change: on the shared screen that saves the shared soundbox, in the editor the story.
  function dirty() {
    if (screen === 'sbx') { saveShared(); return; }
    $('#ed-saved').textContent = '';
    saveSoon();
  }

  /* ================= Audio ================= */
  let ctx = null, masterGain = null, sbGain = null;
  const curve = (v) => v * v;
  const randomMax = () => Math.min(10, Math.max(1, Math.round(+settings.randomMax || 5)));
  const randomPause = () => 500 + Math.floor(Math.random() * Math.max(1, randomMax() * 1000 - 500));
  function applyAudioSession() {
    try { if (navigator.audioSession) navigator.audioSession.type = settings.silent ? 'playback' : 'auto'; } catch (e) { /* older iOS */ }
  }
  function audio() {
    if (!ctx) {
      applyAudioSession();
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      masterGain = ctx.createGain();
      masterGain.gain.value = curve(settings.master);
      masterGain.connect(ctx.destination);
      sbGain = ctx.createGain();
      sbGain.gain.value = curve(settings.sbVol);
      sbGain.connect(masterGain);
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
    return ctx;
  }
  function ramp(param, target, secs) {
    const t = ctx.currentTime;
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
    param.linearRampToValueAtTime(target, t + Math.max(secs, 0.012));
  }

  class Voice {
    constructor(sound, zone, chapter) {
      this.sound = sound; this.zone = zone; this.chapter = chapter;
      this.loop = LOOP_INDEX[sound.loop] ?? zone.loop;
      if (this.loop === 3 && zone.id === 'music') this.loop = 0;
      this.vol = typeof sound.volume === 'number' ? sound.volume : 0.75;
      this.state = 'loading';
      this.plays = 0; this.el = null; this.url = null; this.env = null; this.vg = null; this.timer = 0; this.card = null;
      // Random events, as in the Android app: rnd while the sound keeps coming back, next = when it plays again (0 while it plays).
      this.rnd = false; this.next = 0; this.startedAt = 0;
    }
    attach(blob) {
      this.url = URL.createObjectURL(blob);
      const el = (this.el = new Audio());
      el.preload = 'auto';
      el.loop = this.loop === 2;
      el.addEventListener('loadedmetadata', () => this.paint());
      el.addEventListener('ended', () => this.ended());
      el.addEventListener('error', () => { clearTimeout(this.timer); this.set('error'); });
      el.src = this.url;
      el.load();
      this.set('ready');
    }
    graph() {
      if (this.env) return;
      audio();
      const src = ctx.createMediaElementSource(this.el);
      this.vg = ctx.createGain(); this.vg.gain.value = curve(this.vol);
      this.env = ctx.createGain(); this.env.gain.value = 0;
      src.connect(this.vg).connect(this.env).connect(masterGain);
    }
    get active() { return this.state === 'playing' || this.state === 'ending'; }
    get usable() { return this.el && this.state !== 'loading' && this.state !== 'error'; }
    play(fadeIn = 0.03) {
      if (!this.usable) return;
      this.graph();
      clearTimeout(this.timer);
      if (this.loop === 3) { this.rnd = true; this.next = 0; this.startedAt = Date.now(); }
      if (this.state === 'ending') { ramp(this.env.gain, 1, 0.15); this.set('playing'); return; }
      if (this.state === 'ready') { this.el.currentTime = 0; this.plays = 0; }
      // From silence, rise over fadeIn. ramp() would start from gain.value, which Safari still reports
      // as the old level (1 after a sound ended), so the fade-in was lost there.
      const t = ctx.currentTime;
      this.env.gain.cancelScheduledValues(t);
      this.env.gain.setValueAtTime(0, t);
      this.env.gain.linearRampToValueAtTime(1, t + Math.max(fadeIn, 0.012));
      const p = this.el.play();
      if (p) p.catch(() => this.set('ready'));
      this.set('playing');
    }
    pause() {
      if (!this.active) return;
      clearTimeout(this.timer);
      ramp(this.env.gain, 0, 0.04);
      this.timer = setTimeout(() => this.el.pause(), 50);
      this.set('paused');
    }
    end(ms) {
      this.rnd = false; this.next = 0;
      if (this.state === 'paused') { this.reset(); return; }
      if (!this.active) { this.paint(); return; }
      if (!this.active) return;
      clearTimeout(this.timer);
      ramp(this.env.gain, 0, ms / 1000);
      this.set('ending');
      this.timer = setTimeout(() => this.reset(), ms + 40);
    }
    reset() {
      clearTimeout(this.timer);
      if (this.el) { this.el.pause(); try { this.el.currentTime = 0; } catch (e) { /* not loaded */ } }
      this.plays = 0;
      this.set('ready');
    }
    ended() {
      this.plays += 1;
      if (this.loop === 1 && this.plays < 2 && this.active) { this.el.currentTime = 0; this.el.play().catch(() => {}); return; }
      this.reset();
    }
    /** Random event between two plays (Android: randomOn && nextAt > 0). */
    get waiting() { return this.rnd && this.next > 0; }
    setLoop(l) {
      this.loop = l;
      if (l === 3) this.rnd = this.active || this.state === 'paused';
      else { this.rnd = false; this.next = 0; }
      if (this.el) this.el.loop = l === 2;
      if (l === 0 && this.plays > 0) this.plays = 0;
      this.sound.loop = LOOP_NAMES[l];
      tableDirty();
      this.paint();
    }
    setVol(v) {
      this.vol = v;
      this.sound.volume = Math.round(v * 100) / 100;
      tableDirty();
      if (this.vg) { const g = this.vg.gain; g.cancelScheduledValues(ctx.currentTime); g.setTargetAtTime(curve(v), ctx.currentTime, 0.03); }
    }
    /** Simple volume buttons: one step is 25 %, reached smoothly over 2 s. */
    stepVol(dir) {
      const q = this.vol * 4;
      const t = dir > 0 ? Math.min(1, (Math.floor(q + 1e-6) + 1) / 4) : Math.max(0, (Math.ceil(q - 1e-6) - 1) / 4);
      if (t === this.vol) return;
      const secs = Math.max(0.3, Math.abs(t - this.shownVol()) / 0.25 * 2);
      this.volFrom = this.shownVol(); this.volAt = performance.now(); this.volMs = secs * 1000;
      this.vol = t;
      this.sound.volume = t;
      tableDirty();
      if (this.vg) {
        const g = this.vg.gain, now = ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(curve(t), now + secs);
      }
      this.paint();
    }
    /** The volume heard right now (follows a ramp in progress). */
    shownVol() {
      if (!this.volMs) return this.vol;
      const f = Math.min(1, (performance.now() - this.volAt) / this.volMs);
      if (f >= 1) { this.volMs = 0; return this.vol; }
      return this.volFrom + (this.vol - this.volFrom) * f;
    }
    progress() {
      if (this.state === 'ready' || this.state === 'loading' || this.state === 'error') return 0;
      if (this.loop === 2) return -1;
      const d = this.el.duration;
      if (!d || !isFinite(d)) return 0;
      const total = this.loop === 1 ? 2 * d : d;
      return Math.min(1, (this.plays * d + this.el.currentTime) / total);
    }
    remaining() {
      const d = this.el && this.el.duration;
      if (!d || !isFinite(d) || this.loop === 2) return null;
      const total = this.loop === 1 ? 2 * d : d;
      return Math.max(0, total - (this.plays * d + this.el.currentTime));
    }
    set(state) { this.state = state; this.paint(); }
    paint() { if (this.card) paintCard(this); }
    /** Silences the voice at once (cheap). */
    silence() {
      clearTimeout(this.timer);
      if (this.el) this.el.pause();
      if (this.env) { try { this.env.disconnect(); } catch (e) { /* already */ } }
      this.card = null;
    }
    /** Lets go of the audio data. Done a few voices at a time, after the screen has changed. */
    release() {
      if (this.el) this.el.removeAttribute('src');
      if (this.url) URL.revokeObjectURL(this.url);
      this.el = null; this.url = null;
    }
    destroy() { this.silence(); this.release(); }
  }

  /* ================= Mixing table ================= */
  let tbl = null;         // { story, chapters: [{ meta, voices: {music:[],...}, railBtn }], all: [] }
  let chapterIdx = 0;
  let pausedByAll = [];
  let heldRandom = [];   // random events that were waiting when everything was paused
  const sb = { pads: [], sources: new Set() };
  // Loop and volume changes made at the table are kept with the story.
  const tableSave = debounce(() => { if (tbl) DB.putStory(tbl.story, false).catch(() => {}); }, 800);
  function tableDirty() { tableSave(); }

  async function openTable(story, idx) {
    if (tbl && tbl.story.uid === story.uid) { setChapter(Math.min(idx, tbl.chapters.length - 1)); show('table'); return; }
    closeTable();
    audio();
    tbl = { story, chapters: [], all: [] };
    story.chapters.forEach((c, i) => {
      const ch = { meta: c, index: i, voices: {} };
      ZONES.forEach((zone) => {
        ch.voices[zone.id] = (c[zone.id] || []).map((s) => { const v = new Voice(s, zone, ch); tbl.all.push(v); return v; });
      });
      tbl.chapters.push(ch);
    });
    $('#t-story').textContent = story.title;
    show('table');
    document.title = `${story.title} | Bardic`;
    renderRail();
    setChapter(Math.min(idx, tbl.chapters.length - 1));
    setSoundbox(settings.sbOpen ?? false);
    paintMaster();
    mediaSession(story);
    acquireWake();
    // Everything is already on the phone: hand each sound its stored audio, the chapter on screen first.
    const t = tbl;
    const order = [...ZONES.flatMap((z) => t.chapters[idx] ? t.chapters[idx].voices[z.id] : [])];
    t.all.forEach((v) => { if (!order.includes(v)) order.push(v); });
    loadPads(story);
    for (const v of order) {
      if (tbl !== t) return;
      try {
        const blob = await DB.getBlob(v.sound.blob);
        if (tbl !== t) return;
        if (blob) v.attach(blob); else v.set('error');
      } catch (e) { v.set('error'); }
    }
  }

  function closeTable() {
    if (!tbl) return;
    tableSave.flush();
    const voices = tbl.all;
    lastTableStory = tbl.story;
    voices.forEach((v) => v.silence());
    tbl = null;
    pausedByAll = [];
    stopSoundbox();
    sb.pads = [];
    $('#zones').textContent = '';
    $('#rail').textContent = '';
    $('#pads').textContent = '';
    let i = 0;
    const step = () => {
      const end = Math.min(voices.length, i + 6);
      for (; i < end; i++) voices[i].release();
      if (i < voices.length) setTimeout(step, 16);
    };
    setTimeout(step, 120);
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }

  function renderRail() {
    const rail = $('#rail');
    rail.textContent = '';
    rail.append(el('h3', '', 'Chapters'));
    tbl.chapters.forEach((c, i) => {
      const b = el('button', 'chap');
      b.type = 'button';
      b.append(el('span', 'n', String(i + 1)), el('span', 't', c.meta.title), el('i', 'live'));
      b.title = `Chapter ${i + 1}: ${c.meta.title}`;
      b.addEventListener('click', () => goChapter(i));
      c.railBtn = b;
      rail.append(b);
    });
  }
  function goChapter(i) {
    if (!tbl || i < 0 || i >= tbl.chapters.length) return;
    history.replaceState(null, '', `#/play/${encodeURIComponent(tbl.story.uid)}/${i + 1}`);
    setChapter(i);
  }

  function setChapter(i) {
    // Silence between chapters (setting): the sounds of the other chapters fade out over 4 s.
    if (settings.silence && tbl && i !== chapterIdx && tbl.chapters[i]) {
      const here = new Set(ZONES.flatMap((z) => tbl.chapters[i].voices[z.id]));
      tbl.all.forEach((v) => {
        if (here.has(v) || !(v.active || v.state === 'paused' || v.waiting)) return;
        v.end(4000);
        v.paint();
      });
      pausedByAll = pausedByAll.filter((v) => here.has(v));
      heldRandom = heldRandom.filter((v) => here.has(v));
      paintMaster();
    }
    chapterIdx = i;
    const ch = tbl.chapters[i];
    $('#t-chapter').textContent = `Chapter ${i + 1}: ${ch.meta.title}`;
    tbl.chapters.forEach((c, j) => c.railBtn.setAttribute('aria-current', String(j === i)));
    ch.railBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const zones = $('#zones');
    zones.textContent = '';
    ZONES.forEach((zone) => {
      const row = el('div', `zrow vm-${(settings.vol && settings.vol[zone.id]) || 'hidden'}`);
      row.style.setProperty('--z', zone.color);
      const label = el('div', 'zl');
      label.append(el('span', '', zone.label));
      const cards = el('div', 'cards');
      const voices = ch.voices[zone.id];
      if (!voices.length) cards.append(el('div', 'empty', zone.empty));
      voices.forEach((v) => cards.append(v.card ? v.card.root : buildCard(v)));
      row.append(label, cards);
      zones.append(row);
    });
    zones.scrollTop = 0;
    requestAnimationFrame(() => rollTitles(zones));
    tbl.all.forEach((v) => v.card && paintCard(v));
  }

  function buildCard(v) {
    const c = el('div', 'c');
    c.style.setProperty('--z', v.zone.color);
    const mode = (settings.vol && settings.vol[v.zone.id]) || 'hidden';
    c.classList.add(`vm-${mode}`);
    const head = el('div', 'ch');
    // The title rolls inside its frame when it is longer than the card (see rollTitles).
    const name = el('b', 'nm'); name.title = v.sound.name; name.append(el('span', '', v.sound.name));
    const rem = el('small');
    const loop = el('button', 'loop');
    loop.type = 'button'; loop.title = v.zone.id !== 'music' ? 'Loop: once, twice, forever, random' : 'Loop: once, twice, forever';
    loop.addEventListener('click', () => v.setLoop((v.loop + 1) % (v.zone.id !== 'music' ? 4 : 3)));
    head.append(name);
    if (mode !== 'hidden') head.append(rem);
    head.append(loop);
    const track = el('div', 'track'); const fill = el('div', 'fill'); track.append(fill);
    const ctrl = el('div', 'ctrl');
    const play = el('button', 'pb play'); play.type = 'button';
    play.addEventListener('click', () => toggleVoice(v));
    const end = el('button', 'pb end'); end.type = 'button'; end.innerHTML = ICON.stop;
    end.setAttribute('aria-label', `Fade out ${v.sound.name}`); end.title = 'Fade out';
    end.addEventListener('click', () => v.end(settings.fade));
    const vol = el('input');
    vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = v.vol;
    vol.setAttribute('aria-label', `${v.sound.name} volume`);
    vol.style.setProperty('--z', v.zone.color); setP(vol);
    vol.addEventListener('input', () => { v.setVol(+vol.value); setP(vol); });
    let lvl = null;
    if (mode === 'full') ctrl.append(play, end, vol);
    else if (mode === 'simple') {
      lvl = el('span', 'lvl');
      const dn = btn('vb', ICON.volDown, `Lower ${v.sound.name}`, () => v.stepVol(-1));
      const up = btn('vb', ICON.volUp, `Raise ${v.sound.name}`, () => v.stepVol(1));
      ctrl.append(play, end, dn, lvl, up);
    } else ctrl.append(play, end, rem);
    c.append(head, track, ctrl);
    v.card = { root: c, rem, loop, fill, play, end, lvl };
    paintCard(v);
    return c;
  }

  function toggleVoice(v) {
    audio();
    // Between two plays, a tap stops the random event.
    if (v.waiting) { v.rnd = false; v.next = 0; v.paint(); return; }
    acquireWake();
    if (v.state === 'playing') { v.pause(); return; }
    if (v.zone.id === 'music' && v.state !== 'ending') {
      const others = tbl.all.filter((o) => o !== v && o.zone.id === 'music' && (o.active || o.state === 'paused'));
      const crossing = others.some((o) => o.active);
      others.forEach((o) => o.end(settings.crossfade ? settings.fade : 150));
      v.play(crossing && settings.crossfade && v.state !== 'paused' ? settings.fade / 1000 : 0.03);
    } else {
      v.play();
    }
    pausedByAll = pausedByAll.filter((o) => o !== v);
    paintMaster();
  }

  function paintCard(v) {
    const k = v.card; if (!k) return;
    const waiting = v.waiting;
    const on = v.active || waiting;
    k.root.classList.toggle('on', on);
    k.root.classList.toggle('loading', v.state === 'loading');
    k.root.classList.toggle('err', v.state === 'error');
    const icon = v.state === 'playing' || waiting ? 'pause' : 'play';
    if (k.icon !== icon) { k.play.innerHTML = ICON[icon]; k.icon = icon; }
    k.play.setAttribute('aria-label', `${v.state === 'playing' ? 'Pause' : waiting ? 'Stop' : 'Play'} ${v.sound.name}`);
    k.play.disabled = !v.usable;
    k.end.disabled = !(on || v.state === 'paused');
    if (k.loopShown !== v.loop) {
      if (v.loop === 3) { k.loop.innerHTML = ICON.random; k.loop.setAttribute('aria-label', 'Random: plays again after a short random pause'); }
      else { k.loop.textContent = LOOP_LABELS[v.loop]; k.loop.removeAttribute('aria-label'); }
      k.loopShown = v.loop;
    }
    k.loop.classList.toggle('inf', v.loop === 2);
    k.loop.classList.toggle('rnd', v.loop === 3);
    const p = v.progress();
    if (p < 0) { k.fill.style.width = on || v.state === 'paused' ? '100%' : '0'; k.fill.style.background = 'var(--blue)'; }
    else { k.fill.style.width = `${p * 100}%`; k.fill.style.background = `hsl(${Math.round(130 * (1 - p))},72%,50%)`; }
    let txt = '', warn = false;
    if (v.state === 'loading') txt = 'loading…';
    else if (v.state === 'error') txt = 'unavailable';
    else if (waiting) txt = `next ${fmt(Math.max(0, (v.next - Date.now()) / 1000))}`;
    else if (heldRandom.includes(v)) txt = 'held';
    else if (on || v.state === 'paused') {
      if (v.loop === 2) txt = '∞ loop';
      else { const r = v.remaining(); if (r != null) { txt = fmt(r); warn = r <= 10; } }
    }
    if (k.rem.textContent !== txt) k.rem.textContent = txt;
    k.rem.classList.toggle('warn', warn);
    if (k.lvl) {
      const pct = `${Math.round(v.shownVol() * 100)}`;
      if (k.lvl.textContent !== pct) k.lvl.textContent = pct;
      k.lvl.classList.toggle('moving', !!v.volMs);
    }
  }

  /* Titles longer than their card roll slowly back and forth inside it. */
  function rollTitles(scope) {
    scope.querySelectorAll('.nm').forEach((b) => {
      const span = b.firstElementChild;
      if (!span) return;
      b.classList.remove('roll');
      const over = span.scrollWidth - b.clientWidth;
      if (over > 2) {
        b.classList.add('roll');
        b.style.setProperty('--roll', `${-over - 4}px`);
        b.style.setProperty('--rd', `${(3 + over / 18).toFixed(1)}s`);
      }
    });
  }
  window.addEventListener('resize', () => { if (tbl) rollTitles($('#zones')); });

  function pauseAll() {
    if (!tbl) return;
    audio();
    if (pausedByAll.length || heldRandom.length) {
      pausedByAll.forEach((v) => v.state === 'paused' && v.play());
      pausedByAll = [];
      const now = Date.now();
      heldRandom.forEach((v) => { v.rnd = true; v.next = now + randomPause(); v.paint(); });
      heldRandom = [];
    } else {
      pausedByAll = tbl.all.filter((v) => v.state === 'playing');
      pausedByAll.forEach((v) => v.pause());
      // Random events waiting for their next play hold still too.
      heldRandom = tbl.all.filter((v) => v.waiting);
      heldRandom.forEach((v) => { v.rnd = false; v.next = 0; v.paint(); });
    }
    paintMaster();
  }
  function stopAll() {
    if (!tbl) return;
    tbl.all.forEach((v) => v.end(settings.fade));
    pausedByAll = [];
    heldRandom = [];
    stopSoundbox();
    paintMaster();
  }
  function paintMaster() {
    const b = $('#pause-all');
    const resume = pausedByAll.length > 0 || heldRandom.length > 0;
    b.innerHTML = resume ? ICON.play : ICON.pause;
    b.setAttribute('aria-label', resume ? 'Resume all' : 'Pause all');
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = tbl && tbl.all.some((v) => v.state === 'playing') ? 'playing' : 'paused'; } catch (e) { /* not supported */ }
    }
  }

  /* ---------- Soundbox drawer: the story's effects, then the shared ones ---------- */
  async function loadPads(story) {
    const shared = await DB.getKV('soundbox', []);
    const t = tbl;
    sb.pads = [
      ...story.soundbox.map((s) => ({ s, own: true, buffer: null, state: 'loading' })),
      ...shared.map((s) => ({ s, own: false, buffer: null, state: 'loading' })),
    ];
    renderPads();
    for (const p of sb.pads) {
      if (tbl !== t) return;
      try {
        const blob = await DB.getBlob(p.s.blob);
        if (!blob) throw new Error('missing');
        const data = await blob.arrayBuffer();
        audio();
        p.buffer = await new Promise((ok, ko) => { const r = ctx.decodeAudioData(data, ok, ko); if (r && r.catch) r.catch(ko); });
        p.state = 'ready';
      } catch (e) { p.state = 'error'; }
      if (tbl === t) renderPads();
    }
  }
  function setSoundbox(open) {
    $('#soundbox').hidden = !open;
    $('#sb-toggle').setAttribute('aria-pressed', String(open));
    $('#scrim').hidden = !(open && !WIDE.matches);
    if (open) renderPads();
  }
  function toggleSoundbox() {
    const open = $('#soundbox').hidden;
    settings.sbOpen = open; save();
    setSoundbox(open);
  }
  function orderedPads() {
    const pinned = settings.pins.map((u) => sb.pads.find((p) => p.s.uid === u)).filter(Boolean);
    return pinned.concat(sb.pads.filter((p) => !settings.pins.includes(p.s.uid)));
  }
  function renderPads() {
    const pads = $('#pads');
    if ($('#soundbox').hidden) return;
    pads.textContent = '';
    if (!sb.pads.length) {
      const e = el('div', 'sb-empty', 'No effects yet. Add some to this story in the editor, or to your shared soundbox.');
      pads.append(e);
      return;
    }
    let lastGroup = null;
    orderedPads().forEach((p) => {
      const pinned = settings.pins.includes(p.s.uid);
      const group = pinned ? 'Pinned' : p.own ? 'This story' : 'Shared';
      if (group !== lastGroup) { pads.append(el('h4', 'pad-g', group)); lastGroup = group; }
      const b = el('button', 'pad' + (pinned ? ' pinned' : '') + (p.own ? '' : ' shared'));
      b.type = 'button';
      b.disabled = p.state !== 'ready';
      b.append(el('span', '', p.state === 'error' ? `${p.s.name} (unavailable)` : p.s.name));
      const pin = el('span', 'pin');
      pin.innerHTML = pinned ? ICON.starFill : ICON.star;
      pin.setAttribute('role', 'button'); pin.setAttribute('aria-label', `Pin ${p.s.name}`); pin.tabIndex = 0;
      pin.addEventListener('click', (e) => { e.stopPropagation(); togglePin(p.s.uid); });
      b.append(pin);
      b.addEventListener('click', () => firePad(p, b));
      pads.append(b);
    });
  }
  function togglePin(uid) {
    const i = settings.pins.indexOf(uid);
    if (i >= 0) settings.pins.splice(i, 1); else settings.pins.push(uid);
    save(); renderPads();
  }
  function firePad(p, b) {
    if (!p.buffer) return;
    audio();
    const src = ctx.createBufferSource();
    src.buffer = p.buffer;
    const g = ctx.createGain();
    g.gain.value = curve(typeof p.s.volume === 'number' ? Math.min(1, p.s.volume / 0.75) : 1);
    src.connect(g).connect(sbGain);
    src.start();
    sb.sources.add(src);
    src.onended = () => sb.sources.delete(src);
    if (b) { b.classList.remove('fire'); void b.offsetWidth; b.classList.add('fire'); b.addEventListener('animationend', () => b.classList.remove('fire'), { once: true }); }
  }
  function stopSoundbox() {
    sb.sources.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } });
    sb.sources.clear();
  }

  function mediaSession(story) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: story.title, artist: 'Bardic', artwork: [{ src: 'icons/261014_bardic_ios_512.png', sizes: '512x512', type: 'image/png' }] });
      navigator.mediaSession.setActionHandler('play', () => { if (pausedByAll.length) pauseAll(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (!pausedByAll.length) pauseAll(); });
      navigator.mediaSession.setActionHandler('stop', stopAll);
    } catch (e) { /* partial support */ }
  }

  // Live progress, about 15 times a second like the app.
  setInterval(() => {
    if (!tbl || document.hidden || screen !== 'table') return;
    const ch = tbl.chapters[chapterIdx];
    if (!ch) return;
    ZONES.forEach((z) => ch.voices[z.id].forEach((v) => (v.active || v.state === 'paused' || v.waiting || heldRandom.includes(v) || v.volMs) && paintCard(v)));
    tbl.chapters.forEach((c) => c.railBtn.classList.toggle('playing', ZONES.some((z) => c.voices[z.id].some((v) => v.active || v.waiting))));
    if (pausedByAll.length && !pausedByAll.some((v) => v.state === 'paused')) { pausedByAll = []; paintMaster(); }
  }, 66);

  // Random events (TableSession.runRandom on Android): once a random event has stopped sounding,
  // it gets a next play time 0.5 s to the longest pause later, and plays again when that time comes.
  setInterval(() => {
    if (!tbl) return;
    const now = Date.now();
    tbl.all.forEach((v) => {
      if (!v.rnd) return;
      const sounding = v.state === 'playing' || v.state === 'paused' || v.state === 'ending';
      if (sounding) { if (v.next) v.next = 0; return; }
      if (now - v.startedAt <= 400) return;
      if (!v.next) { v.next = now + randomPause(); v.paint(); }
      else if (now >= v.next) { v.next = 0; v.play(); }
    });
  }, 50);

  /* ================= Settings dialog ================= */
  function buildSettings() {
    const pick = $('#theme-pick');
    const paintThemes = () => BardicThemes.render(pick, settings.theme, (id) => { settings.theme = id; save(); syncSettings(); });
    paintThemes();
    $('#settings').addEventListener('toggle', paintThemes);
    segment('#mode-pick', 'mode', (v) => v);
    segment('#fade-pick', 'fade', Number);
    const stepRandom = (d) => { settings.randomMax = Math.min(10, Math.max(1, randomMax() + d)); save(); syncSettings(); };
    $('#random-less').addEventListener('click', () => stepRandom(-1));
    $('#random-more').addEventListener('click', () => stepRandom(1));
    $('#opt-crossfade').addEventListener('change', (e) => { settings.crossfade = e.target.checked; save(); });
    $('#opt-silence').addEventListener('change', (e) => { settings.silence = e.target.checked; save(); });
    $('#opt-awake').addEventListener('change', (e) => { settings.awake = e.target.checked; save(); settings.awake ? acquireWake() : releaseWake(); });
    $('#opt-silent').addEventListener('change', (e) => { settings.silent = e.target.checked; save(); applyAudioSession(); });
    document.querySelectorAll('[id^="vol-"][data-zone]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      settings.vol[g.dataset.zone] = b.dataset.v; save(); syncSettings();
      // Rebuild the cards of the table with their new controls.
      if (tbl) { tbl.all.forEach((v) => { v.card = null; }); setChapter(chapterIdx); }
    })));
    $('#opt-landscape').addEventListener('change', (e) => { settings.landscape = e.target.checked; save(); applyOrientation(); });
    if (window.BardAccount) window.BardAccount.mount($('#bard-account'));
    $('#app-version').textContent = `version ${VERSION}`;
    $('#app-device').textContent = DEV === 'tablet' ? 'Android tablet' : DEV;
    syncSettings();
  }
  function segment(sel, key, cast) {
    $(sel).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      settings[key] = cast(b.dataset.v); save();
      syncSettings();
    }));
  }
  function syncSettings() {
    document.querySelectorAll('#theme-pick .theme').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === BardicThemes.resolve(settings.theme))));
    document.querySelectorAll('#mode-pick button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.mode)));
    document.querySelectorAll('[id^="vol-"][data-zone]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.vol[g.dataset.zone]))));
    $('#opt-landscape').checked = settings.landscape;
    document.querySelectorAll('#fade-pick button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === settings.fade)));
    $('#random-val').textContent = `${randomMax()} s`;
    $('#random-note').textContent = `Plays again after a pause of 0.5\u00a0s to ${randomMax()}\u00a0s`;
    $('#random-less').disabled = randomMax() <= 1;
    $('#random-more').disabled = randomMax() >= 10;
    $('#opt-crossfade').checked = settings.crossfade;
    $('#opt-silence').checked = !!settings.silence;
    $('#opt-awake').checked = settings.awake;
    $('#opt-silent').checked = settings.silent;
    applyTheme();
  }
  async function openSettings() {
    syncSettings();
    $('#settings').showModal();
    const info = $('#store-info');
    info.textContent = 'Checking…';
    const [p] = await Promise.all([DB.persistence(), refresh()]);
    const bytes = [...SIZES.values()].reduce((a, b) => a + b, 0);
    info.textContent = '';
    const line = el('p', 'store-line');
    line.append(el('b', '', size(bytes)), document.createTextNode(` of sounds in ${plural(STORIES.length, 'story', 'stories')} and the shared soundbox.`));
    info.append(line);
    const prot = el('p', `store-prot ${p.persisted ? 'ok' : 'warn'}`);
    prot.textContent = p.persisted
      ? 'Protected: iOS keeps your stories, even when space runs low.'
      : p.persisted === false
        ? `Not protected yet: ${IOS ? 'iOS' : 'Android'} may clear them if your ${DEV} runs out of space. Keep a backup with Export every story.`
        : 'This iOS version does not say whether your stories are protected. Keep a backup with Export every story.';
    info.append(prot);
    if (p.quota) info.append(el('p', 'muted small', `Room left for Bardic: about ${size(Math.max(0, p.quota - (p.usage || 0)))}.`));
  }

  /* ================= Keep the screen awake ================= */
  let wake = null, videoAwake = false;
  const storyOpen = () => screen === 'table' || screen === 'editor';
  async function acquireWake() {
    if (!settings.awake || !storyOpen() || document.visibilityState !== 'visible') return;
    if ('wakeLock' in navigator && !wake) {
      try {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
        return;
      } catch (e) { wake = null; }
    }
    if (wake || videoAwake) return;
    // Fallback for iOS versions where the Wake Lock API is missing from Home Screen apps:
    // a tiny silent looping video keeps the display on while it plays.
    const v = $('#awake-video');
    if (!v.src) v.src = '261014_keep_awake.mp4';
    v.play().then(() => { videoAwake = true; }).catch(() => {});
  }
  function releaseWake() {
    if (wake) { wake.release().catch(() => {}); wake = null; }
    if (videoAwake) { $('#awake-video').pause(); videoAwake = false; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { acquireWake(); if (ctx && ctx.state !== 'running' && tbl) ctx.resume().catch(() => {}); }
    else { saveSoon.flush(); tableSave.flush(); }
  });
  // Wake lock and audio can only start from a tap on iPhone: retry on the next one.
  document.addEventListener('touchend', () => { if (settings.awake && storyOpen() && !wake && !videoAwake) acquireWake(); }, { passive: true });

  /* ================= Wiring ================= */
  function renderStaticIcons() {
    document.querySelectorAll('[data-action="home"], [data-action="leave-table"]').forEach((b) => (b.innerHTML = ICON.back));
    document.querySelectorAll('[data-action="settings"]').forEach((b) => (b.innerHTML = ICON.gear));
    document.querySelectorAll('#soundbox [data-action="soundbox"], .set-head .ico').forEach((b) => (b.innerHTML = ICON.close));
    $('[data-action="story-info"]').innerHTML = ICON.info;
    $('[data-action="export-current"]').innerHTML = ICON.share;
    $('#sb-toggle .star').innerHTML = ICON.starFill;
    $('[data-action="stop-all"]').innerHTML = ICON.stop;
    document.querySelectorAll('.i-plus').forEach((n) => (n.outerHTML = ICON.plus));
    document.querySelectorAll('.i-import').forEach((n) => (n.outerHTML = ICON.import));
    document.querySelectorAll('.i-play').forEach((n) => (n.outerHTML = ICON.play));
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'home': location.hash = '#/'; break;
      case 'leave-table': {
        stopAll();
        const back = tbl ? `#/edit/${encodeURIComponent(tbl.story.uid)}/${chapterIdx + 1}` : '#/';
        location.hash = tableFrom === 'editor' ? back : '#/';
        break;
      }
      case 'settings': openSettings(); break;
      case 'soundbox': toggleSoundbox(); break;
      case 'pause-all': pauseAll(); break;
      case 'stop-all': stopAll(); break;
      case 'import': pickBardic(); break;
      case 'new-story': newStory(); break;
      case 'add-shared': openPicker({ ...SOUNDBOX_ZONE, label: 'the shared soundbox' }, SHARED, () => { saveShared(); renderShared(); }); break;
      case 'story-info': openStoryInfo(); break;
      case 'export-current': if (ed) { saveSoon.flush(); exportStories([ed.story]); } break;
      case 'play-current':
        if (ed) { saveSoon.flush(); audio(); const ch = ed.ch === 'soundbox' ? 1 : ed.ch + 1; location.hash = `#/play/${encodeURIComponent(ed.story.uid)}/${ch}`; }
        break;
      case 'export-all': $('#settings').close(); refresh().then(() => exportStories(STORIES)); break;
      case 'wipe': wipeAll(); break;
      case 'close-sheet': closeSheet(); break;
    }
  });
  let tableFrom = 'library';
  window.addEventListener('hashchange', (e) => {
    // Leaving the table goes back where it was opened from: the editor or the library.
    if (/#\/play\//.test(e.newURL) && !/#\/play\//.test(e.oldURL || '')) tableFrom = /#\/edit\//.test(e.oldURL || '') ? 'editor' : 'library';
    route();
  });

  async function wipeAll() {
    const v = await ask('Erase everything?', `Every story, sound and effect leaves this ${DEV} for good. Export your stories first if you want to keep them.`, [
      { label: 'Cancel', value: null }, { label: 'Erase', value: 'erase', cls: 'danger' },
    ]);
    if (v !== 'erase') return;
    $('#settings').close();
    closeTable();
    leaveEditor();
    await DB.wipe();
    lastTableStory = null;
    settings.pins = [];
    save();
    location.hash = '#/';
    await route();
    toast('Bardic is empty again.');
  }

  $('#scrim').addEventListener('click', toggleSoundbox);
  ['#settings', '#sheet'].forEach((s) => $(s).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }));
  WIDE.addEventListener?.('change', () => tbl && setSoundbox(!$('#soundbox').hidden));

  const master = $('#master'), masterVal = $('#master-val');
  master.value = settings.master; masterVal.textContent = Math.round(settings.master * 100); setP(master);
  master.addEventListener('input', () => {
    settings.master = +master.value; masterVal.textContent = Math.round(settings.master * 100); setP(master);
    if (masterGain) masterGain.gain.setTargetAtTime(curve(settings.master), ctx.currentTime, 0.03);
    save();
  });
  const sbVol = $('#sb-volume');
  sbVol.value = settings.sbVol; setP(sbVol);
  sbVol.addEventListener('input', () => {
    settings.sbVol = +sbVol.value; setP(sbVol);
    if (sbGain) sbGain.gain.setTargetAtTime(curve(settings.sbVol), ctx.currentTime, 0.03);
    save();
  });

  /* ================= Smooth volume sliders ================= */
  // Safari's own range inputs only move when the small thumb is hit exactly, ignore taps on the bar,
  // and lose the drag to the row that scrolls sideways. Here the whole bar is the handle:
  // touch anywhere on it, the value jumps under the finger and follows it, and nothing else scrolls.
  function rangeValue(input, clientX) {
    const r = input.getBoundingClientRect();
    const pad = 8; // half the thumb, so the ends are reachable
    const f = Math.min(1, Math.max(0, (clientX - r.left - pad) / Math.max(1, r.width - 2 * pad)));
    const min = +input.min || 0, max = input.max === '' ? 100 : +input.max, step = +input.step || 1;
    return Math.round((min + f * (max - min)) / step) * step;
  }
  document.addEventListener('pointerdown', (e) => {
    const input = e.target.closest && e.target.closest('input[type="range"]');
    if (!input || input.disabled || e.button > 0) return;
    e.preventDefault();
    const id = e.pointerId;
    try { input.setPointerCapture(id); } catch (err) { /* older iOS */ }
    input.classList.add('dragging');
    const set = (x) => {
      const v = rangeValue(input, x);
      if (+input.value === v) return;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(e.clientX);
    let frame = 0, lastX = e.clientX;
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      ev.preventDefault();
      lastX = ev.clientX;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; set(lastX); });
    };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      if (frame) { cancelAnimationFrame(frame); frame = 0; set(lastX); }
      input.classList.remove('dragging');
      input.removeEventListener('pointermove', move);
      input.removeEventListener('pointerup', up);
      input.removeEventListener('pointercancel', up);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    input.addEventListener('pointermove', move);
    input.addEventListener('pointerup', up);
    input.addEventListener('pointercancel', up);
  }, { passive: false });

  /* ================= Orientation ================= */
  // iOS does not let a web app lock the screen: with Lock landscape on, an upright phone shows the
  // turn-your-phone screen. Where the browser can lock (Android), it is asked to.
  function applyOrientation() {
    root.classList.toggle('allow-portrait', !settings.landscape);
    try {
      if (screen.orientation && screen.orientation.lock) {
        if (settings.landscape) screen.orientation.lock('landscape').catch(() => {});
        else if (screen.orientation.unlock) screen.orientation.unlock();
      }
    } catch (e) { /* not supported */ }
    if (tbl) requestAnimationFrame(() => rollTitles($('#zones')));
  }
  applyOrientation();

  /* ================= Updates ================= */
  let updateReady = false;
  function reloadIfIdle() {
    if (!updateReady || tbl || !$('#busy').hidden || document.querySelector('dialog[open]')) return;
    if (ed) saveSoon.flush();
    setTimeout(() => location.reload(), 300);
  }
  window.addEventListener('hashchange', () => setTimeout(reloadIfIdle, 600));

  /* ================= Boot ================= */
  async function boot() {
    renderStaticIcons();
    buildSettings();
    applyAudioSession();
    if ('serviceWorker' in navigator) {
      // Updates: each time Bardic comes back to the screen it checks for a new version.
      // When one has arrived, the app reloads by itself, never in the middle of a session at the table.
      navigator.serviceWorker.register('sw.js').then((reg) => {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      }).catch(() => {});
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) return;
        updateReady = true;
        reloadIfIdle();
      });
    }
    try {
      await DB.open();
      DB.persistence().catch(() => {});
    } catch (e) {
      document.body.append(el('p', 'fatal', `Bardic cannot reach its storage on this ${DEV} (${e.message || e}). Close the app and open it again.`));
      return;
    }
    await route();
    scanDamage().catch(() => {});
  }
  boot();
})();
