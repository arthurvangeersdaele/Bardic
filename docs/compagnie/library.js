/* Bardic Story builder: the sound library of the Recueil.
 * Every sound of every tale in the Recueil (docs/recueil/sounds.json, built by the Recueil action),
 * searchable, with Music, Ambiances, Events and Soundbox kept apart. Drag one onto a row of the story or the
 * soundbox, or tap Add.
 * Only the sound's own bytes are downloaded: the tales store their sounds uncompressed, so each one is
 * a plain byte range of its .bardic file. When the server ignores the range, the tale is fetched once
 * and the sound is cut out of it.
 */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const ROWS = [
    { id: 'music', label: 'Music', color: 'var(--music)' },
    { id: 'ambience', label: 'Ambiances', color: 'var(--amb)' },
    { id: 'events', label: 'Events', color: 'var(--evt)' },
    { id: 'soundbox', label: 'Soundbox', color: 'var(--accent)' },
  ];
  const BASE = '../recueil/';
  const svg = (d, size = 16, fill = false) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
  const ICON = {
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', 14, true),
    stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', 12, true),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>', 15),
    grip: svg('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>', 14),
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>', 16),
  };
  const TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' };

  let sounds = null;      // the library, once fetched
  let loading = null;
  let tab = 'music';
  let query = '';
  const files = new Map(); // library id -> Promise<File>
  const tales = new Map(); // .bardic file -> Promise<Blob>, when a whole tale had to be fetched
  const player = new Audio();
  let playing = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const fmtTime = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const byId = (id) => (sounds || []).find((x) => x.id === id);

  function load() {
    if (!loading) {
      loading = fetch(`${BASE}sounds.json`, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((d) => { sounds = (d.sounds || []).map((x) => Object.assign(x, { key: fold(`${x.name} ${x.tale} ${(x.tales || []).join(' ')} ${x.bard}`) })); return sounds; })
        .catch((e) => { loading = null; throw e; });
    }
    return loading;
  }

  /* ---------- fetching one sound ---------- */
  function wholeTale(file) {
    if (!tales.has(file)) {
      tales.set(file, fetch(BASE + encodeURIComponent(file)).then((r) => {
        if (!r.ok) throw new Error(`The tale could not be fetched (${r.status}).`);
        return r.blob();
      }).catch((e) => { tales.delete(file); throw e; }));
    }
    return tales.get(file);
  }
  async function bytesOf(x) {
    let part = null;
    if (!tales.has(x.file)) {
      try {
        const res = await fetch(BASE + encodeURIComponent(x.file), { headers: { Range: `bytes=${x.offset}-${x.offset + x.length - 1}` } });
        if (res.status === 206) {
          const b = await res.blob();
          if (b.size === x.length) part = b;
        } else if (res.ok) {
          // The server sent the whole tale: keep it for the next sounds of the same tale.
          tales.set(x.file, res.blob());
        }
      } catch (e) { /* fall back to the whole tale */ }
    }
    if (!part) part = (await wholeTale(x.file)).slice(x.offset, x.offset + x.length);
    if (x.deflated) part = await new Response(part.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    if (part.size !== x.size) throw new Error('The sound came back damaged. Try again.');
    return part;
  }
  /** The sound as a File, ready for the story (fetched once, then kept). */
  function fileOf(id) {
    const x = byId(id);
    if (!x) return Promise.reject(new Error('This sound is no longer in the Recueil.'));
    if (!files.has(id)) {
      const name = x.path.split('/').pop();
      const ext = (name.split('.').pop() || 'mp3').toLowerCase();
      files.set(id, bytesOf(x).then((b) => new File([b], name, { type: TYPES[ext] || 'audio/mpeg' }))
        .catch((e) => { files.delete(id); throw e; }));
    }
    return files.get(id).then((file) => ({ file, item: x }));
  }

  /* ---------- the panel ---------- */
  let panel = null;
  /** Opens the panel, on the tab of `row` (music, ambience, events or soundbox) when given. */
  function open(row) {
    if (ROWS.some((r) => r.id === row)) tab = row;
    if (panel) { render(); panel.querySelector('.lib-find').focus(); return; }
    panel = el('aside', 'lib');
    panel.setAttribute('aria-label', 'Sounds of the Recueil');
    panel.innerHTML = `<div class="lib-head"><h2>Sounds of the Recueil</h2><button class="lib-close" type="button" aria-label="Close">${ICON.x}</button></div>
      <p class="lib-lead">Every sound of the tales in the Recueil. Drag one onto a row of your story or the soundbox, or tap Add.</p>
      <input class="lib-find" type="search" placeholder="Search a sound, a tale or a bard" aria-label="Search the sounds of the Recueil" autocomplete="off" spellcheck="false">
      <div class="lib-tabs" role="tablist"></div>
      <ul class="lib-list" role="tabpanel"></ul>
      <p class="lib-note">A sound keeps the licence of its tale: credit the tale in your story's description when you share it.</p>`;
    const bld = $('#bld');
    const sb = bld && bld.querySelector('.soundbox');
    if (sb) bld.insertBefore(panel, sb); else document.body.append(panel);
    document.body.classList.add('lib-open');
    $('#lib-btn')?.setAttribute('aria-pressed', 'true');
    panel.querySelector('.lib-close').onclick = close;
    const find = panel.querySelector('.lib-find');
    find.value = query;
    find.oninput = () => { query = find.value; render(); };
    find.focus();
    render();
    load().then(render, () => render(true));
  }
  function close() {
    stop();
    panel?.remove();
    panel = null;
    document.body.classList.remove('lib-open');
    $('#lib-btn')?.setAttribute('aria-pressed', 'false');
  }

  function matches() {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const out = { music: [], ambience: [], events: [], soundbox: [] };
    (sounds || []).forEach((x) => { if (words.every((w) => x.key.includes(w))) (out[x.row] || out.events).push(x); });
    return out;
  }

  function render(failed) {
    if (!panel) return;
    const list = panel.querySelector('.lib-list');
    const tabs = panel.querySelector('.lib-tabs');
    list.textContent = '';
    tabs.textContent = '';
    if (failed === true) { list.append(el('li', 'lib-empty', 'The Recueil could not be reached. Check your connection and open the panel again.')); return; }
    if (!sounds) { list.append(el('li', 'lib-empty', 'Fetching the sounds of the Recueil…')); return; }
    const found = matches();
    ROWS.forEach((r) => {
      const b = el('button', 'lib-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab === r.id));
      b.style.setProperty('--z', r.color);
      b.append(el('span', '', r.label), el('small', '', String(found[r.id].length)));
      b.onclick = () => { tab = r.id; render(); };
      tabs.append(b);
    });
    const row = ROWS.find((r) => r.id === tab);
    const items = found[tab];
    if (!items.length) {
      const others = ROWS.filter((r) => r.id !== tab && found[r.id].length).map((r) => `${r.label} (${found[r.id].length})`);
      list.append(el('li', 'lib-empty', query.trim()
        ? `No ${row.label.toLowerCase()} matches “${query.trim()}”.${others.length ? ` Found in ${others.join(', ')}.` : ''}`
        : `No ${row.label.toLowerCase()} in the Recueil yet.`));
      return;
    }
    items.slice(0, 300).forEach((x) => list.append(item(x, row)));
  }

  function item(x, row) {
    const li = el('li', 'lib-item');
    li.style.setProperty('--z', row.color);
    li.draggable = true;
    li.title = 'Drag onto a row of your story';
    const grip = el('span', 'grip');
    grip.innerHTML = ICON.grip;
    const play = el('button', 'pb play');
    play.type = 'button';
    const paint = () => {
      const on = playing === x.id;
      li.classList.toggle('playing', on);
      play.innerHTML = on ? ICON.stop : ICON.play;
      play.setAttribute('aria-label', `${on ? 'Stop' : 'Listen to'} ${x.name}`);
    };
    play.onclick = () => (playing === x.id ? stop() : listen(x, li));
    li.paint = paint;
    const t = el('div', 't');
    const from = (x.tales || [x.tale]).join(', ');
    t.append(el('b', '', x.name), el('small', '', [x.duration ? fmtTime(x.duration) : null, `${from}, by ${x.bard}`].filter(Boolean).join('   ')));
    const add = el('button', 'btn small', 'Add');
    add.type = 'button';
    add.title = x.row === 'soundbox' ? 'Add to the Soundbox of the story' : `Add to ${row.label} in the chapter on screen`;
    add.onclick = () => window.BardicBuilder && window.BardicBuilder.addFromLibrary(x.id, ROWS.some((r) => r.id === x.row) ? x.row : 'events');
    li.append(grip, play, t, add);
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/x-bardic-library', x.id);
      e.dataTransfer.effectAllowed = 'copy';
      li.classList.add('dragging');
      fileOf(x.id).catch(() => {}); // start fetching while the sound is carried
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    paint();
    return li;
  }

  /* ---------- listening ---------- */
  async function listen(x, li) {
    stop();
    playing = x.id;
    li.paint();
    li.classList.add('wait');
    try {
      const { file } = await fileOf(x.id);
      if (playing !== x.id) return;
      player.src = URL.createObjectURL(file);
      player.volume = 0.75;
      await player.play();
    } catch (e) {
      if (playing === x.id) stop();
      toast(e.message || 'This sound could not be played.');
    } finally {
      li.classList.remove('wait');
    }
  }
  function stop() {
    if (player.src) { player.pause(); URL.revokeObjectURL(player.src); player.removeAttribute('src'); }
    playing = null;
    panel?.querySelectorAll('.lib-item').forEach((li) => li.paint && li.paint());
  }
  player.onended = stop;

  function toast(msg) {
    const t = el('div', 'toast', msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 3200);
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !$('#veil')) close(); });
  $('#lib-btn')?.addEventListener('click', () => (panel ? close() : open()));

  window.BardicLibrary = { open, close, fileOf, stop };
})();
