// Module tests, without network or server
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'playroom-units-'));
process.env.STEAM_API_KEY = 'SECRETSTEAMKEY1234567890ABCDEF00';
const { safeUrl, scrub, normTitle } = await import('../src/util.js');
const notes = await import('../src/notes.js');
const settings = await import('../src/settings.js');
const auth = await import('../src/auth.js');
const { mergeVersions } = await import('../src/connectors/playstation.js');
const nintendo = await import('../src/connectors/nintendo.js');
const { config } = await import('../src/config.js');

test('URLs lose their query string (API keys) in messages', () => {
  assert.equal(safeUrl('https://api.example.com/v1/x?key=SECRET&id=1'), 'https://api.example.com/v1/x');
  assert.ok(!scrub('error SECRETSTEAMKEY1234567890ABCDEF00 here').includes('SECRETSTEAMKEY'));
});

test('game ids: reserved JavaScript names are rejected', () => {
  for (const bad of ['__proto__', 'constructor', 'prototype', '', 'steam-' + 'x'.repeat(200), 'nope']) assert.equal(notes.validGameId(bad), false, bad);
  for (const ok of ['steam-1245620', 'psn-PPSA01234_00', 'nintendo-the-legend-of-zelda']) assert.equal(notes.validGameId(ok), true, ok);
  assert.throws(() => notes.saveNote('__proto__', { tier: 'S' }));
  assert.equal(Object.getPrototypeOf(notes.readNotes()), null);
});

test('notes: values are cleaned and bounded', () => {
  const n = notes.saveNote('steam-1', { tier: 'Z', rating: 12, status: 'hacked', review: 'x'.repeat(3000), cover: 'javascript:alert(1)' });
  assert.equal(n.tier, null);
  assert.equal(n.rating, 10);
  assert.equal(n.status, null);
  assert.equal(n.review.length, 2000);
  assert.equal(n.cover, null);
  assert.equal(notes.saveNote('steam-1', {}), null);
});

test('settings: formats checked, secrets never returned', () => {
  settings.loadSettings();
  assert.deepEqual(settings.updateSettings({ steamApiKey: 'not a key' }), ['steamApiKey']);
  assert.deepEqual(settings.updateSettings({ visibility: 'everyone' }), ['visibility']);
  assert.deepEqual(settings.updateSettings({ steamApiKey: 'ABCDEF0123456789ABCDEF0123456789', visibility: 'private' }), []);
  const pub = settings.publicSettings();
  assert.deepEqual(pub.steamApiKey, { set: true, hint: '…6789' });
  assert.equal(config.visibility, 'private');
  assert.ok(!JSON.stringify(pub).includes('ABCDEF0123456789ABCDEF0123456789'));
  const mode = fs.statSync(path.join(process.env.DATA_DIR, 'settings.json')).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('account: setup code, password, sessions', async () => {
  assert.equal(auth.hasAccount(), false);
  const code = auth.getSetupCode();
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(auth.checkSetupCode('AAAA-AAAA'), false);
  assert.equal(auth.checkSetupCode(code.toLowerCase()), true);
  await auth.createAccount('paul', 'correct-horse-battery');
  assert.equal(auth.getSetupCode(), null);
  await assert.rejects(auth.createAccount('someone', 'correct-horse-battery'));
  assert.ok(!fs.readFileSync(path.join(process.env.DATA_DIR, 'account.json'), 'utf8').includes('correct-horse-battery'));
  assert.equal(await auth.checkLogin('Paul', 'correct-horse-battery'), true);
  assert.equal(await auth.checkLogin('paul', 'wrong-password'), false);
  assert.equal(await auth.checkLogin('nobody', 'correct-horse-battery'), false);
  const s = auth.createSession();
  assert.equal(auth.checkSession(s), true);
  assert.equal(auth.checkSession('faux'), false);
  assert.ok(!fs.readFileSync(path.join(process.env.DATA_DIR, 'sessions.json'), 'utf8').includes(s));
  assert.equal(await auth.changePassword('wrong-password', 'another-long-password'), false);
  assert.equal(await auth.changePassword('correct-horse-battery', 'another-long-password'), true);
  assert.equal(auth.checkSession(s), false, 'changing the password closes every session');
  assert.equal(auth.validUsername('a'), false);
  assert.equal(auth.validPassword('short'), false);
});

test('PlayStation: PS4 and PS5 versions are merged', () => {
  const r = mergeVersions([
    { id: 'psn-A', title: 'Fall Guys', system: 'PS5', hours: 28, achievements: { unlocked: 20, total: 35, percent: 57 } },
    { id: 'psn-B', title: 'Fall Guys', system: 'PS4', hours: 28, achievements: { unlocked: 19, total: 35, percent: 54 } },
    { id: 'psn-C', title: 'Astro Bot', system: 'PS5', hours: 5 },
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].system, 'PS5 / PS4');
  assert.equal(r[0].achievements.unlocked, 20);
  assert.deepEqual(r[0].altIds, ['psn-B']);
});

test('Nintendo: add, duplicate, unknown console, delete', () => {
  const dir = process.env.DATA_DIR;
  const id = nintendo.upsertNintendo(dir, { title: 'Mario Kart World', system: 'Switch 2', hours: 31.5 });
  assert.equal(id, 'nintendo-mario-kart-world');
  assert.throws(() => nintendo.upsertNintendo(dir, { title: 'Mario Kart World' }), /already exists/);
  assert.throws(() => nintendo.upsertNintendo(dir, { title: 'X', system: 'PS9' }), /console/);
  assert.throws(() => nintendo.upsertNintendo(dir, { title: '™' }), /title/);
  nintendo.removeNintendo(dir, id);
  assert.equal(nintendo.syncNintendo(dir).games.some((g) => g.id === id), false);
  assert.equal(normTitle('Overwatch® 2'), 'overwatch 2');
});
