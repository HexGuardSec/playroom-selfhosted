// Settings entered from the site (API keys, name, visibility), stored in data/settings.json.
// They override the optional .env file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const file = () => path.join(config.dataDir, 'settings.json');

// Editable fields: getter, setter, type and format
export const FIELDS = {
  museumName: { get: () => config.museumName, set: (v) => (config.museumName = v), type: 'text', max: 60 },
  visibility: { get: () => config.visibility, set: (v) => (config.visibility = v), type: 'enum', values: ['public', 'private'] },
  steamApiKey: { get: () => config.steam.apiKey, set: (v) => (config.steam.apiKey = v), type: 'secret', pattern: /^[A-F0-9]{32}$/i },
  steamId: { get: () => config.steam.steamId, set: (v) => (config.steam.steamId = v), type: 'text', max: 120 },
  psnNpsso: { get: () => config.psn.npsso, set: (v) => (config.psn.npsso = v), type: 'secret', pattern: /^[A-Za-z0-9]{64}$/ },
  openxblKey: { get: () => config.xbox.openxblKey, set: (v) => (config.xbox.openxblKey = v), type: 'secret', pattern: /^[\w-]{20,100}$/ },
  igdbClientId: { get: () => config.igdb.clientId, set: (v) => (config.igdb.clientId = v), type: 'text', max: 60, pattern: /^[a-z0-9]{20,40}$/i },
  igdbClientSecret: { get: () => config.igdb.clientSecret, set: (v) => (config.igdb.clientSecret = v), type: 'secret', pattern: /^[a-z0-9]{20,40}$/i },
};

function readFile() {
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeFile(data) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${file()}.tmp`;
  // Readable by the server user only: it contains API keys
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file());
}

/** At startup: values saved from the site take precedence over .env */
export function loadSettings() {
  const data = readFile();
  for (const [key, f] of Object.entries(FIELDS)) if (typeof data[key] === 'string') f.set(data[key]);
  if (!data.widgetKey) {
    data.widgetKey = crypto.randomBytes(18).toString('base64url');
    writeFile(data);
  }
  config.widgetKey = data.widgetKey;
}

/**
 * Applies a partial update. For each field:
 * missing = unchanged, empty string = cleared, value = replaced (after a format check).
 * Returns the list of rejected fields.
 */
export function updateSettings(input = {}) {
  const data = readFile();
  const invalid = [];
  const next = {};
  for (const [key, f] of Object.entries(FIELDS)) {
    if (!(key in input)) continue;
    const raw = input[key];
    if (raw !== '' && typeof raw !== 'string') {
      invalid.push(key);
      continue;
    }
    const v = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    const ok =
      v === '' ? f.type !== 'enum' && key !== 'museumName'
      : f.type === 'enum' ? f.values.includes(v)
      : (!f.max || v.length <= f.max) && (!f.pattern || f.pattern.test(v));
    if (!ok) invalid.push(key);
    else next[key] = v;
  }
  if (invalid.length) return invalid;
  for (const [key, v] of Object.entries(next)) {
    data[key] = v;
    FIELDS[key].set(v);
  }
  writeFile(data);
  return [];
}

export function newWidgetKey() {
  const data = readFile();
  data.widgetKey = crypto.randomBytes(18).toString('base64url');
  writeFile(data);
  config.widgetKey = data.widgetKey;
  return data.widgetKey;
}

/** Safe view of the settings: secrets are never returned, only "set" and their last 4 characters */
export function publicSettings() {
  const out = {};
  for (const [key, f] of Object.entries(FIELDS)) {
    const v = f.get() || '';
    out[key] = f.type === 'secret' ? { set: Boolean(v), hint: v ? `…${v.slice(-4)}` : '' } : v;
  }
  out.widgetKey = config.widgetKey;
  return out;
}
