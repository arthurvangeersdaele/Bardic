/* Bardic Story builder: everything stays in the browser, the .bardic file is built locally. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const { ZONES, pack, unpack, validate, isAudio, formatSize, SHARE_LIMIT, bardName } = window.Bardic;
  const ZONE_INFO = {
    music: { label: 'Music', color: 'var(--music)', loop: 'infinite', hint: 'Drop music here, one track plays at a time' },
    ambience: { label: 'Ambiances', color: 'var(--amb)', loop: 'infinite', hint: 'Drop ambiances here: rain, fire, crowds' },
    events: { label: 'Events', color: 'var(--evt)', loop: 'once', hint: 'Drop events here: bells, roars, explosions' },
    soundbox: { label: 'Soundbox', color: 'var(--accent)', loop: 'once', hint: 'Drop quick effects here' },
  };
  const LOOP_LABEL = { once: '1×', twice: '2×', infinite: '∞' };
  // Events and ambiances can also come back at random (the table plays them again after a short random pause).
  const nextLoop = (loop, zone) => ({ once: 'twice', twice: 'infinite', infinite: zone === 'events' || zone === 'ambience' ? 'random' : 'once', random: 'once' })[loop] || 'once';
  const UPLOAD_URL = 'https://github.com/arthurvangeersdaele/Bardic/upload/main/docs/recueil';

  const svg = (d, size = 16, fill = false) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
  const ICON = {
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>', 14),
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', 14, true),
    stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', 12, true),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>', 15),
    up: svg('<path d="M18 15l-6-6-6 6"/>', 14),
    down: svg('<path d="M6 9l6 6 6-6"/>', 14),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', 16),
    drop: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 16),
    link: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', 15),
    cut: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>', 14),
    random: svg('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', 14),
    reuse: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 15),
  };

  let uid = 0;
  const id = () => `s${++uid}`;
  const newChapter = (n) => ({ id: id(), title: `Chapter ${n}`, extra: {}, music: [], ambience: [], events: [] });
  // id, revision and created are the hidden versioning of the story: kept from an opened file, bumped at each forge.
  let state = { id: null, revision: 0, created: null, title: '', description: '', extra: {}, chapters: [newChapter(1)], soundbox: [] };
  let current = 0;
  let pickTarget = null;
  const cards = new Map();

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function nameFrom(fileName) {
    let n = fileName.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]*/, '').replace(/[_-]+/g, ' ').trim();
    return n ? n[0].toUpperCase() + n.slice(1) : fileName;
  }
  function fmtTime(s) { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function listOf(zone) { return zone === 'soundbox' ? state.soundbox : state.chapters[current][zone]; }
  function allSounds() { return state.chapters.flatMap((c) => ZONES.flatMap((z) => c[z])).concat(state.soundbox); }
  function findSound(sid) {
    for (const c of state.chapters) for (const z of ZONES) { const i = c[z].findIndex((s) => s.id === sid); if (i >= 0) return { list: c[z], i }; }
    const i = state.soundbox.findIndex((s) => s.id === sid);
    return i >= 0 ? { list: state.soundbox, i } : null;
  }
  function toast(msg) {
    const t = el('div', 'toast', msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* ---------- adding sounds ---------- */
  function addFiles(files, zone) {
    const list = listOf(zone);
    let skipped = 0;
    [...files].forEach((f) => {
      if (!isAudio(f)) { skipped++; return; }
      const s = { id: id(), name: nameFrom(f.name), blob: f, fileName: f.name, loop: ZONE_INFO[zone].loop, volume: 0.75, extra: {} };
      list.push(s);
      probe(s);
    });
    if (skipped) toast(`${skipped} file${skipped > 1 ? 's were' : ' was'} not audio and stayed out.`);
    renderAll();
  }
  function addFromLink(zone) {
    if (!window.BardicCrop) return;
    stopPreview();
    const list = listOf(zone);
    window.BardicCrop.open({
      zone,
      onSave: (file, info) => {
        list.push({ id: id(), name: info.name, blob: file, fileName: file.name, loop: ZONE_INFO[zone].loop, volume: 0.75, duration: info.duration, extra: {} });
        renderAll();
        toast(`“${info.name}” added to ${ZONE_INFO[zone].label}.`);
      },
    });
  }
  function cropSound(s, zone) {
    if (!window.BardicCrop) return;
    stopPreview();
    window.BardicCrop.open({
      zone, sound: s,
      onSave: (file, info) => {
        s.blob = file; s.fileName = file.name; s.duration = info.duration; s.name = info.name;
        renderAll();
        toast(`“${info.name}” cropped.`);
      },
    });
  }
  /* ---------- sounds of the Recueil (library.js) ---------- */
  // A library sound comes with its file, its name and its duration; it keeps where it comes from
  // (extra.recueil, written in the .bardic), so its tale can be credited.
  async function addFromLibrary(libId, zone, beforeId) {
    if (!window.BardicLibrary || !ZONE_INFO[zone]) return;
    const list = listOf(zone);
    const where = zone === 'soundbox' ? 'the Soundbox' : `${ZONE_INFO[zone].label} in ${state.chapters[current].title.trim() || `Chapter ${current + 1}`}`;
    const slow = setTimeout(() => toast('Fetching the sound from the Recueil…'), 400);
    try {
      const { file, item } = await window.BardicLibrary.fileOf(libId);
      const s = {
        id: id(), name: item.name, blob: file, fileName: file.name, loop: ZONE_INFO[zone].loop, volume: 0.75,
        duration: item.duration, extra: { recueil: { tale: item.tale, bard: item.bard } },
      };
      const at = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
      if (at >= 0) list.splice(at, 0, s); else list.push(s);
      probe(s);
      renderAll();
      toast(`“${item.name}” added to ${where}.`);
    } catch (err) {
      toast(err.message || 'This sound could not be fetched.');
    } finally {
      clearTimeout(slow);
    }
  }
  window.BardicBuilder = {
    /** Adds a sound of the Recueil to a row of the chapter on screen ("music", "ambience", "events") or the soundbox. */
    addFromLibrary: (libId, zone) => addFromLibrary(libId, zone),
  };

  /* ---------- reusing a sound already in the story ---------- */
  // Every distinct sound file of the story once, with the places it is used. A reused sound keeps the
  // same file (crop included), so it costs nothing more in the .bardic: the forge stores it once.
  function storySounds() {
    const map = new Map();
    const note = (s, zone, where) => {
      let e = map.get(s.blob);
      if (!e) { e = { s, zone, where: [] }; map.set(s.blob, e); }
      e.where.push(where);
    };
    state.chapters.forEach((c, i) => ZONES.forEach((z) => c[z].forEach((s) => note(s, z, `${c.title.trim() || `Chapter ${i + 1}`}, ${ZONE_INFO[z].label}`))));
    state.soundbox.forEach((s) => note(s, 'soundbox', 'Soundbox'));
    return [...map.values()];
  }
  let ruPaint = null;
  function reuseSounds(zone) {
    stopPreview();
    const target = listOf(zone);
    const into = zone === 'soundbox' ? 'the Soundbox' : `${ZONE_INFO[zone].label} in ${state.chapters[current].title.trim() || `Chapter ${current + 1}`}`;
    const found = storySounds();
    const box = veil(`<div class="cr-head"><h2>Sounds of this story</h2><button class="cr-close" type="button" aria-label="Close">${ICON.x}</button></div>
      <p class="ru-lead"></p>
      ${found.length > 6 ? '<input class="ru-find" type="search" placeholder="Find a sound" aria-label="Find a sound" autocomplete="off" spellcheck="false">' : ''}
      <ul class="ru-list"></ul>
      <div class="acts"><button class="btn primary" type="button" data-close>Done</button></div>`);
    box.classList.add('reuse');
    box.querySelector('.ru-lead').textContent = `Add a sound you already have to ${into}. It comes as it is, crop included.`;
    const ul = box.querySelector('.ru-list');
    const rows = found.map((e) => {
      const li = el('li');
      li.style.setProperty('--z', ZONE_INFO[e.zone].color);
      const play = el('button', 'pb play');
      play.type = 'button';
      play.onclick = () => togglePreview(e.s);
      const t = el('div', 't');
      const here = target.some((x) => x.blob === e.s.blob);
      const info = [e.s.duration ? fmtTime(e.s.duration) : null, formatSize(e.s.blob.size), e.where.join(', ')].filter(Boolean).join('   ');
      t.append(el('b', '', e.s.name || 'Sound'), el('small', '', info));
      const add = el('button', 'btn small', here ? 'Add again' : 'Add');
      add.type = 'button';
      add.onclick = () => {
        // Same kind of zone: keep its loop mode. Otherwise take the default of the new zone.
        const loop = zone === 'soundbox' ? 'once' : e.zone === zone ? e.s.loop : ZONE_INFO[zone].loop;
        target.push({ id: id(), name: e.s.name, blob: e.s.blob, fileName: e.s.fileName, loop, volume: e.s.volume ?? 0.75, duration: e.s.duration, extra: JSON.parse(JSON.stringify(e.s.extra || {})) });
        renderAll();
        li.classList.add('added');
        add.textContent = 'Added, add again';
      };
      li.append(play, t, add);
      ul.append(li);
      return { li, play, s: e.s, key: (e.s.name || '').toLowerCase() };
    });
    ruPaint = () => rows.forEach((r) => {
      const on = playingId === r.s.id;
      r.li.classList.toggle('playing', on);
      r.play.innerHTML = on ? ICON.stop : ICON.play;
      r.play.setAttribute('aria-label', `${on ? 'Stop' : 'Listen to'} ${r.s.name}`);
    });
    ruPaint();
    const find = box.querySelector('.ru-find');
    if (find) {
      find.oninput = () => { const q = find.value.trim().toLowerCase(); rows.forEach((r) => { r.li.hidden = !!q && !r.key.includes(q); }); };
      find.focus();
    }
    box.querySelector('.cr-close').onclick = closeVeil;
    box.querySelector('[data-close]').onclick = closeVeil;
  }

  function probe(s) {
    if (s.duration) return;
    const url = URL.createObjectURL(s.blob);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { if (isFinite(a.duration)) { s.duration = a.duration; paintMeta(s); } URL.revokeObjectURL(url); };
    a.onerror = () => URL.revokeObjectURL(url);
    a.src = url;
  }

  /* ---------- preview ---------- */
  const player = new Audio();
  let playingId = null;
  player.onended = () => stopPreview();
  function togglePreview(s) {
    if (playingId === s.id) { stopPreview(); return; }
    stopPreview();
    player.src = URL.createObjectURL(s.blob);
    player.volume = s.volume ?? 0.75;
    player.play().catch(() => {});
    playingId = s.id;
    paintPlaying();
  }
  function stopPreview() {
    if (player.src) { player.pause(); URL.revokeObjectURL(player.src); player.removeAttribute('src'); }
    playingId = null;
    paintPlaying();
  }
  function paintPlaying() {
    if (ruPaint) ruPaint();
    // A dot on the chapter whose sound is playing, as in the players.
    const live = playingId == null ? -1 : state.chapters.findIndex((c) => ZONES.some((z) => c[z].some((x) => x.id === playingId)));
    document.querySelectorAll('#rail .chap').forEach((b, i) => b.classList.toggle('playing', i === live));
    cards.forEach((c, sid) => {
      const on = sid === playingId;
      c.root.classList.toggle('playing', on);
      c.play.innerHTML = on ? ICON.stop : ICON.play;
      c.play.setAttribute('aria-label', `${on ? 'Stop' : 'Listen to'} ${c.sound.name}`);
    });
  }

  /* ---------- rendering ---------- */
  function renderAll() {
    cards.clear();
    renderRail();
    renderEditor();
    renderZone($('#sb-zone'), 'soundbox');
    renderTotal();
    paintPlaying();
    saveSoon();
  }

  function renderRail() {
    const rail = $('#rail');
    rail.textContent = '';
    rail.append(el('h3', '', 'Chapters'));
    state.chapters.forEach((c, i) => {
      const count = ZONES.reduce((a, z) => a + c[z].length, 0);
      const b = el('div', 'chap');
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.setAttribute('aria-current', String(i === current));
      const t = el('span', 't');
      t.append(el('span', '', c.title || `Chapter ${i + 1}`), el('div', 'cnt', `${count} sound${count === 1 ? '' : 's'}`));
      const mv = el('span', 'mv');
      const up = el('button'); up.type = 'button'; up.innerHTML = ICON.up; up.setAttribute('aria-label', 'Move chapter up'); up.disabled = i === 0;
      const dn = el('button'); dn.type = 'button'; dn.innerHTML = ICON.down; dn.setAttribute('aria-label', 'Move chapter down'); dn.disabled = i === state.chapters.length - 1;
      up.onclick = (e) => { e.stopPropagation(); moveChapter(i, -1); };
      dn.onclick = (e) => { e.stopPropagation(); moveChapter(i, 1); };
      mv.append(up, dn);
      b.append(el('span', 'n', String(i + 1)), t, el('i', 'live'), mv);
      b.onclick = () => { current = i; renderAll(); };
      b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } };
      // Dragging over a chapter in the rail opens it, so sounds can be dropped into its zones.
      b.ondragover = (e) => { e.preventDefault(); if (current !== i) { current = i; renderAll(); } };
      rail.append(b);
    });
    const add = el('button', 'btn add-chap');
    add.type = 'button';
    add.innerHTML = `${ICON.plus}<span>Add a chapter</span>`;
    add.onclick = () => { state.chapters.push(newChapter(state.chapters.length + 1)); current = state.chapters.length - 1; renderAll(); $('.chap-title')?.select(); };
    rail.append(add);
  }

  function moveChapter(i, d) {
    const j = i + d;
    if (j < 0 || j >= state.chapters.length) return;
    [state.chapters[i], state.chapters[j]] = [state.chapters[j], state.chapters[i]];
    if (current === i) current = j; else if (current === j) current = i;
    renderAll();
  }

  function renderEditor() {
    const ed = $('#editor');
    ed.textContent = '';
    const ch = state.chapters[current];
    const top = el('div', 'ed-top');
    top.append(el('span', 'n', String(current + 1)));
    const t = el('input', 'chap-title');
    t.value = ch.title;
    t.maxLength = 120;
    t.setAttribute('aria-label', `Title of chapter ${current + 1}`);
    t.oninput = () => { ch.title = t.value; const r = $('#rail .chap[aria-current="true"] .t span'); if (r) r.textContent = t.value || `Chapter ${current + 1}`; };
    top.append(t);
    const del = el('button', 'btn del');
    del.type = 'button';
    del.innerHTML = `${ICON.trash}<span>Remove</span>`;
    del.disabled = state.chapters.length === 1;
    del.onclick = () => {
      const n = ZONES.reduce((a, z) => a + ch[z].length, 0);
      if (n && !confirm(`Remove "${ch.title}" and its ${n} sound${n === 1 ? '' : 's'}?`)) return;
      stopPreview();
      state.chapters.splice(current, 1);
      current = Math.max(0, current - 1);
      renderAll();
    };
    top.append(del);
    ed.append(top);
    ZONES.forEach((z) => {
      const row = el('div', 'zrow drop');
      row.style.setProperty('--z', ZONE_INFO[z].color);
      const label = el('div', 'zl');
      label.append(el('span', '', ZONE_INFO[z].label));
      const dz = el('div', 'dz');
      dz.dataset.zone = z;
      row.append(label, dz);
      ed.append(row);
      renderZone(dz, z);
    });
  }

  function renderZone(dz, zone) {
    dz.textContent = '';
    dz.style.setProperty('--z', ZONE_INFO[zone].color);
    listOf(zone).forEach((s) => dz.append(buildCard(s, zone)));
    const hint = el('button', 'hint');
    hint.type = 'button';
    hint.innerHTML = `${ICON.drop}<span>${listOf(zone).length ? 'Add more' : ZONE_INFO[zone].hint}, or <b>browse</b></span>`;
    hint.onclick = () => { pickTarget = zone; $('#pick').click(); };
    const link = el('button', 'link-btn');
    link.type = 'button';
    link.innerHTML = `${ICON.link}<span>From a link or YouTube</span>`;
    link.onclick = () => addFromLink(zone);
    const adds = el('div', 'adds');
    adds.append(hint, link);
    // Sounds already elsewhere in the story can come here again, crop included.
    if (allSounds().some((s) => !listOf(zone).includes(s))) {
      const reuse = el('button', 'link-btn');
      reuse.type = 'button';
      reuse.innerHTML = `${ICON.reuse}<span>From this story</span>`;
      reuse.onclick = () => reuseSounds(zone);
      adds.append(reuse);
    }
    // The sounds of every tale in the Recueil, opened on this row's tab.
    if (window.BardicLibrary) {
      const rec = el('button', 'link-btn');
      rec.type = 'button';
      rec.innerHTML = `${ICON.book}<span>From the Recueil</span>`;
      rec.onclick = () => window.BardicLibrary.open(zone);
      adds.append(rec);
    }
    dz.append(adds);
  }

  function buildCard(s, zone) {
    const c = el('div', 'sc');
    c.style.setProperty('--z', ZONE_INFO[zone].color);
    c.draggable = true;
    c.dataset.id = s.id;
    const top = el('div', 'row');
    const name = el('input');
    name.value = s.name;
    name.maxLength = 80;
    name.setAttribute('aria-label', 'Sound name');
    name.oninput = () => { s.name = name.value; };
    name.addEventListener('mousedown', (e) => e.stopPropagation());
    const x = el('button', 'x');
    x.type = 'button';
    x.innerHTML = ICON.x;
    x.setAttribute('aria-label', `Remove ${s.name}`);
    x.onclick = () => { const f = findSound(s.id); if (f) { if (playingId === s.id) stopPreview(); f.list.splice(f.i, 1); renderAll(); } };
    top.append(name, x);
    const bottom = el('div', 'row');
    const play = el('button', 'pb play');
    play.type = 'button';
    play.onclick = () => togglePreview(s);
    const meta = el('span', 'meta');
    const loop = el('button', 'loop');
    loop.type = 'button';
    loop.title = zone === 'events' || zone === 'ambience' ? 'Loop: once, twice, forever, random' : 'Loop: once, twice, forever';
    const paintLoop = () => {
      if (s.loop === 'random') { loop.innerHTML = ICON.random; loop.setAttribute('aria-label', 'Random: plays again after a short random pause'); }
      else { loop.textContent = LOOP_LABEL[s.loop] || '1×'; loop.removeAttribute('aria-label'); }
      loop.classList.toggle('inf', s.loop === 'infinite');
      loop.classList.toggle('rnd', s.loop === 'random');
    };
    paintLoop();
    loop.onclick = () => { s.loop = nextLoop(s.loop, zone); paintLoop(); };
    const cut = el('button', 'cut');
    cut.type = 'button';
    cut.innerHTML = ICON.cut;
    cut.title = 'Crop';
    cut.setAttribute('aria-label', `Crop ${s.name}`);
    cut.onclick = () => cropSound(s, zone);
    // Soundbox effects fire once per tap: no loop button for them.
    bottom.append(play, meta, cut);
    if (zone !== 'soundbox') bottom.append(loop);
    // Default volume: the level the sound starts at on the table, in every Bardic.
    const volRow = el('label', 'row edvol');
    volRow.append(el('span', 'vl', 'Volume'));
    const vr = el('input');
    vr.type = 'range'; vr.min = 0; vr.max = 1; vr.step = 0.05; vr.value = typeof s.volume === 'number' ? s.volume : 0.75;
    vr.setAttribute('aria-label', `Default volume of ${s.name}`);
    vr.style.setProperty('--z', ZONE_INFO[zone].color);
    vr.style.setProperty('--p', `${vr.value * 100}%`);
    vr.draggable = false;
    vr.addEventListener('mousedown', (e) => e.stopPropagation());
    vr.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
    const vp = el('b', 'vp', `${Math.round(+vr.value * 100)}`);
    vr.addEventListener('input', () => {
      s.volume = Math.round(+vr.value * 100) / 100;
      vp.textContent = `${Math.round(s.volume * 100)}`;
      vr.style.setProperty('--p', `${vr.value * 100}%`);
      if (playingId === s.id) player.volume = s.volume;
    });
    volRow.append(vr, vp);
    c.append(top, bottom, volRow);
    c.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/x-bardic-sound', s.id);
      e.dataTransfer.effectAllowed = 'move';
      c.classList.add('dragging');
    });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
    cards.set(s.id, { root: c, play, meta, sound: s });
    paintMeta(s);
    return c;
  }

  function paintMeta(s) {
    const c = cards.get(s.id);
    if (!c) return;
    c.meta.textContent = '';
    [s.duration ? fmtTime(s.duration) : null, formatSize(s.blob.size)].filter(Boolean).forEach((t) => c.meta.append(el('span', '', t)));
  }

  function renderTotal() {
    const sounds = allSounds();
    const bytes = sounds.reduce((a, s) => a + s.blob.size, 0);
    const t = $('#total');
    t.textContent = sounds.length ? `${state.chapters.length} chapter${state.chapters.length > 1 ? 's' : ''}, ${sounds.length} sound${sounds.length > 1 ? 's' : ''}, about ${formatSize(bytes)}` : 'No sounds yet';
    t.classList.toggle('warn', bytes > SHARE_LIMIT);
    t.title = bytes > SHARE_LIMIT ? 'Over 100 MB: fine for your table, but too heavy for the Recueil on GitHub.' : '';
  }

  /* ---------- drag and drop ---------- */
  document.addEventListener('dragover', (e) => {
    const dz = e.target.closest && e.target.closest('.dz');
    if (!dz) { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); return; }
    e.preventDefault();
    document.querySelectorAll('.dz.over').forEach((d) => d !== dz && d.classList.remove('over'));
    dz.classList.add('over');
  });
  document.addEventListener('dragleave', (e) => {
    const dz = e.target.closest && e.target.closest('.dz');
    if (dz && !dz.contains(e.relatedTarget)) dz.classList.remove('over');
  });
  document.addEventListener('drop', (e) => {
    const dz = e.target.closest && e.target.closest('.dz');
    document.querySelectorAll('.dz.over').forEach((d) => d.classList.remove('over'));
    e.preventDefault();
    if (!dz) return;
    const zone = dz.dataset.zone;
    const lib = e.dataTransfer.getData('text/x-bardic-library');
    if (lib) {
      const before = e.target.closest('.sc');
      addFromLibrary(lib, zone, before ? before.dataset.id : null);
      return;
    }
    const sid = e.dataTransfer.getData('text/x-bardic-sound');
    if (sid) {
      const f = findSound(sid);
      if (!f) return;
      const [s] = f.list.splice(f.i, 1);
      const list = listOf(zone);
      const before = e.target.closest('.sc');
      const at = before ? list.findIndex((x) => x.id === before.dataset.id) : -1;
      if (at >= 0) list.splice(at, 0, s); else list.push(s);
      renderAll();
      return;
    }
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files, zone);
  });

  $('#pick').addEventListener('change', (e) => {
    if (pickTarget && e.target.files.length) addFiles(e.target.files, pickTarget);
    e.target.value = '';
  });

  /* ---------- story fields ---------- */
  [['#f-title', 'title'], ['#f-desc', 'description']].forEach(([sel, key]) => {
    $(sel).addEventListener('input', (e) => { state[key] = e.target.value; });
  });
  function fillFields() {
    $('#f-title').value = state.title;
    $('#f-desc').value = state.description;
  }

  /* ---------- forge ---------- */
  function veil(inner) {
    closeVeil();
    const v = el('div', 'veil');
    v.id = 'veil';
    const box = el('div', 'forge');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = inner;
    v.append(box);
    v.addEventListener('click', (e) => { if (e.target === v && !v.dataset.busy) closeVeil(); });
    document.body.append(v);
    return box;
  }
  function closeVeil() {
    if (ruPaint) { ruPaint = null; stopPreview(); }
    $('#veil')?.remove();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#veil') && !$('#veil').dataset.busy) closeVeil(); });

  /* ---------- bard name (Settings: GitHub account, else Forgotten Barde) ---------- */
  function paintBard() {
    const b = $('#bard-btn');
    b.innerHTML = '';
    b.append('Signed by ');
    b.append(el('b', '', bardName()));
  }
  $('#bard-btn').addEventListener('click', () => window.BardicSettings && window.BardicSettings.open());
  window.addEventListener('storage', (e) => { if (e.key === 'bardic.account') paintBard(); });
  window.addEventListener('bardic:account', paintBard);

  /* ---------- forge ---------- */
  let lastForged = null;
  async function forge() {
    stopPreview();
    const bard = bardName();
    const errors = validate(state, bard);
    if (errors.length) {
      const box = veil('<h2>Not quite ready</h2><ul class="errors"></ul><div class="acts"><button class="btn" type="button" data-close>Back to the story</button></div>');
      errors.forEach((m) => box.querySelector('.errors').append(el('li', '', m)));
      box.querySelector('[data-close]').onclick = closeVeil;
      return;
    }
    const box = veil('<h2>Forging…</h2><p>Packing your chapters and sounds into one file. Everything happens on this computer.</p><div class="bar"><i></i></div>');
    $('#veil').dataset.busy = '1';
    try {
      const out = await pack(state, bard, (f) => { box.querySelector('.bar i').style.width = `${Math.round(f * 100)}%`; });
      lastForged = out;
      download(out);
      // The forged file is now the story: the editor empties for the next one.
      // To change this tale again, open its .bardic (that keeps its revision count going).
      await clearEditor();
      showForged(out);
    } catch (err) {
      const b = veil('<h2>The forge failed</h2><p class="err"></p><div class="acts"><button class="btn" type="button" data-close>Close</button></div>');
      b.querySelector('.err').textContent = err.message || String(err);
      b.querySelector('[data-close]').onclick = closeVeil;
    }
  }
  $('#forge-btn').addEventListener('click', forge);

  function download(out) {
    const a = el('a');
    a.href = URL.createObjectURL(out.blob);
    a.download = out.fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  function showForged(out) {
    const heavy = out.blob.size > SHARE_LIMIT;
    const box = veil(`<h2>Your tale is forged</h2>
      <p><b class="fname"></b> (${formatSize(out.blob.size)}) is in your downloads, revision ${out.story.revision} signed by <b class="bname"></b>. Open it in the Bardic app, or keep it for your next session.</p>
      <p>The builder is now empty, ready for a new tale. To change this one again, open its .bardic file with <b>Open a .bardic</b>.</p>
      ${heavy ? '<p class="errors" style="list-style:none;padding:0">It weighs more than 100 MB, the limit for the Recueil on GitHub. Lighter MP3s (128 kbps) will make it fit.</p>'
              : '<p>Want other bards to play it? Lay it in the Recueil: GitHub opens a pull request for you, and once accepted your tale appears in the book.</p>'}
      <div class="acts">
        ${heavy ? '' : `<a class="btn primary" href="${UPLOAD_URL}" target="_blank" rel="noopener">Lay it in the Recueil</a>`}
        <button class="btn" type="button" data-again>Download again</button>
        <button class="btn" type="button" data-close>Forge a new tale</button>
      </div>`);
    box.querySelector('.fname').textContent = out.fileName;
    box.querySelector('.bname').textContent = out.story.bard;
    box.querySelector('[data-again]').onclick = () => download(lastForged);
    box.querySelector('[data-close]').onclick = () => { closeVeil(); $('#f-title').focus(); };
  }

  /* ---------- open an existing .bardic ---------- */
  function loadingVeil(label) {
    const box = veil('<div class="eq" aria-hidden="true"><i></i><i></i><i></i></div><h2>Opening the tale</h2><p class="lbl"></p><div class="bar"><i></i></div><p class="step" aria-live="polite"></p>');
    box.classList.add('loading');
    box.querySelector('.lbl').textContent = label;
    $('#veil').dataset.busy = '1';
    return {
      progress(frac, text) {
        box.querySelector('.bar i').style.width = `${Math.round(frac * 100)}%`;
        if (text != null) box.querySelector('.step').textContent = text;
      },
    };
  }
  async function load(source, label) {
    const ui = loadingVeil(label);
    const started = Date.now();
    try {
      let blob = source;
      if (typeof source === 'string') blob = await fetchWithProgress(source, (f, got, total) => ui.progress(f * 0.5, `Fetching from the Recueil, ${formatSize(got)}${total ? ` of ${formatSize(total)}` : ''}`));
      const base = typeof source === 'string' ? 0.5 : 0;
      const d = await unpack(blob, (done, total) => ui.progress(base + (1 - base) * (done / total), `Reading sound ${done} of ${total}`));
      ui.progress(1, 'Ready');
      // Leave the animation on screen long enough to be seen, even for a small file.
      const wait = 700 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      stopPreview();
      d.chapters.forEach((c) => { c.id = id(); ZONES.forEach((z) => c[z].forEach((s) => { s.id = id(); })); });
      d.soundbox.forEach((s) => { s.id = id(); });
      if (!d.chapters.length) d.chapters.push(newChapter(1));
      const by = d.bard;
      delete d.bard;
      state = d;
      current = 0;
      fillFields();
      renderAll();
      closeVeil();
      toast(by ? `"${state.title}" by ${by} is open. Forging it makes the next revision.` : `"${state.title}" is open.`);
    } catch (err) {
      const b = veil('<h2>Could not open this file</h2><p class="err"></p><div class="acts"><button class="btn" type="button" data-close>Close</button></div>');
      b.querySelector('.err').textContent = err.message || String(err);
      b.querySelector('[data-close]').onclick = closeVeil;
    }
  }
  async function fetchWithProgress(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not fetch the story (${res.status}).`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !res.body.getReader) return res.blob();
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
      onProgress(total ? Math.min(1, got / total) : 0.5, got, total);
    }
    return new Blob(chunks, { type: 'application/zip' });
  }
  $('#open-btn').addEventListener('click', () => {
    if (allSounds().length && !confirm('Open another story? The current one will be replaced (forge it first to keep it).')) return;
    $('#open-input').click();
  });
  $('#open-input').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) load(f, f.name);
  });
  /* ---------- draft kept in this browser ---------- */
  const Draft = window.BardicDraft;
  let restoring = true, pending = false, saving = null, saveTimer = 0;
  const isEmpty = () => !allSounds().length && !state.title.trim() && !state.description.trim() && state.chapters.length === 1 && /^Chapter 1$/.test(state.chapters[0].title.trim());
  function paintSaved(text) { const t = $('#saved'); if (t) t.textContent = text; }
  function saveSoon() {
    if (restoring || !Draft) return;
    pending = true;
    paintSaved('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 600);
  }
  async function flush() {
    clearTimeout(saveTimer);
    if (!pending || !Draft) return;
    if (saving) { await saving; if (!pending) return; }
    pending = false;
    saving = (isEmpty() ? Draft.clear() : Draft.save(state, current))
      .then(() => { if (!pending) paintSaved(isEmpty() ? '' : 'Saved in this browser'); })
      .catch(() => { paintSaved('Not saved: this browser blocks storage'); })
      .finally(() => { saving = null; });
    await saving;
  }
  // Any edit (typing a name, a loop mode, a drop) schedules a save; structural changes go through renderAll.
  ['input', 'change', 'click', 'drop'].forEach((t) => document.addEventListener(t, (e) => { if (e.target.closest && e.target.closest('#bld')) saveSoon(); }, true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', () => { flush(); });
  window.addEventListener('beforeunload', (e) => {
    // The draft is kept in the browser: only warn while a change has not been written yet.
    if (pending || saving) { flush(); e.preventDefault(); e.returnValue = ''; }
  });

  function adopt(d, at) {
    d.chapters.forEach((c) => { c.id = id(); ZONES.forEach((z) => c[z].forEach((s) => { s.id = id(); probe(s); })); });
    d.soundbox.forEach((s) => { s.id = id(); probe(s); });
    if (!d.chapters.length) d.chapters.push(newChapter(1));
    state = d;
    current = Math.min(Math.max(0, at || 0), state.chapters.length - 1);
    fillFields();
  }

  async function clearEditor() {
    stopPreview();
    state = { id: null, revision: 0, created: null, title: '', description: '', extra: {}, chapters: [newChapter(1)], soundbox: [] };
    current = 0;
    fillFields();
    pending = false;
    clearTimeout(saveTimer);
    if (saving) { try { await saving; } catch (e) { /* ignore */ } }
    try { await Draft.clear(); } catch (e) { /* nothing kept */ }
    renderAll();
    paintSaved('');
  }
  $('#new-btn').addEventListener('click', async () => {
    if (!isEmpty() && !confirm('Start a new story? The one in progress will be cleared from this browser (forge it first to keep it).')) return;
    await clearEditor();
    $('#f-title').focus();
  });

  async function start() {
    const fromUrl = new URLSearchParams(location.search).get('open');
    const wanted = fromUrl && /^[\w./%-]+\.bardic$/i.test(fromUrl) ? fromUrl : null;
    let draft = null;
    try { draft = Draft ? await Draft.load() : null; } catch (e) { draft = null; }
    const has = draft && (draft.story.title || draft.story.chapters.some((c) => ZONES.some((z) => c[z].length)) || draft.story.soundbox.length);
    let useDraft = !!has;
    if (has && wanted) useDraft = !confirm(`You have an unfinished story in this browser${draft.story.title ? `, "${draft.story.title}"` : ''}. Open the tale from the Recueil instead? Your unfinished story will be replaced.`);
    if (useDraft) {
      adopt(draft.story, draft.current);
      renderAll();
      toast(draft.lost
        ? `Your unfinished story is back, but ${draft.lost} sound${draft.lost > 1 ? 's were' : ' was'} missing from this browser.`
        : `Your unfinished story${draft.story.title ? `, "${draft.story.title}",` : ''} is back where you left it.`);
      paintSaved('Saved in this browser');
    }
    restoring = false;
    if (wanted && !useDraft) load(wanted, decodeURIComponent(wanted.split('/').pop()));
  }

  paintBard();
  renderAll();
  start();
})();
