// New-version check: once a day, the server asks GitHub for the latest Playroom release.
// The request carries no data about you or your collection (only the usual HTTP headers),
// and the answer is only shown to the signed-in owner. Disable it with UPDATE_CHECK=false.
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { log } from './util.js';

export const CURRENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const RELEASES = 'https://github.com/HexGuardSec/playroom-selfhosted/releases';
const API = 'https://api.github.com/repos/HexGuardSec/playroom-selfhosted/releases/latest';

let latest = null;

/** true if version a is newer than b (x.y.z). */
export function isNewer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

export async function checkForUpdate(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Playroom/${CURRENT}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tag = String((await res.json()).tag_name || '').replace(/^v/, '');
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(tag)) throw new Error('unexpected tag');
    latest = tag;
  } catch (e) {
    log('update', `Update check failed: ${e.message}`);
  }
  return latest;
}

export function updateInfo() {
  return {
    current: CURRENT,
    enabled: config.updateCheck && !config.demo,
    latest,
    available: Boolean(latest && isNewer(latest, CURRENT)),
    url: latest ? `${RELEASES}/tag/v${latest}` : RELEASES,
  };
}

export function startUpdateCheck() {
  if (!config.updateCheck || config.demo) return;
  setTimeout(() => checkForUpdate(), 60_000).unref();
  setInterval(() => checkForUpdate(), 24 * 3600_000).unref();
}

/** For tests. */
export const _setLatest = (v) => (latest = v);
