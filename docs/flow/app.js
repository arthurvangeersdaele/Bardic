/* Bardic Flow: library, import, settings and routing.
 *   #/            the stories kept on this device
 *   #/play/<uid>  the player (a chapter as a cascade of steps)
 *   #/edit/<uid>  the editor (computer)
 */
(function () {
  'use strict';

  const VERSION = '261017.3';
  const { $, el, ICON, settings, saveSettings, applyTheme, toast, busy, idle, ask, deliver, audio, decode, applyAudioSession } = window.FlowUI;
  const F = window.BardicFlow;
  const DB = window.FlowDB;
  const pc = () => document.documentElement.classList.contains('pc');
  let screen = '';

  /* ================= Library ================= */
  async function renderLibrary() {
    const list = $('#flow-list');
    const recs = await DB.list();
    list.textContent = '';
    if (!recs.length) {
      const e = el('div', 'fl-welcome');
      e.innerHTML = `<svg class="fl-wire-art" viewBox="290 120 444 770" aria-hidden="true"><path d="M512 196V500C512 630 352 640 352 812M512 500C512 630 672 640 672 812"/><circle cx="512" cy="176" r="38"/><circle cx="352" cy="826" r="46"/><circle cx="672" cy="826" r="46"/></svg>
        <h1>Follow the golden wire.</h1>
        <p>Bardic Flow plays your story on time: every sound of a chapter waits on a wire running down the screen, and lights up when its moment comes. You only tap Go at the gates.</p>
        <p class="muted">${pc()
          ? 'Import a <b>.bardic</b> to shape its Flow in the editor, or a <b>.bardic-flow</b> to play it.'
          : 'Import a <b>.bardic-flow</b> forged in the Flow editor on a computer. A plain <b>.bardic</b> works too: it gets a first Flow, ready to play.'}</p>`;
      const b = el('button', 'btn primary', 'Import a story');
      b.type = 'button';
      b.addEventListener('click', pickFile);
      e.append(b);
      list.append(e);
      list.append(discoveryCard());
      return;
    }
    recs.forEach((r) => {
      const card = el('article', 'fl-item');
      const steps = r.flow.chapters.reduce((a, c) => a + c.steps.length, 0);
      const main = el('button', 'fl-item-main');
      main.type = 'button';
      main.append(el('h2', '', r.story.title || 'Story'));
      main.append(el('p', 'muted', `${r.story.chapters.length} chapter${r.story.chapters.length > 1 ? 's' : ''}, ${steps} steps, by ${r.flow.bard || r.story.bard || 'Forgotten Barde'}`));
      const chs = el('ol', 'fl-item-ch');
      r.story.chapters.slice(0, 6).forEach((c) => chs.append(el('li', '', c.title || 'Chapter')));
      if (r.story.chapters.length > 6) chs.append(el('li', 'muted', `and ${r.story.chapters.length - 6} more`));
      main.append(chs);
      main.addEventListener('click', () => { location.hash = `#/play/${r.uid}`; });
      const acts = el('div', 'fl-item-acts');
      const play = el('button', 'btn primary slim');
      play.type = 'button';
      play.innerHTML = `${ICON.play}<span>Play</span>`;
      play.addEventListener('click', () => { location.hash = `#/play/${r.uid}`; });
      acts.append(play);
      if (pc()) {
        const ed = el('button', 'btn slim');
        ed.type = 'button';
        ed.innerHTML = `${ICON.edit}<span>Edit the Flow</span>`;
        ed.addEventListener('click', () => { location.hash = `#/edit/${r.uid}`; });
        acts.append(ed);
      }
      const more = el('button', 'ico small');
      more.type = 'button';
      more.innerHTML = ICON.more;
      more.setAttribute('aria-label', `More for ${r.story.title}`);
      more.addEventListener('click', () => storyMenu(r));
      acts.append(el('span', 'grow'), more);
      card.append(main, acts);
      list.append(card);
    });
    if (!recs.some((r) => r.flow.id === DISCOVERY.id)) list.append(discoveryCard());
  }

  /* ================= Discovery tale ================= */
  const DISCOVERY = { id: '3c9a6e2f-81d4-4b7a-a5e2-6f0b9d4c2a17', file: 'discovery/261017_underwater-adventure.bardic-flow', title: 'Underwater Adventure' };
  function discoveryCard() {
    const b = el('button', 'fl-discovery');
    b.type = 'button';
    b.innerHTML = `<span>Discovery tale</span><b>${DISCOVERY.title}</b><small>Five chapters already timed, from a lazy beach to the Kraken. About 32 MB.</small>`;
    b.addEventListener('click', addDiscovery);
    return b;
  }
  async function addDiscovery() {
    try {
      busy(`Downloading ${DISCOVERY.title}`, '', 0);
      const res = await fetch(DISCOVERY.file);
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        busy(`Downloading ${DISCOVERY.title}`, total ? `${window.Bardic.formatSize(got)} of ${window.Bardic.formatSize(total)}` : window.Bardic.formatSize(got), total ? got / total : null);
      }
      await importFile(new File(parts, DISCOVERY.file.split('/').pop()));
    } catch (e) {
      idle();
      toast(`${DISCOVERY.title} could not be downloaded (${e.message || e}). Check your connection and try again.`, 5200);
    }
  }

  function storyMenu(r) {
    $('#sheet-title').textContent = r.story.title || 'Story';
    const body = $('#sheet-body');
    body.textContent = '';
    body.className = 'fl-menu';
    const item = (icon, label, sub, fn, cls) => {
      const b = el('button', `fl-menu-item ${cls || ''}`);
      b.type = 'button';
      b.innerHTML = icon;
      const t = el('span');
      t.append(el('b', '', label), el('small', '', sub));
      b.append(t);
      b.addEventListener('click', () => { $('#sheet').close(); fn(); });
      body.append(b);
    };
    if (pc()) item(ICON.edit, 'Edit the Flow', 'Steps, gates, timings and fades', () => { location.hash = `#/edit/${r.uid}`; });
    item(ICON.share, 'Export .bardic-flow', 'Forges the next revision, signed with your bard name', () => exportFlow(r));
    item(ICON.share, 'Export .bardic', 'The story alone, for Bardic', () => exportBardic(r));
    item(ICON.trash, 'Remove from this device', 'Keep a .bardic-flow if you want it back', async () => {
      const ok = await ask(`Remove ${r.story.title}?`, 'Its Flow and its sounds leave this device.', [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, cls: 'danger' }]);
      if (!ok) return;
      await DB.remove(r.uid);
      renderLibrary();
    }, 'danger');
    $('#sheet').showModal();
  }

  async function exportFlow(r) {
    try {
      busy('Forging the .bardic-flow', '', 0);
      const files = await DB.filesOf(r);
      const out = await F.pack(r.story, r.flow, files, window.Bardic.bardName(), (f) => busy('Forging the .bardic-flow', '', f), `Bardic Flow ${VERSION}`);
      r.flow = out.flow;
      await DB.put(r);
      idle();
      await deliver(out.blob, out.fileName);
    } catch (e) { idle(); toast(`Could not forge: ${e.message || e}`, 4200); }
  }
  async function exportBardic(r) {
    try {
      busy('Writing the .bardic', '', 0);
      const files = await DB.filesOf(r);
      const out = await F.packBardic(r.story, files, (f) => busy('Writing the .bardic', '', f));
      idle();
      await deliver(out.blob, out.fileName);
    } catch (e) { idle(); toast(`Could not write the .bardic: ${e.message || e}`, 4200); }
  }

  /* ================= Import ================= */
  function pickFile() {
    const input = $('#pick-file');
    // iPhone greys out files whose type it does not know: no filter there.
    if (!document.documentElement.classList.contains('iphone')) input.accept = '.bardic,.bardic-flow,application/zip';
    input.value = '';
    input.click();
  }

  async function importFile(file) {
    const isFlow = /\.bardic-flow$/i.test(file.name);
    try {
      busy('Opening the story', file.name, 0);
      const { story, flow, files } = await F.read(file, (n, t) => busy('Opening the story', `Sound ${n} of ${t}`, n / t));
      // How long every sound lasts: from story.json, else measured.
      const lengths = {};
      (story.chapters || []).forEach((c) => F.ZONES.forEach((z) => (c[z] || []).forEach((s) => { if (s.duration) lengths[s.file] = s.duration; })));
      (story.soundbox || []).forEach((s) => { if (s.duration) lengths[s.file] = s.duration; });
      const toMeasure = [...files.keys()].filter((p) => !lengths[p]);
      let n = 0;
      for (const p of toMeasure) {
        n += 1;
        busy('Measuring the sounds', `${n} of ${toMeasure.length}`, n / toMeasure.length);
        try { lengths[p] = Math.round((await decode(files.get(p))).duration * 10) / 10; } catch (e) { /* unreadable: left free */ }
      }
      let fl = flow ? F.normalize(flow, story, lengths, files) : F.defaultFlow(story, lengths, window.Bardic.bardName());
      // The same Flow already here?
      const all = await DB.list();
      let uid = DB.uid();
      const twin = all.find((r) => (flow ? r.flow.id === fl.id : r.story.id && r.story.id === story.id && !r.flow.revision));
      if (twin) {
        idle();
        const newer = flow && (fl.revision || 0) > (twin.flow.revision || 0);
        const answer = await ask(`${story.title} is already here`, flow
          ? `This device holds revision ${twin.flow.revision || 0} of its Flow; the file is revision ${fl.revision || 0}.${newer ? ' The file is newer.' : ''}`
          : 'A Flow of this story, never forged yet, is already on this device.', [
          { label: 'Cancel', value: null },
          { label: 'Keep both', value: 'both' },
          { label: 'Replace', value: 'replace', cls: 'primary' },
        ]);
        if (!answer) return;
        if (answer === 'replace') uid = twin.uid;
        else if (flow) fl = Object.assign({}, fl, { id: window.Bardic.uuid(), revision: 0 });
      }
      const keys = {};
      n = 0;
      for (const [p, b] of files) {
        n += 1;
        busy('Keeping the sounds on this device', `${n} of ${files.size}`, n / files.size);
        keys[p] = await DB.putBlob(b);
      }
      const rec = await DB.put({ uid, story, flow: fl, files: keys, lengths });
      await DB.collect();
      idle();
      if (!flow && pc()) { location.hash = `#/edit/${rec.uid}`; toast('A first Flow is ready: shape it, then forge the .bardic-flow.', 4200); }
      else {
        if (!flow) toast('A first Flow was made from its sounds. Shape it in the Flow editor, on a computer.', 4600);
        else toast(`${story.title} is ready to play.`);
        if (location.hash === '#/' || !location.hash) renderLibrary(); else location.hash = '#/';
      }
    } catch (e) {
      idle();
      toast(`${isFlow ? 'This .bardic-flow' : 'This file'} could not be opened: ${e.message || e}`, 5200);
    }
  }

  /* ================= Settings ================= */
  function buildSettings() {
    const paintThemes = () => window.BardicThemes.render($('#theme-pick'), window.BardicThemes.resolve(settings.theme), (id) => { settings.theme = id; saveSettings(); applyTheme(); paintSettings(); });
    $('#mode-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.mode = b.dataset.v; saveSettings(); applyTheme(); paintSettings();
    });
    $('#fade-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      settings.fade = Number(b.dataset.v); saveSettings(); paintSettings();
    });
    $('#opt-awake').addEventListener('change', (e) => { settings.awake = e.target.checked; saveSettings(); settings.awake ? acquireWake() : releaseWake(); });
    $('#opt-silent').addEventListener('change', (e) => { settings.silent = e.target.checked; saveSettings(); applyAudioSession(); });
    $('[data-action="wipe"]').addEventListener('click', async () => {
      const ok = await ask('Erase everything?', 'Every Flow and every sound leaves this device. Your settings stay.', [{ label: 'Cancel', value: false }, { label: 'Erase', value: true, cls: 'danger' }]);
      if (!ok) return;
      window.FlowPlayer.close(); window.FlowEditor.close();
      await DB.wipe();
      $('#settings').close();
      location.hash = '#/';
      renderLibrary();
    });
    $('#app-version').textContent = `version ${VERSION}`;
    if (window.BardAccount) window.BardAccount.mount($('#bard-account'));
    buildSettings.paintThemes = paintThemes;
  }
  function paintSettings() {
    buildSettings.paintThemes();
    document.querySelectorAll('#mode-pick [data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.mode)));
    document.querySelectorAll('#fade-pick [data-v]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.v) === settings.fade)));
    $('#opt-awake').checked = settings.awake;
    $('#opt-silent').checked = settings.silent;
  }
  async function openSettings() {
    paintSettings();
    $('#settings').showModal();
    const info = $('#store-info');
    info.textContent = 'Checking…';
    const p = await DB.persistence();
    const size = (b) => window.Bardic.formatSize(b || 0);
    info.textContent = `${p.usage != null ? `In use: about ${size(p.usage)}.` : ''} ${p.persisted ? 'Protected: the browser keeps it even when space runs low.' : 'Not protected: the browser may clear it if space runs low.'}`;
  }

  /* ================= Keep the screen awake ================= */
  let wake = null, videoAwake = false;
  async function acquireWake() {
    if (!settings.awake || screen !== 'player' || document.visibilityState !== 'visible') return;
    if ('wakeLock' in navigator && !wake) {
      try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); return; } catch (e) { wake = null; }
    }
    if (wake || videoAwake) return;
    const v = $('#awake-video');
    if (!v.src) v.src = '../ios/261014_keep_awake.mp4';
    v.play().then(() => { videoAwake = true; }).catch(() => {});
  }
  function releaseWake() {
    if (wake) { wake.release().catch(() => {}); wake = null; }
    if (videoAwake) { $('#awake-video').pause(); videoAwake = false; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      acquireWake();
      // Back from the lock screen: wake the audio clock again, unless the bard paused it.
      const st = window.FlowPlayer.state();
      if (st && st.mode !== 'idle') { const { ctx } = audio(); if (ctx.state !== 'running' && !document.querySelector('#fl-pause.on')) ctx.resume().catch(() => {}); }
    } else window.FlowEditor.flush();
  });
  document.addEventListener('touchend', () => { if (settings.awake && screen === 'player' && !wake && !videoAwake) acquireWake(); }, { passive: true });

  /* ================= Routing ================= */
  function show(id) {
    ['library', 'player', 'editor'].forEach((s) => { $(`#${s}`).hidden = s !== id; });
    screen = id;
    document.documentElement.dataset.screen = id;
    if (id === 'player') acquireWake(); else releaseWake();
  }

  async function route() {
    const m = /^#\/(play|edit)\/([^/]+)(?:\/(\d+))?$/.exec(location.hash);
    if (screen === 'player' && !(m && m[1] === 'play')) window.FlowPlayer.close();
    if (screen === 'editor' && !(m && m[1] === 'edit')) window.FlowEditor.close();
    if (!m) { show('library'); await renderLibrary(); return; }
    const rec = await DB.get(m[2]);
    if (!rec) { location.hash = '#/'; return; }
    if (m[1] === 'edit') {
      if (!pc()) { toast('The Flow editor opens on a computer.'); location.hash = `#/play/${rec.uid}`; return; }
      show('editor');
      await window.FlowEditor.open(rec, { chapter: Number(m[3] || 0), onLeave: () => { location.hash = '#/'; }, onPlay: (ch) => { location.hash = `#/play/${rec.uid}/${ch}`; } });
    } else {
      if (screen === 'player' && window.FlowPlayer.isOpen()) return;
      show('player');
      busy('Opening the story', rec.story.title || '');
      try {
        await window.FlowPlayer.open(rec, Number(m[3] || 0), { onLeave: () => { location.hash = '#/'; } });
      } finally { idle(); }
    }
  }

  /* ================= Wiring ================= */
  function wire() {
    document.querySelectorAll('[data-action="settings"]').forEach((b) => { b.innerHTML = ICON.gear; b.addEventListener('click', openSettings); });
    document.querySelectorAll('.set-head .ico, [data-action="close-sheet"]').forEach((b) => { b.innerHTML = ICON.close; });
    $('[data-action="close-sheet"]').addEventListener('click', () => $('#sheet').close());
    document.querySelectorAll('.i-import').forEach((s) => { s.outerHTML = ICON.import; });
    $('[data-action="import"]').addEventListener('click', pickFile);
    $('#pick-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importFile(f); });
    // A file dropped anywhere on the library (computer).
    $('#library').addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    $('#library').addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); importFile(f); } });
    window.FlowPlayer.wire();
    window.FlowEditor.wire();
    window.addEventListener('hashchange', route);
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (settings.mode === 'system') applyTheme(); });
    // Space pauses at the table on a computer.
    document.addEventListener('keydown', (e) => {
      if (screen === 'player' && e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); window.FlowPlayer.togglePause(); }
    });
  }

  async function boot() {
    applyTheme();
    // In a browser tab on an iPhone, or on another device, the page only shows how to install it.
    if (!document.documentElement.classList.contains('mode-app')) return;
    applyAudioSession();
    wire();
    buildSettings();
    window.FlowApp = { wake: acquireWake };
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    try { await DB.open(); DB.persistence().catch(() => {}); } catch (e) {
      document.body.append(el('p', 'fatal', `Bardic Flow cannot reach its storage here (${e.message || e}).`));
      return;
    }
    await route();
  }
  boot();
})();
