// "Now playing": polls Steam, PlayStation and Xbox at a regular interval (kept in memory only)
import { config } from './config.js';
import { log } from './util.js';
import { steamPresence } from './connectors/steam.js';
import { psnPresence } from './connectors/playstation.js';
import { xboxPresence } from './connectors/xbox.js';

const state = { updatedAt: null, playing: [], online: {} };
const since = new Map(); // "platform:title" -> observed session start

export const getPresence = () => state;

export async function pollPresence(games = []) {
  const checks = {
    steam: config.steam.apiKey && config.steam.steamId ? () => steamPresence(config.steam) : null,
    playstation: config.psn.npsso ? () => psnPresence(config.psn, games) : null,
    xbox: config.xbox.openxblKey ? () => xboxPresence(config.xbox, games) : null,
  };
  const playing = [];
  const online = {};
  await Promise.all(
    Object.entries(checks).map(async ([platform, fn]) => {
      if (!fn) return;
      try {
        const r = await fn();
        online[platform] = r.online;
        if (r.playing) {
          const key = `${platform}:${r.playing.title}`;
          if (!since.has(key)) since.set(key, new Date().toISOString());
          playing.push({ platform, ...r.playing, since: since.get(key) });
        }
      } catch (e) {
        online[platform] = state.online[platform] ?? null;
        log('presence', `${platform} : ${e.message}`);
      }
    })
  );
  // Forget finished sessions
  for (const key of since.keys()) if (!playing.some((p) => `${p.platform}:${p.title}` === key)) since.delete(key);
  Object.assign(state, { updatedAt: new Date().toISOString(), playing, online });
  return state;
}

/** Demo mode */
export function setPresence(p) {
  Object.assign(state, p);
}
