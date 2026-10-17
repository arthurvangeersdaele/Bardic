/* Bardic Flow: the editor, on a computer. Shapes every chapter of a story into steps:
 * up to three sounds side by side in a step, each with its own offset, length, trim and fades,
 * and gates where the wire waits for the bard's tap. */
(function (global) {
  'use strict';

  const { $, el, ICON, toast, busy, idle, ask, deliver, audio, decode } = global.FlowUI;
  const F = global.BardicFlow;
  const MIME = 'application/x-bardic-flow';
  const ZCOL = { music: 'var(--music)', ambience: 'var(--amb)', events: 'var(--evt)', soundbox: 'var(--accent)' };
  const ZNAME = { music: 'Music', ambience: 'Ambiances', events: 'Events', soundbox: 'Soundbox' };

  const E = { rec: null, ch: 0, way: null, sel: null, tab: 'chapter', buffers: new Map(), blobs: null, preview: null, onLeave: null, onPlay: null, saveT: 0 };

  async function open(rec, opts = {}) {
    E.rec = rec;
    E.ch = Math.min(opts.chapter || 0, rec.story.chapters.length - 1);
    E.way = null;
    E.sel = null;
    E.onLeave = opts.onLeave; E.onPlay = opts.onPlay;
    E.blobs = await global.FlowDB.filesOf(rec);
    E.rec.lengths = E.rec.lengths || {};
    $('#fe-title').textContent = rec.story.title || 'Story';
    $('#fe-sub').textContent = `Flow editor, revision ${rec.flow.revision || 0}, ${rec.flow.bard || ''}`;
    renderAll();
  }
  function close() { stopPreview(); flush(); E.rec = null; E.buffers.clear(); E.blobs = null; }

  const chapter = () => E.rec.flow.chapters[E.ch];
  const choice = () => { const c = chapter().choice; return c && Array.isArray(c.answers) && c.answers.length ? c : null; };
  /** The steps being edited: the chapter's trunk, or one way of its choice (E.way). */
  const steps = () => {
    const c = choice();
    if (c && E.way != null && c.answers[E.way]) { c.answers[E.way].steps = c.answers[E.way].steps || []; return c.answers[E.way].steps; }
    return chapter().steps;
  };

  /* ---------- Saving ---------- */
  function changed(redraw = true) {
    const st = steps();
    if (st[0]) st[0].gate = true;
    $('#fe-saved').textContent = 'Saving…';
    clearTimeout(E.saveT);
    E.saveT = setTimeout(flush, 500);
    if (redraw) { renderSteps(); renderInspector(); renderChapters(); renderSounds(); }
  }
  async function flush() {
    clearTimeout(E.saveT);
    if (!E.rec) return;
    try { await global.FlowDB.put(E.rec); $('#fe-saved').textContent = 'Saved on this computer'; } catch (e) { $('#fe-saved').textContent = 'Not saved'; toast(`Could not save: ${e.message || e}`); }
  }

  /* ---------- Lengths and preview ---------- */
  async function buffer(file) {
    if (E.buffers.has(file)) return E.buffers.get(file);
    const blob = E.blobs.get(file);
    if (!blob) return null;
    const b = await decode(blob);
    E.buffers.set(file, b);
    if (!E.rec.lengths[file]) { E.rec.lengths[file] = Math.round(b.duration * 10) / 10; changed(false); }
    return b;
  }
  const lengthOf = (file) => E.rec.lengths[file] || null;

  function stopPreview() {
    if (E.preview) { try { E.preview.src.stop(); } catch (e) { /* done */ } E.preview.btn && E.preview.btn.classList.remove('on'); E.preview = null; }
  }
  /** Plays a sound (or a card, with its trim, length and fades) in the headphones of the bard. */
  async function preview(file, card, btn) {
    const same = E.preview && E.preview.key === (card ? card : file);
    stopPreview();
    if (same) return;
    const b = await buffer(file);
    if (!b) return;
    const { ctx, master } = audio(true);
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    const t = ctx.currentTime + 0.03;
    if (card) {
      const start = Math.min(card.start, b.duration - 0.05);
      const dur = card.repeat ? card.duration : Math.min(card.duration, b.duration - start);
      if (card.repeat) { src.loop = true; src.loopStart = start; src.loopEnd = b.duration; }
      const fi = Math.min(card.fadeIn, dur); const fo = Math.min(card.fadeOut, dur - fi);
      g.gain.setValueAtTime(fi ? 0 : card.volume, t);
      if (fi) g.gain.linearRampToValueAtTime(card.volume, t + fi);
      if (fo) { g.gain.setValueAtTime(card.volume, t + dur - fo); g.gain.linearRampToValueAtTime(0, t + dur); }
      src.start(t, start); src.stop(t + dur);
    } else { g.gain.value = 0.75; src.start(t); }
    src.connect(g).connect(master);
    E.preview = { src, key: card || file, btn };
    if (btn) btn.classList.add('on');
    src.onended = () => { if (E.preview && E.preview.src === src) stopPreview(); };
    renderSounds(false);
  }

  /* ---------- Cards ---------- */
  function newCard(snd) {
    const len = lengthOf(snd.file);
    const endless = snd.loop === 'infinite' || snd.loop === 'random';
    const repeat = endless || snd.loop === 'twice';
    const base = len || 60;
    return F.cleanCard({
      name: snd.name, file: snd.file, zone: snd.zone, offset: 0, start: 0,
      duration: endless ? Math.max(base, snd.zone === 'music' ? 180 : 300) : snd.loop === 'twice' ? base * 2 : base,
      repeat, fadeIn: snd.zone === 'events' || snd.zone === 'soundbox' ? 0 : 2, fadeOut: snd.zone === 'events' || snd.zone === 'soundbox' ? 0 : 4,
      volume: typeof snd.volume === 'number' ? snd.volume : 0.75,
    }, len);
  }
  function addSound(snd, at, into) {
    const st = steps();
    const c = newCard(snd);
    if (into != null) {
      if (st[into].cards.length >= F.LANES) { toast(`A step holds ${F.LANES} sounds side by side at most.`); return; }
      st[into].cards.push(c);
      E.sel = { i: into, k: st[into].cards.length - 1 };
    } else {
      const pos = at == null ? st.length : at;
      st.splice(pos, 0, { title: '', gate: true, next: null, cards: [c] });
      E.sel = { i: pos, k: 0 };
    }
    changed();
    if (!lengthOf(snd.file)) buffer(snd.file).then(() => renderAll()).catch(() => {});
  }
  function moveCard(from, toStep, toIndex, newStepAt) {
    const st = steps();
    const [c] = st[from.i].cards.splice(from.k, 1);
    if (newStepAt != null) {
      st.splice(newStepAt, 0, { title: '', gate: true, next: null, cards: [c] });
      E.sel = { i: newStepAt, k: 0 };
    } else {
      let i = toStep;
      if (st[i].cards.length >= F.LANES) { st[from.i].cards.splice(from.k, 0, c); toast(`A step holds ${F.LANES} sounds side by side at most.`); return; }
      const k = toIndex == null ? st[i].cards.length : Math.min(toIndex, st[i].cards.length);
      st[i].cards.splice(k, 0, c);
      E.sel = { i, k };
    }
    changed();
  }

  /* ---------- Drawing ---------- */
  function renderAll() { renderChapters(); renderSteps(); renderInspector(); renderSounds(); }

  function renderChapters() {
    const nav = $('#fe-chapters');
    nav.textContent = '';
    nav.append(el('h3', '', 'Chapters'));
    E.rec.story.chapters.forEach((c, i) => {
      const b = el('button', 'chap');
      b.type = 'button';
      b.setAttribute('aria-current', String(i === E.ch));
      const n = F.allSteps(E.rec.flow.chapters[i]).length;
      b.append(el('span', 'n', String(i + 1)), el('span', 't', c.title || `Chapter ${i + 1}`), el('small', 'fe-count', `${n}`));
      b.addEventListener('click', () => { E.ch = i; E.way = null; E.sel = null; stopPreview(); renderAll(); $('#fe-main').scrollTop = 0; });
      nav.append(b);
    });
    const tools = el('div', 'fe-tools');
    const reset = el('button', 'btn small', 'Start this chapter again');
    reset.type = 'button';
    reset.title = 'Rebuild this chapter from its sounds, as a first Flow';
    reset.addEventListener('click', async () => {
      const ok = await ask('Start this chapter again?', 'Its steps are replaced by a first Flow made from its sounds: music and ambiances together, then every other sound on its own cue.', [{ label: 'Cancel', value: false }, { label: 'Start again', value: true, cls: 'primary' }]);
      if (!ok) return;
      E.rec.flow.chapters[E.ch] = F.defaultChapter(E.rec.story.chapters[E.ch], E.rec.lengths);
      E.sel = null;
      changed();
    });
    tools.append(reset);
    nav.append(tools);
  }

  const label = (s, i) => s.title || s.cards.map((c) => c.name).join(' + ') || `Step ${i + 1}`;
  function secs(v) { return Math.round(v * 10) / 10; }

  function dropZone(node, onDrop) {
    node.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); e.stopPropagation(); node.classList.add('over'); } });
    node.addEventListener('dragleave', () => node.classList.remove('over'));
    node.addEventListener('drop', (e) => {
      node.classList.remove('over');
      const raw = e.dataTransfer.getData(MIME);
      if (!raw) return;
      e.preventDefault(); e.stopPropagation();
      onDrop(JSON.parse(raw));
    });
  }

  function gap(at) {
    const g = el('div', 'fe-gap');
    g.append(el('span', '', at >= steps().length ? 'Drop a sound here for a new step' : 'Drop here: a new step'));
    dropZone(g, (d) => { if (d.kind === 'sound') addSound(d.snd, at); else moveCard(d.from, null, null, at); });
    return g;
  }

  /** The silver choice of the chapter: its question, its ways, and which list of steps is being edited. */
  function choicePanel() {
    const box = el('div', 'fe-choice');
    const c = choice();
    if (!c) {
      const add = el('button', 'btn small fe-silver', 'Add a choice at the end of this chapter');
      add.type = 'button';
      add.title = 'A silver gate with a question: each answer leads to its own end of the chapter';
      add.addEventListener('click', () => {
        chapter().choice = { question: '', answers: [{ label: 'Yes', steps: [] }, { label: 'No', steps: [] }] };
        E.way = null; E.sel = null; changed();
      });
      box.append(add);
      return box;
    }
    const q = el('input', 'fe-question');
    q.value = c.question || ''; q.placeholder = 'The question, e.g. Did the boy survive?'; q.maxLength = 140;
    q.setAttribute('aria-label', 'Question of the choice');
    q.addEventListener('input', () => { c.question = q.value; changed(false); });
    const qrow = el('div', 'fe-qrow');
    const icon = el('span', 'fe-fork'); icon.innerHTML = ICON.fork || '';
    const del = el('button', 'ico small'); del.type = 'button'; del.innerHTML = ICON.trash; del.title = 'Remove the choice and its ways';
    del.addEventListener('click', async () => {
      const ok = await ask('Remove this choice?', 'Its question and every way after it leave the chapter, with their steps.', [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, cls: 'danger' }]);
      if (!ok) return;
      delete chapter().choice; E.way = null; E.sel = null; changed();
    });
    qrow.append(icon, q, del);
    box.append(qrow);
    // Which steps the cascade below shows.
    const ways = el('div', 'fe-ways');
    const tab = (label, way, n) => {
      const b = el('button', `fe-way${E.way === way ? ' on' : ''}${way != null ? ' silver' : ''}`);
      b.type = 'button';
      b.append(el('span', '', label), el('small', '', `${n} step${n === 1 ? '' : 's'}`));
      b.addEventListener('click', () => { E.way = way; E.sel = null; renderSteps(); renderInspector(); renderSounds(); });
      return b;
    };
    ways.append(tab('Before the choice', null, (chapter().steps || []).length));
    c.answers.forEach((a, k) => {
      const w = el('div', 'fe-answer');
      w.append(tab(a.label || `Way ${k + 1}`, k, (a.steps || []).length));
      if (E.way === k) {
        const name = el('input', 'fe-alabel'); name.value = a.label || ''; name.maxLength = 40; name.placeholder = 'Answer';
        name.setAttribute('aria-label', 'Answer');
        name.addEventListener('input', () => { a.label = name.value; changed(false); });
        name.addEventListener('change', () => renderSteps());
        w.append(name);
        if (c.answers.length > 2) {
          const x = el('button', 'fe-x'); x.type = 'button'; x.innerHTML = ICON.x; x.title = 'Remove this way';
          x.addEventListener('click', () => { c.answers.splice(k, 1); E.way = null; E.sel = null; changed(); });
          w.append(x);
        }
      }
      ways.append(w);
    });
    if (c.answers.length < F.MAX_ANSWERS) {
      const more = el('button', 'btn small fe-silver', '+ Answer'); more.type = 'button';
      more.addEventListener('click', () => { c.answers.push({ label: `Way ${c.answers.length + 1}`, steps: [] }); E.way = c.answers.length - 1; E.sel = null; changed(); });
      ways.append(more);
    }
    box.append(ways);
    box.append(el('p', 'muted small', E.way == null
      ? 'These steps play first. When they end, the wire stops at the silver gate and asks the question.'
      : `The way "${c.answers[E.way].label}": it starts on its own gate when you pick this answer, and ends the chapter.`));
    return box;
  }

  function renderSteps() {
    const main = $('#fe-main');
    const keep = main.scrollTop;
    main.textContent = '';
    const head = el('div', 'fe-head');
    const t = E.rec.story.chapters[E.ch].title || `Chapter ${E.ch + 1}`;
    head.append(el('p', 'kicker', `Chapter ${E.ch + 1}`), el('h2', '', t));
    const total = F.runOffsets(steps());
    head.append(choicePanel());
    head.append(el('p', 'muted', steps().length ? 'Steps run from top to bottom. A gate waits for your tap; the other steps follow on their own when the one above ends.' : 'Drag sounds from the right into the cascade to make the first step.'));
    main.append(head);
    const col = el('div', 'fe-cascade');
    steps().forEach((s, i) => {
      col.append(gap(i));
      const art = el('article', `fe-step${s.gate ? ' gate' : ''}`);
      const top = el('header', 'fe-step-top');
      const num = el('span', 'fe-num', String(i + 1));
      const title = el('input', 'fe-stitle');
      title.value = s.title; title.placeholder = label(Object.assign({}, s, { title: '' }), i); title.maxLength = 80;
      title.setAttribute('aria-label', `Name of step ${i + 1}`);
      title.addEventListener('input', () => { s.title = title.value; changed(false); });
      title.addEventListener('change', () => renderSteps());
      const gateL = el('label', 'fe-gate');
      const gateI = el('input'); gateI.type = 'checkbox'; gateI.checked = s.gate; gateI.disabled = i === 0;
      gateI.addEventListener('change', () => { s.gate = gateI.checked; changed(); });
      gateL.append(gateI, el('span', '', i === 0 ? (E.way != null ? 'Starts when picked' : 'Starts on my tap') : 'Wait for my tap'));
      gateL.title = 'A gate: the wire stops before this step until you tap Go';
      const nextL = el('label', 'fe-next');
      const sel = el('select');
      [['auto', 'Ends with its sounds'], ['after', 'Ends after']].forEach(([v, txt]) => { const o = el('option', '', txt); o.value = v; sel.append(o); });
      sel.value = s.next == null ? 'auto' : 'after';
      const nIn = el('input'); nIn.type = 'number'; nIn.min = 0; nIn.step = 0.5; nIn.value = s.next == null ? secs(F.stepLength(s)) : s.next; nIn.hidden = s.next == null;
      nIn.setAttribute('aria-label', 'Step length in seconds');
      sel.addEventListener('change', () => { s.next = sel.value === 'auto' ? null : secs(F.stepLength(s)); changed(); });
      nIn.addEventListener('change', () => { s.next = Math.max(0, Number(nIn.value) || 0); changed(); });
      nextL.append(sel, nIn, el('small', nIn.hidden ? 'fe-len' : 'fe-unit', nIn.hidden ? F.clock(F.stepLength(s)) : 's'));
      nextL.title = 'When the next step starts, if it is not a gate. Sounds still playing carry on under it.';
      const acts = el('div', 'fe-acts');
      const mk = (icon, lbl, fn, dis) => { const b = el('button', 'ico small'); b.type = 'button'; b.innerHTML = icon; b.title = lbl; b.setAttribute('aria-label', lbl); b.disabled = !!dis; b.addEventListener('click', fn); return b; };
      acts.append(
        mk(ICON.up, 'Move up', () => { const st = steps(); [st[i - 1], st[i]] = [st[i], st[i - 1]]; E.sel = null; changed(); }, i === 0),
        mk(ICON.down, 'Move down', () => { const st = steps(); [st[i + 1], st[i]] = [st[i], st[i + 1]]; E.sel = null; changed(); }, i === steps().length - 1),
        mk(ICON.trash, 'Remove this step', () => { steps().splice(i, 1); E.sel = null; changed(); }),
      );
      top.append(num, title, gateL, nextL, acts);
      art.append(top);

      const lanes = el('div', 'fe-lanes');
      s.cards.forEach((c, k) => {
        const card = el('div', 'fe-card');
        card.draggable = true;
        card.tabIndex = 0;
        card.style.setProperty('--z', ZCOL[c.zone]);
        if (E.sel && E.sel.i === i && E.sel.k === k) card.classList.add('sel');
        card.append(el('b', '', c.name));
        const meta = el('span', 'fe-cmeta', `${c.offset ? `+${F.clock(c.offset)}, ` : ''}${F.clock(c.duration)}${c.repeat ? ', repeats' : ''}${c.start ? `, from ${F.clock(c.start)}` : ''}`);
        card.append(meta);
        const x = el('button', 'fe-x'); x.type = 'button'; x.innerHTML = ICON.x; x.setAttribute('aria-label', `Remove ${c.name}`);
        x.addEventListener('click', (e) => { e.stopPropagation(); s.cards.splice(k, 1); E.sel = null; changed(); });
        card.append(x);
        card.addEventListener('click', () => { E.sel = { i, k }; renderSteps(); renderInspector(); });
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData(MIME, JSON.stringify({ kind: 'card', from: { i, k } })); e.dataTransfer.effectAllowed = 'move'; });
        dropZone(card, (d) => {
          if (d.kind === 'sound') {
            if (s.cards.length >= F.LANES) { toast(`A step holds ${F.LANES} sounds side by side at most.`); return; }
            s.cards.splice(k, 0, newCard(d.snd)); E.sel = { i, k }; changed();
          } else if (d.from.i === i) {
            const [m] = s.cards.splice(d.from.k, 1); s.cards.splice(k, 0, m); E.sel = { i, k }; changed();
          } else moveCard(d.from, i, k);
        });
        lanes.append(card);
      });
      if (s.cards.length < F.LANES) {
        const slot = el('div', 'fe-slot', s.cards.length ? '+ side by side' : 'Drop a sound');
        dropZone(slot, (d) => { if (d.kind === 'sound') addSound(d.snd, null, i); else if (d.from.i !== i) moveCard(d.from, i, null); });
        lanes.append(slot);
      }
      dropZone(lanes, (d) => { if (d.kind === 'sound') addSound(d.snd, null, i); else if (d.from.i !== i) moveCard(d.from, i, null); });
      art.append(lanes);

      // A small timeline of the step: when each sound starts and ends.
      const len = Math.max(0.1, F.stepLength(s), ...s.cards.map((c) => c.offset + c.duration));
      if (s.cards.length) {
        const ruler = el('div', 'fe-ruler');
        s.cards.forEach((c) => {
          const bar = el('i');
          bar.style.left = `${(c.offset / len) * 100}%`;
          bar.style.width = `${Math.max(1, (c.duration / len) * 100)}%`;
          bar.style.background = ZCOL[c.zone];
          ruler.append(bar);
        });
        if (s.next != null && s.next < len) { const m = el('b', 'fe-mark'); m.style.left = `${(s.next / len) * 100}%`; m.title = 'Next step'; ruler.append(m); }
        art.append(ruler);
      }
      const foot = el('div', 'fe-foot');
      foot.textContent = i === 0 ? (E.way != null ? 'Starts when you pick this answer' : 'Opens the chapter on your tap') : s.gate ? 'Waits for your tap' : `Follows on its own, ${F.clock(total[i])} after the last gate`;
      art.append(foot);
      col.append(art);
    });
    col.append(gap(steps().length));
    main.append(col);
    main.scrollTop = keep;
  }

  function field(lbl, input, hint) {
    const l = el('label', 'fe-field');
    l.append(el('span', '', lbl), input);
    if (hint) l.append(el('small', '', hint));
    return l;
  }
  function numIn(v, step, min, max, on) {
    const i = el('input'); i.type = 'number'; i.step = step; i.min = min; if (max != null) i.max = max; i.value = v;
    i.addEventListener('change', () => on(Number(i.value)));
    return i;
  }

  function renderInspector() {
    const box = $('#fe-inspector');
    box.textContent = '';
    const s = E.sel && steps()[E.sel.i];
    const c = s && s.cards[E.sel.k];
    if (!c) {
      box.append(el('h3', '', 'Sound card'));
      box.append(el('p', 'muted small', 'Select a card in the cascade to set when it starts, how long it plays and how it fades. Drag sounds from below into the cascade.'));
      return;
    }
    const len = lengthOf(c.file);
    const head = el('div', 'fe-ins-head');
    head.style.setProperty('--z', ZCOL[c.zone]);
    head.append(el('h3', '', `Step ${E.sel.i + 1}, sound ${E.sel.k + 1}`));
    const pv = el('button', 'btn small'); pv.type = 'button'; pv.innerHTML = `${ICON.play}<span>Listen</span>`;
    pv.addEventListener('click', () => preview(c.file, c, pv));
    head.append(pv);
    box.append(head);
    const name = el('input'); name.value = c.name; name.maxLength = 120;
    name.addEventListener('input', () => { c.name = name.value || 'Sound'; changed(false); });
    name.addEventListener('change', () => renderSteps());
    box.append(field('Name at the table', name));
    const upd = (fn) => (v) => { fn(v); Object.assign(c, F.cleanCard(c, len)); changed(); };
    box.append(field('Starts after', numIn(c.offset, 0.5, 0, null, upd((v) => { c.offset = v; })), 'seconds after the step begins'));
    const durRow = el('div', 'fe-row');
    durRow.append(numIn(c.duration, 0.5, 0.1, null, upd((v) => { c.duration = v; })));
    if (len) {
      const whole = el('button', 'btn small', 'Whole sound'); whole.type = 'button';
      whole.addEventListener('click', upd(() => { c.repeat = false; c.duration = len - c.start; }));
      durRow.append(whole);
    }
    box.append(field('Plays for', durRow, len ? `seconds (the sound lasts ${F.clock(len)})` : 'seconds'));
    const rep = el('label', 'row-set toggle');
    const ri = el('input'); ri.type = 'checkbox'; ri.checked = c.repeat;
    ri.addEventListener('change', upd(() => { c.repeat = ri.checked; }));
    rep.append(el('span', '', 'Repeat until it ends'), ri, el('i'));
    box.append(rep);
    box.append(field('Begins at', numIn(c.start, 0.5, 0, len || null, upd((v) => { c.start = v; })), 'seconds into the sound (trim the start)'));
    const fades = el('div', 'fe-row');
    fades.append(field('Fade in', numIn(c.fadeIn, 0.5, 0, 30, upd((v) => { c.fadeIn = v; }))), field('Fade out', numIn(c.fadeOut, 0.5, 0, 30, upd((v) => { c.fadeOut = v; }))));
    box.append(fades);
    const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = c.volume;
    vol.style.setProperty('--z', ZCOL[c.zone]); vol.style.setProperty('--p', `${c.volume * 100}%`);
    const vv = el('b', 'fe-vol', String(Math.round(c.volume * 100)));
    vol.addEventListener('input', () => { c.volume = Number(vol.value); vol.style.setProperty('--p', `${c.volume * 100}%`); vv.textContent = String(Math.round(c.volume * 100)); changed(false); });
    const vrow = el('div', 'fe-row'); vrow.append(vol, vv);
    box.append(field('Volume', vrow));
  }

  function renderSounds(full = true) {
    const box = $('#fe-sounds');
    if (!full && box.childNodes.length) {
      box.querySelectorAll('.fe-snd .pv').forEach((b) => b.classList.toggle('on', !!(E.preview && E.preview.key === b.dataset.file)));
      return;
    }
    box.textContent = '';
    const tabs = el('div', 'seg small fe-tabs');
    [['chapter', 'This chapter'], ['others', 'Other chapters'], ['soundbox', 'Soundbox']].forEach(([v, t]) => {
      const b = el('button', '', t); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(E.tab === v));
      b.addEventListener('click', () => { E.tab = v; renderSounds(); });
      tabs.append(b);
    });
    box.append(tabs);
    const used = new Map();
    steps().forEach((s) => s.cards.forEach((c) => used.set(c.file, (used.get(c.file) || 0) + 1)));
    const groups = [];
    const st = E.rec.story;
    if (E.tab === 'chapter') F.ZONES.forEach((z) => groups.push([ZNAME[z], (st.chapters[E.ch][z] || []).map((s) => Object.assign({ zone: z }, s))]));
    else if (E.tab === 'soundbox') groups.push(['Soundbox', (st.soundbox || []).map((s) => Object.assign({ zone: 'soundbox' }, s))]);
    else st.chapters.forEach((c, i) => { if (i !== E.ch) groups.push([`${i + 1}. ${c.title || 'Chapter'}`, F.ZONES.flatMap((z) => (c[z] || []).map((s) => Object.assign({ zone: z }, s)))]); });
    const list = el('div', 'fe-snds');
    groups.forEach(([title, sounds]) => {
      if (!sounds.length) return;
      list.append(el('h4', '', title));
      sounds.forEach((snd) => {
        const row = el('div', 'fe-snd');
        row.draggable = true;
        row.style.setProperty('--z', ZCOL[snd.zone]);
        const pv = el('button', 'pv'); pv.type = 'button'; pv.innerHTML = ICON.play; pv.dataset.file = snd.file; pv.setAttribute('aria-label', `Listen to ${snd.name}`);
        pv.addEventListener('click', () => preview(snd.file, null, pv));
        if (E.preview && E.preview.key === snd.file) pv.classList.add('on');
        const name = el('span', 'nm', snd.name);
        const len = lengthOf(snd.file);
        const meta = el('small', '', `${len ? F.clock(len) : ''}${used.get(snd.file) ? `, used ${used.get(snd.file)}×` : ''}`);
        const add = el('button', 'add'); add.type = 'button'; add.innerHTML = ICON.plus; add.title = 'Add as a new step at the end'; add.setAttribute('aria-label', `Add ${snd.name} as a new step`);
        add.addEventListener('click', () => addSound(snd));
        row.append(pv, name, meta, add);
        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData(MIME, JSON.stringify({ kind: 'sound', snd: { name: snd.name, file: snd.file, zone: snd.zone, loop: snd.loop, volume: snd.volume } }));
          e.dataTransfer.effectAllowed = 'copy';
        });
        list.append(row);
      });
    });
    if (!list.childNodes.length) list.append(el('p', 'muted small', 'No sounds here.'));
    box.append(list);
  }

  /* ---------- Export ---------- */
  async function forge() {
    await flush();
    const bard = global.Bardic.bardName();
    try {
      busy('Forging the .bardic-flow', '', 0);
      const out = await F.pack(E.rec.story, E.rec.flow, E.blobs, bard, (f) => busy('Forging the .bardic-flow', '', f), 'Bardic Flow editor (web)');
      E.rec.flow = out.flow;
      await global.FlowDB.put(E.rec);
      idle();
      $('#fe-sub').textContent = `Flow editor, revision ${out.flow.revision}, ${out.flow.bard}`;
      await deliver(out.blob, out.fileName);
      toast(`${out.fileName} forged, revision ${out.flow.revision}. Open it in Bardic Flow on your phone.`, 4200);
    } catch (e) { idle(); toast(`Could not forge: ${e.message || e}`, 4200); }
  }
  async function exportBardic() {
    try {
      busy('Writing the .bardic', '', 0);
      const out = await F.packBardic(E.rec.story, E.blobs, (f) => busy('Writing the .bardic', '', f));
      idle();
      await deliver(out.blob, out.fileName);
    } catch (e) { idle(); toast(`Could not write the .bardic: ${e.message || e}`, 4200); }
  }

  function wire() {
    // While something is dragged, the gaps between steps open up to receive it.
    document.addEventListener('dragstart', () => { if (!$('#editor').hidden) document.body.classList.add('fe-dragging'); });
    ['dragend', 'drop'].forEach((ev) => document.addEventListener(ev, () => document.body.classList.remove('fe-dragging')));
    $('#fe-back').innerHTML = ICON.back;
    $('#fe-back').addEventListener('click', async () => { await flush(); if (E.onLeave) E.onLeave(); });
    $('#fe-play').addEventListener('click', async () => { await flush(); if (E.onPlay) E.onPlay(E.ch); });
    $('#fe-forge').addEventListener('click', forge);
    $('#fe-bardic').addEventListener('click', exportBardic);
    document.addEventListener('keydown', (e) => {
      if (!E.rec || !E.sel || $('#editor').hidden) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
        const s = steps()[E.sel.i];
        if (s) { s.cards.splice(E.sel.k, 1); E.sel = null; changed(); }
      }
    });
  }

  global.FlowEditor = { open, close, wire, flush };
})(window);
