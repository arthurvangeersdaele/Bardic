/* Bardic Flow: the player. A chapter runs as a cascade of steps, top to bottom, joined by a golden wire.
 *
 * Every sound is scheduled on the audio clock: a step starts its cards (each after its own offset),
 * and the next step follows on its own when this one ends, unless it is a gate, which waits for a tap.
 * Pausing suspends the audio clock, so the whole timeline pauses with it.
 */
(function (global) {
  'use strict';

  const { $, el, ICON, settings, saveSettings, toast, audio, decode } = global.FlowUI;
  const F = global.BardicFlow;
  const LEAD = 0.06; // seconds between a tap and the sound

  const P = {
    rec: null, ch: 0, steps: [], buffers: new Map(), blobs: null, loading: 0,
    voices: [], starts: [], gate: null, end: null, paused: false, bus: null, sbBus: null,
    dom: null, raf: 0, focus: -1, touched: 0, onLeave: null, chapterToken: 0,
  };

  /* ---------- Opening and closing ---------- */

  async function open(rec, chapter, opts = {}) {
    P.rec = rec;
    P.onLeave = opts.onLeave || null;
    P.blobs = opts.blobs || await global.FlowDB.filesOf(rec);
    const { ctx, master } = audio(true);
    if (!P.bus) { P.bus = ctx.createGain(); P.bus.connect(master); P.sbBus = ctx.createGain(); P.sbBus.connect(master); }
    P.sbBus.gain.value = settings.sbVolume;
    master.gain.value = settings.master;
    buildChrome();
    // The cascade shows at once; the sounds decode behind it, the dock says how many are left.
    openChapter(Math.min(Math.max(0, chapter || 0), rec.story.chapters.length - 1), false).catch((e) => toast(`Could not open this chapter: ${e.message || e}`));
    loop();
  }

  function close() {
    stopAll(true);
    cancelAnimationFrame(P.raf);
    P.raf = 0;
    P.rec = null;
    P.buffers.clear();
    P.blobs = null;
    if (P.paused) { const { ctx } = audio(); ctx.resume().catch(() => {}); P.paused = false; }
  }

  async function openChapter(i, autostart) {
    const token = ++P.chapterToken;
    if (P.voices.length || P.starts.length) stopAll();
    P.ch = i;
    P.steps = (P.rec.flow.chapters[i] || { steps: [] }).steps;
    P.starts = []; P.gate = null; P.end = null; P.focus = -1; P.touched = 0;
    renderChapters();
    renderCascade();
    $('#fl-scroll').scrollTop = 0;
    // Decode the sounds of this chapter (and the soundbox) before the first tap.
    const want = new Set();
    P.steps.forEach((s) => s.cards.forEach((c) => want.add(c.file)));
    (P.rec.story.soundbox || []).forEach((s) => want.add(s.file));
    const missing = [...want].filter((f) => !P.buffers.has(f));
    P.loading = missing.length;
    paintDock();
    for (const f of missing) {
      if (token !== P.chapterToken) return;
      const blob = P.blobs.get(f);
      try { if (blob) P.buffers.set(f, await decode(blob)); } catch (e) { console.warn('Could not decode', f, e); }
      P.loading -= 1;
      paintDock();
    }
    // Drop sounds no longer needed (the soundbox stays).
    for (const k of [...P.buffers.keys()]) if (!want.has(k) && !P.voices.some((v) => v.file === k)) P.buffers.delete(k);
    if (token !== P.chapterToken) return;
    P.loading = 0;
    paintDock();
    renderPads();
    if (autostart && P.steps.length) go(0);
  }

  /* ---------- Timeline ---------- */

  const now = () => audio().ctx.currentTime;

  function makeVoice(stepIdx, k, card, t0) {
    const buf = P.buffers.get(card.file);
    if (!buf) return null;
    const { ctx } = audio();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const start = Math.min(card.start || 0, Math.max(0, buf.duration - 0.05));
    const dur = card.repeat ? card.duration : Math.min(card.duration, buf.duration - start);
    if (card.repeat) { src.loop = true; src.loopStart = start; src.loopEnd = buf.duration; }
    const g = ctx.createGain();
    const vol = card.volume;
    const fi = Math.min(card.fadeIn || 0, dur);
    const fo = Math.min(card.fadeOut || 0, Math.max(0, dur - fi));
    g.gain.setValueAtTime(fi > 0 ? 0 : vol, t0);
    if (fi > 0) g.gain.linearRampToValueAtTime(vol, t0 + fi);
    if (fo > 0) { g.gain.setValueAtTime(vol, t0 + dur - fo); g.gain.linearRampToValueAtTime(0, t0 + dur); }
    src.connect(g).connect(P.bus);
    src.start(t0, start);
    src.stop(t0 + dur + 0.03);
    const v = { step: stepIdx, k, file: card.file, src, g, t0, end: t0 + dur, cut: null };
    src.onended = () => { v.done = true; try { g.disconnect(); } catch (e) { /* gone */ } };
    return v;
  }

  /** Starts step i at t0 and chains the steps that follow on their own, up to the next gate. */
  function schedule(i, t0) {
    const step = P.steps[i];
    P.starts[i] = t0;
    step.cards.forEach((c, k) => { const v = makeVoice(i, k, c, t0 + c.offset); if (v) P.voices.push(v); });
    const endT = t0 + F.stepLength(step);
    if (i + 1 < P.steps.length) {
      if (P.steps[i + 1].gate) P.gate = { i: i + 1, t: endT };
      else schedule(i + 1, endT);
    } else {
      P.end = P.voices.reduce((a, v) => Math.max(a, v.cut ?? v.end), endT);
    }
  }

  /** Moves the wire to step i now: whatever was waiting after the current moment is called off. */
  function go(i) {
    if (i < 0 || i >= P.steps.length) return;
    if (P.loading) { toast('The sounds of this chapter are still loading.'); return; }
    const { ctx } = audio(true);
    if (P.paused) { ctx.resume().catch(() => {}); P.paused = false; }
    const t = now();
    P.voices = P.voices.filter((v) => {
      if (v.t0 > t) { try { v.src.onended = null; v.src.stop(); v.g.disconnect(); } catch (e) { /* not started */ } return false; }
      return true;
    });
    for (let j = 0; j < P.starts.length; j++) if (j >= i || P.starts[j] > t) P.starts[j] = undefined;
    P.gate = null; P.end = null;
    schedule(i, t + LEAD);
    P.focus = -1;
    P.touched = 0;
    global.FlowApp && global.FlowApp.wake();
    paintDock();
  }

  function fadeVoice(v, ms) {
    const t = now();
    if (v.t0 > t) { try { v.src.onended = null; v.src.stop(); v.g.disconnect(); } catch (e) { /* not started */ } v.cut = t; v.done = true; return; }
    const f = Math.max(0.03, ms / 1000);
    try {
      const g = v.g.gain;
      const cur = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(0, t + f);
      v.src.stop(t + f + 0.03);
    } catch (e) { /* already stopped */ }
    v.cut = Math.min(v.end, t + f);
  }

  /** Fades every sound out and puts the chapter back at its start. */
  function stopAll(quick) {
    const ms = quick ? 120 : settings.fade;
    if (P.paused) { audio().ctx.resume().catch(() => {}); P.paused = false; }
    P.voices.forEach((v) => { if (!v.done && v.cut == null) fadeVoice(v, ms); });
    P.voices = [];
    P.starts = []; P.gate = null; P.end = null; P.focus = -1;
    paintDock();
  }

  function togglePause() {
    const { ctx } = audio();
    if (!P.starts.some((s) => s != null)) return;
    if (P.paused) { ctx.resume().catch(() => {}); P.paused = false; }
    else { ctx.suspend().catch(() => {}); P.paused = true; }
    paintDock();
  }

  /** What the wire is doing right now. */
  function state() {
    const t = P.rec ? now() : 0;
    let cur = -1;
    P.starts.forEach((s, i) => { if (s != null && s <= t) cur = i; });
    const started = P.starts.some((s) => s != null);
    if (!started) return { mode: 'idle', cur: -1, t };
    if (P.gate && t >= P.gate.t) return { mode: 'wait', cur, gate: P.gate.i, t };
    if (P.end != null && t >= P.end) return { mode: 'done', cur, t };
    return { mode: 'run', cur, t };
  }

  /** The step the golden button moves to. */
  function nextTarget(s) {
    if (s.mode === 'idle') return 0;
    if (s.mode === 'wait') return s.gate;
    if (s.mode === 'done') return -1;
    if (P.gate) return P.gate.i;
    const pending = P.starts.findIndex((x, i) => i > s.cur && x != null);
    return pending > 0 ? pending : (s.cur + 1 < P.steps.length ? s.cur + 1 : -1);
  }

  /* ---------- Soundbox ---------- */

  function fire(sound) {
    const buf = P.buffers.get(sound.file);
    if (!buf) { toast('This effect is still loading.'); return; }
    const { ctx } = audio(true);
    if (P.paused) { ctx.resume().catch(() => {}); P.paused = false; paintDock(); }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = typeof sound.volume === 'number' ? sound.volume : 0.75;
    src.connect(g).connect(P.sbBus);
    src.start();
  }

  function renderPads() {
    const box = $('#fl-pads');
    box.textContent = '';
    const list = P.rec.story.soundbox || [];
    if (!list.length) { box.append(el('p', 'fl-sb-empty', 'This story has no soundbox effects.')); return; }
    list.forEach((s, i) => {
      const b = el('button', 'pad');
      b.type = 'button';
      b.append(el('span', 'k', String(i + 1)), document.createTextNode(s.name));
      b.addEventListener('click', () => { fire(s); b.classList.remove('fire'); void b.offsetWidth; b.classList.add('fire'); });
      box.append(b);
    });
  }

  /* ---------- Drawing ---------- */

  function buildChrome() {
    $('#fl-story').textContent = P.rec.story.title || 'Story';
    $('#fl-master').value = settings.master;
    paintRange($('#fl-master'));
    $('#fl-sbvol').value = settings.sbVolume;
    paintRange($('#fl-sbvol'));
  }

  function paintRange(r) { r.style.setProperty('--p', `${Math.round(r.value * 100)}%`); }

  function renderChapters() {
    const nav = $('#fl-chapters');
    nav.textContent = '';
    P.rec.story.chapters.forEach((c, i) => {
      const b = el('button', 'fl-chip');
      b.type = 'button';
      b.setAttribute('aria-current', String(i === P.ch));
      b.append(el('b', '', String(i + 1)), el('span', '', c.title || `Chapter ${i + 1}`));
      b.addEventListener('click', () => { if (i !== P.ch) openChapter(i, false); });
      nav.append(b);
    });
    const on = nav.querySelector('[aria-current="true"]');
    if (on) nav.scrollLeft = Math.max(0, on.offsetLeft - nav.clientWidth / 2 + on.clientWidth / 2);
  }

  const ZCOL = { music: 'var(--music)', ambience: 'var(--amb)', events: 'var(--evt)', soundbox: 'var(--accent)' };
  const ZNAME = { music: 'Music', ambience: 'Ambiance', events: 'Event', soundbox: 'Soundbox' };

  function stepLabel(s, i) {
    if (s.title) return s.title;
    return s.cards.map((c) => c.name).join(' + ') || `Step ${i + 1}`;
  }

  /** Split or join of the wire between the centre and N lanes, in a 100 × 40 box stretched to the width. */
  function wireSvg(n, join) {
    const paths = [];
    for (let k = 0; k < n; k++) {
      const x = ((k + 0.5) / n) * 100;
      // The same bend as the wire of the app icon.
      paths.push(join ? `M${x} 0 C${x} 22.1 50 23.3 50 40` : `M50 0 C50 16.7 ${x} 17.9 ${x} 40`);
    }
    return `<svg class="fl-wsvg" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">${paths.map((d, k) => `<path class="w" data-k="${k}" d="${d}"/>`).join('')}</svg>`;
  }

  function renderCascade() {
    const box = $('#fl-cascade');
    box.textContent = '';
    P.dom = { steps: [], end: null };
    if (!P.steps.length) {
      box.append(el('p', 'fl-empty', 'This chapter has no steps yet. Shape it in the Flow editor, on a computer.'));
    }
    const offsets = F.runOffsets(P.steps);
    P.steps.forEach((s, i) => {
      const sec = el('section', 'fl-step');
      sec.dataset.i = i;
      if (s.gate) sec.classList.add('gate');
      const n = Math.max(1, s.cards.length);
      sec.style.setProperty('--n', n);

      if (i > 0) sec.append(el('div', 'fl-link'));
      const row = el('div', 'fl-node-row');
      const node = el('button', `fl-node${s.gate ? ' gate' : ''}`);
      node.type = 'button';
      node.innerHTML = s.gate ? ICON.play : '';
      node.setAttribute('aria-label', `${s.gate ? 'Go' : 'Jump'}: ${stepLabel(s, i)}`);
      node.addEventListener('click', () => go(i));
      const meta = el('div', 'fl-meta');
      const len = F.stepLength(s);
      meta.append(el('b', '', stepLabel(s, i)));
      const sub = el('span', 'fl-sub');
      sub.textContent = `${s.gate ? (i === 0 ? 'Starts on your tap' : 'Waits for your tap') : `Follows on its own, +${F.clock(offsets[i])}`}, ${F.clock(len)}`;
      meta.append(sub);
      row.append(node, meta);
      sec.append(row);

      const split = el('div', 'fl-split');
      split.innerHTML = wireSvg(n, false);
      sec.append(split);

      const lanes = el('div', 'fl-lanes');
      const cards = [];
      s.cards.forEach((c, k) => {
        const card = el('button', 'fl-card');
        card.type = 'button';
        card.style.setProperty('--z', ZCOL[c.zone] || 'var(--accent)');
        const stub = el('i', 'fl-stub');
        const head = el('div', 'fl-ch');
        head.append(el('b', '', c.name));
        const tags = el('div', 'fl-tags');
        tags.append(el('span', 'fl-zone', ZNAME[c.zone] || ''));
        if (c.offset) tags.append(el('span', 'fl-off', `+${F.clock(c.offset)}`));
        if (c.repeat) { const r = el('span', 'fl-rep'); r.innerHTML = ICON.repeat; tags.append(r); }
        const time = el('span', 'fl-time', F.clock(c.duration));
        tags.append(time);
        const track = el('div', 'fl-track');
        const fill = el('i');
        track.append(fill);
        card.append(stub, head, tags, track);
        card.addEventListener('click', () => {
          const v = voiceOf(i, k);
          if (v && !v.done && v.cut == null && v.t0 <= now()) { fadeVoice(v, settings.fade); toast(`Fading out ${c.name}.`, 1600); }
        });
        lanes.append(card);
        cards.push({ card, fill, time, stub, c });
      });
      if (!s.cards.length) lanes.append(el('div', 'fl-card ghost', 'Silence'));
      sec.append(lanes);

      const join = el('div', 'fl-join');
      join.innerHTML = wireSvg(n, true);
      sec.append(join);

      box.append(sec);
      P.dom.steps.push({ sec, node, sub, split, join, cards, cls: '' });
    });
    const end = el('div', 'fl-end');
    end.append(el('div', 'fl-link'));
    const btn = el('button', 'fl-nextch');
    btn.type = 'button';
    const last = P.ch + 1 >= P.rec.story.chapters.length;
    btn.innerHTML = last ? '<b>End of the story</b>' : `<span>Next chapter</span><b>${escapeHtml(P.rec.story.chapters[P.ch + 1].title || `Chapter ${P.ch + 2}`)}</b>`;
    btn.disabled = last;
    btn.addEventListener('click', () => { if (!last) openChapter(P.ch + 1, true); });
    end.append(btn);
    box.append(end);
    P.dom.end = { end, btn };
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function voiceOf(i, k) {
    for (let n = P.voices.length - 1; n >= 0; n--) if (P.voices[n].step === i && P.voices[n].k === k) return P.voices[n];
    return null;
  }

  function setCls(node, name, on) { if (node.classList.contains(name) !== on) node.classList.toggle(name, on); }

  /** One frame: lights the wire and the cards, moves the countdowns. */
  function frame() {
    if (!P.rec || !P.dom) return;
    const s = state();
    const t = s.t;
    P.voices = P.voices.filter((v) => !(v.done && (v.cut ?? v.end) < t - 2));
    let focus = s.mode === 'wait' ? s.gate : s.mode === 'idle' ? 0 : s.mode === 'done' ? P.steps.length : s.cur;
    P.dom.steps.forEach((d, i) => {
      const st = P.starts[i];
      const lit = st != null && st <= t;
      const len = F.stepLength(P.steps[i]);
      const past = lit && t >= st + len && d.cards.every((x, k) => { const v = voiceOf(i, k); return !v || t >= (v.cut ?? v.end); });
      const waiting = s.mode === 'wait' && s.gate === i;
      const ready = s.mode === 'idle' && i === 0;
      setCls(d.sec, 'lit', lit);
      setCls(d.sec, 'past', past);
      setCls(d.sec, 'waiting', waiting || ready);
      setCls(d.sec, 'current', i === s.cur && !past);
      // The link above a step charges while the wire runs towards it.
      if (i > 0) {
        const prev = P.starts[i - 1];
        let p = 0;
        if (lit || waiting) p = 1;
        else if (prev != null && prev <= t) { const pl = F.stepLength(P.steps[i - 1]); p = pl > 0 ? Math.min(1, (t - prev) / pl) : 1; }
        d.sec.style.setProperty('--link', p.toFixed(3));
      }
      d.cards.forEach((x, k) => {
        const v = lit || (st != null) ? voiceOf(i, k) : null;
        const c = x.c;
        let on = false, done = false, frac = 0, left = c.duration, stub = 0;
        if (v) {
          const end = v.cut ?? v.end;
          on = t >= v.t0 && t < end;
          done = t >= end;
          frac = Math.min(1, Math.max(0, (t - v.t0) / Math.max(0.01, v.end - v.t0)));
          left = Math.max(0, v.end - Math.max(t, v.t0));
          stub = st != null && c.offset > 0 ? Math.min(1, Math.max(0, (t - st) / c.offset)) : (t >= v.t0 ? 1 : 0);
        } else if (st != null && st <= t) { done = true; stub = 1; }
        setCls(x.card, 'on', on);
        setCls(x.card, 'done', done && !on);
        setCls(x.card, 'warn', on && left <= 10);
        x.card.style.setProperty('--stub', stub.toFixed(3));
        x.fill.style.width = `${(done ? 1 : frac) * 100}%`;
        const txt = on ? F.clock(left) : F.clock(c.duration);
        if (x.time.textContent !== txt) x.time.textContent = txt;
      });
    });
    setCls(P.dom.end.end, 'lit', s.mode === 'done');
    setCls(P.dom.end.btn, 'ready', s.mode === 'done' || (s.mode === 'run' && P.end != null && P.end - t < 5));
    if (P.steps.length) {
      const lastStart = P.starts[P.steps.length - 1];
      const ll = F.stepLength(P.steps[P.steps.length - 1]);
      const p = s.mode === 'done' ? 1 : lastStart != null && lastStart <= t ? Math.min(1, (t - lastStart) / Math.max(0.01, (P.end ?? lastStart + ll) - lastStart)) : 0;
      P.dom.end.end.style.setProperty('--link', p.toFixed(3));
    }
    if (focus !== P.focus) { P.focus = focus; follow(focus); }
    paintDock(s);
  }

  /** Keeps the step in play near the top of the screen, with the coming steps below it. */
  function follow(i) {
    if (Date.now() - P.touched < 5000) return;
    const sc = $('#fl-scroll');
    const target = i >= P.dom.steps.length ? P.dom.end.end : P.dom.steps[i] && P.dom.steps[i].sec;
    if (!target) return;
    const top = target.offsetTop - sc.clientHeight * 0.16;
    const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;
    sc.scrollTo({ top: Math.max(0, top), behavior: quiet ? 'auto' : 'smooth' });
  }

  let lastDock = '';
  function paintDock(s) {
    if (!P.rec) return;
    s = s || state();
    const goBtn = $('#fl-go');
    const target = nextTarget(s);
    let label, sub, cls;
    if (P.loading) { label = 'Loading sounds'; sub = `${P.loading} left`; cls = 'loading'; }
    else if (s.mode === 'idle') { label = 'Begin'; sub = P.steps[0] ? stepLabel(P.steps[0], 0) : 'Nothing to play'; cls = 'ready'; }
    else if (s.mode === 'wait') { label = 'Go'; sub = stepLabel(P.steps[s.gate], s.gate); cls = 'ready'; }
    else if (s.mode === 'done') {
      const last = P.ch + 1 >= P.rec.story.chapters.length;
      label = last ? 'The end' : 'Next chapter'; sub = last ? 'Every chapter is played' : (P.rec.story.chapters[P.ch + 1].title || `Chapter ${P.ch + 2}`); cls = last ? 'off' : 'ready';
    } else if (target >= 0) {
      const at = P.gate ? P.gate.t : P.starts[target];
      const inS = at != null ? Math.max(0, at - s.t) : null;
      label = P.gate && target === P.gate.i ? 'Go now' : 'Skip';
      sub = `${stepLabel(P.steps[target], target)}${inS != null ? `, in ${F.clock(inS)}` : ''}`;
      cls = 'quiet';
    } else {
      label = 'Last step'; sub = P.end != null ? `Ends in ${F.clock(P.end - s.t)}` : ''; cls = 'off';
    }
    const key = `${label}|${sub}|${cls}|${P.paused}|${s.mode}|${s.cur}`;
    if (key === lastDock) return;
    lastDock = key;
    goBtn.className = `fl-go ${cls}`;
    goBtn.disabled = cls === 'off' || cls === 'loading';
    $('#fl-go-label').textContent = label;
    $('#fl-go-sub').textContent = sub;
    const pb = $('#fl-pause');
    pb.innerHTML = P.paused ? ICON.play : ICON.pause;
    pb.setAttribute('aria-label', P.paused ? 'Resume' : 'Pause');
    pb.classList.toggle('on', P.paused);
    pb.disabled = s.mode === 'idle';
    $('#fl-stop').disabled = s.mode === 'idle';
    const step = s.cur >= 0 ? `Step ${s.cur + 1} of ${P.steps.length}` : `${P.steps.length} steps`;
    $('#fl-status').textContent = P.paused ? `Paused, ${step}` : step;
    document.querySelectorAll('#fl-chapters .fl-chip').forEach((b, i) => b.classList.toggle('live', i === P.ch && s.mode !== 'idle'));
  }

  function onGo() {
    const s = state();
    if (s.mode === 'done') { if (P.ch + 1 < P.rec.story.chapters.length) openChapter(P.ch + 1, true); return; }
    const t = nextTarget(s);
    if (t >= 0) go(t);
  }

  function loop() {
    cancelAnimationFrame(P.raf);
    const tick = () => {
      try { frame(); } catch (e) { if (!tick.warned) { console.error('Bardic Flow frame', e); tick.warned = true; } }
      P.raf = requestAnimationFrame(tick);
    };
    P.raf = requestAnimationFrame(tick);
  }

  /* ---------- Wiring (once) ---------- */
  function wire() {
    $('#fl-go').addEventListener('click', onGo);
    $('#fl-pause').addEventListener('click', togglePause);
    $('#fl-stop').addEventListener('click', () => stopAll());
    $('#fl-pause').innerHTML = ICON.pause;
    $('#fl-stop').innerHTML = ICON.stop;
    $('#fl-sb').innerHTML = ICON.star;
    $('#fl-sb').addEventListener('click', () => { const d = $('#fl-drawer'); d.hidden = !d.hidden; $('#fl-sb').setAttribute('aria-pressed', String(!d.hidden)); });
    $('#fl-drawer-close').innerHTML = ICON.close;
    $('#fl-drawer-close').addEventListener('click', () => { $('#fl-drawer').hidden = true; $('#fl-sb').setAttribute('aria-pressed', 'false'); });
    $('#fl-master').addEventListener('input', (e) => {
      settings.master = Number(e.target.value);
      paintRange(e.target);
      const { ctx, master } = audio();
      master.gain.setTargetAtTime(settings.master, ctx.currentTime, 0.03);
      saveSettings();
    });
    $('#fl-sbvol').addEventListener('input', (e) => {
      settings.sbVolume = Number(e.target.value);
      paintRange(e.target);
      if (P.sbBus) P.sbBus.gain.value = settings.sbVolume;
      saveSettings();
    });
    const sc = $('#fl-scroll');
    ['touchstart', 'wheel', 'mousedown'].forEach((ev) => sc.addEventListener(ev, () => { P.touched = Date.now(); }, { passive: true }));
    $('#fl-back').innerHTML = ICON.back;
    $('#fl-back').addEventListener('click', () => { if (P.onLeave) P.onLeave(); });
  }

  global.FlowPlayer = { open, close, wire, state: () => (P.rec ? state() : null), isOpen: () => !!P.rec, chapter: () => P.ch, togglePause };
})(window);
