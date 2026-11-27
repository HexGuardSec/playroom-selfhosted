// Tests against the real server: setup, sign-in, protections
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playroom-server-'));
let proc;
let logs = '';

before(async () => {
  proc = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dir, PRESENCE_INTERVAL_SECONDS: '0', SYNC_INTERVAL_HOURS: '0' },
  });
  proc.stdout.on('data', (d) => (logs += d));
  proc.stderr.on('data', (d) => (logs += d));
  for (let i = 0; i < 50 && !logs.includes('Listening on'); i++) await new Promise((r) => setTimeout(r, 100));
});
after(() => proc?.kill());

const post = (url, body, headers = {}) =>
  fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('security headers and hidden files', async () => {
  const res = await fetch(BASE + '/');
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/.env', '/%2e%2e/server.js', '/..%2fserver.js', '/missing.js']) assert.equal((await fetch(BASE + p)).status, 404, p);
});

test('fonts are served locally, nothing loads from Google', async () => {
  const res = await fetch(`${BASE}/fonts/barlow-400.woff`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'font/woff');
  const page = await fetch(`${BASE}/`);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /google|gstatic/);
  assert.doesNotMatch(await page.text(), /fonts\.googleapis|fonts\.gstatic/);
});

test('setup requires the code, then signs in with a cookie', async () => {
  const me = await (await fetch(BASE + '/api/me')).json();
  assert.equal(me.setup, true);
  assert.equal((await fetch(BASE + '/api/library')).status, 401);
  const code = logs.match(/[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];
  assert.ok(code, 'the setup code is in the logs');
  assert.equal((await post('/api/setup', { code: 'AAAA-AAAA', username: 'paul', password: 'correct-horse-battery' })).status, 403);
  assert.equal((await post('/api/setup', { code, username: 'paul', password: 'court' })).status, 400);
  const ok = await post('/api/setup', { code, username: 'paul', password: 'correct-horse-battery', settings: { visibility: 'public' } });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const session = cookie.split(';')[0];
  assert.equal((await post('/api/setup', { code, username: 'x', password: 'correct-horse-battery' })).status, 409);
  const settings = await (await fetch(BASE + '/api/settings', { headers: { Cookie: session } })).json();
  assert.equal(settings.visibility, 'public');
  assert.equal((await fetch(BASE + '/api/settings')).status, 401);
});

test('changes require a session and the same origin', async () => {
  const r = await fetch(BASE + '/api/notes/steam-1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 401);
  const login = await post('/api/login', { username: 'paul', password: 'correct-horse-battery' });
  const session = login.headers.get('set-cookie').split(';')[0];
  const evil = await fetch(BASE + '/api/notes/steam-1', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: session, Origin: 'https://evil.example' }, body: '{"tier":"S"}',
  });
  assert.equal(evil.status, 403);
  const good = await fetch(BASE + '/api/notes/steam-1', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: session }, body: '{"tier":"S"}' });
  assert.equal(good.status, 200);
  const proto = await fetch(BASE + '/api/notes/__proto__', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: session }, body: '{"tier":"S"}' });
  assert.equal(proto.status, 400);
});

test('brute force: blocked after 10 failures', async () => {
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await post('/api/login', { username: 'paul', password: 'wrong-password-here' })).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(401));
  assert.equal(codes[10], 429);
});

test('version and update status: owner only, never in demo, isNewer compares x.y.z', async () => {
  const anon = await (await fetch(BASE + '/api/me')).json();
  assert.equal(anon.update, undefined, 'visitors do not see the version');
  const { isNewer } = await import('../src/updates.js');
  assert.equal(isNewer('2.0.10', '2.0.9'), true);
  assert.equal(isNewer('2.1.0', '2.0.3'), true);
  assert.equal(isNewer('2.0.3', '2.0.3'), false);
  assert.equal(isNewer('1.9.9', '2.0.0'), false);
});
