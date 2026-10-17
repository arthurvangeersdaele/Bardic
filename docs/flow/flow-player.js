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
    voices: [], starts: [], gate: null, end: null, forced: new Set(), paused: false, bus: null, sbBus: null,
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
    P.starts = []; P.gate = null; P.end = null; P.focus = -1; P.touched = 0; P.forced.clear();
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
    step.cards.forEach((c, k) => {
      if (P.forced.has(`${i}:${k}`)) return; // already started by hand
      const v = makeVoice(i, k, c, t0 + c.offset);
      if (v) P.voices.push(v);
    });
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
    const run = runIndex(i);
    // Steps not started yet are called off. Inside the same run, the late sounds of a step already playing still come in;
    // a gate closes the run before it: its sounds fade out as the new one begins.
    P.voices = P.voices.filter((v) => {
      const same = runIndex(v.step) === run;
      if (v.t0 > t && !(same && P.starts[v.step] <= t && v.step < i)) { try { v.src.onended = null; v.src.stop(); v.g.disconnect(); } catch (e) { /* not started */ } return false; }
      if (!same && P.steps[i].gate && !v.done && v.cut == null) fadeVoice(v, settings.fade);
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

  /** The gate a step hangs from: steps share a run until the next gate. */
  function runIndex(i) {
    let g = 0;
    for (let j = 0; j <= i && j < P.steps.length; j++) if (j === 0 || P.steps[j].gate) g = j;
    return g;
  }

  /** Starts one card now, by hand, ahead of the wire. Not once the wire has reached it. */
  function force(i, k) {
    const key = `${i}:${k}`;
    const c = P.steps[i] && P.steps[i].cards[k];
    if (!c || P.loading || cardReached(i, k)) return;
    audio(true);
    if (P.paused) { audio().ctx.resume().catch(() => {}); P.paused = false; }
    const t = now();
    const pending = voiceOf(i, k);
    if (pending && pending.t0 > t) { try { pending.src.onended = null; pending.src.stop(); pending.g.disconnect(); } catch (e) { /* not started */ } P.voices = P.voices.filter((v) => v !== pending); }
    const v = makeVoice(i, k, c, t + LEAD);
    if (!v) return;
    P.voices.push(v);
    P.forced.add(key);
    if (P.end != null) P.end = Math.max(P.end, v.end);
    global.FlowApp && global.FlowApp.wake();
    paintDock();
  }
  /** True once the card has started, or the wire went past its start. */
  function cardReached(i, k) {
    const t = now();
    const v = voiceOf(i, k);
    if (v && v.t0 <= t) return true;
    if (P.forced.has(`${i}:${k}`)) return true;
    const st = P.starts[i];
    if (st != null && st + P.steps[i].cards[k].offset <= t) return true;
    // A run the wire has left behind (a later gate was opened) stays behind.
    const cur = state().cur;
    return cur >= 0 && runIndex(i) < runIndex(cur);
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
    P.starts = []; P.gate = null; P.end = null; P.focus = -1; P.forced.clear();
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

  /* A chapter is drawn as runs: a run opens on a gate and holds the steps that follow on their own.
   * Inside a run, time flows down: every card starts at the height of its start and is as tall as it lasts
   * (long sounds squeezed, short ones stretched to stay readable), so sounds that overlap sit side by side.
   * The golden wire runs down the left, a thread branches to each card, and a playhead sweeps down with time. */
  const GUTTER = 34;   // the wire's column
  const WIRE_X = 14;
  const PAD = 40;      // room above the first sounds of a run, for the lane wires to branch off
  const RUN_PX = 420;   // a run is drawn about this tall...
  const MIN_PPS = 2;    // ...at no less than 2 px per second
  const MAX_PPS = 36;   // and no more than 36
  const MIN_PX = 30;    // a sound shorter than that still shows its name

  function runsOf(steps) {
    const runs = [];
    steps.forEach((s, i) => { if (i === 0 || s.gate) runs.push({ gate: i, steps: [] }); runs[runs.length - 1].steps.push(i); });
    return runs;
  }

  /** Lays out one run: card positions (seconds), lanes, and the time-to-pixel map. */
  function layoutRun(run, offsets, last) {
    const items = [];
    let stepsEnd = 0;
    run.steps.forEach((i) => {
      const s = P.steps[i];
      stepsEnd = Math.max(stepsEnd, offsets[i] + F.stepLength(s));
      s.cards.forEach((c, k) => items.push({ i, k, c, s0: offsets[i] + c.offset, s1: offsets[i] + c.offset + c.duration }));
    });
    // A run that a gate follows ends with its steps: sounds still playing carry on under the next gate.
    const end = last ? Math.max(stepsEnd, ...items.map((x) => x.s1), 0) : stepsEnd;
    items.forEach((x) => { x.e = Math.min(x.s1, Math.max(end, x.s0 + 0.1)); x.cont = x.s1 > x.e + 0.05; });
    // One speed for the whole run: so many pixels per second, the same for every card and for the time line.
    // A card is as tall as it lasts; sounds side by side are sized by the same rule.
    const pps = Math.min(MAX_PPS, Math.max(MIN_PPS, RUN_PX / Math.max(end, 0.1)));
    const map = (t) => Math.max(0, Math.min(t, end)) * pps;
    items.forEach((x) => { x.y0 = x.s0 * pps; x.y1 = Math.max(x.e * pps, x.y0 + MIN_PX); });
    // Lanes: each card takes the first lane free at its top (a very short card keeps a readable height).
    const lanes = [];
    items.sort((a, b) => a.s0 - b.s0 || a.i - b.i || a.k - b.k).forEach((x) => {
      let l = lanes.findIndex((free) => free <= x.y0 + 0.5);
      if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = x.y1 + 4;
      x.lane = l;
    });
    const height = Math.max(end * pps, ...items.map((x) => x.y1), 24);
    return { items, lanes: Math.max(1, lanes.length), end, pps, height, map, y: (t) => t * pps };
  }

  function renderCascade() {
    const box = $('#fl-cascade');
    box.textContent = '';
    P.dom = { runs: [], end: null, cards: new Map(), dots: [] };
    if (!P.steps.length) box.append(el('p', 'fl-empty', 'This chapter has no steps yet. Shape it in the Flow editor, on a computer.'));
    P.offsets = F.runOffsets(P.steps);
    const runs = runsOf(P.steps);
    const cs = getComputedStyle(box);
    const width = Math.max(240, (box.clientWidth || 360) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    runs.forEach((run, r) => {
      const L = layoutRun(run, P.offsets, r === runs.length - 1);
      const sec = el('section', 'fl-run');
      if (r > 0) sec.append(el('div', 'fl-link'));
      const g = P.steps[run.gate];
      const row = el('div', 'fl-node-row');
      const node = el('button', 'fl-node gate');
      node.type = 'button';
      node.innerHTML = ICON.play;
      node.setAttribute('aria-label', `Go: ${stepLabel(g, run.gate)}`);
      node.addEventListener('click', () => go(run.gate));
      const meta = el('div', 'fl-meta');
      meta.append(el('b', '', stepLabel(g, run.gate)));
      const sub = el('span', 'fl-sub', `${run.gate === 0 ? 'Starts on your tap' : 'Waits for your tap'}, ${F.clock(L.end)}`);
      meta.append(sub);
      row.append(node, meta);
      sec.append(row);

      const area = el('div', 'fl-area');
      const H = L.height + PAD + 9;
      area.style.height = `${H}px`;
      // Lanes side by side; each has its own wire on its left, branching from the main wire like the icon.
      const laneW = (width - 8) / L.lanes;
      const wx = (l) => l * laneW + WIRE_X;
      const cardW = laneW - 16;
      if (laneW < 118) area.classList.add('narrow');
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'fl-threads');
      svg.setAttribute('width', width); svg.setAttribute('height', H);
      const top0 = (x) => x.y0 + PAD;
      const d = [`M${wx(0)} 0V${H}`];
      for (let l = 1; l < L.lanes; l++) {
        const inLane = L.items.filter((x) => x.lane === l);
        if (!inLane.length) continue;
        const y1 = Math.min(...inLane.map(top0));
        const y2 = Math.max(...inLane.map(top0));
        // The bend of the icon: the wire splits under the gate, each lane wire runs down its own rail
        // (between the lanes, never behind a card) to the elbow of its last card.
        const ys = 0;
        void y1;
        d.push(`M${wx(0)} ${ys}C${wx(0)} ${ys + 15} ${wx(l)} ${ys + 15} ${wx(l)} ${ys + 30}V${Math.max(ys + 30, y2 - 10)}`);
      }
      // Each card hangs from its lane wire: a soft elbow that becomes the card's top edge.
      L.items.forEach((x) => {
        const top = top0(x) + 0.5;
        const xw = wx(x.lane);
        d.push(`M${xw} ${Math.max(0, top - 10)}Q${xw} ${top} ${xw + 10} ${top}H${xw + 12}`);
      });
      const clipId = `fl-clip-${P.chapterToken}-${r}`;
      svg.innerHTML = `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${width}" height="0"/></clipPath></defs>`
        + `<g class="base">${d.map((p) => `<path class="w" d="${p}"/>`).join('')}</g>`
        + `<g class="gilt" clip-path="url(#${clipId})">${d.map((p) => `<path class="w lit" d="${p}"/>`).join('')}</g>`;
      const lit = svg.querySelector('clipPath rect');
      area.append(svg);
      L.items.forEach((x) => {
        const top = top0(x);
        const h = x.y1 - x.y0;
        const left = wx(x.lane) + 10;
        const thread = null;
        const c = x.c;
        const card = el('button', `fl-card${x.cont ? ' cont' : ''}`);
        card.type = 'button';
        card.style.cssText = `top:${top}px;left:${left}px;width:${cardW}px;height:${Math.max(24, h - 4)}px`;
        card.style.setProperty('--z', ZCOL[c.zone] || 'var(--accent)');
        const stub = el('i', 'fl-stub');
        const head = el('div', 'fl-ch');
        head.append(el('b', '', c.name));
        const tags = el('div', 'fl-tags');
        tags.append(el('span', 'fl-zone', ZNAME[c.zone] || ''));
        if (c.repeat) { const rp = el('span', 'fl-rep'); rp.innerHTML = ICON.repeat; tags.append(rp); }
        const pb = el('span', 'fl-force');
        pb.setAttribute('role', 'button');
        pb.setAttribute('aria-label', `Start ${c.name} now`);
        pb.innerHTML = ICON.play;
        pb.addEventListener('click', (e) => { e.stopPropagation(); force(x.i, x.k); });
        const time = el('span', 'fl-time', F.clock(c.duration));
        tags.append(time, pb);
        const track = el('div', 'fl-track');
        const fill = el('i');
        track.append(fill);
        // The wire, once it touches the card's top, comes down both its sides with the time line.
        const ch = Math.max(24, h - 4);
        if (ch < 58) card.classList.add('short');
        const gold = el('i', 'fl-gold');
        // The name, time and bar stay in sight while a tall card scrolls by.
        const stick = el('div', 'fl-stick');
        stick.append(head, tags, track);
        card.append(gold, stub, stick);
        if (x.cont) card.append(el('span', 'fl-cont', 'until the next Go'));
        card.addEventListener('click', () => {
          const v = voiceOf(x.i, x.k);
          if (v && !v.done && v.cut == null && v.t0 <= now()) { fadeVoice(v, settings.fade); toast(`Fading out ${c.name}.`, 1600); }
        });
        area.append(card);
        P.dom.cards.set(`${x.i}:${x.k}`, { card, fill, time, thread, c, gold, pb, top, ch, run: r, g: -1, s0: x.s0, e: x.e, cont: x.cont, span: (x.y1 - x.y0) / L.pps });
      });
      // The steps that follow on their own: a dot on the wire, tap to jump there.
      run.steps.slice(1).forEach((i) => {
        const d = el('button', 'fl-dot');
        d.type = 'button';
        d.style.top = `${L.y(P.offsets[i]) + PAD}px`;
        d.style.left = `${WIRE_X}px`;
        d.title = stepLabel(P.steps[i], i);
        d.setAttribute('aria-label', `Jump to ${stepLabel(P.steps[i], i)}`);
        d.addEventListener('click', () => go(i));
        area.append(d);
        P.dom.dots.push({ d, i });
      });
      const head = el('div', 'fl-playhead');
      head.hidden = true;
      area.append(head);
      sec.append(area);
      box.append(sec);
      P.dom.runs.push({ run, L, sec, node, sub, area, lit, head, total: H });
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
    P.dom.width = width;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function voiceOf(i, k) {
    for (let n = P.voices.length - 1; n >= 0; n--) if (P.voices[n].step === i && P.voices[n].k === k) return P.voices[n];
    return null;
  }

  function setCls(node, name, on) { if (node.classList.contains(name) !== on) node.classList.toggle(name, on); }

  /** Where the wire is inside run r, in seconds of its plan (follows jumps), or null before it starts. */
  function runTime(R, t) {
    let cur = -1;
    R.run.steps.forEach((i) => { const s = P.starts[i]; if (s != null && s <= t && (cur < 0 || s >= P.starts[cur])) cur = i; });
    if (cur < 0) return null;
    return P.offsets[cur] + (t - P.starts[cur]);
  }

  /** One frame: lights the wire, the threads and the cards, moves the playhead and the countdowns. */
  function frame() {
    if (!P.rec || !P.dom) return;
    const s = state();
    const t = s.t;
    P.voices = P.voices.filter((v) => !(v.done && (v.cut ?? v.end) < t - 2));
    let focusY = null;
    const curRun = P.dom.runs.findIndex((R) => R.run.steps.includes(s.cur));
    P.dom.runs.forEach((R, r) => {
      // A run left behind by a later gate counts as played to its end.
      const rt = curRun > r && runTime(R, t) != null ? Math.max(runTime(R, t), R.L.end + 1) : runTime(R, t);
      const started = rt != null;
      const waiting = (s.mode === 'wait' && s.gate === R.run.gate) || (s.mode === 'idle' && r === 0);
      setCls(R.sec, 'lit', started);
      setCls(R.sec, 'waiting', waiting);
      setCls(R.sec, 'past', started && rt >= R.L.end);
      // The link above a gate charges while the run before it ends.
      if (r > 0) {
        const P0 = P.dom.runs[r - 1];
        const prt = runTime(P0, t);
        const p = started || waiting ? 1 : prt == null ? 0 : Math.min(1, prt / Math.max(0.01, P0.L.end));
        R.sec.style.setProperty('--link', p.toFixed(3));
      }
      const y = started ? Math.min(R.L.map(rt) + PAD, R.total) : 0;
      R.y = y;
      R.rt = rt;
      R.lit.setAttribute('height', String(y));
      const show = started && r === curRun && rt < R.L.end + 0.5 && s.mode !== 'idle';
      R.head.hidden = !show;
      if (show) { R.head.style.transform = `translateY(${y}px)`; focusY = R.sec.offsetTop + R.area.offsetTop + y; }
      if (waiting) focusY = R.sec.offsetTop + 10;
    });
    P.dom.cards.forEach((x, key) => {
      const [i, k] = key.split(':').map(Number);
      const st = P.starts[i];
      const v = voiceOf(i, k);
      const c = x.c;
      let on = false, done = false, frac = 0, left = c.duration, stub = 0;
      if (v) {
        const end = v.cut ?? v.end;
        on = t >= v.t0 && t < end;
        done = t >= end;
        frac = Math.min(1, Math.max(0, (t - v.t0) / Math.max(0.01, v.end - v.t0)));
        left = Math.max(0, v.end - Math.max(t, v.t0));
        stub = t >= v.t0 ? 1 : 0;
      } else if (st != null && st <= t) { done = true; stub = 1; }
      setCls(x.card, 'on', on);
      setCls(x.card, 'done', done && !on);
      setCls(x.card, 'warn', on && left <= 10);
      setCls(x.card, 'spent', P.forced.has(key) && done);
      setCls(x.card, 'reached', !!(on || done || P.forced.has(key) || (st != null && st + c.offset <= t) || (s.cur >= 0 && runIndex(i) < runIndex(s.cur))));
      // One time for everything: the card's gold, its progress bar and the time line move together,
      // at the run's speed (a card started by hand, off the wire, follows its own sound).
      const R = P.dom.runs[x.run];
      let p = frac;
      if (!P.forced.has(key) && R.rt != null && !(done && !x.cont)) p = Math.min(1, Math.max(0, (R.rt - x.s0) / Math.max(0.01, x.span)));
      if (done) p = 1;
      let g = 0;
      if (stub > 0) g = Math.max(3, p * x.ch);
      frac = p;
      if (x.cont && on) left = Math.max(0, x.s0 + x.span - R.rt);
      x.fill.style.width = `${p * 100}%`;
      g = Math.round(g);
      if (g !== x.g) { x.g = g; x.gold.style.setProperty('--g', `${g}px`); setCls(x.gold, 'on', g > 0); }
      const txt = on ? (x.cont && left <= 0 ? 'Go' : F.clock(left)) : F.clock(c.duration);
      if (x.time.textContent !== txt) x.time.textContent = txt;
    });
    P.dom.dots.forEach(({ d, i }) => setCls(d, 'lit', P.starts[i] != null && P.starts[i] <= t));
    setCls(P.dom.end.end, 'lit', s.mode === 'done');
    setCls(P.dom.end.btn, 'ready', s.mode === 'done' || (s.mode === 'run' && P.end != null && P.end - t < 5));
    const lastR = P.dom.runs[P.dom.runs.length - 1];
    if (lastR) {
      const rt = runTime(lastR, t);
      P.dom.end.end.style.setProperty('--link', (s.mode === 'done' ? 1 : rt == null ? 0 : Math.min(1, rt / Math.max(0.01, lastR.L.end))).toFixed(3));
    }
    if (s.mode === 'done') focusY = P.dom.end.end.offsetTop;
    follow(focusY);
    paintDock(s);
  }

  /** Keeps the playhead (or the gate that waits) near the top of the screen, the coming sounds below it. */
  function follow(y) {
    if (y == null || Date.now() - P.touched < 5000) return;
    const sc = $('#fl-scroll');
    const want = Math.max(0, y - sc.clientHeight * 0.22);
    if (Math.abs(sc.scrollTop - want) < 48) return;
    if (P.scrolling && Date.now() - P.scrolling < 700) return;
    P.scrolling = Date.now();
    const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;
    sc.scrollTo({ top: want, behavior: quiet ? 'auto' : 'smooth' });
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
    let resizeT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => { if (P.rec && P.dom && P.dom.width !== null) renderCascade(); }, 150);
    });
    const sc = $('#fl-scroll');
    ['touchstart', 'wheel', 'mousedown'].forEach((ev) => sc.addEventListener(ev, () => { P.touched = Date.now(); }, { passive: true }));
    $('#fl-back').innerHTML = ICON.back;
    $('#fl-back').addEventListener('click', () => { if (P.onLeave) P.onLeave(); });
  }

  global.FlowPlayer = { open, close, wire, state: () => (P.rec ? state() : null), isOpen: () => !!P.rec, chapter: () => P.ch, togglePause };
})(window);
