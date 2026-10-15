/* Bard account: the bard name that signs every .bardic file forged on this device.
 *
 * Nobody has to sign in. Until a bard connects a GitHub account, every story is signed
 * "Forgotten Barde". Connecting (GitHub's device sign-in, no permission asked) lets the bard
 * register a bard name once and for all; the Recueil only accepts that name from its owner.
 *
 * Shared by the web player, Bardic for iPhone, the Story builder and the Compagnie pages.
 * Saved in localStorage 'bardic.account': { token, login, id, name }.
 * The sign-in helper (a Cloudflare Worker, see auth-worker/) is named in auth/config.json.
 *
 *   BardAccount.name()        registered name, or "Forgotten Barde"
 *   BardAccount.mount(el)     draws the settings block into el
 *   event 'bardic:account'    fired on window when the account changes
 */
(function (global) {
  'use strict';
  const KEY = 'bardic.account';
  const FORGOTTEN = 'Forgotten Barde';
  const here = document.currentScript ? new URL('.', document.currentScript.src) : new URL('../auth/', location.href);
  let configP = null;

  function config() {
    if (!configP) {
      configP = fetch(new URL('config.json', here), { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))
        .then((c) => ({ worker: String(c.worker || '').replace(/\/+$/, '') }));
    }
    return configP;
  }

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  function write(a) {
    try {
      if (a && a.token) localStorage.setItem(KEY, JSON.stringify(a));
      else localStorage.removeItem(KEY);
    } catch (e) { /* private mode */ }
    global.dispatchEvent(new CustomEvent('bardic:account'));
  }
  const name = () => (read().name || '').trim() || FORGOTTEN;

  async function call(path, { method = 'GET', token, body } = {}) {
    const { worker } = await config();
    if (!worker) throw new Error('GitHub connection is not open yet.');
    const r = await fetch(worker + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    return { status: r.status, d };
  }

  /** Checks the saved connection with GitHub (a name registered on another device shows up here). */
  async function refresh() {
    const a = read();
    if (!a.token) return;
    try {
      const { status, d } = await call('/bard', { token: a.token });
      if (status === 401) { write(null); return; }
      if (status === 200 && (d.name !== (a.name || null) || d.login !== a.login)) write({ ...a, login: d.login, id: d.id, name: d.name || '' });
    } catch (e) { /* offline: keep what we have */ }
  }

  // ------------------------------------------------------------------ settings block

  const CSS = `
.bacc { display: grid; gap: 10px; }
.bacc .bacc-name { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.bacc .bacc-name b { font-family: 'Cormorant SC', serif; font-size: 24px; font-weight: 700; color: var(--text); line-height: 1.1; }
.bacc .bacc-name .tag { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; }
.bacc .bacc-name .tag.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
.bacc p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.45; }
.bacc p b { color: var(--text); font-weight: 600; }
.bacc .bacc-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.bacc button { font: inherit; font-size: 15px; font-weight: 600; height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.bacc button:hover { border-color: var(--muted); }
.bacc button.go { background: var(--accent); border-color: var(--accent); color: #15151B; }
.bacc button:disabled { opacity: .5; cursor: default; }
.bacc button.quiet { background: none; }
.bacc input { font: inherit; font-size: 16px; color: var(--text); background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; height: 38px; flex: 1 1 180px; min-width: 0; }
.bacc input:focus { outline: none; border-color: var(--accent); }
.bacc .code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 28px; letter-spacing: 4px; color: var(--text); background: var(--card); border: 1px dashed var(--line); border-radius: 12px; padding: 8px 16px; justify-self: start; user-select: all; }
.bacc .err { color: var(--evt, #E06A63); }
.bacc .fine { font-size: 13px; }
.bacc .wait::after { content: ''; display: inline-block; width: 1em; text-align: left; animation: bacc-dots 1.4s steps(4) infinite; }
@keyframes bacc-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
`;
  function style() {
    if (document.getElementById('bacc-style')) return;
    const s = document.createElement('style');
    s.id = 'bacc-style';
    s.textContent = CSS;
    document.head.append(s);
  }

  const GH = '<svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mount(box) {
    style();
    box.classList.add('bacc');
    // Local state of this block: the sign-in in progress, the name being registered.
    let flow = null; // { code, uri, deviceCode, interval, until, timer, error }
    let draft = '';
    let confirming = false;
    let busy = false;
    let error = '';
    let ready = false;
    let worker = '';

    const nameLine = (n, tag, on) => `<div class="bacc-name"><b>${esc(n)}</b><span class="tag${on ? ' on' : ''}">${tag}</span></div>`;

    function paint() {
      const a = read();
      if (!ready) { box.innerHTML = nameLine(name(), 'Signs your stories', false); return; }
      if (!worker) {
        box.innerHTML = `${nameLine(FORGOTTEN, 'Signs your stories', false)}
          <p>Every story forged here is signed <b>${FORGOTTEN}</b>.</p>
          <p class="fine">Connecting a GitHub account to register your own bard name opens soon.</p>`;
        return;
      }
      if (a.token && a.name) {
        box.innerHTML = `${nameLine(a.name, 'Registered', true)}
          <p>Your bard name, registered to the GitHub account <b>@${esc(a.login)}</b>. It signs every story you forge on this device, and only you can sign tales with it in the Recueil.</p>
          <div class="bacc-row"><button type="button" class="quiet" data-a="out">Disconnect GitHub</button></div>
          <p class="fine">Disconnecting signs your next stories ${FORGOTTEN} on this device. Your name stays yours: connect again to sign with it.</p>`;
        return;
      }
      if (a.token) {
        if (confirming) {
          box.innerHTML = `${nameLine(draft, 'Not registered yet', false)}
            <p>Register <b>${esc(draft)}</b> as your bard name for good? It can never be changed afterwards.</p>
            <div class="bacc-row"><button type="button" class="go" data-a="confirm"${busy ? ' disabled' : ''}>${busy ? 'Registering' : 'Register for good'}</button><button type="button" data-a="back"${busy ? ' disabled' : ''}>Change it</button></div>
            ${error ? `<p class="err">${esc(error)}</p>` : ''}`;
          return;
        }
        box.innerHTML = `${nameLine(FORGOTTEN, 'Signs your stories', false)}
          <p>Connected to GitHub as <b>@${esc(a.login)}</b>. Choose your bard name: until you register it, your stories stay signed ${FORGOTTEN}.</p>
          <div class="bacc-row"><input type="text" maxlength="40" autocomplete="nickname" enterkeyhint="done" placeholder="Your bard name" aria-label="Your bard name" value="${esc(draft)}"><button type="button" class="go" data-a="register">Register</button></div>
          ${error ? `<p class="err">${esc(error)}</p>` : ''}
          <p class="fine">A bard name is registered <b>once and for all</b>: you cannot change it later, and no other bard can ever take it. 2 to 40 characters: letters, digits, spaces, apostrophes and hyphens.</p>
          <div class="bacc-row"><button type="button" class="quiet" data-a="out">Disconnect GitHub</button></div>`;
        const input = box.querySelector('input');
        input.addEventListener('input', () => { draft = input.value; });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); act('register'); } });
        return;
      }
      if (flow) {
        box.innerHTML = `${nameLine(FORGOTTEN, 'Signs your stories', false)}
          <p>On GitHub, sign in if asked, then enter this code:</p>
          <div class="code">${esc(flow.code)}</div>
          <div class="bacc-row"><button type="button" class="go" data-a="open">${GH} Open GitHub</button><button type="button" data-a="copy">Copy the code</button><button type="button" class="quiet" data-a="cancel">Cancel</button></div>
          ${flow.error ? `<p class="err">${esc(flow.error)}</p>` : '<p class="wait">Waiting for GitHub</p>'}`;
        return;
      }
      box.innerHTML = `${nameLine(FORGOTTEN, 'Signs your stories', false)}
        <p>Every story you forge is signed <b>${FORGOTTEN}</b>. To sign with your own bard name, connect a GitHub account: it proves the name is yours, so no one else can sign a tale with it in the Recueil.</p>
        <div class="bacc-row"><button type="button" class="go" data-a="connect"${busy ? ' disabled' : ''}>${GH} Connect with GitHub</button></div>
        ${error ? `<p class="err">${esc(error)}</p>` : ''}
        <p class="fine">Optional and free. Bardic only reads your public GitHub username: no email, no access to your repositories. You can disconnect at any time.</p>`;
    }

    function stopFlow() {
      if (flow && flow.timer) clearTimeout(flow.timer);
      flow = null;
    }

    async function poll() {
      if (!flow) return;
      if (Date.now() > flow.until) { flow.error = 'The code has expired. Cancel and connect again.'; paint(); return; }
      try {
        const { d } = await call('/device/token', { method: 'POST', body: { device_code: flow.deviceCode } });
        if (!flow) return;
        if (d.status === 'ok' && d.token) {
          stopFlow();
          write({ token: d.token, login: d.login, id: d.id, name: d.name || '' });
          return;
        }
        if (d.status === 'slow_down') flow.interval += 5;
        else if (d.status === 'expired_token') { flow.error = 'The code has expired. Cancel and connect again.'; paint(); return; }
        else if (d.status === 'access_denied') { stopFlow(); error = 'The connection was cancelled on GitHub.'; paint(); return; }
      } catch (e) { /* a lost connection: try again */ }
      flow.timer = setTimeout(poll, flow.interval * 1000);
    }

    async function act(what) {
      error = '';
      const a = read();
      if (what === 'connect') {
        busy = true; paint();
        try {
          const { status, d } = await call('/device/code', { method: 'POST' });
          if (status !== 200 || !d.user_code) throw new Error(d.error || 'GitHub did not answer.');
          flow = { code: d.user_code, uri: d.verification_uri || 'https://github.com/login/device', deviceCode: d.device_code, interval: Math.max(5, d.interval || 5), until: Date.now() + (d.expires_in || 900) * 1000 };
          flow.timer = setTimeout(poll, flow.interval * 1000);
        } catch (e) {
          error = `${e.message || e} Check your connection and try again.`;
        }
        busy = false; paint();
      } else if (what === 'open' && flow) {
        try { navigator.clipboard && navigator.clipboard.writeText(flow.code); } catch (e) { /* no clipboard */ }
        global.open(flow.uri, '_blank', 'noopener');
      } else if (what === 'copy' && flow) {
        try { await navigator.clipboard.writeText(flow.code); box.querySelector('[data-a="copy"]').textContent = 'Copied'; } catch (e) { /* no clipboard */ }
      } else if (what === 'cancel') {
        stopFlow(); paint();
      } else if (what === 'register') {
        const input = box.querySelector('input');
        if (input) draft = input.value;
        draft = draft.replace(/\s+/g, ' ').trim();
        if (draft.length < 2) { error = 'A bard name has 2 to 40 characters.'; paint(); return; }
        confirming = true; paint();
      } else if (what === 'back') {
        confirming = false; paint();
      } else if (what === 'confirm') {
        busy = true; paint();
        try {
          const { status, d } = await call('/bard', { method: 'POST', token: a.token, body: { name: draft } });
          busy = false;
          if (status === 200 && d.name) { confirming = false; draft = ''; write({ ...a, name: d.name }); return; }
          if (status === 401) { confirming = false; write(null); error = 'Your GitHub connection has ended. Connect again.'; return; }
          if (status === 409 && d.name) { confirming = false; write({ ...a, name: d.name }); return; }
          confirming = false;
          error = d.error || 'The name could not be registered. Try again later.';
        } catch (e) {
          busy = false; confirming = false;
          error = 'Bardic could not reach GitHub. Check your connection and try again.';
        }
        paint();
      } else if (what === 'out') {
        stopFlow(); confirming = false; draft = '';
        write(null);
      }
    }

    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]');
      if (b && !b.disabled) act(b.dataset.a);
    });
    global.addEventListener('bardic:account', paint);
    global.addEventListener('storage', (e) => { if (e.key === KEY) paint(); });
    paint();
    config().then((c) => { worker = c.worker; ready = true; paint(); if (worker) refresh(); });
  }

  global.BardAccount = { FORGOTTEN, name, mount, refresh, config };
})(window);
