/* Bardic Flow: small helpers shared by the library, the player and the editor. */
(function (global) {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(body, size = 18, fill = false) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  const ICON = {
    back: svg('<path d="M15 18l-6-6 6-6"/>', 20),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 19),
    close: svg('<path d="M18 6L6 18M6 6l12 12"/>', 18),
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', 16, true),
    // A play glyph centred by eye in its circle (a triangle centred by its box looks pushed to the right).
    go: svg('<path d="M7.2 5.3v13.4a1 1 0 0 0 1.5.86l10.7-6.7a1 1 0 0 0 0-1.72L8.7 4.44a1 1 0 0 0-1.5.86z"/>', 16, true),
    // A gate on the wire: an arch with two closed doors.
    gate: svg('<path d="M5 20.5V10a7 7 0 0 1 14 0v10.5"/><path d="M12 3.6v16.9"/><path d="M3.5 20.5h17"/><path d="M9.6 12.6v1.6M14.4 12.6v1.6"/>', 20),
    next: svg('<path d="M5.5 5.6v12.8a1 1 0 0 0 1.55.83l9.2-6.4a1 1 0 0 0 0-1.66l-9.2-6.4a1 1 0 0 0-1.55.83z"/><rect x="17.2" y="5" width="2.6" height="14" rx="1.1"/>', 16, true),
    pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>', 16, true),
    stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', 14, true),
    star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 18),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
    import: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', 16),
    share: svg('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', 16),
    edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 16),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 16),
    up: svg('<path d="M18 15l-6-6-6 6"/>', 14),
    down: svg('<path d="M6 9l6 6 6-6"/>', 14),
    skip: svg('<path d="M5 5l9 7-9 7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>', 16),
    more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>', 18),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>', 14),
    hand: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.3 14a1.5 1.5 0 0 1 2.4-1.8L8 15"/>', 14),
    repeat: svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 13),
  };

  /* ---------- Settings, kept on this device ---------- */
  const KEY = 'bardic.flow.settings';
  const DEFAULTS = { theme: 'obsidian', mode: 'dark', fade: 2000, awake: true, silent: true, master: 0.8, sbVolume: 0.8, autoNext: false };
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s) {
      // First run: start from the theme chosen in Bardic, if any.
      try { const b = JSON.parse(localStorage.getItem('bardic.settings') || '{}'); s = { theme: b.theme, mode: b.mode }; } catch (e) { s = {}; }
    }
    const out = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach((k) => { if (s && s[k] != null) out[k] = s[k]; });
    return out;
  }
  const settings = loadSettings();
  function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ } }
  function applyTheme() {
    const root = document.documentElement;
    let mode = settings.mode;
    if (mode === 'system') mode = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    root.dataset.theme = global.BardicThemes ? BardicThemes.resolve(settings.theme) : settings.theme;
    root.dataset.mode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.body || root).getPropertyValue('--bar').trim() || '#15151B';
  }

  /* ---------- Feedback ---------- */
  let toastTimer = 0;
  function toast(msg, ms = 2800) {
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

  /** A small question: resolves with the value of the button tapped (null when dismissed). */
  function ask(title, text, buttons) {
    const dlg = $('#ask');
    $('#ask-title').textContent = title;
    $('#ask-text').textContent = text || '';
    $('#ask-text').hidden = !text;
    const acts = $('#ask-acts');
    acts.textContent = '';
    return new Promise((resolve) => {
      let answered = false;
      const finish = (v) => { if (answered) return; answered = true; if (dlg.open) dlg.close(); resolve(v); };
      buttons.forEach((b) => {
        const x = el('button', `btn ${b.cls || ''}`, b.label);
        x.type = 'button';
        x.onclick = () => finish(b.value);
        acts.append(x);
      });
      dlg.addEventListener('close', () => finish(null), { once: true });
      dlg.showModal();
    });
  }

  /** Hands a file over: the share sheet on a phone (Files, AirDrop), a download elsewhere. */
  async function deliver(blob, fileName) {
    const file = new File([blob], fileName, { type: 'application/octet-stream' });
    const phone = !document.documentElement.classList.contains('pc');
    if (phone && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fileName }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return true;
  }

  /* ---------- One audio context for the whole app ---------- */
  let ctx = null, master = null;
  /** The audio context. `wake` resumes it (from a tap): reading the clock must never resume a paused table. */
  function audio(wake) {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      ctx = new AC({ latencyHint: 'playback' });
      master = ctx.createGain();
      master.gain.value = settings.master;
      master.connect(ctx.destination);
    }
    if (wake && (ctx.state === 'suspended' || ctx.state === 'interrupted')) ctx.resume().catch(() => {});
    return { ctx, master };
  }
  function applyAudioSession() {
    try { if (navigator.audioSession) navigator.audioSession.type = settings.silent ? 'playback' : 'auto'; } catch (e) { /* older iOS */ }
  }
  async function decode(blob) {
    const { ctx: c } = audio();
    const data = await blob.arrayBuffer();
    return new Promise((ok, ko) => { const r = c.decodeAudioData(data, ok, ko); if (r && r.catch) r.catch(ko); });
  }

  global.FlowUI = { $, el, svg, ICON, settings, saveSettings, applyTheme, toast, busy, idle, ask, deliver, audio, decode, applyAudioSession };
})(window);
