// Tests the worker against a fake GitHub (node --test auth-worker/test/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { checkName, nameKey } from '../src/index.js';

const env = {
  CLIENT_ID: 'cid', REPO: 'o/r', REGISTRY_PATH: 'docs/recueil/bards.json',
  ALLOWED_ORIGINS: 'https://arthurvangeersdaele.github.io', REGISTRY_TOKEN: 'reg',
};
const ORIGIN = 'https://arthurvangeersdaele.github.io';
const USERS = { tA: { id: 1, login: 'alice' }, tB: { id: 2, login: 'bob' } };
let registry; let sha; let pendingPolls; let writes;

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(s, 'base64').toString('utf8');

beforeEach(() => {
  registry = { version: 1, bards: [] }; sha = 's1'; pendingPolls = 1; writes = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const auth = (init.headers && init.headers.Authorization) || '';
    const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u === 'https://github.com/login/device/code') {
      assert.equal(new URLSearchParams(init.body).get('client_id'), 'cid');
      return res(200, { device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 });
    }
    if (u === 'https://github.com/login/oauth/access_token') {
      if (pendingPolls-- > 0) return res(200, { error: 'authorization_pending' });
      return res(200, { access_token: 'tA', token_type: 'bearer' });
    }
    if (u === 'https://api.github.com/user') {
      const user = USERS[auth.replace('Bearer ', '')];
      return user ? res(200, user) : res(401, { message: 'Bad credentials' });
    }
    if (u.startsWith('https://api.github.com/repos/o/r/contents/docs/recueil/bards.json')) {
      assert.equal(auth, 'Bearer reg');
      if ((init.method || 'GET') === 'GET') return res(200, { sha, content: b64(JSON.stringify(registry)) });
      const body = JSON.parse(init.body);
      if (body.sha !== sha) return res(409, { message: 'conflict' });
      registry = JSON.parse(unb64(body.content)); sha = `s${++writes + 1}`;
      return res(200, { content: { sha } });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
});

const call = (path, { method = 'GET', token, body, origin = ORIGIN } = {}) => worker.fetch(new Request(`https://w.example${path}`, {
  method,
  headers: { ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), env);

test('name rules', () => {
  assert.equal(checkName('  Arthur   the  Resonant ').name, 'Arthur the Resonant');
  assert.equal(checkName("D’Artagnan").name, "D'Artagnan");
  assert.ok(checkName('A').error);
  assert.ok(checkName('x'.repeat(41)).error);
  assert.ok(checkName('-Arthur').error);
  assert.ok(checkName('Ar--thur').error);
  assert.ok(checkName('<script>').error);
  assert.ok(checkName('Forgotten Barde').error);
  assert.ok(checkName('forgötten  BARDE').error);
  assert.ok(checkName('Bardic').error);
  assert.equal(checkName('Élodie la Brave').name, 'Élodie la Brave');
  assert.equal(nameKey('Élodie  LA brave'), nameKey('elodie la Brave'));
});

test('device sign-in, then register once and for all', async () => {
  let r = await call('/device/code', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await r.json()).user_code, 'ABCD-1234');

  r = await call('/device/token', { method: 'POST', body: { device_code: 'dc' } });
  assert.equal((await r.json()).status, 'authorization_pending');
  r = await call('/device/token', { method: 'POST', body: { device_code: 'dc' } });
  const ok = await r.json();
  assert.deepEqual([ok.status, ok.token, ok.login, ok.name], ['ok', 'tA', 'alice', null]);

  r = await call('/bard', { method: 'POST', token: 'tA', body: { name: 'Alice the Bold' } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).name, 'Alice the Bold');
  assert.equal(registry.bards.length, 1);
  assert.equal(registry.bards[0].githubId, 1);

  // Once and for all: a second name is refused.
  r = await call('/bard', { method: 'POST', token: 'tA', body: { name: 'Alice Again' } });
  assert.equal(r.status, 409);
  // Nobody else can take it, whatever the case or accents.
  r = await call('/bard', { method: 'POST', token: 'tB', body: { name: 'alice THE bold' } });
  assert.equal(r.status, 409);
  assert.equal(registry.bards.length, 1);

  // Another device: GET /bard gives the name back.
  r = await call('/bard', { token: 'tA' });
  assert.equal((await r.json()).name, 'Alice the Bold');
  r = await call('/bard', { token: 'tB' });
  assert.equal((await r.json()).name, null);
});

test('says why GitHub refused', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).endsWith('/device/code')
    ? new Response(JSON.stringify({ error: 'device_flow_disabled' }), { status: 400 }) : real(url, init));
  const r = await call('/device/code', { method: 'POST' });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /Device Flow is not enabled/);
});

test('refuses strangers and bad tokens', async () => {
  let r = await call('/bard', { token: 'nope' });
  assert.equal(r.status, 401);
  r = await call('/device/code', { method: 'POST', origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  // The Android app sends no Origin: allowed.
  r = await call('/device/code', { method: 'POST', origin: null });
  assert.equal(r.status, 200);
  r = await call('/bard', { method: 'POST', token: 'tB', body: { name: 'B' } });
  assert.equal(r.status, 400);
});

test('a concurrent write is retried on the fresh registry', async () => {
  const real = globalThis.fetch;
  let raced = false;
  globalThis.fetch = async (url, init = {}) => {
    if (!raced && String(url).includes('/contents/') && init.method === 'PUT') {
      raced = true;
      registry.bards.push({ name: 'Bob', github: 'bob', githubId: 2, registered: '2026-10-15' });
      sha = 'other';
    }
    return real(url, init);
  };
  const r = await call('/bard', { method: 'POST', token: 'tA', body: { name: 'Alice' } });
  assert.equal(r.status, 200);
  assert.deepEqual(registry.bards.map((b) => b.name), ['Alice', 'Bob']);
});
