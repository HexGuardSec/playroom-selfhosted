// Nintendo: no public API and no achievements on Switch.
// Games live in data/nintendo.json, filled from the site (or by hand).
import fs from 'node:fs';
import path from 'node:path';
import { round1, normTitle } from '../util.js';

const EXAMPLE = {
  _aide:
    "Add your Nintendo games here, or use '+ Add a game' on the site. Playtime is shown on the console: HOME menu > your user icon. " +
    "cover and banner are optional: when IGDB is configured they are found automatically. completed = true marks the game as 100% done.",
  profile: { name: 'Nintendo', avatar: null },
  games: [
    {
      title: 'The Legend of Zelda: Tears of the Kingdom',
      system: 'Switch',
      hours: 120,
      lastPlayed: '2026-10-01',
      completed: true,
      cover: '',
      note: 'All shrines done',
    },
  ],
};

export function nintendoFile(dataDir) {
  return path.join(dataDir, 'nintendo.json');
}

export function ensureNintendoFile(dataDir) {
  const file = nintendoFile(dataDir);
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(EXAMPLE, null, 2));
  return file;
}

export const nintendoId = (title) => `nintendo-${normTitle(title).replace(/ /g, '-')}`;

function readData(dataDir) {
  const file = ensureNintendoFile(dataDir);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? { games: data } : { ...data, games: data.games || [] };
  } catch (e) {
    throw new Error(`data/nintendo.json is not valid JSON: ${e.message}`);
  }
}

function writeData(dataDir, data) {
  const file = nintendoFile(dataDir);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

export const NINTENDO_SYSTEMS = ['Switch 2', 'Switch', 'Wii U', 'Wii', '3DS', 'DS', 'GameCube', 'Nintendo 64', 'Game Boy Advance', 'Game Boy', 'Super Nintendo', 'NES'];

/** Adds (or edits, when oldId is given) a game in data/nintendo.json. Returns its id. */
export function upsertNintendo(dataDir, input, oldId = null) {
  const title = String(input?.title || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 150);
  if (!normTitle(title)) throw new Error('A title is required');
  if (!NINTENDO_SYSTEMS.includes(input?.system || 'Switch')) throw new Error('Unknown console');
  const https = (v) => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{4,500}$/.test(v) ? v : undefined);
  const hours = input?.hours === '' || input?.hours === null || input?.hours === undefined ? undefined : Number(input.hours);
  if (hours !== undefined && (!Number.isFinite(hours) || hours < 0 || hours > 100000)) throw new Error('Invalid playtime');
  const lastPlayed = /^\d{4}-\d{2}-\d{2}$/.test(input?.lastPlayed || '') ? input.lastPlayed : undefined;
  const entry = {
    title,
    system: input?.system || 'Switch',
    hours: hours === undefined ? undefined : Math.round(hours * 10) / 10,
    lastPlayed,
    completed: input?.completed === true || undefined,
    online: input?.online === true || undefined,
    cover: https(input?.cover),
    banner: https(input?.banner),
    igdbId: Number.isInteger(input?.igdbId) && input.igdbId > 0 ? input.igdbId : undefined,
    note: typeof input?.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : undefined,
  };
  for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];

  const data = readData(dataDir);
  if (!oldId && data.games.length >= 2000) throw new Error('Too many games in nintendo.json');
  const newId = nintendoId(title);
  const idx = oldId ? data.games.findIndex((g) => g?.title && nintendoId(g.title) === oldId) : -1;
  if (oldId && idx === -1) throw new Error('This game is no longer in nintendo.json');
  const clash = data.games.findIndex((g) => g?.title && nintendoId(g.title) === newId);
  if (clash !== -1 && clash !== idx) throw new Error('A game with this title already exists');
  // Keep the fields the form does not handle (completedAt, timeToBeat…)
  if (idx >= 0) data.games[idx] = { ...data.games[idx], ...entry, ...Object.fromEntries(['completed', 'online', 'cover', 'banner', 'igdbId', 'note', 'hours', 'lastPlayed'].filter((k) => !(k in entry)).map((k) => [k, undefined])) };
  else data.games.push(entry);
  data.games = data.games.map((g) => JSON.parse(JSON.stringify(g))); // drop undefined values
  writeData(dataDir, data);
  return newId;
}

export function removeNintendo(dataDir, id) {
  const data = readData(dataDir);
  const before = data.games.length;
  data.games = data.games.filter((g) => !(g?.title && nintendoId(g.title) === id));
  if (data.games.length === before) throw new Error('Game not found in nintendo.json');
  writeData(dataDir, data);
}

export function syncNintendo(dataDir) {
  const data = readData(dataDir);
  const list = data.games;
  const games = list
    .filter((g) => g && g.title)
    .map((g) => ({
      id: nintendoId(g.title),
      igdbId: Number.isInteger(g.igdbId) ? g.igdbId : null,
      // Raw values as entered, for the edit form
      raw: { system: g.system || 'Switch', hours: g.hours ?? '', lastPlayed: g.lastPlayed || '', completed: Boolean(g.completed), online: g.online === true, cover: g.cover || '', banner: g.banner || '', igdbId: g.igdbId ?? null, note: g.note || '' },
      platform: 'nintendo',
      system: g.system || 'Switch',
      title: g.title,
      cover: g.cover || null,
      coverFallback: null,
      hero: g.banner || null,
      online: typeof g.online === 'boolean' ? g.online : null,
      ...(Number(g.timeToBeat) > 0 ? { timeToBeat: Number(g.timeToBeat) } : {}),
      hours: g.hours === undefined || g.hours === null || g.hours === '' ? null : round1(g.hours),
      lastPlayed: g.lastPlayed ? new Date(g.lastPlayed).toISOString() : null,
      achievements: null,
      completed: Boolean(g.completed),
      completedAt: g.completedAt ? new Date(g.completedAt).toISOString() : null,
      note: g.note || null,
      url: null,
    }));
  return { profile: { name: data.profile?.name || 'Nintendo', avatar: data.profile?.avatar || null, url: null }, games };
}
