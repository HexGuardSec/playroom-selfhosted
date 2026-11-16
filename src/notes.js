// Personal notes: tier (S to D), rating out of 10, status and review, stored in data/notes.json
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Reserved JavaScript names are rejected as ids (prototype pollution protection)
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
export const validGameId = (id) => typeof id === 'string' && /^[a-z]+-[\w.:-]{1,150}$/i.test(id) && !RESERVED.has(id);

export const TIERS = ['S', 'A', 'B', 'C', 'D'];
// ignored = taken out of the pile of shame
export const STATUSES = ['todo', 'playing', 'done', 'dropped', 'ignored'];

const file = () => path.join(config.dataDir, 'notes.json');

export function readNotes() {
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
    // Prototype-less object: a crafted key in the file cannot change anything
    return Object.assign(Object.create(null), data && typeof data === 'object' ? data : {});
  } catch {
    return Object.create(null);
  }
}

/** Validates and saves a game's note. An empty note deletes the entry. */
export function saveNote(gameId, input) {
  if (!validGameId(gameId)) throw new Error('Invalid game id');
  const tier = TIERS.includes(input?.tier) ? input.tier : null;
  const rating =
    input?.rating === null || input?.rating === undefined || input?.rating === ''
      ? null
      : Math.max(0, Math.min(10, Math.round(Number(input.rating) * 2) / 2));
  if (rating !== null && Number.isNaN(rating)) throw new Error('Invalid rating');
  const status = STATUSES.includes(input?.status) ? input.status : null;
  const review = typeof input?.review === 'string' ? input.review.trim().slice(0, 2000) : '';
  // Game type set by hand (otherwise detected automatically)
  const mode = ['solo', 'online'].includes(input?.mode) ? input.mode : null;
  // Cover and background picked by hand
  const url = (v) => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{4,500}$/.test(v) ? v : null);
  const cover = url(input?.cover);
  const hero = url(input?.hero);
  const hidden = input?.hidden === true;
  // IGDB game picked with the cover: also used for the time to beat
  const igdbId = Number.isInteger(input?.igdbId) && input.igdbId > 0 ? input.igdbId : null;

  const notes = readNotes();
  if (!tier && rating === null && !status && !review && !mode && !cover && !hidden) delete notes[gameId];
  else notes[gameId] = { tier, rating, status, review, mode, cover, hero, igdbId: cover ? igdbId : null, hidden, updatedAt: new Date().toISOString() };

  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(notes, null, 2));
  fs.renameSync(tmp, file());
  return notes[gameId] ?? null;
}

/** Splits visible games from games hidden by hand */
export function splitHidden(games, notes = readNotes()) {
  const isHidden = (g) => [g.id, ...(g.altIds || [])].some((id) => notes[id]?.hidden);
  return { visible: games.filter((g) => !isHidden(g)), hidden: games.filter(isHidden) };
}
