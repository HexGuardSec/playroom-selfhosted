// Owner account: one account per installation.
// Password hashed with scrypt (never stored in clear text), sessions use a random cookie.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const PASSWORD_MIN = 10;
export const SESSION_DAYS = 30;
const MAX_SESSIONS = 20;

const accountFile = () => path.join(config.dataDir, 'account.json');
const sessionsFile = () => path.join(config.dataDir, 'sessions.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}

export const readAccount = () => readJson(accountFile(), null);
export const hasAccount = () => Boolean(readAccount()?.passwordHash);

// ---------- Setup code ----------
// Until an account exists, this code (printed in the server logs) is required to create one:
// without it, whoever opened the site first could take over the installation.
let setupCode = null;
export function getSetupCode() {
  if (hasAccount()) return null;
  if (!setupCode) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const pick = () => Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join('');
    setupCode = `${pick()}-${pick()}`;
  }
  return setupCode;
}
export function checkSetupCode(code) {
  const expected = getSetupCode();
  if (!expected || typeof code !== 'string') return false;
  const a = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- Credentials ----------
export function validUsername(u) {
  return typeof u === 'string' && /^[\p{L}\p{N}._-]{3,32}$/u.test(u);
}
export function validPassword(p) {
  return typeof p === 'string' && p.length >= PASSWORD_MIN && p.length <= 200;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize('NFC'), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [algo, N, r, p, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = await scrypt(String(password).normalize('NFC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(got, expected);
}

// Dummy hash: an unknown username takes as long as a wrong password
let dummyHash = null;

export async function createAccount(username, password) {
  if (hasAccount()) throw new Error('An account already exists');
  writeJson(accountFile(), { username, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() });
  setupCode = null;
}

export async function checkLogin(username, password) {
  const acc = readAccount();
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  const ok = await verifyPassword(password, acc?.passwordHash || dummyHash);
  const sameUser = acc && typeof username === 'string' && username.toLowerCase() === acc.username.toLowerCase();
  return Boolean(ok && sameUser);
}

export async function changePassword(current, next) {
  const acc = readAccount();
  if (!acc || !(await verifyPassword(current, acc.passwordHash))) return false;
  acc.passwordHash = await hashPassword(next);
  acc.passwordChangedAt = new Date().toISOString();
  writeJson(accountFile(), acc);
  // Every open session is closed: all devices must sign in again
  writeJson(sessionsFile(), []);
  return true;
}

// ---------- Sessions ----------
// Only a hash of each session token is stored: a stolen sessions.json cannot be used to sign in.
const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');
const liveSessions = () => readJson(sessionsFile(), []).filter((s) => s.expires > Date.now());

export function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  const sessions = liveSessions().slice(-(MAX_SESSIONS - 1));
  sessions.push({ id: digest(token), created: Date.now(), expires: Date.now() + SESSION_DAYS * 86400_000 });
  writeJson(sessionsFile(), sessions);
  return token;
}

export function checkSession(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return false;
  const id = digest(token);
  return liveSessions().some((s) => s.id === id);
}

export function endSession(token) {
  if (!token) return;
  const id = digest(token);
  writeJson(sessionsFile(), liveSessions().filter((s) => s.id !== id));
}
