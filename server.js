// HTTP server: serves the site, exposes the API and runs the periodic sync
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, ROOT } from './src/config.js';
import * as auth from './src/auth.js';
import { loadSettings, updateSettings, publicSettings, newWidgetKey } from './src/settings.js';
import { runSync, readLibrary, isSyncing, computeStats, refreshNintendo } from './src/sync.js';
import { upsertNintendo, removeNintendo, ensureNintendoFile } from './src/connectors/nintendo.js';
import { log, scrub } from './src/util.js';
import { searchIgdb } from './src/connectors/igdb.js';
import { readHistory, activityPayload } from './src/history.js';
import { readNotes, saveNote, splitHidden, validGameId } from './src/notes.js';
import { getPresence, pollPresence, setPresence } from './src/presence.js';
import { demoNotes, demoPresence } from './src/demo.js';

const PUBLIC = path.join(ROOT, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

// ---------- Security headers ----------
// CSP: only the site's own scripts run; images over https (platform covers); Google Fonts.
// style="" attributes carry the platform colours, hence 'unsafe-inline' for styles only.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' https: data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}
const json = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
/** API error: a stable code (translated by the front end) and a readable message */
const fail = (res, status, code, message) => json(res, status, { error: code, message });

class BadRequest extends Error {}

function readBody(req, limit = 16_000) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return reject(new BadRequest('JSON body expected'));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new BadRequest('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
        resolve(data);
      } catch {
        reject(new BadRequest('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------- Authentication ----------
const COOKIE = 'playroom_session';

function clientIp(req) {
  if (config.trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}
const isHttps = (req) => req.socket.encrypted || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
function setSessionCookie(req, res, token) {
  const maxAge = token ? auth.SESSION_DAYS * 86400 : 0;
  // HttpOnly: unreadable from JavaScript. SameSite=Strict: never sent by another site.
  const parts = [`${COOKIE}=${token || ''}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
const loggedIn = (req) => auth.checkSession(readCookie(req, COOKIE));

// Brute-force protection: 10 failures (password or setup code) within 15 minutes block the IP address
const FAIL_WINDOW = 15 * 60_000;
const FAIL_MAX = 10;
const failures = new Map();
function isBlocked(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.since > FAIL_WINDOW) {
    failures.delete(ip);
    return false;
  }
  return f.count >= FAIL_MAX;
}
function recordFailure(ip) {
  const f = failures.get(ip) || { count: 0, since: Date.now() };
  f.count++;
  failures.set(ip, f);
  if (f.count === FAIL_MAX) log('http', `Too many failed attempts from ${ip}: blocked for 15 minutes`);
}
setInterval(() => {
  for (const [ip, f] of failures) if (Date.now() - f.since > FAIL_WINDOW) failures.delete(ip);
}, FAIL_WINDOW).unref();

/** A request that changes something must come from this site (CSRF protection on top of the SameSite cookie) */
function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Owner only. Sends the error response itself and returns false when refused. */
function requireOwner(req, res) {
  if (config.demo) {
    fail(res, 400, 'demo', 'Not available in demo mode');
    return false;
  }
  if (req.method !== 'GET' && !sameOrigin(req)) {
    fail(res, 403, 'origin', 'Request refused: it did not come from this site');
    return false;
  }
  if (!loggedIn(req)) {
    fail(res, 401, 'auth', 'Sign-in required');
    return false;
  }
  return true;
}

/** Reading data: open when the collection is public, owner only otherwise */
function canRead(req, res) {
  if (config.demo || (config.visibility === 'public' && auth.hasAccount()) || loggedIn(req)) return true;
  fail(res, 401, auth.hasAccount() ? 'private' : 'setup', 'Sign-in required');
  return false;
}

// ---------- Static files ----------
function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  // No hidden files (.env, .git…) and no escaping the public folder
  if (rel.includes('\0') || rel.split('/').some((part) => part.startsWith('.'))) return send(res, 404, 'Not found');
  let file = path.join(PUBLIC, rel);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Not found');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // Unknown path: serve the app (hash-based routing), except for a missing file
    if (path.extname(rel)) return send(res, 404, 'Not found');
    // The page uses relative URLs: any other path goes back to the root
    if (pathname !== '/') return send(res, 302, '', { Location: '/' });
    file = path.join(PUBLIC, 'index.html');
  }
  const ext = path.extname(file);
  // The browser keeps a copy but revalidates it every time (304 when unchanged)
  const st = fs.statSync(file);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
  if (req.headers['if-none-match'] === etag) return send(res, 304, '', headers);
  send(res, 200, fs.readFileSync(file), headers);
}

// ---------- Public data ----------
function publicLibrary(owner) {
  const lib = readLibrary();
  if (!lib) return null;
  const notes = readNotes();
  const { visible, hidden } = splitHidden(lib.games, notes);
  return {
    ...lib,
    games: visible,
    stats: computeStats(visible),
    // Hidden games are only listed for the owner
    hiddenGames: !owner ? [] : hidden.map((g) => ({ id: g.id, title: g.title, platform: g.platform, system: g.system, cover: g.cover })),
    notes,
    syncing: isSyncing(),
    museumName: config.museumName,
    igdbEnabled: Boolean(config.igdb.clientId && config.igdb.clientSecret),
  };
}

function widget() {
  const lib = readLibrary();
  const pres = getPresence();
  const playing = pres.playing?.[0] || null;
  const online = Object.values(pres.online || {}).some(Boolean);
  const st = lib ? computeStats(splitHidden(lib.games).visible) : {};
  return {
    name: lib?.museumName ?? config.museumName,
    games: st.games ?? 0,
    hours: Math.round(st.hours ?? 0),
    achievements: st.achievements ?? 0,
    completed: st.completed ?? 0,
    platinums: st.platinums ?? 0,
    status: playing ? `In game: ${playing.title}` : online ? 'Online' : 'Offline',
    playing: playing?.title ?? '',
    updatedAt: lib?.generatedAt ?? null,
  };
}

// ---------- Routes ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const m = req.method;

  if (pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

  if (pathname.startsWith('/api/')) {
    // ----- Account -----
    if (m === 'GET' && pathname === '/api/me') {
      const user = !config.demo && loggedIn(req) ? auth.readAccount()?.username ?? null : null;
      const setup = !config.demo && !auth.hasAccount();
      // During setup: which keys the .env file already provides (booleans only)
      const configured = setup ? Object.fromEntries(Object.entries(publicSettings()).filter(([, v]) => v?.set !== undefined).map(([k, v]) => [k, v.set])) : undefined;
      return json(res, 200, { setup, user, demo: config.demo, visibility: config.visibility, configured });
    }
    if (m === 'POST' && (pathname === '/api/setup' || pathname === '/api/login')) {
      const ip = clientIp(req);
      if (config.demo) return fail(res, 400, 'demo', 'No account in demo mode');
      if (!sameOrigin(req)) return fail(res, 403, 'origin', 'Request refused');
      if (isBlocked(ip)) return fail(res, 429, 'rate', 'Too many failed attempts. Try again in 15 minutes.');
      const body = await readBody(req);
      if (pathname === '/api/setup') {
        if (auth.hasAccount()) return fail(res, 409, 'exists', 'An account already exists');
        if (!auth.checkSetupCode(body.code)) {
          recordFailure(ip);
          return fail(res, 403, 'setupCode', 'Wrong setup code');
        }
        if (!auth.validUsername(body.username)) return fail(res, 400, 'username', 'Invalid username');
        if (!auth.validPassword(body.password)) return fail(res, 400, 'password', 'Password too short');
        const invalid = updateSettings(body.settings || {});
        if (invalid.length) return json(res, 400, { error: 'fields', fields: invalid });
        await auth.createAccount(body.username, body.password);
        log('http', `Account "${body.username}" created`);
        runSync().catch((e) => log('sync', e.message));
      } else if (!(await auth.checkLogin(body.username, body.password))) {
        recordFailure(ip);
        return fail(res, 401, 'login', 'Wrong username or password');
      }
      failures.delete(ip);
      setSessionCookie(req, res, auth.createSession());
      return json(res, 200, { ok: true });
    }
    if (m === 'POST' && pathname === '/api/logout') {
      if (!sameOrigin(req)) return fail(res, 403, 'origin', 'Request refused');
      auth.endSession(readCookie(req, COOKIE));
      setSessionCookie(req, res, null);
      return json(res, 200, { ok: true });
    }
    if (pathname === '/api/settings' && (m === 'GET' || m === 'PUT')) {
      if (!requireOwner(req, res)) return;
      if (m === 'PUT') {
        const invalid = updateSettings(await readBody(req));
        if (invalid.length) return json(res, 400, { error: 'fields', fields: invalid });
      }
      return json(res, 200, publicSettings());
    }
    if (m === 'POST' && pathname === '/api/settings/widget-key') {
      if (!requireOwner(req, res)) return;
      return json(res, 200, { widgetKey: newWidgetKey() });
    }
    if (m === 'PUT' && pathname === '/api/password') {
      if (!requireOwner(req, res)) return;
      const ip = clientIp(req);
      if (isBlocked(ip)) return fail(res, 429, 'rate', 'Too many failed attempts. Try again in 15 minutes.');
      const body = await readBody(req);
      if (!auth.validPassword(body.next)) return fail(res, 400, 'password', 'New password too short');
      if (!(await auth.changePassword(body.current, body.next))) {
        recordFailure(ip);
        return fail(res, 403, 'login', 'Current password is wrong');
      }
      setSessionCookie(req, res, auth.createSession());
      return json(res, 200, { ok: true });
    }

    // ----- Data (public or private, depending on the setting) -----
    // Flat summary for dashboards (Homepage, Homarr…). Private collection: add ?key=<widget key from Settings>
    if (m === 'GET' && pathname === '/api/widget') {
      const key = url.searchParams.get('key') || '';
      const keyOk = key && config.widgetKey && key.length === config.widgetKey.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(config.widgetKey));
      if (!keyOk && !canRead(req, res)) return;
      return json(res, 200, widget());
    }
    if (m === 'GET' && ['/api/library', '/api/status', '/api/activity', '/api/presence'].includes(pathname) && !canRead(req, res)) return;
    if (m === 'GET' && pathname === '/api/library') {
      const lib = publicLibrary(loggedIn(req));
      return lib ? json(res, 200, lib) : json(res, 503, { error: 'syncing', syncing: isSyncing() });
    }
    if (m === 'GET' && pathname === '/api/status') {
      const lib = readLibrary();
      return json(res, 200, { syncing: isSyncing(), generatedAt: lib?.generatedAt ?? null, platforms: lib?.platforms ?? {} });
    }
    if (m === 'GET' && pathname === '/api/activity') return json(res, 200, activityPayload(readHistory()));
    if (m === 'GET' && pathname === '/api/presence') return json(res, 200, getPresence());

    if (m === 'POST' && pathname === '/api/sync') {
      if (!requireOwner(req, res)) return;
      runSync().catch((e) => log('sync', e.message));
      return json(res, 202, { started: true });
    }

    // Manual cover choice: IGDB candidates for a title
    if (m === 'GET' && pathname === '/api/covers') {
      if (!requireOwner(req, res)) return;
      if (!config.igdb.clientId || !config.igdb.clientSecret) return fail(res, 400, 'igdbOff', 'IGDB is not configured');
      const q = (url.searchParams.get('q') || '').slice(0, 120).trim();
      if (!q) return fail(res, 400, 'invalid', 'Missing title');
      try {
        return json(res, 200, { results: await searchIgdb(q, (url.searchParams.get('system') || '').slice(0, 40), config.igdb, 18) });
      } catch (e) {
        log('igdb', e.message);
        return fail(res, 502, 'igdb', 'IGDB search is unavailable right now');
      }
    }

    const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (m === 'PUT' && noteMatch) {
      if (!requireOwner(req, res)) return;
      const id = decodeURIComponent(noteMatch[1]);
      if (!validGameId(id)) return fail(res, 400, 'invalid', 'Invalid game id');
      try {
        return json(res, 200, { note: saveNote(id, await readBody(req)) });
      } catch {
        return fail(res, 400, 'invalid', 'Invalid note');
      }
    }

    // Nintendo games entered from the site
    const ninMatch = pathname.match(/^\/api\/nintendo(?:\/([^/]+))?$/);
    if (ninMatch && ['POST', 'PUT', 'DELETE'].includes(m)) {
      if (!requireOwner(req, res)) return;
      const oldId = ninMatch[1] ? decodeURIComponent(ninMatch[1]) : null;
      if ((m === 'POST') === Boolean(oldId) || (oldId && !validGameId(oldId))) return fail(res, 400, 'invalid', 'Missing or invalid game');
      try {
        let id = null;
        if (m === 'DELETE') removeNintendo(config.dataDir, oldId);
        else id = upsertNintendo(config.dataDir, await readBody(req), oldId);
        await refreshNintendo();
        return json(res, 200, { id });
      } catch (e) {
        return /already exists/.test(e.message)
          ? fail(res, 400, 'exists', 'A game with this title already exists')
          : fail(res, 400, 'invalid', 'Invalid game');
      }
    }

    return fail(res, 404, 'notFound', 'Unknown endpoint');
  }

  if (m !== 'GET' && m !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  return serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (e instanceof BadRequest) return fail(res, 400, 'invalid', 'Invalid request');
    log('http', e);
    if (!res.headersSent) fail(res, 500, 'server', 'Internal error');
  });
});
// Drop slow or abandoned connections
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

// ---------- Startup ----------
fs.mkdirSync(config.dataDir, { recursive: true });
if (!config.demo) {
  ensureNintendoFile(config.dataDir);
  loadSettings();
  if (!auth.hasAccount()) {
    log('http', '================================================================');
    log('http', `No account yet. Open the site and create yours with this setup code: ${auth.getSetupCode()}`);
    log('http', '================================================================');
  }
}

server.listen(config.port, config.host, () => {
  log('http', `Listening on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}${config.demo ? ' (demo mode)' : ''}`);
  const active = [
    config.steam.apiKey && 'Steam', config.psn.npsso && 'PlayStation', config.xbox.openxblKey && 'Xbox', 'Nintendo (manual)',
    config.igdb.clientId && 'IGDB',
  ].filter(Boolean);
  if (!config.demo) log('http', `Sources: ${active.join(', ')}`);
});

const firstSync = config.syncOnStart || !readLibrary() ? runSync().catch((e) => log('sync', e.message)) : Promise.resolve();

// "Now playing"
if (config.demo) {
  firstSync.then(() => {
    setPresence(demoPresence(readLibrary()?.games ?? []));
    if (!fs.existsSync(path.join(config.dataDir, 'notes.json'))) {
      fs.writeFileSync(path.join(config.dataDir, 'notes.json'), JSON.stringify(demoNotes(), null, 2));
    }
  });
} else if (config.presenceIntervalSec > 0) {
  const tick = () => pollPresence(readLibrary()?.games ?? []).catch((e) => log('presence', scrub(e.message)));
  firstSync.then(tick);
  setInterval(tick, Math.max(30, config.presenceIntervalSec) * 1000).unref();
}
if (config.syncIntervalHours > 0) {
  setInterval(() => runSync().catch((e) => log('sync', e.message)), config.syncIntervalHours * 3600_000).unref();
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
