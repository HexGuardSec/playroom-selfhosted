// PlayStation: unofficial API used by the PlayStation mobile app.
// Authentication with an NPSSO token (valid ~2 months, then renew it).
// Same approach as the open source psn-api library (https://psn-api.achievements.app).
import { fetchJson, normTitle, isoDurationToHours, round1, log } from '../util.js';

const AUTH = 'https://ca.account.sony.com/api/authz/v3/oauth';
const API = 'https://m.np.playstation.com/api';
// Public identifiers of the official Android app
const CLIENT_ID = '09515159-7237-4370-9b40-3806e67c0891';
const BASIC = 'MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
const REDIRECT = 'com.scee.psxandroid.scecompcall://redirect';

// The access token (valid ~1 h) is shared by sync and presence
let tokenCache = null;
async function getAccessToken(npsso) {
  if (tokenCache && tokenCache.npsso === npsso && tokenCache.expires > Date.now() + 120_000) return tokenCache.token;
  const token = await exchangeNpsso(npsso);
  tokenCache = { npsso, token: token.access_token, expires: Date.now() + (token.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function exchangeNpsso(npsso) {
  const qs = new URLSearchParams({
    access_type: 'offline',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'psn:mobile.v2.core psn:clientapp',
  });
  const res = await fetch(`${AUTH}/authorize?${qs}`, {
    headers: { Cookie: `npsso=${npsso}` },
    redirect: 'manual',
  });
  const location = res.headers.get('location') || '';
  const code = new URL(location, 'http://x').searchParams.get('code');
  if (!code) {
    throw new Error(
      "NPSSO token refused or expired. Sign in on playstation.com again, then get a new token at https://ca.account.sony.com/api/v1/ssocookie"
    );
  }
  const token = await fetchJson(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${BASIC}` },
    body: new URLSearchParams({ code, redirect_uri: REDIRECT, grant_type: 'authorization_code', token_format: 'jwt' }),
  });
  return token;
}

async function paginate(urlFor, pick, auth) {
  const all = [];
  let offset = 0;
  for (let guard = 0; guard < 50; guard++) {
    const data = await fetchJson(urlFor(offset), { headers: auth });
    const page = pick(data) ?? [];
    all.push(...page);
    const total = data.totalItemCount ?? 0;
    const next = data.nextOffset ?? offset + page.length;
    if (!page.length || all.length >= total || next <= offset) break;
    offset = next;
  }
  return all;
}

function pickHero(t) {
  const imgs = t?.concept?.media?.images ?? t?.media?.images ?? [];
  const byType = (type) => imgs.find((i) => i.type === type)?.url;
  return byType('BACKGROUND_LAYER_ART') || byType('GAMEHUB_COVER_ART') || byType('SIXTEEN_BY_NINE_BANNER') || null;
}

function pickCover(t) {
  const imgs = t?.concept?.media?.images ?? t?.media?.images ?? [];
  const byType = (type) => imgs.find((i) => i.type === type)?.url;
  return byType('PORTRAIT_BANNER') || byType('MASTER') || byType('GAMEHUB_COVER_ART') || t.imageUrl || null;
}

/** Online ID and avatar: the mobile app endpoint first, then the older profile service */
async function getProfile(auth) {
  try {
    const p = await fetchJson(`${API}/userProfile/v1/internal/users/me/profiles`, { headers: auth }, { retries: 1 });
    const avatar = p?.avatars?.find((a) => a.size === 'xl')?.url || p?.avatars?.at(-1)?.url || null;
    if (p?.onlineId) return { onlineId: p.onlineId, avatar };
  } catch (e) {
    log('psn', `Profile (mobile API) unavailable: ${e.message}`);
  }
  try {
    const d = await fetchJson(
      'https://us-prof.np.community.playstation.net/userProfile/v1/users/me/profile2?fields=onlineId,avatarUrls',
      { headers: auth },
      { retries: 1 }
    );
    const urls = d?.profile?.avatarUrls ?? [];
    const avatar = urls.find((a) => a.size === 'xl')?.avatarUrl || urls.at(-1)?.avatarUrl || null;
    if (d?.profile?.onlineId) return { onlineId: d.profile.onlineId, avatar };
  } catch (e) {
    log('psn', `Profile (profile service) unavailable: ${e.message}`);
  }
  return null;
}

export async function syncPlayStation({ npsso }) {
  const token = await getAccessToken(npsso);
  const auth = { Authorization: `Bearer ${token}` };

  const [profile, trophyTitles, played] = await Promise.all([
    getProfile(auth),
    paginate((o) => `${API}/trophy/v1/users/me/trophyTitles?limit=800&offset=${o}`, (d) => d.trophyTitles, auth),
    paginate(
      (o) => `${API}/gamelist/v2/users/me/titles?categories=ps4_game,ps5_native_game&limit=200&offset=${o}`,
      (d) => d.titles,
      auth
    ).catch((e) => {
      log('psn', 'Played games list unavailable (no playtime):', e.message);
      return [];
    }),
  ]);
  log('psn', `${trophyTitles.length} trophy lists, ${played.length} games with playtime`);

  // Match trophy lists with playtime by normalised title
  const playedByName = new Map();
  for (const p of played) {
    const k = normTitle(p.name);
    const prev = playedByName.get(k);
    if (prev) {
      // Same game on PS4 and PS5: add the hours up
      prev.hours += isoDurationToHours(p.playDuration);
      if ((p.lastPlayedDateTime || '') > (prev.lastPlayed || '')) prev.lastPlayed = p.lastPlayedDateTime;
    } else {
      playedByName.set(k, {
        raw: p,
        hours: isoDurationToHours(p.playDuration),
        lastPlayed: p.lastPlayedDateTime || null,
        used: false,
      });
    }
  }

  const games = trophyTitles.map((t) => {
    const match = playedByName.get(normTitle(t.trophyTitleName));
    if (match) match.used = true;
    const e = t.earnedTrophies || {};
    const d = t.definedTrophies || {};
    const unlocked = (e.bronze || 0) + (e.silver || 0) + (e.gold || 0) + (e.platinum || 0);
    const total = (d.bronze || 0) + (d.silver || 0) + (d.gold || 0) + (d.platinum || 0);
    const pct = typeof t.progress === 'number' ? t.progress : null;
    // Stable id: the game's titleId when known, so it does not change with the first trophy
    const stableId = match ? `psn-${match.raw.titleId}` : `psn-${t.npCommunicationId}`;
    return {
      id: stableId,
      altIds: match ? [`psn-${t.npCommunicationId}`] : [],
      platform: 'playstation',
      system: (t.trophyTitlePlatform || '').split(',')[0] || 'PlayStation',
      title: t.trophyTitleName,
      cover: (match && pickCover(match.raw)) || t.trophyTitleIconUrl,
      coverFallback: t.trophyTitleIconUrl,
      hero: match ? pickHero(match.raw) : null,
      hours: match ? round1(match.hours) : null,
      lastPlayed: match?.lastPlayed || t.lastUpdatedDateTime || null,
      achievements: total ? { unlocked, total, percent: pct } : null,
      trophies: {
        platinum: e.platinum || 0,
        gold: e.gold || 0,
        silver: e.silver || 0,
        bronze: e.bronze || 0,
        hasPlatinum: (d.platinum || 0) > 0,
      },
      completed: pct === 100,
      completedAt: pct === 100 ? t.lastUpdatedDateTime : null,
      url: null,
    };
  });

  // Played games without a trophy list (rare): add them anyway
  for (const [, m] of playedByName) {
    if (m.used) continue;
    games.push({
      id: `psn-${m.raw.titleId}`,
      platform: 'playstation',
      system: m.raw.category === 'ps5_native_game' ? 'PS5' : 'PS4',
      title: m.raw.name,
      cover: pickCover(m.raw),
      coverFallback: m.raw.imageUrl,
      hero: pickHero(m.raw),
      hours: round1(m.hours),
      lastPlayed: m.lastPlayed,
      achievements: null,
      completed: false,
      url: null,
    });
  }

  return { profile: { name: profile?.onlineId || 'PlayStation', avatar: profile?.avatar || null, url: null }, games: mergeVersions(games) };
}

/**
 * A game released on PS4 and PS5 has two trophy lists: keep a single entry.
 * The entry uses the version with the most progress and lists both consoles.
 */
export function mergeVersions(games) {
  const groups = new Map();
  for (const g of games) {
    // Same title on PlayStation = same game (PS4 and PS5 versions share the name)
    const key = normTitle(g.title) || g.id;
    const list = groups.get(key) || [];
    list.push(g);
    groups.set(key, list);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const best = [...list].sort((a, b) => (b.achievements?.percent ?? -1) - (a.achievements?.percent ?? -1) || (b.hours ?? 0) - (a.hours ?? 0))[0];
    const systems = [...new Set(list.flatMap((g) => (g.system || '').split(' / ')).filter(Boolean))].sort().reverse();
    const done = list.find((g) => g.completed);
    const ids = new Set(list.flatMap((g) => [g.id, ...(g.altIds || [])]));
    ids.delete(best.id);
    out.push({
      ...best,
      system: systems.join(' / '),
      hours: Math.max(...list.map((g) => g.hours ?? 0)) || best.hours,
      lastPlayed: list.map((g) => g.lastPlayed).filter(Boolean).sort().at(-1) || null,
      completed: Boolean(done),
      completedAt: done?.completedAt ?? null,
      altIds: [...ids],
    });
  }
  return out;
}

/** Presence: the PlayStation game running right now (or null) */
export async function psnPresence({ npsso }, games = []) {
  const token = await getAccessToken(npsso);
  const data = await fetchJson(`${API}/userProfile/v1/internal/users/me/basicPresences?type=primary`, {
    headers: { Authorization: `Bearer ${token}` },
  }, { retries: 1 });
  const p = data?.basicPresence ?? data;
  const online = p?.primaryPlatformInfo?.onlineStatus === 'online' || p?.availability === 'availableToPlay';
  const t = p?.gameTitleInfoList?.[0];
  if (!t) return { online, playing: null };
  const match = games.find((g) => g.platform === 'playstation' && normTitle(g.title) === normTitle(t.titleName));
  return { online: true, playing: { gameId: match?.id ?? null, title: t.titleName, cover: t.conceptIconUrl || t.npTitleIconUrl || null } };
}
