/* Bardic Story builder: everything stays in the browser, the .bardic file is built locally. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const { ZONES, pack, unpack, validate, isAudio, formatSize, SHARE_LIMIT, bardName, setBardName } = window.Bardic;
  const ZONE_INFO = {
    music: { label: 'Music', color: 'var(--music)', loop: 'infinite', hint: 'Drop music here, one track plays at a time' },
    ambience: { label: 'Ambience', color: 'var(--amb)', loop: 'infinite', hint: 'Drop ambiences here: rain, fire, crowds' },
    events: { label: 'Events', color: 'var(--evt)', loop: 'once', hint: 'Drop events here: bells, roars, explosions' },
    soundbox: { label: 'Soundbox', color: 'var(--accent)', loop: 'once', hint: 'Drop quick effects here' },
  };
  const LOOP_LABEL = { once: '1×', twice: '2×', infinite: '∞' };
  const NEXT_LOOP = { once: 'twice', twice: 'infinite', infinite: 'once' };
  const UPLOAD_URL = 'https://github.com/arthurvangeersdaele/Bardic/upload/main/docs/recueil';

  const svg = (d, size = 16, fill = false) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
  const ICON = {
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', 14, true),
    stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', 12, true),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>', 15),
    up: svg('<path d="M18 15l-6-6-6 6"/>', 14),
    down: svg('<path d="M6 9l6 6 6-6"/>', 14),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', 16),
    drop: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 16),
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
      b.append(el('span', 'n', String(i + 1)), t, mv);
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
    dz.append(hint);
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
    loop.title = 'Loop: once, twice, forever';
    const paintLoop = () => { loop.textContent = LOOP_LABEL[s.loop]; loop.classList.toggle('inf', s.loop === 'infinite'); };
    paintLoop();
    loop.onclick = () => { s.loop = NEXT_LOOP[s.loop]; paintLoop(); };
    bottom.append(play, meta, loop);
    c.append(top, bottom);
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
  function closeVeil() { $('#veil')?.remove(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#veil') && !$('#veil').dataset.busy) closeVeil(); });

  /* ---------- bard name (shared settings) ---------- */
  function paintBard() {
    const b = $('#bard-btn');
    const name = bardName();
    b.classList.toggle('missing', !name);
    b.innerHTML = '';
    if (name) { b.append('Signed by '); b.append(el('b', '', name)); } else b.textContent = 'Set your bard name';
  }
  function askBard(then) {
    const box = veil(`<h2>Your bard name</h2>
      <p>It signs every story you forge, here and in the player's Settings. Set it once.</p>
      <label class="field"><span>Bard name</span><input id="bard-input" maxlength="60" autocomplete="nickname" placeholder="Arthur the Resonant"></label>
      <div class="acts"><button class="btn primary" type="button" data-ok>${then ? 'Save and forge' : 'Save'}</button><button class="btn" type="button" data-close>Cancel</button></div>`);
    const input = box.querySelector('#bard-input');
    input.value = bardName();
    input.focus();
    const ok = () => {
      if (!input.value.trim()) { input.focus(); return; }
      setBardName(input.value);
      paintBard();
      closeVeil();
      if (then) then();
    };
    box.querySelector('[data-ok]').onclick = ok;
    input.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    box.querySelector('[data-close]').onclick = closeVeil;
  }
  $('#bard-btn').addEventListener('click', () => askBard(null));
  window.addEventListener('storage', (e) => { if (e.key === 'bardic.settings') paintBard(); });
  window.addEventListener('bardic:settings', paintBard);

  /* ---------- forge ---------- */
  let lastForged = null;
  async function forge() {
    stopPreview();
    const bard = bardName();
    const errors = validate(state, bard);
    if (!bard && errors.length === 1) { askBard(forge); return; }
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
      // The forged file is the new reference: the next forge makes the next revision.
      state.id = out.story.id;
      state.revision = out.story.revision;
      state.created = out.story.created;
      lastForged = out;
      download(out);
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
      ${heavy ? '<p class="errors" style="list-style:none;padding:0">It weighs more than 100 MB, the limit for the Recueil on GitHub. Lighter MP3s (128 kbps) will make it fit.</p>'
              : '<p>Want other bards to play it? Lay it in the Recueil: GitHub opens a pull request for you, and once accepted your tale appears in the book.</p>'}
      <div class="acts">
        ${heavy ? '' : `<a class="btn primary" href="${UPLOAD_URL}" target="_blank" rel="noopener">Lay it in the Recueil</a>`}
        <button class="btn" type="button" data-again>Download again</button>
        <button class="btn" type="button" data-close>Keep editing</button>
      </div>`);
    box.querySelector('.fname').textContent = out.fileName;
    box.querySelector('.bname').textContent = out.story.bard;
    box.querySelector('[data-again]').onclick = () => download(lastForged);
    box.querySelector('[data-close]').onclick = closeVeil;
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
  const fromUrl = new URLSearchParams(location.search).get('open');
  if (fromUrl && /^[\w./%-]+\.bardic$/i.test(fromUrl)) load(fromUrl, decodeURIComponent(fromUrl.split('/').pop()));

  window.addEventListener('beforeunload', (e) => {
    if (allSounds().length) { e.preventDefault(); e.returnValue = ''; }
  });

  paintBard();
  renderAll();
})();
