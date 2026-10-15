/*
 * Bardic auth: the small helper behind "Connect with GitHub" in Bardic's settings.
 *
 * GitHub's sign-in addresses cannot be called from a web page (no CORS), and someone has to hold
 * the key that writes the registry of bard names. This Cloudflare Worker does both, nothing more:
 *
 *   POST /device/code    starts GitHub's device sign-in (the bard types a code on github.com)
 *   POST /device/token   asks GitHub whether the bard has entered the code yet
 *   GET  /bard           who is this GitHub account, and which bard name does it own
 *   POST /bard           registers a bard name for this GitHub account, once and for all
 *
 * The sign-in asks for no GitHub permission: Bardic only learns the public username and id.
 * The registry is docs/recueil/bards.json in the Bardic repository, written with REGISTRY_TOKEN
 * (a fine-grained token limited to that repository's contents). The Recueil check reads it to
 * make sure only a name's owner can sign tales with it.
 *
 * Settings (wrangler.toml and secrets): CLIENT_ID, REPO, REGISTRY_PATH, ALLOWED_ORIGINS, REGISTRY_TOKEN.
 */

export const FORGOTTEN = 'Forgotten Barde';
const RESERVED = ['forgotten barde', 'forgotten bard', 'bardic', 'compagnie des bardes', 'compagnie', 'recueil', 'admin', 'administrator', 'moderator', 'github'];
const UA = 'bardic-auth';

/** Comparison key: case, accents, apostrophe styles and spacing do not make a different name. */
export function nameKey(name) {
  return String(name || '')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[’‘`´]/g, "'")
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Cleans a proposed name, or returns an error message. */
export function checkName(raw) {
  const name = String(raw || '').normalize('NFC').replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 40) return { error: 'A bard name has 2 to 40 characters.' };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '\-]*[\p{L}\p{N}]$/u.test(name)) {
    return { error: 'Use letters, digits, spaces, apostrophes and hyphens, starting and ending with a letter or digit.' };
  }
  if (/['\- ]{2,}/.test(name)) return { error: 'Leave a letter between two spaces, apostrophes or hyphens.' };
  if (RESERVED.includes(nameKey(name))) return { error: `“${name}” is kept for Bardic itself. Choose another name.` };
  return { name };
}

// ------------------------------------------------------------------ HTTP helpers

function cors(env, request) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

async function readJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

/** The GitHub account behind a sign-in token, or null. */
async function whoIs(token) {
  if (!token) return null;
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, login: u.login } : null;
}

// ------------------------------------------------------------------ registry (docs/recueil/bards.json)

function contentsUrl(env) {
  return `https://api.github.com/repos/${env.REPO}/contents/${env.REGISTRY_PATH}`;
}

const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const b64encode = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

async function readRegistry(env) {
  const r = await fetch(`${contentsUrl(env)}?ref=main`, {
    headers: { Authorization: `Bearer ${env.REGISTRY_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': UA },
  });
  if (r.status === 404) return { data: { version: 1, bards: [] }, sha: null };
  if (!r.ok) throw new Error(`registry read ${r.status}`);
  const f = await r.json();
  const data = JSON.parse(b64decode(f.content));
  if (!Array.isArray(data.bards)) data.bards = [];
  return { data, sha: f.sha };
}

async function writeRegistry(env, data, sha, message) {
  data.bards.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)));
  const body = {
    message,
    content: b64encode(JSON.stringify(data, null, 1) + '\n'),
    branch: 'main',
    committer: { name: 'Bardic registry', email: '41898282+github-actions[bot]@users.noreply.github.com' },
  };
  if (sha) body.sha = sha;
  const r = await fetch(contentsUrl(env), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${env.REGISTRY_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.status; // 200/201 written, 409/422 someone wrote first
}

const ownedBy = (data, user) => data.bards.find((b) => b.githubId === user.id) || null;

// ------------------------------------------------------------------ routes

async function deviceCode(env) {
  const r = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ client_id: env.CLIENT_ID, scope: '' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.device_code) return [{ error: 'GitHub did not answer. Try again in a moment.' }, 502];
  return [{
    device_code: d.device_code, user_code: d.user_code, verification_uri: d.verification_uri,
    expires_in: d.expires_in, interval: d.interval,
  }, 200];
}

async function deviceToken(env, body) {
  if (!body.device_code) return [{ error: 'missing device_code' }, 400];
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ client_id: env.CLIENT_ID, device_code: body.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
  });
  const d = await r.json().catch(() => ({}));
  if (d.access_token) {
    const user = await whoIs(d.access_token);
    if (!user) return [{ error: 'GitHub refused the sign-in.' }, 502];
    const { data } = await readRegistry(env);
    const mine = ownedBy(data, user);
    return [{ status: 'ok', token: d.access_token, login: user.login, id: user.id, name: mine ? mine.name : null }, 200];
  }
  // authorization_pending, slow_down, expired_token, access_denied
  return [{ status: d.error || 'error', interval: d.interval }, 200];
}

async function getBard(env, token) {
  const user = await whoIs(token);
  if (!user) return [{ error: 'signed-out' }, 401];
  const { data } = await readRegistry(env);
  const mine = ownedBy(data, user);
  return [{ login: user.login, id: user.id, name: mine ? mine.name : null }, 200];
}

async function registerBard(env, token, body) {
  const user = await whoIs(token);
  if (!user) return [{ error: 'Your GitHub connection has ended. Connect again.' }, 401];
  const checked = checkName(body.name);
  if (checked.error) return [{ error: checked.error }, 400];
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, sha } = await readRegistry(env);
    const mine = ownedBy(data, user);
    if (mine) return [{ error: `This GitHub account already owns the bard name “${mine.name}”.`, name: mine.name }, 409];
    const key = nameKey(checked.name);
    if (data.bards.some((b) => nameKey(b.name) === key)) return [{ error: `“${checked.name}” already belongs to another bard. Choose another name.` }, 409];
    data.bards.push({ name: checked.name, github: user.login, githubId: user.id, registered: new Date().toISOString().slice(0, 10) });
    const status = await writeRegistry(env, data, sha, `Register the bard name "${checked.name}" for @${user.login}`);
    if (status === 200 || status === 201) return [{ login: user.login, id: user.id, name: checked.name }, 200];
    if (status !== 409 && status !== 422) return [{ error: 'The registry could not be written. Try again later.' }, 502];
  }
  return [{ error: 'The registry is busy. Try again in a moment.' }, 503];
}

export default {
  async fetch(request, env) {
    const h = cors(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const origin = request.headers.get('Origin');
    if (origin && !h['Access-Control-Allow-Origin']) return json({ error: 'origin not allowed' }, 403, h);
    const { pathname } = new URL(request.url);
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    try {
      let out;
      if (pathname === '/device/code' && request.method === 'POST') out = await deviceCode(env);
      else if (pathname === '/device/token' && request.method === 'POST') out = await deviceToken(env, await readJson(request));
      else if (pathname === '/bard' && request.method === 'GET') out = await getBard(env, token);
      else if (pathname === '/bard' && request.method === 'POST') out = await registerBard(env, token, await readJson(request));
      else if (pathname === '/' && request.method === 'GET') out = [{ service: 'bardic-auth', ok: true }, 200];
      else out = [{ error: 'not found' }, 404];
      return json(out[0], out[1], h);
    } catch (e) {
      return json({ error: 'Something went wrong on the Bardic side. Try again later.' }, 500, h);
    }
  },
};
