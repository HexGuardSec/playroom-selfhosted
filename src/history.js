// History: playtime per day (from the difference between two syncs) and dated achievements.
// File data/history.json:
//   since        date of the first reading
//   last         { gameId: hours at the last reading }
//   days         { "YYYY-MM-DD": { gameId: hours played that day } }
//   achievements { "YYYY-MM-DD": { gameId: achievements unlocked that day } }  (Steam, rebuilt on every sync)
//   lastSync     date and time of the last reading
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { round1 } from './util.js';

const file = () => path.join(config.dataDir, 'history.json');

/** Local date YYYY-MM-DD (time zone from the TZ variable) */
export const localDay = (d = new Date()) => d.toLocaleDateString('sv-SE');

export function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return { since: null, last: {}, days: {}, achievements: {} };
  }
}

function write(h) {
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(h));
  fs.renameSync(tmp, file());
}

/**
 * Records a reading after a sync.
 * @param games      synced games
 * @param steamFresh true when Steam synced successfully (otherwise the previous dated achievements are kept)
 */
export function recordSnapshot(games, { steamFresh = false, partial = false } = {}) {
  const h = readHistory();
  const now = new Date();
  const today = localDay(now);
  const firstRun = !h.since;
  h.since ??= today;
  const lastSync = h.lastSync ? new Date(h.lastSync) : null;
  // Hours since the previous reading: nobody can have played longer than that
  const elapsed = lastSync ? (now - lastSync) / 3600000 : 0;

  for (const g of games) {
    if (typeof g.hours !== 'number') continue;
    // Old id (format change): carry its value over
    let prev = h.last[g.id];
    if (typeof prev !== 'number') {
      const alias = (g.altIds || []).find((id) => typeof h.last[id] === 'number');
      if (alias) {
        prev = h.last[alias];
        delete h.last[alias];
      }
    }
    const playedSince = g.lastPlayed && lastSync && new Date(g.lastPlayed) > lastSync;

    let delta = 0;
    if (typeof prev === 'number') {
      delta = g.hours - prev; // negative: the platform corrected itself, re-sync the baseline
    } else if (!firstRun && !partial && playedSince && g.hours <= elapsed + 0.5) {
      // Game never seen before (brand new, or hours finally available) and launched since the last reading:
      // all of its time was played between the two readings
      delta = g.hours;
    }

    // Under 3 minutes: rounding noise
    if (delta >= 0.05) {
      // The session counts on the day the game was last launched, when known
      const day = playedSince ? localDay(new Date(g.lastPlayed)) : today;
      const bucket = (h.days[day] ??= {});
      bucket[g.id] = round1((bucket[g.id] || 0) + delta);
    }
    h.last[g.id] = g.hours;
  }
  // A partial update (Nintendo game edited by hand) does not count as a full reading
  if (!partial) h.lastSync = now.toISOString();

  if (steamFresh) {
    const ach = {};
    // Keep dated achievements from other platforms (none so far) and rebuild Steam
    for (const g of games) {
      for (const ts of g._unlocks ?? []) {
        const day = localDay(new Date(ts * 1000));
        const bucket = (ach[day] ??= {});
        bucket[g.id] = (bucket[g.id] || 0) + 1;
      }
    }
    h.achievements = ach;
  }

  write(h);
  return h;
}

/** Data sent to the site: the last 400 days */
export function activityPayload(h = readHistory()) {
  const from = localDay(new Date(Date.now() - 400 * 86400000));
  const pick = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([d]) => d >= from));
  return { since: h.since, today: localDay(), days: pick(h.days), achievements: pick(h.achievements) };
}
