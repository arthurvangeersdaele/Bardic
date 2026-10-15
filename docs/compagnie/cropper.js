/* Bardic Story builder: add a sound from a link (an MP3 or other audio file, or a YouTube video),
 * listen to it, crop it (start, end, fade in, fade out) and keep only that part.
 * Also used to crop a sound already in the story.
 *
 * Audio links are fetched by the browser itself: the site that hosts them must allow it (CORS).
 * YouTube cannot be downloaded by a web page; the video plays in an embedded player and Bardic records
 * this tab's own audio while the chosen part plays (Chrome or Edge: share "This tab" with its audio).
 * The cropped part is encoded as an MP3 in the browser (LAME, vendor/lame.min.js, LGPL). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const svg = (d, size = 16, fill = false) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
  const ICON = {
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>', 14, true),
    stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>', 12, true),
    rec: svg('<circle cx="12" cy="12" r="7"/>', 14, true),
  };
  const ZONE_LABEL = { music: 'Music', ambience: 'Ambience', events: 'Events', soundbox: 'Soundbox' };

  function fmt(t) {
    if (!isFinite(t)) return '0:00.0';
    t = Math.max(0, t);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }
  function parseTime(v) {
    v = String(v).trim().replace(',', '.');
    if (!v) return NaN;
    const parts = v.split(':').map(Number);
    if (parts.some((x) => !isFinite(x))) return NaN;
    return parts.reduce((a, x) => a * 60 + x, 0);
  }
  function nameFrom(text) {
    let n = String(text || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/^\d+[\s._-]*/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return n ? (n[0].toUpperCase() + n.slice(1)).slice(0, 80) : 'Sound';
  }

  /** The YouTube video id of a link, or null. */
  function youTubeId(url) {
    let u;
    try { u = new URL(url.trim()); } catch (e) { return null; }
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else { const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/); if (m) id = m[1]; }
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  }
  function youTubeStart(url) {
    try {
      const u = new URL(url.trim());
      const t = u.searchParams.get('t') || u.searchParams.get('start');
      if (!t) return 0;
      const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
    } catch (e) { return 0; }
  }

  let ctx = null;
  const audio = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());

  /* ---------- YouTube player (IFrame API, loaded on first use) ---------- */
  let ytReady = null;
  function loadYouTubeApi() {
    if (ytReady) return ytReady;
    ytReady = new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytReady = null; reject(new Error('The YouTube player could not be loaded. Check your connection.')); };
      document.head.append(s);
    });
    return ytReady;
  }

  /* ---------- MP3 encoding ---------- */
  let lameReady = null;
  const LAME_SRC = document.currentScript ? new URL('vendor/lame.min.js', document.currentScript.src).href : 'vendor/lame.min.js';

  /** Copies [start, end) of the buffer into Float32 channels with the fades applied. */
  function slice(buf, start, end, fadeIn, fadeOut) {
    const sr = buf.sampleRate;
    const a = Math.max(0, Math.floor(start * sr));
    const b = Math.min(buf.length, Math.ceil(end * sr));
    const n = Math.max(0, b - a);
    const fi = Math.min(n, Math.round(fadeIn * sr));
    const fo = Math.min(n, Math.round(fadeOut * sr));
    const chans = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
      const d = buf.getChannelData(c).slice(a, b);
      for (let i = 0; i < fi; i++) d[i] *= i / fi;
      for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
      chans.push(d);
    }
    return { chans, sr, n };
  }

  async function encodeMp3(part, onProgress) {
    const lame = await loadLameAt();
    const { chans, sr, n } = part;
    const stereo = chans.length > 1;
    const rate = [48000, 44100, 32000].includes(sr) ? sr : 44100;
    const enc = new lame.Mp3Encoder(stereo ? 2 : 1, rate, 192);
    const toI16 = (f) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
    // A rate the encoder does not take is resampled linearly first.
    const src = rate === sr ? chans : chans.map((f) => { const m = Math.floor(f.length * rate / sr), o = new Float32Array(m); for (let i = 0; i < m; i++) { const x = i * sr / rate, j = Math.floor(x), t = x - j; o[i] = (f[j] || 0) * (1 - t) + (f[j + 1] || 0) * t; } return o; });
    const L = toI16(src[0]);
    const R = stereo ? toI16(src[1]) : null;
    const out = [];
    const block = 1152 * 20;
    for (let i = 0; i < L.length; i += block) {
      const mp3 = stereo ? enc.encodeBuffer(L.subarray(i, i + block), R.subarray(i, i + block)) : enc.encodeBuffer(L.subarray(i, i + block));
      if (mp3.length) out.push(new Uint8Array(mp3));
      if ((i / block) % 8 === 0) { if (onProgress) onProgress(i / L.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    const end = enc.flush();
    if (end.length) out.push(new Uint8Array(end));
    if (onProgress) onProgress(1);
    void n;
    return new Blob(out, { type: 'audio/mpeg' });
  }
  function loadLameAt() {
    if (lameReady) return lameReady;
    lameReady = new Promise((resolve, reject) => {
      if (window.lamejs) { resolve(window.lamejs); return; }
      const s = document.createElement('script');
      s.src = LAME_SRC;
      s.onload = () => (window.lamejs ? resolve(window.lamejs) : reject(new Error('MP3 encoder missing')));
      s.onerror = () => { lameReady = null; reject(new Error('The MP3 encoder could not be loaded.')); };
      document.head.append(s);
    });
    return lameReady;
  }

  /* ---------- the dialog ---------- */
  /**
   * open({ zone, sound?, onSave(file, { name, duration }) })
   * Without `sound`: add from a link (or a file dropped on the dialog). With `sound`: crop that sound.
   */
  function open(opts) {
    const cropOnly = !!opts.sound;
    const zoneLabel = ZONE_LABEL[opts.zone] || 'the story';
    const v = el('div', 'veil');
    v.id = 'veil';
    const box = el('div', 'forge crop');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `
      <div class="cr-head"><h2></h2><button class="x cr-close" type="button" aria-label="Close">${svg('<path d="M18 6L6 18M6 6l12 12"/>', 18)}</button></div>
      <div class="cr-src">
        <p class="cr-lead">Paste a link to an audio file (MP3, OGG, WAV, M4A) or to a YouTube video, listen to it, and keep only the part you need.</p>
        <form class="cr-url"><input type="url" placeholder="https://… .mp3 or a YouTube link" aria-label="Link to a sound or a YouTube video" autocomplete="off" spellcheck="false"><button class="btn primary" type="submit">Load</button></form>
        <p class="cr-or">Or drop an audio file here, or <button type="button" class="linkish cr-file">choose one</button>.</p>
      </div>
      <div class="cr-yt" hidden>
        <div class="cr-yt-row">
          <div class="cr-yt-player"><div></div></div>
          <div class="cr-yt-side">
            <p class="cr-steps">Play the video and set the part you want, then record it. The page records its own sound while that part plays: when your browser asks, choose <b>This tab</b> and keep <b>Share tab audio</b> on.</p>
            <div class="cr-times">
              <label>From <input class="cr-ys" value="0:00.0" inputmode="decimal"></label><button class="btn small cr-ys-set" type="button">Here</button>
              <label>To <input class="cr-ye" value="0:10.0" inputmode="decimal"></label><button class="btn small cr-ye-set" type="button">Here</button>
            </div>
            <button class="btn primary cr-rec" type="button">${ICON.rec}<span>Record this part</span></button>
            <p class="cr-fine">Only keep sounds you are allowed to use. A tale laid in the Recueil must only hold sounds that are free to share.</p>
          </div>
        </div>
      </div>
      <p class="cr-status" aria-live="polite"></p>
      <div class="cr-edit" hidden>
        <div class="cr-wave"><canvas></canvas><div class="cr-sel"><i class="h a" title="Drag to set the start"></i><i class="h b" title="Drag to set the end"></i></div><div class="cr-ph"></div></div>
        <div class="cr-ctrl">
          <button class="pb cr-play" type="button" aria-label="Listen to the selection">${ICON.play}</button>
          <label>Start <input class="cr-s" inputmode="decimal"></label>
          <label>End <input class="cr-e" inputmode="decimal"></label>
          <span class="cr-len"></span>
          <label>Fade in <select class="cr-fi"><option value="0">none</option><option value="0.05">short</option><option value="0.5">0.5 s</option><option value="1">1 s</option><option value="2">2 s</option></select></label>
          <label>Fade out <select class="cr-fo"><option value="0">none</option><option value="0.05">short</option><option value="0.5">0.5 s</option><option value="1">1 s</option><option value="2">2 s</option><option value="4">4 s</option></select></label>
        </div>
        <div class="cr-save">
          <label class="cr-name">Name <input maxlength="80" class="cr-n"></label>
          <button class="btn cr-cancel" type="button">Cancel</button>
          <button class="btn primary cr-ok" type="button"></button>
        </div>
      </div>
      <input type="file" class="cr-pick" accept=".mp3,.ogg,.m4a,.wav,.webm,.aac,.flac,audio/*" hidden>`;
    v.append(box);
    document.body.append(v);
    $('h2', box).textContent = cropOnly ? `Crop “${opts.sound.name}”` : `Add a sound to ${zoneLabel}`;
    $('.cr-ok', box).textContent = cropOnly ? 'Keep this part' : `Add to ${zoneLabel}`;
    if (cropOnly) $('.cr-src', box).hidden = true;

    const status = (t, err) => { const s = $('.cr-status', box); s.textContent = t || ''; s.classList.toggle('err', !!err); };
    let buf = null;          // AudioBuffer being edited
    let original = null;     // { blob, fileName } when the whole file can be kept untouched
    let selA = 0, selB = 0;
    let src = null, playT0 = 0, raf = 0;
    let yt = null, ytTimer = 0, recording = null, closed = false;

    function close() {
      if (closed) return;
      closed = true;
      stop();
      stopRecording(true);
      clearInterval(ytTimer);
      if (yt && yt.destroy) { try { yt.destroy(); } catch (e) { /* gone */ } }
      v.remove();
      document.removeEventListener('keydown', onKey, true);
    }
    const onKey = (e) => { if (e.key === 'Escape' && !v.dataset.busy) { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    v.addEventListener('click', (e) => { if (e.target === v && !v.dataset.busy && !buf) close(); });
    $('.cr-close', box).onclick = () => { if (!v.dataset.busy) close(); };
    $('.cr-cancel', box).onclick = close;

    /* --- loading --- */
    async function useBlob(blob, name, keepable) {
      stop();
      status('Reading the sound…');
      try {
        const data = await blob.arrayBuffer();
        buf = await audio().decodeAudioData(data);
      } catch (e) {
        buf = null;
        status('This sound could not be read. Try another file or link.', true);
        return;
      }
      original = keepable ? { blob, fileName: name } : null;
      selA = 0; selB = buf.duration;
      if (!$('.cr-n', box).value) $('.cr-n', box).value = nameFrom(name);
      $('.cr-edit', box).hidden = false;
      status(`${fmt(buf.duration)} loaded. Drag the edges of the selection, or type the times, then listen.`);
      paintTimes();
      requestAnimationFrame(drawWave);
    }

    async function loadUrl(url) {
      url = url.trim();
      if (!url) return;
      const id = youTubeId(url);
      if (id) { openYouTube(id, youTubeStart(url)); return; }
      let u;
      try { u = new URL(url); } catch (e) { status('This does not look like a link.', true); return; }
      $('.cr-yt', box).hidden = true;
      status('Fetching the sound…');
      v.dataset.busy = '1';
      try {
        const res = await fetch(u.href, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = decodeURIComponent(u.pathname.split('/').pop() || 'sound');
        await useBlob(blob, /\.[a-z0-9]{2,4}$/i.test(file) ? file : `${file}.mp3`, true);
      } catch (e) {
        status('This link could not be fetched: the site that hosts it does not let other pages download its files, or it is not a sound. Download the file, then drop it here.', true);
      } finally { delete v.dataset.busy; }
    }
    $('.cr-url', box).addEventListener('submit', (e) => { e.preventDefault(); loadUrl($('.cr-url input', box).value); });
    $('.cr-file', box).onclick = () => $('.cr-pick', box).click();
    $('.cr-pick', box).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { $('.cr-yt', box).hidden = true; useBlob(f, f.name, true); } });
    box.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.stopPropagation(); box.classList.add('over'); } });
    box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove('over'); });
    box.addEventListener('drop', (e) => {
      box.classList.remove('over');
      if (!e.dataTransfer.files.length) return;
      e.preventDefault(); e.stopPropagation();
      const f = e.dataTransfer.files[0];
      $('.cr-yt', box).hidden = true;
      useBlob(f, f.name, true);
    });

    /* --- YouTube --- */
    async function openYouTube(id, start) {
      $('.cr-yt', box).hidden = false;
      $('.cr-ys', box).value = fmt(start);
      $('.cr-ye', box).value = fmt(start + 10);
      status('Loading the YouTube player…');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder) {
        status('Recording a YouTube video needs Chrome or Edge on a computer.', true);
      }
      let YT;
      try { YT = await loadYouTubeApi(); } catch (e) { status(e.message, true); return; }
      if (closed) return;
      if (yt && yt.loadVideoById) { yt.cueVideoById({ videoId: id, startSeconds: start }); }
      else {
        const host = $('.cr-yt-player > div', box);
        yt = new YT.Player(host, {
          videoId: id,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { start: Math.floor(start), rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => { status('Play the video to find the part you want.'); yt.unMute(); yt.setVolume(100); },
            onError: (e) => status(e.data === 101 || e.data === 150 ? 'This video cannot be played outside YouTube, so it cannot be recorded here.' : 'This video could not be loaded.', true),
          },
        });
      }
      clearInterval(ytTimer);
      ytTimer = setInterval(() => {
        if (!recording || !yt || !yt.getCurrentTime) return;
        const t = yt.getCurrentTime();
        const p = Math.min(1, (t - recording.a) / Math.max(0.1, recording.b - recording.a));
        status(`Recording… ${fmt(Math.max(0, t - recording.a))} of ${fmt(recording.b - recording.a)}`);
        $('.cr-rec span', box).textContent = `Recording ${Math.round(p * 100)}%`;
        if (t >= recording.b + 0.25) stopRecording(false);
      }, 80);
    }
    const now = () => (yt && yt.getCurrentTime ? yt.getCurrentTime() : 0);
    $('.cr-ys-set', box).onclick = () => { $('.cr-ys', box).value = fmt(now()); };
    $('.cr-ye-set', box).onclick = () => { $('.cr-ye', box).value = fmt(now()); };

    async function record() {
      if (recording) { stopRecording(false); return; }
      if (!yt || !yt.seekTo) { status('Wait for the video to load.', true); return; }
      const a = parseTime($('.cr-ys', box).value), b = parseTime($('.cr-ye', box).value);
      if (!isFinite(a) || !isFinite(b) || b <= a) { status('Set a start time before the end time.', true); return; }
      if (b - a > 600) { status('Record 10 minutes at most at once.', true); return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder) { status('Recording a YouTube video needs Chrome or Edge on a computer.', true); return; }
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
          preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', systemAudio: 'include',
        });
      } catch (e) {
        status('Recording was not allowed. Try again and share this tab with its audio.', true);
        return;
      }
      const tracks = stream.getAudioTracks();
      if (!tracks.length) {
        stream.getTracks().forEach((t) => t.stop());
        status('No sound was shared. Try again: choose This tab and keep Share tab audio on.', true);
        return;
      }
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type, audioBitsPerSecond: 256000 } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recording = { a, b, rec, stream, chunks, cancelled: false };
      v.dataset.busy = '1';
      box.classList.add('recording');
      yt.pauseVideo();
      yt.seekTo(Math.max(0, a - 0.3), true);
      await new Promise((r) => setTimeout(r, 700));
      if (!recording) return;
      rec.onstop = async () => {
        const r = recording;
        recording = null;
        delete v.dataset.busy;
        box.classList.remove('recording');
        $('.cr-rec span', box).textContent = 'Record this part';
        stream.getTracks().forEach((t) => t.stop());
        if (!r || r.cancelled || closed) return;
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        let title = '';
        try { title = (yt.getVideoData && yt.getVideoData().title) || ''; } catch (e) { /* no title */ }
        if (!$('.cr-n', box).value) $('.cr-n', box).value = nameFrom(title || 'YouTube sound');
        await useBlob(blob, title || 'YouTube sound', false);
        if (buf) {
          // The recording starts a little before the chosen part: place the selection on it.
          selA = Math.min(buf.duration, 0.3);
          selB = Math.min(buf.duration, selA + (b - a));
          paintTimes(); drawWave();
          status('Recorded. Fine-tune the selection, listen, then add it.');
        }
      };
      rec.start(250);
      yt.playVideo();
    }
    function stopRecording(cancel) {
      if (!recording) return;
      recording.cancelled = cancel;
      try { if (yt && yt.pauseVideo) yt.pauseVideo(); } catch (e) { /* gone */ }
      if (recording.rec.state !== 'inactive') recording.rec.stop();
      else { recording.stream.getTracks().forEach((t) => t.stop()); recording = null; }
    }
    $('.cr-rec', box).onclick = record;

    /* --- waveform and selection --- */
    const wave = $('.cr-wave', box);
    const canvas = $('canvas', wave);
    let peaks = null, peaksFor = 0;
    function drawWave() {
      if (!buf) return;
      const w = wave.clientWidth, h = wave.clientHeight, dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const g = canvas.getContext('2d');
      g.scale(dpr, dpr);
      if (!peaks || peaksFor !== w) {
        peaks = new Float32Array(w);
        const per = buf.length / w;
        const chs = [];
        for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
        for (let x = 0; x < w; x++) {
          let m = 0;
          const a = Math.floor(x * per), b = Math.min(buf.length, Math.floor((x + 1) * per));
          const step = Math.max(1, Math.floor((b - a) / 400));
          for (const d of chs) for (let i = a; i < b; i += step) { const v = Math.abs(d[i]); if (v > m) m = v; }
          peaks[x] = m;
        }
        peaksFor = w;
      }
      const cs = getComputedStyle(box);
      const muted = cs.getPropertyValue('--line').trim() || '#2E2E39';
      const z = cs.getPropertyValue('--accent').trim() || '#E0A84B';
      const xa = (selA / buf.duration) * w, xb = (selB / buf.duration) * w;
      g.clearRect(0, 0, w, h);
      for (let x = 0; x < w; x++) {
        const ph = Math.max(1, peaks[x] * (h - 8));
        g.fillStyle = x >= xa && x <= xb ? z : muted;
        g.fillRect(x, (h - ph) / 2, 1, ph);
      }
      const sel = $('.cr-sel', wave);
      sel.style.left = `${xa}px`;
      sel.style.width = `${Math.max(2, xb - xa)}px`;
    }
    window.addEventListener('resize', () => { if (!closed) drawWave(); });
    const timeAt = (clientX) => { const r = wave.getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (buf ? buf.duration : 0); };
    wave.addEventListener('pointerdown', (e) => {
      if (!buf) return;
      e.preventDefault();
      const t = timeAt(e.clientX);
      const r = wave.getBoundingClientRect();
      const px = (s) => r.left + (s / buf.duration) * r.width;
      let which;
      if (e.target.classList.contains('a')) which = 'a';
      else if (e.target.classList.contains('b')) which = 'b';
      else which = Math.abs(e.clientX - px(selA)) < Math.abs(e.clientX - px(selB)) ? 'a' : 'b';
      const move = (ev) => {
        const x = timeAt(ev.clientX);
        if (which === 'a') selA = Math.min(x, selB - 0.05); else selB = Math.max(x, selA + 0.05);
        selA = Math.max(0, selA); selB = Math.min(buf.duration, selB);
        paintTimes(); drawWave();
      };
      move(e);
      void t;
      wave.setPointerCapture(e.pointerId);
      wave.onpointermove = move;
      wave.onpointerup = () => { wave.onpointermove = null; wave.onpointerup = null; if (src) play(); };
    });
    function paintTimes() {
      $('.cr-s', box).value = fmt(selA);
      $('.cr-e', box).value = fmt(selB);
      $('.cr-len', box).textContent = `${fmt(selB - selA)} kept`;
    }
    const fromField = (cls, which) => {
      const t = parseTime($(cls, box).value);
      if (!buf || !isFinite(t)) { paintTimes(); return; }
      if (which === 'a') selA = Math.max(0, Math.min(t, selB - 0.05)); else selB = Math.min(buf.duration, Math.max(t, selA + 0.05));
      paintTimes(); drawWave();
    };
    $('.cr-s', box).addEventListener('change', () => fromField('.cr-s', 'a'));
    $('.cr-e', box).addEventListener('change', () => fromField('.cr-e', 'b'));

    /* --- listening --- */
    function play() {
      stop();
      if (!buf) return;
      const c = audio();
      if (c.state === 'suspended') c.resume();
      const fi = +$('.cr-fi', box).value, fo = +$('.cr-fo', box).value;
      const len = selB - selA;
      const g = c.createGain();
      const t0 = c.currentTime + 0.02;
      g.gain.setValueAtTime(fi > 0 ? 0 : 1, t0);
      if (fi > 0) g.gain.linearRampToValueAtTime(1, t0 + Math.min(fi, len));
      if (fo > 0) { g.gain.setValueAtTime(1, t0 + Math.max(0, len - fo)); g.gain.linearRampToValueAtTime(0, t0 + len); }
      src = c.createBufferSource();
      src.buffer = buf;
      src.connect(g).connect(c.destination);
      src.start(t0, selA, len);
      playT0 = t0;
      src.onended = () => { if (src && src.buffer === buf) stop(); };
      $('.cr-play', box).innerHTML = ICON.stop;
      $('.cr-play', box).setAttribute('aria-label', 'Stop');
      const ph = $('.cr-ph', wave);
      ph.style.display = 'block';
      const tick = () => {
        if (!src) return;
        const t = selA + Math.max(0, ctx.currentTime - playT0);
        ph.style.left = `${(Math.min(t, selB) / buf.duration) * wave.clientWidth}px`;
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    function stop() {
      cancelAnimationFrame(raf);
      if (src) { const s = src; src = null; try { s.onended = null; s.stop(); } catch (e) { /* ended */ } }
      const b = $('.cr-play', box);
      if (b) { b.innerHTML = ICON.play; b.setAttribute('aria-label', 'Listen to the selection'); }
      const ph = $('.cr-ph', box);
      if (ph) ph.style.display = 'none';
    }
    $('.cr-play', box).onclick = () => (src ? stop() : play());

    /* --- saving --- */
    $('.cr-ok', box).onclick = async () => {
      if (!buf || v.dataset.busy) return;
      stop();
      const name = ($('.cr-n', box).value.trim() || 'Sound').slice(0, 80);
      const fi = +$('.cr-fi', box).value, fo = +$('.cr-fo', box).value;
      const whole = selA <= 0.01 && selB >= buf.duration - 0.01 && !fi && !fo;
      if (whole && original) {
        close();
        opts.onSave(new File([original.blob], original.fileName, { type: original.blob.type || 'audio/mpeg' }), { name, duration: buf.duration });
        return;
      }
      v.dataset.busy = '1';
      const ok = $('.cr-ok', box);
      ok.disabled = true;
      try {
        const blob = await encodeMp3(slice(buf, selA, selB, fi, fo), (p) => { ok.textContent = `Encoding ${Math.round(p * 100)}%`; });
        const fileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sound'}.mp3`;
        delete v.dataset.busy;
        close();
        opts.onSave(new File([blob], fileName, { type: 'audio/mpeg' }), { name, duration: selB - selA });
      } catch (e) {
        delete v.dataset.busy;
        ok.disabled = false;
        ok.textContent = cropOnly ? 'Keep this part' : `Add to ${zoneLabel}`;
        status(e.message || 'The sound could not be encoded.', true);
      }
    };

    if (cropOnly) useBlob(opts.sound.blob, opts.sound.fileName || opts.sound.name, true).then(() => { $('.cr-n', box).value = opts.sound.name; });
    else setTimeout(() => $('.cr-url input', box).focus(), 30);
  }

  window.BardicCrop = { open, youTubeId };
})();
