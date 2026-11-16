// Shared helpers: HTTP requests, limited concurrency, title normalisation
import { config } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** URL without its query string: API keys passed in URLs must never end up in a message */
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '(hidden URL)';
  }
}

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} on ${safeUrl(url)}`);
    this.status = status;
    this.body = body;
  }
}

/** fetch + JSON, with retries on 429 / 5xx */
export async function fetchJson(url, options = {}, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : {};
      }
      const body = await res.text().catch(() => '');
      const err = new HttpError(res.status, url, body);
      if (res.status === 429 || res.status >= 500) {
        lastErr = err;
        const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt * 2;
        await sleep(Math.min(retryAfter, 30) * 1000);
        continue;
      }
      throw err;
    } catch (e) {
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(2 ** attempt * 1000);
    }
  }
  throw lastErr;
}

/** Runs fn on every item with at most `limit` concurrent calls */
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (e) {
        results[idx] = { __error: e };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** Normalises a title to match games across lists */
export function normTitle(s = '') {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/\b(ps4|ps5|playstation ?[45]|edition|remastered|trophies|trophees)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "PT228H56M33S" -> hours (decimal) */
export function isoDurationToHours(d) {
  if (!d || typeof d !== 'string') return 0;
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!m) return 0;
  const [, days = 0, h = 0, min = 0, s = 0] = m;
  return Number(days) * 24 + Number(h) + Number(min) / 60 + Number(s) / 3600;
}

export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

export function percent(unlocked, total) {
  if (!total) return null;
  return Math.round((unlocked / total) * 1000) / 10;
}

/** Removes every secret value (API keys, tokens) from a text */
export function scrub(text) {
  let out = String(text ?? '');
  for (const secret of config.secrets) if (secret) out = out.split(secret).join('***');
  return out;
}

export const log = (scope, ...args) =>
  console.log(`[${new Date().toISOString()}] [${scope}]`, ...args.map((a) => scrub(a instanceof Error ? a.stack || a.message : a)));
