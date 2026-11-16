// Configuration: loads the optional .env file (no external dependency)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const bool = (k, d = false) => {
  const v = env(k, d ? 'true' : 'false').toLowerCase();
  return ['1', 'true', 'yes', 'oui', 'on'].includes(v);
};

export const config = {
  port: Number(env('PORT', '8080')),
  host: env('HOST', '0.0.0.0'),
  dataDir: path.resolve(ROOT, env('DATA_DIR', 'data')),
  museumName: env('MUSEUM_NAME', 'Playroom'),
  syncIntervalHours: Number(env('SYNC_INTERVAL_HOURS', '6')),
  syncOnStart: bool('SYNC_ON_START', true),
  // "Now playing" check every X seconds (0 = disabled)
  presenceIntervalSec: Number(env('PRESENCE_INTERVAL_SECONDS', '120')),
  // Behind a reverse proxy (Nginx, Caddy, Traefik): trust X-Forwarded-For / X-Forwarded-Proto
  trustProxy: bool('TRUST_PROXY', false),
  // Collection visible without signing in (can be changed later in Settings)
  visibility: env('VISIBILITY', 'public') === 'private' ? 'private' : 'public',
  demo: bool('DEMO', false),

  steam: {
    apiKey: env('STEAM_API_KEY'),
    steamId: env('STEAM_ID'),
    includeFreeGames: bool('STEAM_INCLUDE_FREE_GAMES', true),
    hideNeverPlayed: bool('STEAM_HIDE_NEVER_PLAYED', false),
  },
  psn: {
    npsso: env('PSN_NPSSO'),
  },
  xbox: {
    openxblKey: env('OPENXBL_API_KEY'),
    // Xbox playtime costs one request per game: capped to respect the OpenXBL quota
    playtimeMaxTitles: Number(env('XBOX_PLAYTIME_MAX_TITLES', '40')),
  },
  igdb: {
    clientId: env('IGDB_CLIENT_ID'),
    clientSecret: env('IGDB_CLIENT_SECRET'),
  },
};

// Values that must never appear in a log or a response (recomputed when keys change)
Object.defineProperty(config, 'secrets', {
  get: () => [config.steam.apiKey, config.psn.npsso, config.xbox.openxblKey, config.igdb.clientSecret].filter((s) => s && s.length >= 8),
});
