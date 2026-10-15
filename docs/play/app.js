/* Bardic web edition.
 * Fixed stories, a live mixing table (Music / Ambiances / Events) and a soundbox.
 * Opening a story downloads every MP3 of every chapter into memory, so any sound starts instantly.
 * Long sounds play through <audio> elements fed from in-memory blobs (low RAM, gapless enough);
 * soundbox effects are fully decoded (AudioBuffer) so they fire with zero delay and can overlap.
 */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const ZONES = [
    { id: 'music', label: 'Music', color: 'var(--music)', loop: 2, empty: 'No music in this chapter yet.' },
    { id: 'ambience', label: 'Ambiances', color: 'var(--amb)', loop: 2, empty: 'No ambiances in this chapter yet.' },
    { id: 'events', label: 'Events', color: 'var(--evt)', loop: 0, empty: 'No events in this chapter yet.' },
  ];
  const LOOP_LABELS = ['1×', '2×', '∞'];
  const THEMES = [['obsidian', 'Obsidian'], ['parchment', 'Parchment'], ['blood', 'Blood'], ['divination', 'Divination']];
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
    star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 16),
    starFill: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 16, true),
  };

  /* ---------------- Settings ---------------- */
  const DEFAULTS = { theme: 'obsidian', mode: 'dark', fade: 2000, crossfade: true, silence: false, awake: false, master: 0.8, sbVol: 0.8, sbOpen: null, pins: [], randomMax: 5 };
  const settings = Object.assign({}, DEFAULTS, readJSON('bardic.settings'));
  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { const cur = readJSON('bardic.settings'); localStorage.setItem('bardic.settings', JSON.stringify(Object.assign(cur, settings))); } catch (e) { /* private mode */ } }

  const lightQuery = matchMedia('(prefers-color-scheme: light)');
  function applyTheme() {
    const mode = settings.mode === 'system' ? (lightQuery.matches ? 'light' : 'dark') : settings.mode;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.mode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bar').trim();
    document.querySelectorAll('.swatch').forEach((s) => { s.dataset.mode = mode; });
  }
  lightQuery.addEventListener?.('change', () => settings.mode === 'system' && applyTheme());

  /* ---------------- Audio graph ---------------- */
  let ctx = null, masterGain = null, sbGain = null;
  const curve = (v) => v * v;
  const randomMax = () => Math.min(10, Math.max(1, Math.round(+settings.randomMax || 5)));
  const randomPause = () => 500 + Math.floor(Math.random() * Math.max(1, randomMax() * 1000 - 500)); // perceptual volume
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      masterGain = ctx.createGain();
      masterGain.gain.value = curve(settings.master);
      masterGain.connect(ctx.destination);
      sbGain = ctx.createGain();
      sbGain.gain.value = curve(settings.sbVol);
      sbGain.connect(masterGain);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
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
      this.loop = zone.loop; this.vol = 0.75;
      this.state = 'loading'; // loading | ready | playing | paused | ending | error
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
      // The whole file is already in memory, so it is playable now
      // (iOS never preloads media on its own, so waiting for canplaythrough would stall there).
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
      if (this.el) { this.el.pause(); try { this.el.currentTime = 0; } catch (e) {} }
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
      this.paint();
    }
    setVol(v) {
      this.vol = v;
      if (this.vg) this.vg.gain.setTargetAtTime(curve(v), ctx.currentTime, 0.03);
    }
    /** Absolute progress 0..1 including loops, or -1 for an infinite loop that is running. */
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
    destroy() {
      clearTimeout(this.timer);
      if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
      if (this.url) URL.revokeObjectURL(this.url);
      if (this.env) this.env.disconnect();
    }
  }

  /* ---------------- Data ---------------- */
  let STORIES = [], LIBRARY = { chapters: {}, soundbox: [] };
  let story = null;          // { meta, chapters: [{ meta, key, voices: {music:[],...} }], all: [] }
  let chapterIdx = 0;
  let pausedByAll = [];
  let heldRandom = [];   // random events that were waiting when everything was paused
  let loader = null;
  const sb = { sounds: [], loaded: false, sources: new Set(), shared: null };
  // A .bardic file opened from this computer: { meta, chapters: [{ music|ambience|events: [sound] }], soundbox: [sound] }.
  // Its sounds carry their blob, so nothing is downloaded.
  let CUSTOM = null;
  const LOOP_INDEX = { once: 0, twice: 1, infinite: 2, random: 3 };

  async function boot() {
    renderStaticIcons();
    applyTheme();
    buildSettings();
    try {
      const [s, l] = await Promise.all([
        fetch('stories.json', { cache: 'no-cache' }).then((r) => r.json()),
        fetch('library.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : LIBRARY)).catch(() => LIBRARY),
      ]);
      STORIES = s.stories; LIBRARY = l;
    } catch (e) {
      $('#story-list').innerHTML = '<p class="muted">Could not load the stories. Open this page from GitHub Pages or a local web server.</p>';
      $('#stories').hidden = false;
      return;
    }
    sb.sounds = (LIBRARY.soundbox || []).map((s) => ({ ...s, buffer: null, state: 'loading' }));
    renderStories();
    window.addEventListener('hashchange', route);
    const src = new URLSearchParams(location.search).get('bardic');
    if (src && /^[\w./%-]+\.bardic$/i.test(src)) {
      history.replaceState(null, '', location.pathname + '#/bardic');
      openBardic(src, decodeURIComponent(src.split('/').pop()));
      return;
    }
    route();
  }

  function soundsOf(storyMeta) {
    const out = [];
    storyMeta.chapters.forEach((c) => {
      const z = LIBRARY.chapters[`${storyMeta.id}/${c.id}`] || {};
      ZONES.forEach((zone) => (z[zone.id] || []).forEach((s) => out.push(s)));
    });
    return out;
  }

  /* ---------------- Routing ---------------- */
  function route() {
    const m = location.hash.match(/^#\/([\w-]+)(?:\/(\d+))?/);
    if (m && m[1] === 'bardic' && !CUSTOM) { closeStory(); showImport(); return; }
    const meta = m && (m[1] === 'bardic' ? CUSTOM.meta : STORIES.find((s) => s.id === m[1]));
    if (!meta) { closeStory(); showStories(); return; }
    const idx = Math.min(Math.max(parseInt(m[2] || '1', 10) - 1, 0), meta.chapters.length - 1);
    if (!story || story.meta !== meta) openStory(meta, idx);
    else setChapter(idx);
  }
  const goChapter = (i) => {
    if (!story || i < 0 || i >= story.chapters.length) return;
    history.replaceState(null, '', `#/${story.meta.id}/${i + 1}`);
    setChapter(i);
  };

  /* ---------------- Stories screen ---------------- */
  function renderStories() {
    const list = $('#story-list');
    list.textContent = '';
    STORIES.forEach((s) => {
      const sounds = soundsOf(s);
      const mb = sounds.reduce((a, x) => a + (x.size || 0), 0) / 1048576;
      const b = el('button', 'story');
      b.type = 'button';
      b.append(el('h2', '', s.title), el('p', '', s.blurb));
      const ol = el('ol');
      s.chapters.forEach((c) => ol.append(el('li', '', c.title)));
      const meta = el('div', 'meta');
      meta.append(
        el('span', '', sounds.length ? `${s.chapters.length} chapters, ${sounds.length} sounds, ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB` : `${s.chapters.length} chapters, sounds coming soon`),
        el('span', 'open', 'Open'),
      );
      b.append(ol, meta);
      b.addEventListener('click', () => { audio(); location.hash = `#/${s.id}/1`; });
      list.append(b);
    });
  }
  function showStories() {
    $('#import').hidden = true;
    $('#table').hidden = true;
    $('#stories').hidden = false;
    document.title = 'Bardic Web Edition';
    releaseWake();
  }

  /* ---------------- Opening a story: preload everything ---------------- */
  function openStory(meta, idx) {
    closeStory();
    useSoundbox(meta.custom ? CUSTOM.soundbox : null);
    story = { meta, chapters: [], all: [] };
    meta.chapters.forEach((c, i) => {
      const key = `${meta.id}/${c.id}`;
      const lib = (meta.custom ? CUSTOM.chapters[i] : LIBRARY.chapters[key]) || {};
      const ch = { meta: c, index: i, key, voices: {} };
      ZONES.forEach((zone) => {
        ch.voices[zone.id] = (lib[zone.id] || []).map((s) => {
          const v = new Voice(s, zone, ch);
          if (s.loop in LOOP_INDEX && (s.loop !== 'random' || zone.id !== 'music')) v.loop = LOOP_INDEX[s.loop];
          if (typeof s.volume === 'number') v.vol = s.volume;
          story.all.push(v);
          return v;
        });
      });
      story.chapters.push(ch);
    });
    $('#t-story').textContent = meta.title;
    $('#stories').hidden = true;
    $('#import').hidden = true;
    $('#table').hidden = false;
    document.title = `${meta.title} | Bardic`;
    renderRail();
    setChapter(idx);
    setSoundbox(settings.sbOpen ?? WIDE.matches);
    preload(idx);
    acquireWake();
  }

  function closeStory() {
    if (!story) return;
    if (loader) loader.abort();
    story.all.forEach((v) => v.destroy());
    story = null; pausedByAll = [];
    stopSoundbox();
  }

  async function preload(firstChapter) {
    const s = story;
    const ctrl = (loader = new AbortController());
    // The chapter on screen first, then the soundbox, then every other chapter in order.
    const order = [];
    s.chapters[firstChapter] && ZONES.forEach((z) => order.push(...s.chapters[firstChapter].voices[z.id]));
    if (!sb.loaded) sb.sounds.forEach((x) => order.push(x));
    s.chapters.forEach((c, i) => i !== firstChapter && ZONES.forEach((z) => order.push(...c.voices[z.id])));

    const totalBytes = order.reduce((a, x) => a + ((x.sound || x).size || 0), 0) || 1;
    let doneBytes = 0;
    const tick = () => paintLoad(doneBytes / totalBytes);
    paintLoad(0);

    let next = 0;
    const worker = async () => {
      while (next < order.length && !ctrl.signal.aborted) {
        const item = order[next++];
        const info = item.sound || item;
        let got = 0;
        try {
          const blob = info.blob || await download(info.file, ctrl.signal, (n) => { got += n; doneBytes += n; tick(); });
          if (info.blob) doneBytes += info.blob.size;
          if (ctrl.signal.aborted) return;
          if (item instanceof Voice) item.attach(blob);
          else await decodePad(item, blob);
        } catch (e) {
          if (ctrl.signal.aborted) return;
          doneBytes += Math.max(0, (info.size || 0) - got);
          if (item instanceof Voice) item.set('error'); else { item.state = 'error'; renderPads(); }
        }
        tick();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!ctrl.signal.aborted && sb.sounds.every((x) => x.state !== 'loading')) sb.loaded = true;
  }

  async function download(file, signal, onBytes) {
    const res = await fetch(file, { signal });
    if (!res.ok) throw new Error(res.status);
    const type = res.headers.get('content-type') || 'audio/mpeg';
    if (!res.body || !res.body.getReader) { const b = await res.blob(); onBytes(b.size); return b; }
    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); onBytes(value.byteLength);
    }
    return new Blob(chunks, { type });
  }

  async function decodePad(pad, blob) {
    const data = await blob.arrayBuffer();
    audio();
    pad.buffer = await new Promise((ok, ko) => {
      const p = ctx.decodeAudioData(data, ok, ko); // callback form for older Safari
      if (p && p.catch) p.catch(ko);
    });
    pad.state = 'ready';
    renderPads();
  }

  function paintLoad(frac) {
    if (!story) return;
    const ready = story.all.filter((v) => v.state !== 'loading').length;
    const total = story.all.length;
    $('#load-count').textContent = `${ready}/${total}`;
    $('#load-fill').style.width = `${Math.round(frac * 100)}%`;
    $('#load-chip').classList.toggle('done', ready === total);
  }

  /* The shared web soundbox, or the soundbox of an opened .bardic file. */
  function useSoundbox(own) {
    if (own) {
      if (!sb.shared) sb.shared = { sounds: sb.sounds, loaded: sb.loaded };
      stopSoundbox();
      sb.sounds = own.map((s, i) => ({ name: s.name, file: `bardic:${CUSTOM.meta.key}:${i}`, blob: s.blob, size: s.size, buffer: null, state: 'loading' }));
      sb.loaded = false;
    } else if (sb.shared) {
      stopSoundbox();
      sb.sounds = sb.shared.sounds;
      sb.loaded = sb.shared.loaded;
      sb.shared = null;
    }
    renderPads();
  }

  /* ---------------- Play your own .bardic (computer) ---------------- */
  function showImport() {
    $('#stories').hidden = true;
    $('#table').hidden = true;
    $('#import').hidden = false;
    document.title = 'Play a tale | Bardic';
    releaseWake();
  }
  function dropState(title, sub, frac, busy, err) {
    const d = $('#bardic-drop');
    d.classList.toggle('busy', !!busy);
    d.classList.toggle('err', !!err);
    $('#drop-title').textContent = title;
    $('#drop-sub').textContent = sub;
    const bar = d.querySelector('.bar');
    bar.hidden = frac == null;
    if (frac != null) bar.firstElementChild.style.width = `${Math.round(frac * 100)}%`;
  }
  async function openBardic(source, label) {
    showImport();
    const started = Date.now();
    try {
      let blob = source;
      if (typeof source === 'string') {
        dropState('Fetching the tale', label, 0, true);
        blob = await download(source, undefined, (() => { let got = 0; return (n) => { got += n; dropState('Fetching the tale', `${label}, ${fmtSize(got)}`, null, true); }; })());
      }
      dropState('Opening the tale', label, 0, true);
      const d = await window.Bardic.unpack(blob, (done, total) => dropState('Opening the tale', `Reading sound ${done} of ${total}`, done / total, true));
      const wait = 700 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const conv = (s) => ({ name: s.name, blob: s.blob, size: s.blob.size, loop: s.loop, volume: s.volume });
      const key = `t${Date.now()}`;
      CUSTOM = {
        meta: {
          id: 'bardic', key, custom: true, title: d.title || 'Untitled tale', bard: d.bard, revision: d.revision,
          chapters: d.chapters.map((c, i) => ({ id: `c${i + 1}`, title: c.title || `Chapter ${i + 1}` })),
        },
        chapters: d.chapters.map((c) => ({ music: c.music.map(conv), ambience: c.ambience.map(conv), events: c.events.map(conv) })),
        soundbox: d.soundbox.map(conv),
      };
      if (!CUSTOM.meta.chapters.length) throw new Error('This tale has no chapter.');
      dropState('Drop a .bardic file here', 'or click to browse your computer', null, false);
      audio();
      location.hash = '#/bardic/1';
    } catch (e) {
      dropState('This file could not be opened', e.message || String(e), null, false, true);
    }
  }
  function fmtSize(b) { return b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`; }
  {
    const drop = $('#bardic-drop');
    $('#bardic-input').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) openBardic(f, f.name);
    });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer.files[0];
      if (f) openBardic(f, f.name);
    });
  }

  /* ---------------- Chapters & zones ---------------- */
  function renderRail() {
    const rail = $('#rail');
    rail.textContent = '';
    rail.append(el('h3', '', 'Chapters'));
    story.chapters.forEach((c, i) => {
      const b = el('button', 'chap');
      b.type = 'button';
      b.append(el('span', 'n', String(i + 1)), el('span', 't', c.meta.title), el('i', 'live'));
      b.title = `Chapter ${i + 1}: ${c.meta.title}`;
      b.addEventListener('click', () => goChapter(i));
      c.railBtn = b;
      rail.append(b);
    });
  }

  function setChapter(i) {
    // Silence between chapters (setting): the sounds of the other chapters fade out over 4 s.
    if (settings.silence && story && i !== chapterIdx) {
      const here = new Set(ZONES.flatMap((z) => story.chapters[i].voices[z.id]));
      story.all.forEach((v) => {
        if (here.has(v) || !(v.active || v.state === 'paused' || v.waiting)) return;
        v.end(4000);
        v.paint();
      });
      pausedByAll = pausedByAll.filter((v) => here.has(v));
      heldRandom = heldRandom.filter((v) => here.has(v));
      paintMaster();
    }
    chapterIdx = i;
    const ch = story.chapters[i];
    $('#t-chapter').textContent = `Chapter ${i + 1}: ${ch.meta.title}`;
    story.chapters.forEach((c, j) => c.railBtn.setAttribute('aria-current', String(j === i)));
    ch.railBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const zones = $('#zones');
    zones.textContent = '';
    ZONES.forEach((zone) => {
      const row = el('div', 'zrow');
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
    story.all.forEach((v) => v.card && paintCard(v));
  }

  function buildCard(v) {
    const c = el('div', 'c');
    c.style.setProperty('--z', v.zone.color);
    const head = el('div', 'ch');
    const name = el('b', '', v.sound.name); name.title = v.sound.name;
    const rem = el('small');
    const loop = el('button', 'loop');
    loop.type = 'button'; loop.title = v.zone.id !== 'music' ? 'Loop: once, twice, forever, random' : 'Loop: once, twice, forever';
    loop.addEventListener('click', () => v.setLoop((v.loop + 1) % (v.zone.id !== 'music' ? 4 : 3)));
    head.append(name, rem, loop);
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
    ctrl.append(play, end, vol);
    c.append(head, track, ctrl);
    v.card = { root: c, rem, loop, fill, play, end };
    paintCard(v);
    return c;
  }

  function toggleVoice(v) {
    audio();
    // Between two plays, a tap stops the random event.
    if (v.waiting) { v.rnd = false; v.next = 0; v.paint(); return; }
    if (v.state === 'playing') { v.pause(); return; }
    if (v.zone.id === 'music' && v.state !== 'ending') {
      const others = story.all.filter((o) => o !== v && o.zone.id === 'music' && (o.active || o.state === 'paused'));
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
    // Only swap the icon when it changes: replacing it on every tick swallowed clicks (the pause button seemed dead).
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
  }

  /* ---------------- Master ---------------- */
  function pauseAll() {
    if (!story) return;
    audio();
    if (pausedByAll.length || heldRandom.length) {
      pausedByAll.forEach((v) => v.state === 'paused' && v.play());
      pausedByAll = [];
      const now = Date.now();
      heldRandom.forEach((v) => { v.rnd = true; v.next = now + randomPause(); v.paint(); });
      heldRandom = [];
    } else {
      pausedByAll = story.all.filter((v) => v.state === 'playing');
      pausedByAll.forEach((v) => v.pause());
      // Random events waiting for their next play hold still too.
      heldRandom = story.all.filter((v) => v.waiting);
      heldRandom.forEach((v) => { v.rnd = false; v.next = 0; v.paint(); });
    }
    paintMaster();
  }
  function stopAll() {
    if (!story) return;
    story.all.forEach((v) => v.end(settings.fade));
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
    b.title = resume ? 'Resume all (Space)' : 'Pause all (Space)';
  }

  /* ---------------- Soundbox ---------------- */
  function setSoundbox(open) {
    const box = $('#soundbox');
    box.hidden = !open;
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
    const pinned = settings.pins.map((f) => sb.sounds.find((x) => x.file === f)).filter(Boolean);
    return pinned.concat(sb.sounds.filter((x) => !settings.pins.includes(x.file)));
  }
  function renderPads() {
    const pads = $('#pads');
    if ($('#soundbox').hidden) return;
    pads.textContent = '';
    if (!sb.sounds.length) { pads.append(el('div', 'sb-empty', 'No soundbox effects yet.')); return; }
    orderedPads().forEach((x, i) => {
      const b = el('button', 'pad' + (settings.pins.includes(x.file) ? ' pinned' : ''));
      b.type = 'button';
      b.disabled = x.state !== 'ready';
      if (i < 9) b.append(el('span', 'k', String(i + 1)));
      b.append(el('span', '', x.state === 'error' ? `${x.name} (unavailable)` : x.name));
      const pin = el('span', 'pin');
      pin.innerHTML = settings.pins.includes(x.file) ? ICON.starFill : ICON.star;
      pin.setAttribute('role', 'button'); pin.setAttribute('aria-label', `Pin ${x.name}`); pin.tabIndex = 0;
      const doPin = (e) => { e.stopPropagation(); togglePin(x.file); };
      pin.addEventListener('click', doPin);
      pin.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && doPin(e));
      b.append(pin);
      b.addEventListener('click', () => firePad(x, b));
      pads.append(b);
    });
  }
  function togglePin(file) {
    const i = settings.pins.indexOf(file);
    if (i >= 0) settings.pins.splice(i, 1); else settings.pins.push(file);
    save(); renderPads();
  }
  function firePad(x, btn) {
    if (!x.buffer) return;
    audio();
    const src = ctx.createBufferSource();
    src.buffer = x.buffer;
    src.connect(sbGain);
    src.start();
    sb.sources.add(src);
    src.onended = () => sb.sources.delete(src);
    if (btn) { btn.classList.remove('fire'); void btn.offsetWidth; btn.classList.add('fire'); }
  }
  function stopSoundbox() {
    sb.sources.forEach((s) => { try { s.stop(); } catch (e) {} });
    sb.sources.clear();
  }

  /* ---------------- Settings dialog ---------------- */
  function buildSettings() {
    const pick = $('#theme-pick');
    THEMES.forEach(([id, label]) => {
      const b = el('button', 'theme');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = id;
      const sw = el('div', 'swatch');
      sw.dataset.theme = id;
      sw.style.background = 'var(--bg)';
      ['--music', '--amb', '--evt'].forEach((c, n) => { const i = el('i'); i.style.background = `var(${c})`; i.style.width = `${[70, 100, 45][n]}%`; sw.append(i); });
      b.append(sw, el('span', '', label));
      b.addEventListener('click', () => { settings.theme = id; save(); applyTheme(); syncSettings(); });
      pick.append(b);
    });
    segment('#mode-pick', 'mode', (v) => v);
    segment('#fade-pick', 'fade', Number);
    const stepRandom = (d) => { settings.randomMax = Math.min(10, Math.max(1, randomMax() + d)); save(); syncSettings(); };
    $('#random-less').addEventListener('click', () => stepRandom(-1));
    $('#random-more').addEventListener('click', () => stepRandom(1));
    $('#opt-crossfade').addEventListener('change', (e) => { settings.crossfade = e.target.checked; save(); });
    $('#opt-silence').addEventListener('change', (e) => { settings.silence = e.target.checked; save(); });
    if (window.BardAccount) window.BardAccount.mount($('#bard-account'));
    $('#opt-awake').addEventListener('change', (e) => { settings.awake = e.target.checked; save(); settings.awake ? acquireWake() : releaseWake(); });
    syncSettings();
  }
  function segment(sel, key, cast) {
    $(sel).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      settings[key] = cast(b.dataset.v); save();
      if (key === 'mode') applyTheme();
      syncSettings();
    }));
  }
  function syncSettings() {
    document.querySelectorAll('#theme-pick .theme').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.theme)));
    document.querySelectorAll('#mode-pick button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.mode)));
    document.querySelectorAll('#fade-pick button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === settings.fade)));
    $('#random-val').textContent = `${randomMax()} s`;
    $('#random-note').textContent = `Plays again after a pause of 0.5\u00a0s to ${randomMax()}\u00a0s`;
    $('#random-less').disabled = randomMax() <= 1;
    $('#random-more').disabled = randomMax() >= 10;
    $('#opt-crossfade').checked = settings.crossfade;
    $('#opt-silence').checked = !!settings.silence;
    $('#opt-awake').checked = settings.awake;
    applyTheme();
  }

  /* ---------------- Screen wake lock ---------------- */
  let wake = null;
  async function acquireWake() {
    if (!settings.awake || !story || !('wakeLock' in navigator) || wake) return;
    try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (e) { wake = null; }
  }
  function releaseWake() { if (wake) { wake.release().catch(() => {}); wake = null; } }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && acquireWake());

  /* ---------------- Wiring ---------------- */
  function renderStaticIcons() {
    document.querySelectorAll('[data-action="back"]').forEach((b) => (b.innerHTML = ICON.back));
    document.querySelectorAll('[data-action="settings"]').forEach((b) => (b.innerHTML = ICON.gear));
    document.querySelectorAll('#soundbox [data-action="soundbox"], .set-head .ico').forEach((b) => (b.innerHTML = ICON.close));
    $('#sb-toggle .star').innerHTML = ICON.starFill;
    $('[data-action="stop-all"]').innerHTML = ICON.stop;
    paintMaster();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'back': stopAll(); if (story && story.meta.custom) { CUSTOM = null; } location.hash = story && story.meta.custom ? '#/bardic' : '#/'; break;
      case 'settings': $('#settings').showModal(); break;
      case 'soundbox': toggleSoundbox(); break;
      case 'pause-all': pauseAll(); break;
      case 'stop-all': stopAll(); break;
    }
  });
  $('#scrim').addEventListener('click', toggleSoundbox);
  $('#settings').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  WIDE.addEventListener?.('change', () => story && setSoundbox(!$('#soundbox').hidden));

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

  document.addEventListener('keydown', (e) => {
    if (!story || e.metaKey || e.ctrlKey || e.altKey || $('#settings').open) return;
    const t = e.target;
    const typing = t.matches && t.matches('input, textarea, select');
    if (e.key === ' ' && !typing && !(t.matches && t.matches('button'))) { e.preventDefault(); pauseAll(); }
    else if (/^[1-9]$/.test(e.key) && !typing) { const x = orderedPads()[+e.key - 1]; if (x) firePad(x, null); }
    else if (e.key === 'ArrowRight' && !typing) goChapter(chapterIdx + 1);
    else if (e.key === 'ArrowLeft' && !typing) goChapter(chapterIdx - 1);
    else if ((e.key === 's' || e.key === 'S') && !typing) toggleSoundbox();
    else if (e.key === 'Escape' && !$('#soundbox').hidden && !WIDE.matches) toggleSoundbox();
  });

  // Live progress (≈15 fps, like the app)
  setInterval(() => {
    if (!story || document.hidden) return;
    const ch = story.chapters[chapterIdx];
    ZONES.forEach((z) => ch.voices[z.id].forEach((v) => (v.active || v.state === 'paused' || v.waiting || heldRandom.includes(v)) && paintCard(v)));
    story.chapters.forEach((c) => c.railBtn.classList.toggle('playing', ZONES.some((z) => c.voices[z.id].some((v) => v.active || v.waiting))));
    if (pausedByAll.length && !pausedByAll.some((v) => v.state === 'paused')) { pausedByAll = []; paintMaster(); }
  }, 66);

  // Random events (TableSession.runRandom on Android): once a random event has stopped sounding,
  // it gets a next play time 0.5 s to the longest pause later, and plays again when that time comes.
  setInterval(() => {
    if (!story) return;
    const now = Date.now();
    story.all.forEach((v) => {
      if (!v.rnd) return;
      const sounding = v.state === 'playing' || v.state === 'paused' || v.state === 'ending';
      if (sounding) { if (v.next) v.next = 0; return; }
      if (now - v.startedAt <= 400) return;
      if (!v.next) { v.next = now + randomPause(); v.paint(); }
      else if (now >= v.next) { v.next = 0; v.play(); }
    });
  }, 50);

  /* ---------------- Helpers ---------------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function setP(input) { input.style.setProperty('--p', `${(input.value - input.min) / (input.max - input.min) * 100}%`); }
  function fmt(s) { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  boot();
})();
