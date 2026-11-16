// Sync: fetches every platform and writes data/library.json
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log, round1, scrub } from './util.js';
import { syncSteam } from './connectors/steam.js';
import { syncPlayStation } from './connectors/playstation.js';
import { syncXbox } from './connectors/xbox.js';
import { syncNintendo } from './connectors/nintendo.js';
import { enrichFromIgdb } from './connectors/igdb.js';
import { recordSnapshot } from './history.js';
import { readNotes } from './notes.js';
import { buildDemoLibrary, buildDemoHistory } from './demo.js';

export const libraryFile = () => path.join(config.dataDir, 'library.json');

export function readLibrary() {
  try {
    return JSON.parse(fs.readFileSync(libraryFile(), 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export function computeStats(games) {
  const sum = (arr, f) => arr.reduce((s, g) => s + (f(g) || 0), 0);
  const byPlatform = {};
  for (const g of games) {
    const p = (byPlatform[g.platform] ??= { games: 0, hours: 0, achievements: 0, completed: 0 });
    p.games++;
    p.hours += g.hours || 0;
    p.achievements += g.achievements?.unlocked || 0;
    if (g.completed) p.completed++;
  }
  for (const p of Object.values(byPlatform)) p.hours = round1(p.hours);
  return {
    games: games.length,
    played: games.filter((g) => (g.hours || 0) > 0 || g.achievements?.unlocked).length,
    hours: round1(sum(games, (g) => g.hours)),
    achievements: sum(games, (g) => g.achievements?.unlocked),
    completed: games.filter((g) => g.completed).length,
    platinums: sum(games, (g) => g.trophies?.platinum),
    gamerscore: sum(games, (g) => g.gamerscore?.current),
    byPlatform,
  };
}

let running = null;

/** Starts a sync (one at a time). A failing platform keeps its previous data. */
export function runSync() {
  if (running) return running;
  running = doSync().finally(() => (running = null));
  return running;
}

export const isSyncing = () => Boolean(running);

async function doSync() {
  fs.mkdirSync(config.dataDir, { recursive: true });

  if (config.demo) {
    const lib = buildDemoLibrary(config);
    lib.stats = computeStats(lib.games);
    writeAtomic(libraryFile(), lib);
    writeAtomic(path.join(config.dataDir, 'history.json'), buildDemoHistory(lib.games));
    log('sync', 'Demo mode: fake library generated');
    return lib;
  }

  const previous = readLibrary();
  const prevGames = (platform) => (previous?.games ?? []).filter((g) => g.platform === platform);

  const tasks = {
    steam: config.steam.apiKey && config.steam.steamId ? () => syncSteam(config.steam) : null,
    playstation: config.psn.npsso ? () => syncPlayStation(config.psn) : null,
    xbox: config.xbox.openxblKey ? () => syncXbox(config.xbox, prevGames('xbox')) : null,
    nintendo: () => syncNintendo(config.dataDir),
  };

  const platforms = {};
  const games = [];
  for (const [name, task] of Object.entries(tasks)) {
    if (!task) {
      platforms[name] = { enabled: false };
      continue;
    }
    const started = Date.now();
    try {
      log('sync', `${name}: start`);
      const res = await task();
      platforms[name] = { enabled: true, ok: true, profile: res.profile, syncedAt: new Date().toISOString() };
      games.push(...res.games);
      log('sync', `${name}: ${res.games.length} games in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    } catch (e) {
      log('sync', `${name}: ERROR ${e.message}`);
      const old = previous?.platforms?.[name];
      platforms[name] = {
        enabled: true,
        ok: false,
        // Message shown on the site: stripped of any key and shortened
        error: scrub(e.message).slice(0, 300),
        profile: old?.profile ?? null,
        syncedAt: old?.syncedAt ?? null,
      };
      games.push(...prevGames(name));
    }
  }

  // IGDB covers and time to beat (cached, so fast after the first run)
  await enrichFromIgdb(games, config.igdb, config.dataDir, readNotes()).catch((e) => log('igdb', e.message));

  // History: hours played since the last reading + dated Steam achievements
  try {
    recordSnapshot(games, { steamFresh: platforms.steam?.ok === true });
  } catch (e) {
    log('history', e.message);
  }
  for (const g of games) delete g._unlocks;

  const lib = {
    museumName: config.museumName,
    generatedAt: new Date().toISOString(),
    platforms,
    games,
    stats: computeStats(games),
  };
  writeAtomic(libraryFile(), lib);
  log('sync', `Done: ${games.length} games, ${lib.stats.hours} h, ${lib.stats.achievements} achievements`);
  return lib;
}

/** After a Nintendo game is added or edited: refresh the library without a full sync */
export async function refreshNintendo() {
  if (running) await running.catch(() => {});
  const lib = readLibrary();
  if (!lib) return runSync();
  const res = syncNintendo(config.dataDir);
  await enrichFromIgdb(res.games, config.igdb, config.dataDir, readNotes()).catch((e) => log('igdb', e.message));
  try {
    recordSnapshot(res.games, { partial: true });
  } catch (e) {
    log('history', e.message);
  }
  lib.games = lib.games.filter((g) => g.platform !== 'nintendo').concat(res.games);
  lib.platforms = { ...lib.platforms, nintendo: { enabled: true, ok: true, profile: res.profile, syncedAt: new Date().toISOString() } };
  lib.stats = computeStats(lib.games);
  writeAtomic(libraryFile(), lib);
  return lib;
}

// Command line: node src/sync.js
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runSync().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
