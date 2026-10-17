/* Bardic Flow: reads and writes .bardic-flow files. Spec: BARDIC_FLOW_FORMAT.md at the repo root.
 *
 * A .bardic-flow file is a .bardic file with one more entry: flow.json, the timing of every chapter.
 * story.json and the audio stay exactly as in the .bardic it was made from, so a Flow can always
 * be turned back into a plain .bardic (drop flow.json).
 *
 * Needs ../compagnie/bardic-format.js (window.Bardic) for the ZIP reader and writer.
 */
(function (global) {
  'use strict';

  const B = global.Bardic;
  const FLOW_VERSION = 1;
  const ZONES = ['music', 'ambience', 'events'];
  const LANES = 3; // parallel sounds in one step, side by side on a phone
  const MAX_SECONDS = 3600;

  const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  /** Every sound of a story, with the place it comes from: { name, file, zone, chapter (index, or -1 for the soundbox), loop, volume } */
  function soundsOf(story) {
    const out = [];
    (story.chapters || []).forEach((c, i) => ZONES.forEach((z) => (c[z] || []).forEach((s) => out.push({ name: s.name, file: s.file, zone: z, chapter: i, loop: s.loop, volume: s.volume }))));
    (story.soundbox || []).forEach((s) => out.push({ name: s.name, file: s.file, zone: 'soundbox', chapter: -1, loop: s.loop, volume: s.volume }));
    return out;
  }

  /** A card cleaned up: known fields in range, unknown ones kept. */
  function cleanCard(c, length) {
    const out = Object.assign({}, c);
    out.name = String(c.name || 'Sound').slice(0, 120);
    out.file = String(c.file || '');
    out.zone = ['music', 'ambience', 'events', 'soundbox'].includes(c.zone) ? c.zone : 'events';
    out.offset = r1(num(c.offset, 0, 0, MAX_SECONDS));
    out.start = r1(num(c.start, 0, 0, MAX_SECONDS));
    out.repeat = !!c.repeat;
    const room = length ? Math.max(0.1, length - out.start) : MAX_SECONDS;
    out.duration = r1(num(c.duration, room, 0.1, out.repeat ? MAX_SECONDS : room));
    out.fadeIn = r1(num(c.fadeIn, 0, 0, Math.min(30, out.duration)));
    out.fadeOut = r1(num(c.fadeOut, 0, 0, Math.min(30, out.duration)));
    out.volume = r2(num(c.volume, 0.75, 0, 1));
    return out;
  }

  function cleanStep(s, lengths) {
    const out = Object.assign({}, s);
    out.title = String(s.title || '').slice(0, 80);
    out.gate = !!s.gate;
    out.next = s.next == null || s.next === '' ? null : r1(num(s.next, 0, 0, MAX_SECONDS));
    out.cards = (s.cards || []).slice(0, LANES).map((c) => cleanCard(c, lengths && lengths[c.file]));
    return out;
  }

  /** The step's own length: until `next` if set, else until its last card ends. */
  function stepLength(step) {
    if (step.next != null) return step.next;
    return step.cards.reduce((a, c) => Math.max(a, c.offset + c.duration), 0);
  }
  /** Where every step starts, in seconds from the start of its run (a run begins at a gate). */
  function runOffsets(steps) {
    let t = 0;
    return steps.map((s, i) => {
      if (i === 0 || s.gate) t = 0;
      const at = t;
      t += stepLength(s);
      return at;
    });
  }

  /* ---------- A first Flow, made from a plain .bardic ---------- */

  function card(sound, length, opts = {}) {
    const len = length || 60;
    const endless = sound.loop === 'infinite' || sound.loop === 'random';
    const twice = sound.loop === 'twice';
    let duration = len;
    let repeat = false;
    if (endless) { repeat = true; duration = Math.max(len, sound.zone === 'music' ? 180 : 300); }
    else if (twice) { repeat = true; duration = len * 2; }
    return cleanCard({
      name: sound.name, file: sound.file, zone: sound.zone, offset: opts.offset || 0, start: 0, duration, repeat,
      fadeIn: sound.zone === 'events' ? 0 : Math.min(2, duration / 4),
      fadeOut: sound.zone === 'events' ? 0 : Math.min(4, duration / 4),
      volume: typeof sound.volume === 'number' ? sound.volume : 0.75,
    }, length);
  }

  /** One chapter: music and ambiances open it together, every other sound waits for its cue. */
  function defaultChapter(ch, lengths) {
    const S = (z) => (ch[z] || []).map((s) => Object.assign({ zone: z }, s));
    const music = S('music'); const amb = S('ambience'); const evt = S('events');
    const steps = [];
    const first = [];
    if (music[0]) first.push(card(music[0], lengths[music[0].file]));
    amb.slice(0, LANES - first.length).forEach((a) => first.push(card(a, lengths[a.file])));
    const usedAmb = first.length - (music[0] ? 1 : 0);
    if (first.length) steps.push({ title: 'Opening', gate: true, next: null, cards: first });
    music.slice(1).forEach((m) => steps.push({ title: '', gate: true, next: null, cards: [card(m, lengths[m.file])] }));
    const rest = amb.slice(usedAmb);
    for (let i = 0; i < rest.length; i += LANES) steps.push({ title: '', gate: true, next: null, cards: rest.slice(i, i + LANES).map((a) => card(a, lengths[a.file])) });
    evt.forEach((e) => steps.push({ title: '', gate: true, next: null, cards: [card(e, lengths[e.file])] }));
    return { steps: steps.map((s) => cleanStep(s, lengths)) };
  }

  function defaultFlow(story, lengths, bard) {
    const stamp = now();
    return {
      format: 'bardic-flow',
      version: FLOW_VERSION,
      id: B.uuid(),
      story: story.id || null,
      revision: 0,
      bard: bard || B.FORGOTTEN,
      created: stamp,
      chapters: (story.chapters || []).map((c) => defaultChapter(c, lengths || {})),
    };
  }

  /** Brings a flow in line with its story: one entry per chapter, cards only on sounds the archive holds. */
  function normalize(flow, story, lengths, files) {
    const out = Object.assign({}, flow);
    const chapters = story.chapters || [];
    out.chapters = chapters.map((c, i) => {
      const fc = (flow.chapters || [])[i] || { steps: [] };
      const ch = Object.assign({}, fc);
      ch.steps = (fc.steps || []).map((s) => cleanStep(s, lengths))
        .map((s) => Object.assign(s, { cards: s.cards.filter((k) => !files || files.has(k.file)) }));
      if (ch.steps[0]) ch.steps[0].gate = true;
      return ch;
    });
    return out;
  }

  /* ---------- Reading ---------- */

  /** Reads a .bardic or a .bardic-flow. Resolves with { story, flow (null for a plain .bardic), files: Map(path => Blob) }.
   *  Only the audio the story points to is read. */
  async function read(file, onProgress) {
    const zip = await B.readZip(file);
    if (!zip.has('story.json')) throw new Error('This file has no story.json: it is not a Bardic story.');
    const story = JSON.parse(await (await zip.get('story.json')()).text());
    if (story.format !== 'bardic') throw new Error('story.json is not a Bardic story.');
    if (story.version !== 1 && story.version !== 2) throw new Error(`This story uses format version ${story.version}, which Bardic Flow does not know yet.`);
    if (story.version === 1) { story.bard = story.bard || story.author || B.FORGOTTEN; }
    let flow = null;
    if (zip.has('flow.json')) {
      flow = JSON.parse(await (await zip.get('flow.json')()).text());
      if (flow.format !== 'bardic-flow') throw new Error('flow.json is not a Bardic Flow.');
      if (flow.version !== FLOW_VERSION) throw new Error(`This Flow uses version ${flow.version}, which this Bardic Flow does not know yet. Update the app.`);
    }
    const paths = [...new Set(soundsOf(story).map((s) => s.file).concat(flow ? flow.chapters.flatMap((c) => (c.steps || []).flatMap((s) => (s.cards || []).map((k) => k.file))) : []))]
      .filter((p) => p && zip.has(p));
    const files = new Map();
    let n = 0;
    for (const p of paths) {
      const blob = await zip.get(p)();
      const type = /\.ogg$/i.test(p) ? 'audio/ogg' : /\.m4a$/i.test(p) ? 'audio/mp4' : /\.wav$/i.test(p) ? 'audio/wav' : 'audio/mpeg';
      files.set(p, new Blob([blob], { type }));
      n += 1;
      if (onProgress) onProgress(n, paths.length);
    }
    return { story, flow, files };
  }

  /* ---------- Writing ---------- */

  /** Forges the next revision of the Flow. `files` maps each path to its Blob. Resolves with { blob, flow, fileName }. */
  async function pack(story, flow, files, bard, onProgress, generator) {
    const stamp = now();
    const out = Object.assign({}, flow, {
      format: 'bardic-flow',
      version: FLOW_VERSION,
      id: flow.id || B.uuid(),
      story: story.id || null,
      revision: (flow.revision || 0) + 1,
      bard: (bard || B.FORGOTTEN).trim(),
      created: flow.created || stamp,
      forged: stamp,
      generator: generator || 'Bardic Flow (web)',
    });
    const entries = [
      { name: 'story.json', data: new TextEncoder().encode(JSON.stringify(story, null, 2) + '\n') },
      { name: 'flow.json', data: new TextEncoder().encode(JSON.stringify(out, null, 2) + '\n') },
    ];
    [...files.keys()].sort().forEach((p) => entries.push({ name: p, data: files.get(p) }));
    const blob = await B.writeZip(entries, onProgress);
    return { blob, flow: out, fileName: `${yymmdd()}_${B.slug(story.title, 'story')}.bardic-flow` };
  }

  /** The story alone, as a plain .bardic (story.json is kept as it came, revision included). */
  async function packBardic(story, files, onProgress) {
    const used = new Set(soundsOf(story).map((s) => s.file));
    const entries = [{ name: 'story.json', data: new TextEncoder().encode(JSON.stringify(story, null, 2) + '\n') }];
    [...files.keys()].filter((p) => used.has(p)).sort().forEach((p) => entries.push({ name: p, data: files.get(p) }));
    const blob = await B.writeZip(entries, onProgress);
    return { blob, fileName: `${yymmdd()}_${B.slug(story.title, 'story')}.bardic` };
  }

  function yymmdd(d = new Date()) {
    return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  /** "1:05", "12 s", "∞" free: durations at the table. */
  function clock(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  global.BardicFlow = {
    FLOW_VERSION, LANES, ZONES, soundsOf, cleanCard, cleanStep, stepLength, runOffsets,
    defaultFlow, defaultChapter, normalize, read, pack, packBardic, yymmdd, clock,
  };
})(window);
