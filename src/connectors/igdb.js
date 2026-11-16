// IGDB (Twitch): covers, backgrounds and time to beat
// Free sign-up: https://api-docs.igdb.com/#account-creation
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson, normTitle, log, round1 } from '../util.js';

let tokenCache = null;

async function getToken({ clientId, clientSecret }) {
  if (tokenCache?.clientId === clientId && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  // Credentials go in the request body, never in the URL
  const data = await fetchJson('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  tokenCache = { clientId, token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const img = (size, id) => (id ? `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg` : null);

// IGDB platform ids, to favour the right version of a game
const PLATFORM_IDS = {
  PS5: [167], PS4: [48], PS3: [9], PSVITA: [46], 'Xbox Series': [169], 'Xbox One': [49], 'Xbox 360': [12],
  Switch: [130], 'Switch 2': [508], PC: [6],
};
// IGDB types to avoid: 1 DLC, 3 bundle, 5 mod, 7 season, 13 pack, 14 update
const BAD_TYPES = [1, 3, 5, 7, 13, 14];

/** Title cleaned up for search: no ™ ®, no "PS4 & PS5", no edition name */
export function searchTitle(title = '') {
  return title
    .replace(/[™®©]/g, '')
    .replace(/\((PS4|PS5|PlayStation ?[45])[^)]*\)/gi, '')
    .replace(/\b(PS4|PS5)\s*(&|et|and|\/)\s*(PS4|PS5)\b/gi, '')
    .replace(/\s+(-|–|:)?\s*(standard|digital deluxe|deluxe|gold|ultimate|complete|definitive|game of the year|goty|premium|launch)\s+edition\b.*$/i, '')
    .replace(/["\\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let typeFieldOk = true;
/** Searches IGDB for a title and returns candidates, best match first */
export async function searchIgdb(title, system, igdb, limit = 15) {
  const headers = { 'Client-ID': igdb.clientId, Authorization: `Bearer ${await getToken(igdb)}`, 'Content-Type': 'text/plain' };
  const q = searchTitle(title);
  const base = 'name,first_release_date,platforms,version_parent,game_modes,cover.image_id,artworks.image_id,screenshots.image_id';
  let res;
  try {
    res = await fetchJson('https://api.igdb.com/v4/games', {
      method: 'POST', headers,
      body: `search "${q}"; fields ${base}${typeFieldOk ? ',game_type' : ''}; where cover != null; limit ${limit};`,
    }, { retries: 1 });
  } catch (e) {
    if (!typeFieldOk || e.status !== 400) throw e;
    typeFieldOk = false; // field unknown to this API version: do without it
    res = await fetchJson('https://api.igdb.com/v4/games', {
      method: 'POST', headers, body: `search "${q}"; fields ${base}; where cover != null; limit ${limit};`,
    }, { retries: 1 });
  }
  const want = normTitle(q);
  const plats = String(system || '').split(' / ').flatMap((s) => PLATFORM_IDS[s] || []);
  const scored = (res || []).map((r, i) => {
    const name = normTitle(r.name);
    let score = 30 - i; // IGDB's own ranking counts a little
    if (name === want) score += 100;
    else if (name.startsWith(want) || want.startsWith(name)) score += 35;
    else if (name.includes(want)) score += 15;
    if (r.version_parent) score -= 30; // special edition of another game
    if (BAD_TYPES.includes(r.game_type)) score -= 80; // compilation, pack, DLC…
    if (plats.length && (r.platforms || []).some((p) => plats.includes(p))) score += 25;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ r }) => ({
    id: r.id,
    name: r.name,
    year: r.first_release_date ? new Date(r.first_release_date * 1000).getFullYear() : null,
    modes: r.game_modes ?? [],
    cover: img('t_cover_big_2x', r.cover?.image_id),
    thumb: img('t_cover_big', r.cover?.image_id),
    hero: img('t_1080p', r.artworks?.[0]?.image_id || r.screenshots?.[0]?.image_id),
  }));
}

/** Barely played games: pile of shame candidates that need a time to beat */
export const isBacklogCandidate = (g) => g.hours === 0 || (g.hours !== null && g.hours !== undefined && g.hours < 2 && !g.completed);

/**
 * Enriches games with IGDB:
 * - cover and background for PlayStation, Xbox and Nintendo (Steam has its own);
 * - time to beat (rushed, main story, 100%).
 * Results are cached in data/igdb-cache.json (one entry per title).
 */
export async function enrichFromIgdb(games, igdb, dataDir, notes = {}) {
  if (!igdb.clientId || !igdb.clientSecret) return;
  const cacheFile = path.join(dataDir, 'igdb-cache.json');
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {}
  // Old format, or a search made before the improved matching (v2): search again
  for (const [k, v] of Object.entries(cache)) if (v === null || typeof v !== 'object' || v.v !== 2) delete cache[k];

  // Every game except online ones (they never "end"): covers outside Steam, time to beat for all
  const targets = games.filter((g) => g.platform !== 'steam' || g.online !== true);
  const titles = new Map(targets.map((g) => [normTitle(g.title), g]));
  const toLookup = [...titles.keys()].filter((k) => !(k in cache));
  // IGDB game picked by hand ("Wrong cover?"): use its time to beat
  const pinned = (g) => [g.id, ...(g.altIds || [])].map((id) => notes[id]?.igdbId).find(Boolean) || g.igdbId || null;
  for (const g of targets) {
    const pid = pinned(g);
    if (pid && !cache[`#${pid}`]) cache[`#${pid}`] = { v: 2, id: pid };
  }
  const entryFor = (g) => (pinned(g) ? cache[`#${pinned(g)}`] : cache[normTitle(g.title)]);

  try {
    if (toLookup.length) {
      log('igdb', `Looking up ${toLookup.length} games…`);
      for (const key of toLookup) {
        const g = titles.get(key);
        try {
          const best = (await searchIgdb(g.title, g.system, igdb))[0];
          cache[key] = best ? { v: 2, id: best.id, modes: best.modes, cover: best.cover, hero: best.hero } : { v: 2, id: null };
        } catch (e) {
          log('igdb', `Lookup failed for "${g.title}": ${e.message}`);
        }
        await sleep(260); // IGDB limit: 4 requests per second
      }
    }

    // Time to beat (rushed, normal, 100%), in batches of 100
    const needTtb = [...new Set(targets.map(entryFor).filter((c) => c?.id && c.ttbDetail === undefined))];
    if (needTtb.length) {
      const headers = { 'Client-ID': igdb.clientId, Authorization: `Bearer ${await getToken(igdb)}`, 'Content-Type': 'text/plain' };
      for (let i = 0; i < needTtb.length; i += 100) {
        const chunk = needTtb.slice(i, i + 100);
        try {
          const res = await fetchJson('https://api.igdb.com/v4/game_time_to_beats', {
            method: 'POST',
            headers,
            body: `fields game_id,hastily,normally,completely; where game_id = (${chunk.map((c) => c.id).join(',')}); limit 500;`,
          });
          const byId = new Map((res || []).map((t) => [t.game_id, t]));
          for (const c of chunk) {
            const t = byId.get(c.id);
            const h = (s) => (s ? round1(s / 3600) : null);
            c.ttbDetail = t ? { hastily: h(t.hastily), normally: h(t.normally), completely: h(t.completely) } : null;
            c.ttb = h(t?.normally || t?.hastily || t?.completely);
          }
        } catch (e) {
          log('igdb', `Time to beat unavailable: ${e.message}`);
        }
        await sleep(260);
      }
    }
  } catch (e) {
    log('igdb', 'Cannot connect to IGDB:', e.message);
  }

  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

  for (const g of games) {
    const found = entryFor(g);
    if (!found?.id) continue;
    // A time entered by hand (nintendo.json) wins
    if (!g.timeToBeat) {
      if (found.ttb) g.timeToBeat = found.ttb;
      if (found.ttbDetail) g.timeToBeatDetail = found.ttbDetail;
    }
    if ((g.online === null || g.online === undefined) && Array.isArray(found.modes) && found.modes.length) {
      // IGDB modes: 1 single player, 2 multiplayer, 3 co-op, 5 MMO, 6 battle royale
      const m = found.modes;
      g.online = m.includes(5) || m.includes(6) || ((m.includes(2) || m.includes(3)) && !m.includes(1));
    }
    if (g.platform === 'steam') continue; // Steam keeps its official artwork
    const manualCover = g.platform === 'nintendo' && g.cover;
    if (found.cover && !manualCover) {
      if (g.cover && !g.coverFallback) g.coverFallback = g.cover;
      g.cover = found.cover;
    }
    if (found.hero && !g.hero) g.hero = found.hero;
  }
}
