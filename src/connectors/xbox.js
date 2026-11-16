// Xbox : via OpenXBL (https://xbl.io), passerelle vers l'API Xbox Live.
// Free key after signing in with a Microsoft account (quota ~150 requests/hour).
import { fetchJson, mapPool, round1, log } from '../util.js';

const API = 'https://xbl.io/api/v2';

/** Short, secret-free hint about an unexpected payload: its top-level keys or error message */
function describe(data) {
  if (!data || typeof data !== 'object') return '';
  const msg = data.error_message || data.message || data.error || data.code;
  if (msg && typeof msg !== 'object') return ` (${String(msg).slice(0, 120)})`;
  const keys = Object.keys(data).slice(0, 6).join(', ');
  return keys ? ` (fields: ${keys})` : ' (empty)';
}

/** Recursively finds the MinutesPlayed stat in the response */
function findMinutesPlayed(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.name === 'MinutesPlayed' && obj.value !== undefined) return Number(obj.value) || 0;
  for (const v of Object.values(obj)) {
    const r = findMinutesPlayed(v);
    if (r !== null) return r;
  }
  return null;
}

export async function syncXbox({ openxblKey, playtimeMaxTitles }, previousGames = []) {
  const headers = { 'X-Authorization': openxblKey, Accept: 'application/json', 'Accept-Language': 'en-US' };

  const [account, history] = await Promise.all([
    fetchJson(`${API}/account`, { headers }).catch((e) => {
      log('xbox', `Profile unavailable: ${e.message}`);
      return null;
    }),
    fetchJson(`${API}/achievements`, { headers }),
  ]);

  // OpenXBL sometimes wraps its payload in "content"; anything else is an error we must show
  const list = Array.isArray(history?.titles) ? history.titles : Array.isArray(history?.content?.titles) ? history.content.titles : null;
  if (!list) throw new Error(`Unexpected OpenXBL response${describe(history)}. Check the OpenXBL key in Settings.`);
  const titles = list.filter((t) => t.type !== 'App');
  log('xbox', `${titles.length} games found`);

  // Reuse the known playtime when the game has not been played since (saves quota)
  const prev = new Map(previousGames.map((g) => [g.id, g]));
  const sorted = [...titles].sort((a, b) =>
    (b.titleHistory?.lastTimePlayed || '').localeCompare(a.titleHistory?.lastTimePlayed || '')
  );
  const toFetch = sorted
    .filter((t) => {
      const p = prev.get(`xbox-${t.titleId}`);
      return !p || p.hours === null || p.lastPlayed !== (t.titleHistory?.lastTimePlayed || null);
    })
    .slice(0, playtimeMaxTitles);

  const fetched = new Map();
  await mapPool(toFetch, 3, async (t) => {
    try {
      const stats = await fetchJson(`${API}/achievements/stats/${t.titleId}`, { headers }, { retries: 1 });
      const minutes = findMinutesPlayed(stats);
      if (minutes !== null) fetched.set(t.titleId, minutes / 60);
    } catch (e) {
      log('xbox', `Playtime unavailable for ${t.name}: ${e.message}`);
    }
  });

  const profileUser = (account?.profileUsers ?? account?.content?.profileUsers)?.[0];
  if (account && !profileUser) log('xbox', `Profile not found in the OpenXBL response${describe(account)}`);
  const setting = (id) => profileUser?.settings?.find((s) => s.id === id)?.value;

  const games = titles.map((t) => {
    const a = t.achievement || {};
    const id = `xbox-${t.titleId}`;
    const lastPlayed = t.titleHistory?.lastTimePlayed || null;
    const hours = fetched.has(t.titleId) ? round1(fetched.get(t.titleId)) : prev.get(id)?.hours ?? null;
    const total = a.totalAchievements || 0;
    const pct = typeof a.progressPercentage === 'number' && (total || a.totalGamerscore) ? a.progressPercentage : null;
    const devices = t.devices || [];
    return {
      id,
      platform: 'xbox',
      system: devices.includes('XboxSeries') ? 'Xbox Series' : devices.includes('XboxOne') ? 'Xbox One' : devices.includes('Xbox360') ? 'Xbox 360' : devices.includes('PC') ? 'PC' : 'Xbox',
      title: t.name,
      cover: t.displayImage || null,
      coverFallback: t.displayImage || null,
      hours,
      lastPlayed,
      achievements:
        total || a.currentAchievements
          ? { unlocked: a.currentAchievements || 0, total: total || null, percent: pct }
          : null,
      gamerscore: a.totalGamerscore ? { current: a.currentGamerscore || 0, total: a.totalGamerscore } : null,
      completed: pct === 100,
      completedAt: pct === 100 ? lastPlayed : null,
      url: null,
    };
  });

  return {
    profile: { name: setting('Gamertag') || 'Xbox', avatar: setting('GameDisplayPicRaw') || null, url: null },
    games,
  };
}

/** Presence: the Xbox game running right now (or null). The console home screen is ignored. */
export async function xboxPresence({ openxblKey }, games = []) {
  const headers = { 'X-Authorization': openxblKey, Accept: 'application/json', 'Accept-Language': 'en-US' };
  const data = await fetchJson(`${API}/presence`, { headers }, { retries: 1 });
  const me = Array.isArray(data) ? data[0] : data?.people?.[0] ?? data;
  const online = (me?.state || '').toLowerCase() === 'online';
  const titles = (me?.devices ?? []).flatMap((d) => d.titles ?? []);
  const t = titles.find((x) => x.placement === 'Full' && !/^(home|accueil)$/i.test(x.name || '') && x.id !== '750323071')
    || titles.find((x) => !/^(home|accueil)$/i.test(x.name || '') && x.id !== '750323071');
  if (!t) return { online, playing: null };
  const id = `xbox-${t.id}`;
  return { online: true, playing: { gameId: games.some((g) => g.id === id) ? id : null, title: t.name } };
}
