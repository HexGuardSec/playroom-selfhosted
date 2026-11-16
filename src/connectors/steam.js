// Steam: Valve's official Web API
// Doc : https://developer.valvesoftware.com/wiki/Steam_Web_API
import { fetchJson, mapPool, round1, percent, log, HttpError } from '../util.js';

const API = 'https://api.steampowered.com';
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

const resolved = new Map();
async function resolveSteamId(apiKey, idOrVanity) {
  if (/^\d{17}$/.test(idOrVanity)) return idOrVanity;
  if (resolved.has(idOrVanity)) return resolved.get(idOrVanity);
  const id = await resolveVanity(apiKey, idOrVanity);
  resolved.set(idOrVanity, id);
  return id;
}

async function resolveVanity(apiKey, idOrVanity) {
  // Also accepts a full profile URL
  const vanity = idOrVanity.replace(/^https?:\/\/steamcommunity\.com\/(id|profiles)\//, '').replace(/\/$/, '');
  if (/^\d{17}$/.test(vanity)) return vanity;
  const data = await fetchJson(`${API}/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanity)}`);
  if (data?.response?.success !== 1) throw new Error(`Cannot resolve the Steam profile "${vanity}"`);
  return data.response.steamid;
}

/**
 * Gets the exact names of the official artwork (cover, banner, logo) from IStoreBrowseService.
 * Since 2024, new games use hashed URLs: the "classic" URLs sometimes return 404.
 */
async function fetchAssets(apiKey, appids) {
  const out = new Map();
  const BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/';
  for (let i = 0; i < appids.length; i += 100) {
    const input = {
      ids: appids.slice(i, i + 100).map((appid) => ({ appid })),
      context: { language: 'french', country_code: 'FR' },
      data_request: { include_assets: true, include_basic_info: true, include_tag_count: 20 },
    };
    const data = await fetchJson(
      `${API}/IStoreBrowseService/GetItems/v1/?key=${apiKey}&input_json=${encodeURIComponent(JSON.stringify(input))}`
    );
    for (const item of data?.response?.store_items ?? []) {
      const a = item.assets;
      if (!item.appid) continue;
      const url = (file) => (file && a?.asset_url_format ? BASE + a.asset_url_format.replace('${FILENAME}', file) : null);
      out.set(item.appid, {
        online: detectOnline(item),
        cover: url(a.library_capsule_2x || a.library_capsule),
        header: url(a.header),
        hero: url(a.library_hero_2x || a.library_hero),
        logo: url(a.library_logo_2x || a.library_logo),
      });
    }
  }
  return out;
}

// Steam categories: 1 multiplayer, 2 single player, 20 MMO, 27 cross-platform multiplayer, 36 online PvP, 38 online co-op, 49 PvP
const ONLINE_CATEGORIES = [1, 20, 27, 36, 38, 49];
// Steam tags: 128 "Massively Multiplayer"
const ONLINE_TAGS = [128];

/** Online game = multiplayer without single player, or MMO. null when Steam does not say. */
function detectOnline(item) {
  const players = item.categories?.supported_player_categoryids;
  const tags = (item.tags ?? []).map((t) => t.tagid ?? t).concat(item.tagids ?? []);
  if (players?.includes(20) || tags.some((t) => ONLINE_TAGS.includes(Number(t)))) return true;
  if (!Array.isArray(players) || !players.length) return null;
  return players.some((c) => ONLINE_CATEGORIES.includes(c)) && !players.includes(2);
}

export async function syncSteam({ apiKey, steamId, includeFreeGames, hideNeverPlayed }) {
  const id = await resolveSteamId(apiKey, steamId);

  const [summary, owned] = await Promise.all([
    fetchJson(`${API}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${id}`),
    fetchJson(
      `${API}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${id}&include_appinfo=1` +
        `&include_played_free_games=${includeFreeGames ? 1 : 0}`
    ),
  ]);

  const player = summary?.response?.players?.[0];
  let games = owned?.response?.games ?? [];
  if (!games.length) {
    log('steam', 'No games returned: check that "Game details" is set to Public in your Steam profile privacy settings.');
  }
  if (hideNeverPlayed) games = games.filter((g) => g.playtime_forever > 0);
  log('steam', `${games.length} games found, fetching achievements…`);

  // Achievements are only fetched for games launched at least once
  const achievements = await mapPool(games, 6, async (g) => {
    if (!g.playtime_forever) return null;
    try {
      const data = await fetchJson(
        `${API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${id}&appid=${g.appid}`,
        {},
        { retries: 2 }
      );
      const list = data?.playerstats?.achievements;
      if (!Array.isArray(list) || !list.length) return null;
      const unlocked = list.filter((a) => a.achieved === 1);
      const lastUnlock = Math.max(0, ...unlocked.map((a) => a.unlocktime || 0));
      return { unlocked: unlocked.length, total: list.length, lastUnlock, times: unlocked.map((a) => a.unlocktime).filter(Boolean) };
    } catch (e) {
      // 400 = the game has no achievements: expected
      if (e instanceof HttpError && (e.status === 400 || e.status === 403)) return null;
      throw e;
    }
  });

  const assets = await fetchAssets(apiKey, games.map((g) => g.appid)).catch((e) => {
    log('steam', 'Official artwork unavailable, using classic URLs:', e.message);
    return new Map();
  });

  const items = games.map((g, i) => {
    const ach = achievements[i] && !achievements[i].__error ? achievements[i] : null;
    const pct = ach ? percent(ach.unlocked, ach.total) : null;
    const a = assets.get(g.appid) || {};
    return {
      id: `steam-${g.appid}`,
      platform: 'steam',
      system: 'PC',
      title: g.name,
      online: a.online ?? null,
      cover: a.cover || `${CDN}/${g.appid}/library_600x900.jpg`,
      coverFallback: a.header || `${CDN}/${g.appid}/header.jpg`,
      hero: a.hero || `${CDN}/${g.appid}/library_hero.jpg`,
      logo: a.logo || `${CDN}/${g.appid}/logo.png`,
      hours: round1(g.playtime_forever / 60),
      recentHours: round1((g.playtime_2weeks || 0) / 60),
      lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
      achievements: ach ? { unlocked: ach.unlocked, total: ach.total, percent: pct } : null,
      completed: pct === 100,
      completedAt: pct === 100 && ach.lastUnlock ? new Date(ach.lastUnlock * 1000).toISOString() : null,
      url: `https://store.steampowered.com/app/${g.appid}`,
      // Unlock dates: used by the activity calendar, removed before library.json is written
      _unlocks: ach?.times ?? [],
    };
  });

  return {
    profile: player
      ? { name: player.personaname, avatar: player.avatarfull, url: player.profileurl }
      : { name: 'Steam', avatar: null, url: null },
    games: items,
  };
}

/** Presence: the Steam game running right now (or null) */
export async function steamPresence({ apiKey, steamId }) {
  const id = await resolveSteamId(apiKey, steamId);
  const data = await fetchJson(`${API}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${id}`, {}, { retries: 1 });
  const p = data?.response?.players?.[0];
  if (!p) return { online: false, playing: null };
  return {
    online: p.personastate > 0,
    playing: p.gameid ? { gameId: `steam-${p.gameid}`, title: p.gameextrainfo || null } : null,
  };
}
