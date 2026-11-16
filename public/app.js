// Playroom front end: plain JavaScript, no framework
import { t, LANGS, getLang, setLang, initLang } from './i18n.js';

const PLATFORMS = {
  steam: { label: 'Steam', color: 'var(--steam)' },
  playstation: { label: 'PlayStation', color: 'var(--playstation)' },
  xbox: { label: 'Xbox', color: 'var(--xbox)' },
  nintendo: { label: 'Nintendo', color: 'var(--nintendo)' },
};
const TIERS = ['S', 'A', 'B', 'C', 'D'];
const STATUS_KEYS = ['todo', 'playing', 'done', 'dropped', 'ignored'];
const statusLabel = (k) => t(`status.${k}`);
const EXTRA_PAGES = { activite: 'nav.activity', pile: 'nav.pile', notes: 'nav.notes' };
const GLOBE = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

const state = { me: null, lib: null, notes: {}, activity: null, presence: null, featured: null, view: {}, editing: false };
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

// ---------- Formatting ----------
let nf = new Intl.NumberFormat('en');
let rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const loc = () => getLang();
function refreshFormats() {
  nf = new Intl.NumberFormat(loc());
  rtf = new Intl.RelativeTimeFormat(loc(), { numeric: 'auto' });
}
const n = (x) => nf.format(Math.round(x || 0));
const n1 = (x) => nf.format(Math.round((x || 0) * 10) / 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const H = () => t('u.h');
const MIN = () => t('u.min');
const hoursText = (h) => (h === null || h === undefined ? null : h === 0 ? t('neverLaunched') : h < 1 ? `${Math.round(h * 60)} ${MIN()}` : `${n(h)} ${H()}`);
const durText = (h) => (h < 1 ? `${Math.round(h * 60)} ${MIN()}` : h < 10 ? `${n1(h)} ${H()}` : `${n(h)} ${H()}`);
function ago(iso) {
  if (!iso) return null;
  const s = (new Date(iso) - Date.now()) / 1000;
  for (const [u, k] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= k) return rtf.format(Math.round(s / k), u);
  }
  return t('justNow');
}
const date = (iso) => (iso ? new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
const dayMonth = (d, month = 'long') => new Date(`${d}T12:00:00`).toLocaleDateString(loc(), { day: 'numeric', month });
const pctOf = (g) => {
  const a = g.achievements;
  if (!a) return null;
  if (typeof a.percent === 'number') return a.percent;
  return a.total ? (a.unlocked / a.total) * 100 : null;
};
const achWord = (g) => t(g.platform === 'playstation' ? 'ach.trophies' : 'ach.word');
const noteOf = (g) => state.notes[g.id] || (g.altIds || []).map((id) => state.notes[id]).find(Boolean) || null;
/** Online game: manual choice in the note, otherwise automatic detection */
const isOnline = (g) => {
  const m = noteOf(g)?.mode;
  return m ? m === 'online' : g.online === true;
};
/** Cover and background picked by hand (in the notes) win over the automatic ones */
function applyOverrides() {
  for (const g of state.lib.games) {
    g._auto ??= { cover: g.cover, hero: g.hero, coverFallback: g.coverFallback };
    const nt = noteOf(g);
    g.cover = nt?.cover || g._auto.cover;
    g.hero = nt?.hero || g._auto.hero;
    g.coverFallback = nt?.cover ? g._auto.cover : g._auto.coverFallback;
  }
}
/** The owner is signed in: editing buttons are shown */
const isOwner = () => Boolean(state.me?.user);
const gameById = (id) => state.lib.games.find((g) => g.id === id || g.altIds?.includes(id));

// ---------- Images with fallbacks ----------
// data-alt: fallback URLs separated by |. When all fail: data-fail=remove|title
function img(src, alts = [], { cls = '', fail = 'remove', title = '', eager = false } = {}) {
  if (!src) return '';
  const alt = alts.filter(Boolean).join('|');
  return `<img src="${esc(src)}" alt="" class="${cls}" ${alt ? `data-alt="${esc(alt)}"` : ''} data-fail="${fail}"
    ${title ? `data-title="${esc(title)}"` : ''} ${eager ? '' : 'loading="lazy"'} decoding="async">`;
}
document.addEventListener(
  'error',
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement) || !el.dataset.fail) return;
    const alts = (el.dataset.alt || '').split('|').filter(Boolean);
    if (alts.length) {
      const next = alts.shift();
      el.dataset.alt = alts.join('|');
      if (/header|capsule_231|banner|1080p|hero/i.test(next) && el.closest('.case')) el.classList.add('wide');
      el.src = next;
      return;
    }
    if (el.dataset.fail === 'title') {
      const h = document.createElement('h1');
      h.className = 'hero-title';
      h.textContent = el.dataset.title || '';
      el.replaceWith(h);
    } else el.remove();
  },
  true
);

const ICON = {
  check: `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cup: (c) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${c}" d="M7 3h10v2h3v3a5 5 0 0 1-4.6 5A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 8.6 13 5 5 0 0 1 4 8V5h3V3zm-1 4v1a3 3 0 0 0 1.2 2.4A7 7 0 0 1 7 9V7H6zm12 0h-1v2a7 7 0 0 1-.2 1.4A3 3 0 0 0 18 8V7z"/></svg>`,
  dice: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="16" cy="8" r="1.6" fill="currentColor"/><circle cx="8" cy="16" r="1.6" fill="currentColor"/></svg>`,
};

const poster = (g) => `<div class="poster"><b>${esc(g.title)}</b><i>${esc(g.system || PLATFORMS[g.platform].label)}</i></div>`;
function caseArt(g, { eager = false, ttb = false } = {}) {
  const note = noteOf(g);
  const pct = pctOf(g);
  return `<div class="case">${poster(g)}${img(g.cover, [g.coverFallback], { eager })}${
    g.completed ? `<span class="complete">${ICON.check}${t('pct100')}</span>` : ''
  }${note?.tier ? `<span class="tier-badge t-${note.tier}">${note.tier}</span>` : ''}${
    isOnline(g) && !ttb ? `<span class="online-badge" title="${esc(t('onlineGame'))}">${GLOBE}</span>` : ''
  }${
    ttb && g.timeToBeat ? `<span class="ttb">≈ ${durText(g.timeToBeat)}</span>` : ''
  }${pct !== null && !g.completed ? `<div class="meter"><span style="width:${Math.min(100, pct)}%"></span></div>` : ''}</div>`;
}
const heroArt = (g, swap = false) => {
  const src = g.hero || g.cover;
  if (!src) return `<div class="hero-art"></div>`;
  return `<div class="hero-art ${swap ? 'swap' : ''}">${img(src, g.hero ? [g.cover] : [], { cls: g.hero ? '' : 'from-cover', eager: true })}</div>`;
};
const logoOrTitle = (g) =>
  g.logo ? img(g.logo, [], { cls: 'hero-logo', fail: 'title', title: g.title, eager: true }) : `<h1 class="hero-title">${esc(g.title)}</h1>`;

/** Page banner background: the featured game's wide art, otherwise a mosaic of covers */
function bannerArt(list, showcase) {
  if (showcase?.hero) return heroArt(showcase);
  const covers = list.filter((g) => g.cover).slice(0, 14);
  if (!covers.length) return '<div class="hero-art"></div>';
  const tiles = [];
  while (tiles.length < 14) tiles.push(...covers);
  return `<div class="hero-art mosaic" aria-hidden="true">${tiles.slice(0, 14).map((g) => `<div class="mosaic-cell">${img(g.cover, [g.coverFallback], { eager: true })}</div>`).join('')}</div>`;
}

function tile(g, opts = {}) {
  const sub = [];
  if (opts.ttb && g.timeToBeat) sub.push(`<span>${t('ttb.short', { d: durText(g.timeToBeat) })}</span>`);
  else {
    const h = hoursText(g.hours);
    if (h) sub.push(`<span>${h}</span>`);
    if (g.achievements) sub.push(`<span>${n(g.achievements.unlocked)}${g.achievements.total ? `/${n(g.achievements.total)}` : ''} ${achWord(g)}</span>`);
  }
  return `<button class="tile" data-id="${esc(g.id)}" style="--c:${PLATFORMS[g.platform].color}">
    ${caseArt(g, opts)}
    <div class="tile-name">${esc(g.title)}</div>
    <div class="tile-sub">${sub.join('')}</div>
  </button>`;
}
const SCORE_ICONS = {
  games: '<path d="M7 8h10a5 5 0 0 1 4.8 6.4l-1 3.3a2.5 2.5 0 0 1-4.3.9L14.6 16H9.4l-1.9 2.6a2.5 2.5 0 0 1-4.3-.9l-1-3.3A5 5 0 0 1 7 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 11v3M6.5 12.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="12" r="1.1" fill="currentColor"/>',
  hours: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  ach: '<path d="M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  done: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.3l2.7 2.7L16 9.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  plat: '<path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.6 9.1l5.8-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  gs: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15 9.5a3.5 3.5 0 1 0 .5 4H12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};
const score = (value, label, gold = false, icon = null) =>
  `<div class="score ${gold ? 'gold' : ''}">${icon ? `<svg class="score-icon" viewBox="0 0 24 24" aria-hidden="true">${SCORE_ICONS[icon]}</svg>` : ''}<div class="big">${value}</div><div class="big-label">${label}</div></div>`;

const gamesOf = (p) => state.lib.games.filter((g) => g.platform === p);
const activePlatforms = () => Object.keys(PLATFORMS).filter((p) => state.lib.platforms?.[p]?.enabled || gamesOf(p).length);
const byRecent = (a, b) => (b.lastPlayed || '').localeCompare(a.lastPlayed || '');
const played = (g) => (g.hours || 0) > 0 || g.achievements?.unlocked;

// ---------- Presence ("now playing") ----------
const nowPlaying = () => state.presence?.playing?.[0] || null;
function liveText(p) {
  const mins = p.since ? Math.max(1, Math.round((Date.now() - new Date(p.since)) / 60000)) : null;
  if (mins === null) return t('live.playing');
  const d = mins < 60 ? `${mins} ${MIN()}` : `${Math.floor(mins / 60)} ${H()} ${String(mins % 60).padStart(2, '0')}`;
  return t('live.playingFor', { d });
}
function renderLivePill() {
  const el = $('#live');
  const pres = state.presence;
  // No presence tracking (disabled or no platform connected): nothing to show
  if (!pres || !pres.updatedAt) return (el.hidden = true);
  el.hidden = false;
  const p = nowPlaying();
  if (p) {
    el.className = 'live is-playing';
    el.innerHTML = `<span class="pulse" aria-hidden="true"></span><span class="live-label">${t('live.inGame')}</span><b>${esc(p.title)}</b>`;
    el.dataset.open = p.gameId || '';
    el.title = t('live.on', { text: liveText(p), p: PLATFORMS[p.platform]?.label || p.platform });
    el.disabled = !p.gameId;
    return;
  }
  const online = Object.entries(pres.online || {}).filter(([, v]) => v).map(([k]) => PLATFORMS[k]?.label || k);
  el.className = `live ${online.length ? 'is-online' : 'is-offline'}`;
  el.innerHTML = `<span class="dot-status" aria-hidden="true"></span><span>${t(online.length ? 'live.online' : 'live.offline')}</span>`;
  el.dataset.open = '';
  el.disabled = true;
  el.title = online.length ? t('live.connected', { list: online.join(', ') }) : t('live.noGame');
}

// ---------- Home ----------
function heroBlock(g, recent, swap = false) {
  const pct = pctOf(g);
  const live = nowPlaying();
  const isLive = live && live.gameId === g.id;
  const when = isLive
    ? t('live.on', { text: liveText(live), p: PLATFORMS[g.platform].label })
    : g.lastPlayed
    ? t('hero.last', { ago: ago(g.lastPlayed), p: PLATFORMS[g.platform].label })
    : PLATFORMS[g.platform].label;
  return `<section class="hero" style="--c:${PLATFORMS[g.platform].color}">
    ${heroArt(g, swap)}
    <div class="hero-inner">
      <div>
        ${logoOrTitle(g)}
        <p class="hero-when ${isLive ? 'is-live' : ''}">${isLive ? '<span class="pulse" aria-hidden="true"></span>' : ''}${esc(when)}</p>
        <div class="hero-numbers">
          ${g.hours ? `<div><div class="big">${n(g.hours)}<small>${H()}</small></div><div class="big-label">${t('hero.played')}</div></div>` : ''}
          ${g.achievements ? `<div><div class="big">${n(g.achievements.unlocked)}${g.achievements.total ? `<small>/${n(g.achievements.total)}</small>` : ''}</div><div class="big-label">${t('hero.unlocked', { what: achWord(g) })}</div></div>` : ''}
          ${pct !== null ? `<div><div class="big" style="color:var(--xp)">${nf.format(Math.round(pct))}<small>%</small></div><div class="big-label">${t('hero.complete')}</div></div>` : ''}
        </div>
        <div class="hero-actions"><button class="btn" data-open="${esc(g.id)}">${t('btn.view')}</button></div>
      </div>
      <div class="picker" role="group" aria-label="${esc(t('hero.pick'))}">
        ${recent.map((r) => `<button class="pick" data-feature="${esc(r.id)}" aria-pressed="${r.id === g.id}" aria-label="${esc(r.title)}" style="--c:${PLATFORMS[r.platform].color}">${caseArt(r, { eager: true })}</button>`).join('')}
      </div>
    </div>
  </section>`;
}

function recentGames() {
  const live = nowPlaying();
  const list = state.lib.games.filter((g) => g.lastPlayed && played(g)).sort(byRecent).slice(0, 6);
  const liveGame = live?.gameId && gameById(live.gameId);
  if (liveGame) return [liveGame, ...list.filter((g) => g.id !== liveGame.id)].slice(0, 6);
  return list;
}

function renderHome() {
  const { stats, games } = state.lib;
  const recent = recentGames();
  const live = nowPlaying();
  const featured =
    (state.featured && gameById(state.featured)) ||
    (live?.gameId && gameById(live.gameId)) ||
    recent.find((g) => g.hero) ||
    recent[0] ||
    [...games].sort((a, b) => (b.hours || 0) - (a.hours || 0))[0];
  const top = games.filter((g) => g.hours && !isOnline(g)).sort((a, b) => b.hours - a.hours).slice(0, 6);
  const maxH = top[0]?.hours || 1;
  const online = games.filter((g) => isOnline(g) && played(g)).sort((a, b) => (b.hours || 0) - (a.hours || 0));
  const onlineHours = online.reduce((sum, g) => sum + (g.hours || 0), 0);
  const done = games.filter((g) => g.completed).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const recentRow = games.filter((g) => g.lastPlayed && played(g)).sort(byRecent).slice(0, 14);

  const scores = [score(n(stats.games), t('home.games'), false, 'games'), score(`${n(stats.hours)}<small>${H()}</small>`, t('home.total'), false, 'hours'), score(n(stats.achievements), t('home.ach'), false, 'ach'), score(n(stats.completed), t('home.done'), true, 'done')];
  if (stats.platinums) scores.push(score(n(stats.platinums), t('home.plat'), false, 'plat'));
  if (stats.gamerscore) scores.push(score(n(stats.gamerscore), 'Gamerscore', false, 'gs'));

  app.innerHTML = `
    ${featured ? heroBlock(featured, recent.length ? recent : [featured]) : ''}
    <div class="wrap">
      <div class="scoreboard">${scores.join('')}</div>
      ${activityTeaser()}
      ${recentRow.length ? `<section class="shelf"><div class="shelf-head"><h2>${t('home.recent')}</h2></div>
        <div class="row">${recentRow.map((g) => tile(g)).join('')}</div></section>` : ''}
      ${top.length ? `<section class="shelf"><div class="shelf-head"><h2>${t(online.length ? 'home.topSolo' : 'home.top')}</h2></div>
        <div class="ranking">${top.map((g) => `<button class="rank" data-open="${esc(g.id)}" style="--c:${PLATFORMS[g.platform].color}">
          ${caseArt(g)}
          <div><div class="rank-name">${esc(g.title)}</div><div class="rank-bar"><span style="width:${(g.hours / maxH) * 100}%"></span></div></div>
          <div class="big">${n(g.hours)}<small>${H()}</small></div></button>`).join('')}</div></section>` : ''}
      ${online.length ? `<section class="shelf"><div class="shelf-head"><h2>${t('home.online')}</h2><a href="#/en-ligne">${t('home.hoursTotal', { n: n(onlineHours) })}</a></div>
        <div class="row">${online.slice(0, 14).map((g) => tile(g)).join('')}</div></section>` : ''}
      ${backlogTeaser()}
      ${done.length ? `<section class="shelf"><div class="shelf-head"><h2>${t('home.doneShelf')}</h2><a href="#/100">${t('btn.seeAll')}</a></div>
        <div class="row">${done.slice(0, 14).map((g) => tile(g)).join('')}</div></section>` : ''}
      ${activePlatforms().map((p) => {
        const list = gamesOf(p).filter(played).sort((a, b) => (b.hours || 0) - (a.hours || 0)).slice(0, 14);
        return list.length ? `<section class="shelf"><div class="shelf-head"><h2>${PLATFORMS[p].label}</h2><a href="#/${p}">${t('home.allGames', { n: n(gamesOf(p).length) })}</a></div>
          <div class="row">${list.map((g) => tile(g)).join('')}</div></section>` : '';
      }).join('')}
    </div>`;
}

// ---------- Activity ----------
function dailyTotals() {
  const out = {};
  for (const [d, games] of Object.entries(state.activity?.days || {})) out[d] = Object.values(games).reduce((a, b) => a + b, 0);
  return out;
}
const isoDay = (dt) => dt.toLocaleDateString('sv-SE');
const addDays = (d, k) => {
  const dt = new Date(`${d}T12:00:00`);
  dt.setDate(dt.getDate() + k);
  return isoDay(dt);
};
function streaks(totals, today) {
  let current = 0;
  let d = totals[today] ? today : addDays(today, -1);
  while (totals[d]) {
    current++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  const all = Object.keys(totals).filter((k) => totals[k] > 0).sort();
  for (let i = 0; i < all.length; i++) {
    run = i && addDays(all[i - 1], 1) === all[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best };
}
function sumRange(totals, from, to) {
  return Object.entries(totals).reduce((s, [d, h]) => (d >= from && d <= to ? s + h : s), 0);
}
const mondayOf = (d) => {
  const dt = new Date(`${d}T12:00:00`);
  return addDays(d, -((dt.getDay() + 6) % 7));
};

/** GitHub-style calendar: one column per week, one cell per day */
function heatmap(values, today, weeks = 53, unit = 'h') {
  const start = addDays(mondayOf(today), -(weeks - 1) * 7);
  const nonZero = Object.values(values).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => nonZero[Math.floor((nonZero.length - 1) * p)] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.8)];
  const level = (v) => (!v ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);
  let cells = '';
  let months = '';
  let lastMonth = '';
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(start, w * 7);
    const m = new Date(`${weekStart}T12:00:00`).toLocaleDateString(loc(), { month: 'short' });
    months += `<span>${m !== lastMonth ? esc(m.replace('.', '')) : ''}</span>`;
    lastMonth = m;
    for (let k = 0; k < 7; k++) {
      const d = addDays(weekStart, k);
      if (d > today) {
        cells += '<i class="hm-future"></i>';
        continue;
      }
      const v = values[d] || 0;
      const label = `${dayLabel(d)}: ${v ? (unit === 'h' ? durText(v) : t('hm.ach', { n: v })) : t('hm.nothing')}`;
      cells += `<i class="l${level(v)}" data-day="${d}" title="${esc(label)}"></i>`;
    }
  }
  return `<div class="heatmap" style="--weeks:${weeks}">
    <div class="hm-months">${months}</div>
    <div class="hm-days">${[0, 1, 2, 3, 4, 5, 6].map((k) => `<span>${k % 2 ? '' : k < 6 ? esc(new Date(2024, 0, 1 + k).toLocaleDateString(loc(), { weekday: 'short' })) : ''}</span>`).join('')}</div>
    <div class="hm-grid">${cells}</div>
  </div>
  <div class="hm-legend"><span>${t('hm.less')}</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>${t('hm.more')}</span></div>`;
}

function activityTeaser() {
  if (!state.activity?.since) return '';
  const today = state.activity.today;
  const totals = dailyTotals();
  const week = sumRange(totals, mondayOf(today), today);
  const { current } = streaks(totals, today);
  return `<section class="shelf"><div class="shelf-head"><h2>${t('act.yours')}</h2><a href="#/activite">${t('act.seeCal')}</a></div>
    <a class="teaser" href="#/activite">
      <div class="teaser-stats">
        <div><div class="big">${durText(week)}</div><div class="big-label">${t('act.week')}</div></div>
        <div><div class="big">${n(current)}<small>${t('u.d')}</small></div><div class="big-label">${t('act.row')}</div></div>
      </div>
      <div class="teaser-map">${heatmap(totals, today, 30)}</div>
    </a></section>`;
}

function renderActivity() {
  const a = state.activity;
  if (!a?.since) {
    app.innerHTML = `<div class="wrap"><div class="empty"><strong>${t('act.emptyT')}</strong>${t('act.empty')}</div></div>`;
    return;
  }
  const today = a.today;
  const totals = dailyTotals();
  const ach = {};
  for (const [d, games] of Object.entries(a.achievements || {})) ach[d] = Object.values(games).reduce((x, y) => x + y, 0);
  const mode = state.view.mode || 'hours';
  const { current, best } = streaks(totals, today);
  const monthStart = today.slice(0, 8) + '01';
  const record = Object.entries(totals).sort((x, y) => y[1] - x[1])[0];

  // Last 26 weeks
  const weeks = [];
  for (let w = 25; w >= 0; w--) {
    const from = addDays(mondayOf(today), -w * 7);
    weeks.push({ from, h: sumRange(totals, from, addDays(from, 6)) });
  }
  const maxW = Math.max(1, ...weeks.map((w) => w.h));

  // Games of the month
  const perGame = {};
  for (const [d, games] of Object.entries(a.days || {})) {
    if (d < monthStart) continue;
    for (const [id, h] of Object.entries(games)) perGame[id] = (perGame[id] || 0) + h;
  }
  const topMonth = Object.entries(perGame).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([id, h]) => ({ g: gameById(id), h })).filter((x) => x.g);
  const maxM = topMonth[0]?.h || 1;
  const monthName = new Date(`${today}T12:00:00`).toLocaleDateString(loc(), { month: 'long' });

  app.innerHTML = `
    <section class="page-head wrap">
      <h1>${t('act.title')}</h1>
      <p>${esc(t('act.intro', { date: date(a.since) }))}</p>
    </section>
    <div class="wrap">
      <div class="scoreboard">
        ${score(durText(sumRange(totals, mondayOf(today), today)), t('act.week'))}
        ${score(durText(sumRange(totals, monthStart, today)), esc(t('act.inMonth', { month: monthName })))}
        ${score(`${n(current)}<small>${t('u.d')}</small>`, t('act.streak'), current > 0)}
        ${score(`${n(best)}<small>${t('u.d')}</small>`, t('act.best'))}
        ${record ? score(durText(record[1]), esc(t('act.record', { date: dayMonth(record[0]) }))) : ''}
      </div>
      <section class="shelf">
        <div class="shelf-head"><h2>${t('act.cal')}</h2>
          <div class="seg" role="group" aria-label="${esc(t('act.show'))}">
            <button data-mode="hours" aria-pressed="${mode === 'hours'}">${t('act.playtime')}</button>
            <button data-mode="ach" aria-pressed="${mode === 'ach'}">${t('act.steamAch')}</button>
          </div>
        </div>
        <div class="panel">${heatmap(mode === 'hours' ? totals : ach, today, 53, mode === 'hours' ? 'h' : 'a')}
          <p class="hm-detail" id="hmDetail">${t('act.hover')}</p></div>
      </section>
      <div class="split">
        <section class="shelf"><div class="shelf-head"><h2>${t('act.perWeek')}</h2></div>
          <div class="panel"><div class="weeks">${weeks
            .map((w, i) => `<div class="wk" title="${esc(t('act.weekOf', { date: dayMonth(w.from), d: durText(w.h) }))}">
              <span style="height:${(w.h / maxW) * 100}%"></span><em>${i % 4 === 0 ? esc(dayMonth(w.from, 'short').replace('.', '')) : ''}</em></div>`)
            .join('')}</div></div></section>
        <section class="shelf"><div class="shelf-head"><h2>${esc(t('act.monthGames', { month: monthName }))}</h2></div>
          <div class="panel">${topMonth.length ? `<div class="month-list">${topMonth
            .map(({ g, h }) => `<button class="rank compact" data-open="${esc(g.id)}" style="--c:${PLATFORMS[g.platform].color}">${caseArt(g)}
              <div><div class="rank-name">${esc(g.title)}</div><div class="rank-bar"><span style="width:${(h / maxM) * 100}%"></span></div></div>
              <div class="big">${durText(h)}</div></button>`)
            .join('')}</div>` : `<p class="muted">${t('act.noSession')}</p>`}</div></section>
      </div>
    </div>`;

  app.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      state.view.mode = b.dataset.mode;
      renderActivity();
      app.querySelectorAll('.heatmap').forEach((h) => (h.scrollLeft = h.scrollWidth));
    })
  );
  const detail = $('#hmDetail');
  const show = (cell) => {
    const d = cell?.dataset.day;
    if (!d) return;
    const src = mode === 'hours' ? a.days[d] : a.achievements[d];
    const list = Object.entries(src || {}).sort((x, y) => y[1] - x[1]).map(([id, v]) => `${esc(gameById(id)?.title || id)} (${mode === 'hours' ? durText(v) : t('hm.ach', { n: v })})`);
    detail.innerHTML = `<b>${esc(dayLabel(d))}</b> ${list.length ? list.join(', ') : t('act.noDay')}`;
  };
  app.querySelector('.hm-grid')?.addEventListener('mouseover', (e) => show(e.target.closest('[data-day]')));
  app.querySelector('.hm-grid')?.addEventListener('click', (e) => show(e.target.closest('[data-day]')));
}

// ---------- Pile of shame ----------
const inPile = (g) => !['ignored', 'done', 'dropped'].includes(noteOf(g)?.status) && !g.completed;
const neverPlayed = () => state.lib.games.filter((g) => g.hours === 0 && inPile(g));
const forgotten = () => {
  const limit = new Date(Date.now() - 90 * 86400000).toISOString();
  return state.lib.games.filter((g) => g.hours > 0 && g.hours < 2 && inPile(g) && (!g.lastPlayed || g.lastPlayed < limit));
};

function backlogTeaser() {
  const pile = neverPlayed();
  if (!pile.length) return '';
  const hours = pile.reduce((s, g) => s + (g.timeToBeat || 0), 0);
  return `<section class="shelf"><div class="shelf-head"><h2>${t('pile.title')}</h2><a href="#/pile">${t('pile.never', { n: n(pile.length) })}</a></div>
    <div class="row">${[...pile].sort((a, b) => (a.timeToBeat || 999) - (b.timeToBeat || 999)).slice(0, 14).map((g) => tile(g, { ttb: true })).join('')}</div>
    ${hours ? `<p class="muted shelf-note">${t('pile.about', { n: n(hours) })}</p>` : ''}</section>`;
}

const TTB_FILTERS = { all: 'f.all', short: 'f.short', mid: 'f.mid', long: 'f.long' };
function renderPile() {
  const pile = neverPlayed();
  const old = forgotten();
  const known = pile.filter((g) => g.timeToBeat);
  const hours = known.reduce((s, g) => s + g.timeToBeat, 0);
  const f = state.view.ttb || 'all';
  const filtered = pile.filter((g) => {
    const d = g.timeToBeat;
    if (f === 'short') return d && d < 10;
    if (f === 'mid') return d && d >= 10 && d <= 30;
    if (f === 'long') return d && d > 30;
    return true;
  }).sort((a, b) => (a.timeToBeat || 999) - (b.timeToBeat || 999) || a.title.localeCompare(b.title, loc()));
  const showcase = [...pile].find((g) => g.hero) || pile[0];

  app.innerHTML = `
    <section class="banner" style="--c:var(--nintendo)">
      ${bannerArt(pile, showcase)}
      <div class="banner-inner">
        <div><h1>${t('pile.title')}</h1><div class="who">${t('pile.who')}</div></div>
        <div class="banner-stats">
          <div><div class="big">${n(pile.length)}</div><div class="big-label">${t('pile.neverLabel')}</div></div>
          ${hours ? `<div><div class="big">${n(hours)}<small>${H()}</small></div><div class="big-label">${t('pile.toFinish')}${known.length < pile.length ? ` ${t('pile.estimated', { n: n(known.length) })}` : ''}</div></div>
          <div><div class="big">${n(hours / 7)}<small>${t('u.wk')}</small></div><div class="big-label">${t('pile.perDay')}</div></div>` : ''}
        </div>
      </div>
    </section>
    <div class="wrap">
      ${pile.length ? `<div class="roulette-cta"><button class="btn big-btn" id="spin">${ICON.dice}${t('pile.spin')}</button>
        <span class="muted">${t(f !== 'all' ? 'pile.spinFiltered' : 'pile.spinHint')}</span></div>
        <div id="roulette" hidden></div>` : ''}
      <div class="toolbar">
        <div class="seg" role="group" aria-label="${esc(t('pile.duration'))}">${Object.entries(TTB_FILTERS).map(([k, l]) => `<button data-ttb="${k}" aria-pressed="${f === k}">${t(l)}</button>`).join('')}</div>
        <span class="count">${t('pile.count', { n: n(filtered.length) })}</span>
      </div>
      ${filtered.length ? `<div class="grid">${filtered.map((g) => tile(g, { ttb: true })).join('')}</div>`
        : `<div class="empty"><strong>${t(pile.length ? 'pile.noneSlice' : 'pile.emptyT')}</strong>${t(pile.length ? 'pile.tryFilter' : 'pile.allLaunched')}</div>`}
      ${old.length ? `<section class="shelf" style="margin-top:56px"><div class="shelf-head"><h2>${t('pile.forgot')}</h2><span class="muted">${t('pile.forgotSub')}</span></div>
        <div class="row">${old.map((g) => tile(g)).join('')}</div></section>` : ''}
      <p class="muted shelf-note">${t('pile.tip')}${known.length < pile.length ? ` ${t('pile.tipTtb')}` : ''}</p>
    </div>`;

  app.querySelectorAll('[data-ttb]').forEach((b) => b.addEventListener('click', () => { state.view.ttb = b.dataset.ttb; renderPile(); }));
  $('#spin')?.addEventListener('click', () => spin(filtered.length ? filtered : pile));
}

function spin(pool) {
  const box = $('#roulette');
  box.hidden = false;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Strip of covers that scrolls, then stops on the picked game
  const strip = [];
  for (let i = 0; i < 28; i++) strip.push(pool[Math.floor(Math.random() * pool.length)]);
  strip.push(pick, ...pool.slice(0, 3));
  box.innerHTML = `<div class="reel"><div class="reel-track">${strip.map((g) => `<div class="reel-item" style="--c:${PLATFORMS[g.platform].color}">${caseArt(g, { eager: true })}</div>`).join('')}</div><div class="reel-mark"></div></div>
    <div class="reel-result" hidden></div>`;
  const track = box.querySelector('.reel-track');
  const item = box.querySelector('.reel-item');
  const w = item.getBoundingClientRect().width + 14;
  const target = 28 * w - (box.querySelector('.reel').clientWidth / 2 - w / 2);
  track.style.transition = reduce ? 'none' : 'transform 3.2s cubic-bezier(.12,.75,.12,1)';
  requestAnimationFrame(() => requestAnimationFrame(() => (track.style.transform = `translateX(${-target}px)`)));
  setTimeout(() => {
    const res = box.querySelector('.reel-result');
    res.hidden = false;
    res.innerHTML = `<div><div class="muted">${t('r.tonight')}</div><h3>${esc(pick.title)}</h3>
      <div class="muted">${esc(PLATFORMS[pick.platform].label)}${pick.timeToBeat ? `, ${t('r.about', { d: durText(pick.timeToBeat) })}` : ''}</div></div>
      <div class="reel-actions"><button class="btn" data-open="${esc(pick.id)}">${t('btn.view')}</button><button class="btn ghost" id="respin">${t('r.again')}</button></div>`;
    $('#respin').addEventListener('click', () => spin(pool));
  }, reduce ? 50 : 3300);
}

// ---------- My ratings ----------
function renderNotes() {
  const rated = state.lib.games.filter((g) => noteOf(g));
  const byTier = Object.fromEntries(TIERS.map((x) => [x, rated.filter((g) => noteOf(g).tier === x).sort((a, b) => (noteOf(b).rating ?? -1) - (noteOf(a).rating ?? -1))]));
  const reviews = rated.filter((g) => noteOf(g).review || noteOf(g).rating !== null).sort((a, b) => (noteOf(b).updatedAt || '').localeCompare(noteOf(a).updatedAt || ''));
  const tiered = TIERS.some((x) => byTier[x].length);

  app.innerHTML = `
    <section class="page-head wrap"><h1>${t('notes.title')}</h1><p>${t('notes.intro')}</p></section>
    <div class="wrap">
      ${tiered ? `<section class="shelf"><div class="shelf-head"><h2>${t('notes.tierlist')}</h2></div>
        <div class="tierlist">${TIERS.map((x) => `<div class="tier-row"><div class="tier-label t-${x}">${x}</div>
          <div class="tier-items">${byTier[x].map((g) => `<button class="tier-item" data-open="${esc(g.id)}" title="${esc(g.title)}" style="--c:${PLATFORMS[g.platform].color}">${caseArt(g)}</button>`).join('') || `<span class="muted">${t('notes.noGame')}</span>`}</div></div>`).join('')}</div></section>` : ''}
      ${reviews.length ? `<section class="shelf"><div class="shelf-head"><h2>${t('notes.reviews')}</h2></div>
        <div class="reviews">${reviews.map((g) => {
          const nt = noteOf(g);
          return `<button class="review" data-open="${esc(g.id)}" style="--c:${PLATFORMS[g.platform].color}">
            ${caseArt(g)}
            <div class="review-body"><div class="review-top"><b>${esc(g.title)}</b>${nt.rating !== null ? `<span class="rating">${n1(nt.rating)}<small>/10</small></span>` : ''}</div>
              <div class="gp-tags">${nt.tier ? `<span class="tag t-${nt.tier}">${t('notes.tier', { t: nt.tier })}</span>` : ''}${nt.status ? `<span class="tag">${statusLabel(nt.status)}</span>` : ''}</div>
              ${nt.review ? `<p>${esc(nt.review)}</p>` : ''}</div></button>`;
        }).join('')}</div></section>` : ''}
      ${!rated.length ? `<div class="empty"><strong>${t('notes.emptyT')}</strong>${t('notes.empty')}</div>` : ''}
      ${(state.lib.hiddenGames || []).length ? `<p class="muted shelf-note"><a class="link-btn" href="#/masques">${t('notes.seeHidden', { n: n(state.lib.hiddenGames.length) })}</a></p>` : ''}
    </div>`;
}

function renderHidden() {
  const list = state.lib.hiddenGames || [];
  app.innerHTML = `
    <section class="page-head wrap"><h1>${t('hidden.title')}</h1>
      <p>${t('hidden.intro')}</p></section>
    <div class="wrap">
      ${list.length ? `<div class="grid">${list.map((h) => `<div class="tile hidden-tile" style="--c:${PLATFORMS[h.platform]?.color || 'var(--muted)'}">
          ${caseArt({ ...h, achievements: null, completed: false })}
          <div class="tile-name">${esc(h.title)}</div>
          <div class="tile-sub"><span>${esc(PLATFORMS[h.platform]?.label || h.platform)}${h.system && h.system !== PLATFORMS[h.platform]?.label ? `, ${esc(h.system)}` : ''}</span></div>
          <button class="btn ghost unhide-btn" data-unhide="${esc(h.id)}">${t('hidden.show')}</button>
        </div>`).join('')}</div>`
        : `<div class="empty"><strong>${t('hidden.emptyT')}</strong>${t('hidden.empty')}</div>`}
    </div>`;
  app.querySelectorAll('[data-unhide]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.unhide;
    const prev = state.notes[id] || {};
    try {
      const saved = await saveNote(id, { ...prev, hidden: false });
      if (saved) state.notes[id] = saved;
      else delete state.notes[id];
    } catch (e) {
      return alert(e.message);
    }
    await load();
  }));
}

// ---------- Platform pages and 100% ----------
const SORTS = {
  hours: ['sort.hours', (a, b) => (b.hours ?? -1) - (a.hours ?? -1)],
  recent: ['sort.recent', byRecent],
  progress: ['sort.progress', (a, b) => (pctOf(b) ?? -1) - (pctOf(a) ?? -1)],
  rating: ['sort.rating', (a, b) => (noteOf(b)?.rating ?? -1) - (noteOf(a)?.rating ?? -1)],
  ttb: ['sort.ttb', (a, b) => (a.timeToBeat ?? 9999) - (b.timeToBeat ?? 9999)],
  title: ['sort.title', (a, b) => a.title.localeCompare(b.title, loc())],
};
const FILTERS = { all: 'f.all', solo: 'f.solo', online: 'f.online', played: 'f.played', completed: 'pct100', unplayed: 'f.unplayed' };

const LIST_PAGES = {
  100: { title: 'list.doneTitle', color: 'var(--xp)', pick: (g) => g.completed, sort: 'recent' },
  'en-ligne': { title: 'list.onlineTitle', color: '#3ddc84', pick: (g) => isOnline(g), sort: 'hours', who: 'list.onlineWho' },
};

function renderList(key) {
  const page = LIST_PAGES[key];
  const isDone = Boolean(page);
  const base = page ? state.lib.games.filter(page.pick) : gamesOf(key);
  const color = page ? page.color : PLATFORMS[key].color;
  const byHours = [...base].sort((a, b) => (b.hours || 0) - (a.hours || 0));
  const showcase = byHours.find((g) => g.hero) || byHours[0];
  const info = state.lib.platforms?.[key];
  const hours = base.reduce((sum, g) => sum + (g.hours || 0), 0);
  const ach = base.reduce((sum, g) => sum + (g.achievements?.unlocked || 0), 0);
  state.view.q ??= '';
  state.view.filter ??= 'all';
  state.view.sort ??= page ? page.sort : 'hours';
  const totalHours = state.lib.stats.hours || 1;

  app.innerHTML = `
    <section class="banner" style="--c:${color}">
      ${bannerArt(byHours, showcase)}
      <div class="banner-inner">
        <div><h1>${page ? t(page.title) : PLATFORMS[key].label}</h1>
          ${page?.who ? `<div class="who">${t(page.who)}</div>` : ''}
          ${!page && info?.profile?.name && info.profile.name !== PLATFORMS[key].label ? `<div class="who">${esc(info.profile.name)}</div>` : ''}</div>
        <div class="banner-stats">
          <div><div class="big">${n(base.length)}</div><div class="big-label">${t('home.games')}</div></div>
          <div><div class="big">${n(hours)}<small>${H()}</small></div><div class="big-label">${t('hero.played')}</div></div>
          ${key !== 'nintendo' ? `<div><div class="big">${n(ach)}</div><div class="big-label">${t(key === 'playstation' ? 'ach.trophies' : 'ach.word')}</div></div>` : ''}
          ${!isDone ? `<div><div class="big" style="color:var(--xp)">${n(base.filter((g) => g.completed).length)}</div><div class="big-label">${t('list.at100')}</div></div>` : ''}
          ${key === 'en-ligne' ? `<div><div class="big" style="color:#3ddc84">${n((hours / totalHours) * 100)}<small>%</small></div><div class="big-label">${t('list.share')}</div></div>` : ''}
        </div>
      </div>
    </section>
    <div class="wrap">
      <div class="toolbar">
        <input class="search" id="q" type="search" placeholder="${esc(t('list.search'))}" value="${esc(state.view.q)}" aria-label="${esc(t('list.search'))}">
        <select class="select" id="sort" aria-label="${esc(t('list.sortBy'))}">${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}" ${state.view.sort === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
        ${key === 'nintendo' && isOwner() ? `<button class="btn add-btn" id="addNintendo">${t('list.add')}</button>` : ''}
        ${isDone ? '' : `<div class="seg" role="group" aria-label="${esc(t('list.filter'))}">${Object.entries(FILTERS).map(([k, l]) => `<button data-filter="${k}" aria-pressed="${state.view.filter === k}">${t(l)}</button>`).join('')}</div>`}
        <span class="count" id="count"></span>
      </div>
      <div id="list"></div>
    </div>`;

  const draw = () => {
    const q = state.view.q.trim().toLowerCase();
    let list = base.filter((g) => !q || g.title.toLowerCase().includes(q));
    const f = isDone ? 'all' : state.view.filter;
    if (f === 'played') list = list.filter(played);
    if (f === 'completed') list = list.filter((g) => g.completed);
    if (f === 'unplayed') list = list.filter((g) => g.hours === 0);
    if (f === 'solo') list = list.filter((g) => !isOnline(g));
    if (f === 'online') list = list.filter(isOnline);
    list.sort(SORTS[state.view.sort][1]);
    $('#count').textContent = t('list.count', { n: n(list.length) });
    $('#list').innerHTML = list.length
      ? `<div class="grid">${list.map((g) => tile(g)).join('')}</div>`
      : `<div class="empty">${emptyText(key, Boolean(q) || f !== 'all')}</div>`;
  };
  draw();

  let timer;
  $('#q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { state.view.q = e.target.value; draw(); }, 120); });
  $('#sort').addEventListener('change', (e) => { state.view.sort = e.target.value; draw(); });
  $('#addNintendo')?.addEventListener('click', () => openNintendoForm(null));
  app.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    state.view.filter = b.dataset.filter;
    app.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    draw();
  }));
}

function emptyText(key, filtered) {
  const k = filtered ? 'match' : key === '100' ? 'done' : key === 'en-ligne' ? 'online' : key === 'nintendo' ? 'nin' : 'none';
  return `<strong>${t(`empty.${k}T`)}</strong>${t(`empty.${k}`)}`;
}

// ---------- Game page ----------
/** Average time to beat (IGDB) and how far the player is */
function ttbBlock(g) {
  if (isOnline(g)) return '';
  const d = g.timeToBeatDetail || (g.timeToBeat ? { normally: g.timeToBeat } : null);
  if (!d || !(d.normally || d.hastily || d.completely)) {
    return `<div class="progress"><div class="progress-top"><b>${t('ttb.title')}</b><span>${t('ttb.unknown')}</span></div>
      <p class="muted ttb-hint">${t(state.lib.igdbEnabled ? 'ttb.noData' : 'ttb.needKeys')}</p></div>`;
  }
  const main = d.normally || d.hastily || d.completely;
  const cols = [
    [t('ttb.fast'), d.hastily],
    [t('ttb.main'), d.normally],
    [t('ttb.full'), d.completely],
  ].filter(([, v]) => v);
  const h = g.hours || 0;
  const ratio = h / main;
  let verdict;
  if (!h) verdict = t('ttb.notStarted', { d: durText(main) });
  else if (g.completed) verdict = t('ttb.done', { d: durText(h) });
  else if (ratio < 1) verdict = t('ttb.remain', { d: durText(h), r: durText(main - h) });
  else verdict = t('ttb.over', { d: durText(h), x: nf.format(Math.round(ratio * 10) / 10) });
  return `<div class="progress">
    <div class="progress-top"><b>${t('ttb.title')}</b><span>${t('ttb.avg')}</span></div>
    <div class="ttb-cols">${cols.map(([l, v]) => `<div><div class="big">${durText(v)}</div><div class="big-label">${l}</div></div>`).join('')}</div>
    <div class="xpbar ttb-bar"><span style="width:${Math.min(100, ratio * 100)}%"></span></div>
    <p class="ttb-verdict">${esc(verdict)}</p>
  </div>`;
}

function noteBlock(g) {
  const nt = noteOf(g);
  if (state.editing) {
    const v = nt || {};
    return `<form class="progress note-form" id="noteForm">
      <div class="progress-top"><b>${t('note.mine')}</b></div>
      <label class="field"><span>${t('note.tier')}</span>
        <div class="seg tiers" role="group" aria-label="${esc(t('note.tier'))}">${['', ...TIERS].map((x) => `<button type="button" data-tier="${x}" aria-pressed="${(v.tier || '') === x}" class="${x ? `t-${x}` : ''}">${x || t('note.none')}</button>`).join('')}</div></label>
      <div class="field-row">
        <label class="field"><span>${t('note.rating')}</span><input class="select" type="number" name="rating" min="0" max="10" step="0.5" value="${v.rating ?? ''}" placeholder="—"></label>
        <label class="field"><span>${t('note.status')}</span><select class="select" name="status"><option value="">${t('note.none')}</option>${STATUS_KEYS.map((k) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${statusLabel(k)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>${t('note.type')}</span><select class="select" name="mode">
        <option value="">${t('note.auto', { x: t(g.online === true ? 'note.detOnline' : g.online === false ? 'note.detSolo' : 'note.detNone') })}</option>
        <option value="solo" ${v.mode === 'solo' ? 'selected' : ''}>${t('f.solo')}</option>
        <option value="online" ${v.mode === 'online' ? 'selected' : ''}>${t('f.online')}</option></select></label>
      <label class="field"><span>${t('note.mine')}</span><textarea class="select" name="review" rows="4" maxlength="2000" placeholder="${esc(t('note.ph'))}">${esc(v.review || '')}</textarea></label>
      <p class="form-error" id="noteError" hidden></p>
      <div class="reel-actions"><button class="btn" type="submit">${t('btn.save')}</button><button class="btn ghost" type="button" id="noteCancel">${t('btn.cancel')}</button></div>
    </form>`;
  }
  if (!nt) return isOwner() ? `<div class="gp-actions"><button class="btn ghost" id="noteEdit">${t('note.rate')}</button></div>` : '';
  return `<div class="progress">
    <div class="progress-top"><b>${t('note.mine')}</b>${isOwner() ? `<button class="link-btn" id="noteEdit">${t('btn.edit')}</button>` : ''}</div>
    <div class="my-note">
      ${nt.tier ? `<span class="tier-badge big t-${nt.tier}">${nt.tier}</span>` : ''}
      ${nt.rating !== null ? `<span class="rating">${n1(nt.rating)}<small>/10</small></span>` : ''}
      ${nt.status ? `<span class="tag">${statusLabel(nt.status)}</span>` : ''}
      ${nt.mode ? `<span class="tag">${t(nt.mode === 'online' ? 'note.manualOnline' : 'note.manualSolo')}</span>` : ''}
    </div>
    ${nt.review ? `<p class="note">${esc(nt.review)}</p>` : ''}
  </div>`;
}

function openGame(id) {
  const g = gameById(id);
  if (!g) return;
  state.editing = false;
  state.picking = false;
  drawGame(g);
  const d = $('#gamepage');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

function drawGame(g) {
  const P = PLATFORMS[g.platform];
  const pct = pctOf(g);
  const tr = g.trophies;
  const live = nowPlaying();
  const tags = [`<span class="tag p">${P.label}</span>`];
  if (g.system && g.system !== P.label) tags.push(`<span class="tag">${esc(g.system)}</span>`);
  if (live?.gameId === g.id) tags.push(`<span class="tag live"><span class="pulse"></span>${t('gp.playing')}</span>`);
  if (isOnline(g)) tags.push(`<span class="tag online">${GLOBE}${t('f.online')}</span>`);
  if (g.completed) tags.push(`<span class="tag gold">${esc(g.completedAt ? t('gp.doneOn', { date: date(g.completedAt) }) : t('gp.done'))}</span>`);
  if (tr?.platinum) tags.push(`<span class="tag gold">${t('gp.plat')}</span>`);

  $('#gpBody').innerHTML = `
    <div class="gp-top" style="--c:${P.color}">${heroArt(g)}${g.logo ? img(g.logo, [], { cls: 'hero-logo', eager: true }) : ''}</div>
    <div class="gp-main" style="--c:${P.color}">
      <div class="case-wrap">${caseArt(g, { eager: true })}
        ${isOwner() ? `<button class="link-btn cover-change" id="coverPick">${t(noteOf(g)?.cover ? 'gp.changeCover' : 'gp.wrongCover')}</button>` : ''}</div>
      <div class="gp-info">
        <h2 id="gpTitle">${esc(g.title)}</h2>
        <div class="gp-tags">${tags.join('')}</div>
        ${g.note ? `<p class="note">${esc(g.note)}</p>` : ''}
        <div class="gp-stats">
          ${score(g.hours === null || g.hours === undefined ? '—' : g.hours < 1 && g.hours > 0 ? `${Math.round(g.hours * 60)}<small>${MIN()}</small>` : `${n(g.hours)}<small>${H()}</small>`, g.recentHours ? esc(t('gp.playedRecent', { h: hoursText(g.recentHours) })) : t('gp.played'))}
          ${score(g.lastPlayed ? esc(ago(g.lastPlayed)) : '—', g.lastPlayed ? esc(t('gp.lastOn', { date: date(g.lastPlayed) })) : t('gp.last'))}
          ${g.gamerscore ? score(`${n(g.gamerscore.current)}<small>/${n(g.gamerscore.total)}</small>`, 'Gamerscore') : ''}
        </div>
        ${g.achievements ? `<div class="progress">
          <div class="progress-top"><b>${t(g.platform === 'playstation' ? 'ach.Trophies' : 'ach.Word')}</b>
            <span>${g.achievements.total ? t('gp.of', { a: n(g.achievements.unlocked), b: n(g.achievements.total) }) : n(g.achievements.unlocked)}${pct !== null ? `, ${new Intl.NumberFormat(loc(), { style: 'percent', maximumFractionDigits: 1 }).format(pct / 100)}` : ''}</span></div>
          ${pct !== null ? `<div class="xpbar"><span style="width:${Math.min(100, pct)}%"></span></div>` : ''}
          ${tr ? `<div class="trophies">
            ${tr.hasPlatinum ? `<span>${ICON.cup('#b8c8e8')}${tr.platinum} ${t('tr.plat')}</span>` : ''}
            <span>${ICON.cup('#f2c14e')}${tr.gold} ${t('tr.gold')}</span><span>${ICON.cup('#c4c9d4')}${tr.silver} ${t('tr.silver')}</span><span>${ICON.cup('#d08a55')}${tr.bronze} ${t('tr.bronze')}</span>
          </div>` : ''}
        </div>` : g.platform === 'nintendo' ? `<div class="progress"><div class="progress-top"><b>${t('ach.Word')}</b><span>${t('gp.noNinAch')}</span></div></div>` : ''}
        ${state.picking ? pickerBlock(g) : ''}
        ${ttbBlock(g)}
        ${noteBlock(g)}
        <div class="gp-actions">
          ${g.url ? `<a class="btn ghost" href="${esc(g.url)}" target="_blank" rel="noopener">${esc(t('gp.openOn', { p: P.label }))}</a>` : ''}
          ${g.platform === 'nintendo' && isOwner() ? `<button class="btn ghost" id="editNintendo">${t('gp.editGame')}</button>` : ''}
          ${isOwner() ? `<button class="btn ghost danger" id="hideGame" title="${esc(t('gp.hideHint'))}">${t('gp.hide')}</button>` : ''}
        </div>
      </div>
    </div>`;

  $('#hideGame')?.addEventListener('click', () => setHidden(g, true));
  $('#editNintendo')?.addEventListener('click', () => openNintendoForm(g));
  $('#coverPick')?.addEventListener('click', () => {
    state.picking = true;
    state.pick = { q: g.title, results: null, error: null };
    drawGame(g);
    searchCovers(g);
  });
  $('#pickClose')?.addEventListener('click', () => { state.picking = false; drawGame(g); });
  $('#pickForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.pick.q = new FormData(e.target).get('q');
    searchCovers(g);
  });
  $('#pickReset')?.addEventListener('click', () => chooseCover(g, null));
  document.querySelectorAll('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => chooseCover(g, state.pick.results[Number(b.dataset.pick)]))
  );
  $('#noteEdit')?.addEventListener('click', () => { state.editing = true; drawGame(g); $('#noteForm')?.scrollIntoView({ block: 'nearest' }); });
  $('#noteCancel')?.addEventListener('click', () => { state.editing = false; drawGame(g); });
  const form = $('#noteForm');
  if (form) {
    let tier = noteOf(g)?.tier || '';
    form.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => {
      tier = b.dataset.tier;
      form.querySelectorAll('[data-tier]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const prev = noteOf(g) || {};
      const body = { cover: prev.cover || null, hero: prev.hero || null, igdbId: prev.igdbId ?? null, hidden: prev.hidden === true, tier: tier || null, rating: fd.get('rating') === '' ? null : Number(fd.get('rating')), status: fd.get('status') || null, review: fd.get('review'), mode: fd.get('mode') || null };
      const err = $('#noteError');
      try {
        await storeNote(g, body);
        state.editing = false;
        drawGame(g);
        chrome(); // the number of online games may have changed
        renderPage(); // refresh the page behind the dialog
      } catch (ex) {
        err.hidden = false;
        err.textContent = ex.message;
      }
    });
  }
}

/** Saves a game's note (under its current id) and refreshes the view */
async function storeNote(g, body) {
  const saved = await saveNote(g.id, body);
  for (const id of g.altIds || []) delete state.notes[id];
  if (saved) state.notes[g.id] = saved;
  else delete state.notes[g.id];
  applyOverrides();
}

function pickerBlock(g) {
  const p = state.pick || {};
  const list = p.results;
  return `<div class="progress picker-panel">
    <div class="progress-top"><b>${t('pick.title')}</b><button class="link-btn" id="pickClose">${t('btn.close')}</button></div>
    <form id="pickForm" class="pick-form"><input class="search" name="q" value="${esc(p.q || g.title)}" aria-label="${esc(t('pick.query'))}"><button class="btn ghost" type="submit">${t('btn.search')}</button></form>
    ${p.error ? `<p class="form-error">${esc(p.error)}</p>` : ''}
    ${list === null ? `<p class="muted">${t('pick.searching')}</p>` : ''}
    ${list && !list.length && !p.error ? `<p class="muted">${t('pick.none')}</p>` : ''}
    ${list?.length ? `<div class="pick-grid">${list.map((r, i) => `<button class="pick-item" data-pick="${i}" title="${esc(r.name)}">
        <div class="case">${img(r.thumb || r.cover, [], { eager: true })}</div><span>${esc(r.name)}</span><em>${r.year || ''}</em></button>`).join('')}</div>` : ''}
    ${noteOf(g)?.cover ? `<button class="link-btn" id="pickReset">${t('pick.reset')}</button>` : ''}
  </div>`;
}

async function searchCovers(g) {
  state.pick.results = null;
  state.pick.error = null;
  try {
    state.pick.results = (await api('GET', `/api/covers?q=${encodeURIComponent(state.pick.q)}&system=${encodeURIComponent(g.system || '')}`)).results;
  } catch (e) {
    state.pick.results = [];
    state.pick.error = e.message;
  }
  if ($('#gamepage').open) drawGame(g);
}

const NIN_SYSTEMS = ['Switch 2', 'Switch', 'Wii U', 'Wii', '3DS', 'DS', 'GameCube', 'Nintendo 64', 'Game Boy Advance', 'Game Boy', 'Super Nintendo', 'NES'];

/** Form to add or edit a Nintendo game (g = null for a new game) */
function openNintendoForm(g) {
  const raw = g?.raw || {};
  state.nin = {
    editing: g ? g.id : null,
    title: g?.title || '',
    system: raw.system || 'Switch 2',
    hours: raw.hours ?? '',
    lastPlayed: raw.lastPlayed ? String(raw.lastPlayed).slice(0, 10) : '',
    completed: Boolean(raw.completed),
    online: Boolean(raw.online),
    note: raw.note || '',
    cover: raw.cover || '',
    banner: raw.banner || '',
    igdbId: raw.igdbId ?? null,
    results: null,
    searching: false,
    error: null,
  };
  drawNintendoForm();
  const d = $('#gamepage');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

function drawNintendoForm() {
  const f = state.nin;
  const preview = { title: f.title || t('nin.new'), system: f.system, platform: 'nintendo', cover: f.cover || null };
  $('#gpBody').innerHTML = `<form class="nin-form" id="ninForm" style="--c:var(--nintendo)">
    <h2 id="gpTitle">${t(f.editing ? 'nin.editT' : 'nin.addT')}</h2>
    <div class="nin-grid">
      <div class="nin-cover">${caseArt(preview, { eager: true })}
        <p class="muted">${t(f.cover ? 'nin.chosen' : 'nin.coverHint')}</p></div>
      <div class="nin-fields">
        <label class="field"><span>${t('nin.title')}</span>
          <div class="pick-form"><input class="search" name="title" required maxlength="150" value="${esc(f.title)}" placeholder="${esc(t('nin.titlePh'))}">
          <button class="btn ghost" type="button" id="ninSearch">${t('nin.search')}</button></div></label>
        ${f.searching ? `<p class="muted">${t('pick.searching')}</p>` : ''}
        ${f.results?.length ? `<div class="pick-grid">${f.results.map((r, i) => `<button type="button" class="pick-item ${f.igdbId === r.id ? 'is-picked' : ''}" data-ninpick="${i}" title="${esc(r.name)}">
            <div class="case">${img(r.thumb || r.cover, [], { eager: true })}</div><span>${esc(r.name)}</span><em>${r.year || ''}</em></button>`).join('')}</div>` : ''}
        ${f.results && !f.results.length && !f.searching && !f.error ? `<p class="muted">${t('pick.none')}</p>` : ''}
        <div class="field-row">
          <label class="field"><span>${t('nin.console')}</span><select class="select" name="system">${NIN_SYSTEMS.map((x) => `<option ${x === f.system ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label class="field"><span>${t('nin.hours')}</span><input class="select" type="number" name="hours" min="0" step="0.5" value="${esc(f.hours)}" placeholder="${esc(t('nin.hoursPh'))}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>${t('nin.last')}</span><input class="select" type="date" name="lastPlayed" value="${esc(f.lastPlayed)}"></label>
          <div class="field checks">
            <label><input type="checkbox" name="completed" ${f.completed ? 'checked' : ''}> ${t('nin.done')}</label>
            <label><input type="checkbox" name="online" ${f.online ? 'checked' : ''}> ${t('nin.online')}</label>
          </div>
        </div>
        <label class="field"><span>${t('nin.note')}</span><input class="select" name="note" maxlength="300" value="${esc(f.note)}" placeholder="${esc(t('nin.notePh'))}"></label>
        <p class="muted nin-hint">${t('nin.hint')}</p>
        ${f.error ? `<p class="form-error">${esc(f.error)}</p>` : ''}
        <div class="reel-actions">
          <button class="btn" type="submit">${t(f.editing ? 'btn.save' : 'nin.add')}</button>
          <button class="btn ghost" type="button" id="ninCancel">${t('btn.cancel')}</button>
          ${f.editing ? `<button class="btn ghost danger" type="button" id="ninDelete">${t('nin.delete')}</button>` : ''}
        </div>
      </div>
    </div>
  </form>`;

  const form = $('#ninForm');
  // keep what was typed when the form re-renders
  const keep = () => {
    const fd = new FormData(form);
    Object.assign(f, { title: fd.get('title'), system: fd.get('system'), hours: fd.get('hours'), lastPlayed: fd.get('lastPlayed'), completed: fd.get('completed') === 'on', online: fd.get('online') === 'on', note: fd.get('note') });
  };
  $('#ninSearch').addEventListener('click', async () => {
    keep();
    if (!f.title.trim()) return;
    f.searching = true;
    f.error = null;
    drawNintendoForm();
    try {
      f.results = (await api('GET', `/api/covers?q=${encodeURIComponent(f.title)}&system=${encodeURIComponent(f.system)}`)).results;
    } catch (e) {
      f.results = [];
      f.error = e.message;
    }
    f.searching = false;
    drawNintendoForm();
  });
  form.querySelectorAll('[data-ninpick]').forEach((b) => b.addEventListener('click', () => {
    keep();
    const r = f.results[Number(b.dataset.ninpick)];
    Object.assign(f, { cover: r.cover || '', banner: r.hero || '', igdbId: r.id });
    drawNintendoForm();
  }));
  $('#ninCancel').addEventListener('click', () => {
    const g = f.editing && gameById(f.editing);
    if (g) openGame(g.id);
    else $('#gamepage').close();
  });
  $('#ninDelete')?.addEventListener('click', async () => {
    if (!confirm(t('nin.confirm', { t: f.title }))) return;
    try {
      await ninRequest('DELETE', f.editing);
      $('#gamepage').close();
      await load();
    } catch (e) {
      f.error = e.message;
      drawNintendoForm();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    keep();
    const body = {
      title: f.title, system: f.system, hours: f.hours === '' ? null : Number(f.hours), lastPlayed: f.lastPlayed || null,
      completed: f.completed, online: f.online, note: f.note, cover: f.cover || null, banner: f.banner || null, igdbId: f.igdbId,
    };
    try {
      const { id } = await ninRequest(f.editing ? 'PUT' : 'POST', f.editing, body);
      await load();
      if (gameById(id)) openGame(id);
    } catch (ex) {
      f.error = ex.message;
      drawNintendoForm();
    }
  });
}

async function ninRequest(method, id, body) {
  return api(method, `/api/nintendo${id ? `/${encodeURIComponent(id)}` : ''}`, body);
}

/** Hides a game (or shows it again): it disappears from every page and total */
async function setHidden(g, hidden) {
  const prev = noteOf(g) || {};
  try {
    await storeNote(g, { ...prev, hidden });
  } catch (e) {
    return alert(e.message);
  }
  if ($('#gamepage').open) $('#gamepage').close();
  await load();
}

async function chooseCover(g, r) {
  const prev = noteOf(g) || {};
  try {
    await storeNote(g, { ...prev, cover: r?.cover || null, hero: r ? r.hero || null : null, igdbId: r?.id ?? null });
    state.picking = false;
    drawGame(g);
    renderPage();
  } catch (e) {
    state.pick.error = e.message;
    drawGame(g);
  }
}

async function saveNote(id, body) {
  return (await api('PUT', `/api/notes/${encodeURIComponent(id)}`, body)).note;
}

$('#gpClose').addEventListener('click', () => $('#gamepage').close());
$('#gamepage').addEventListener('click', (e) => e.target === e.currentTarget && $('#gamepage').close());

document.addEventListener('click', (e) => {
  const feat = e.target.closest('[data-feature]');
  if (feat) {
    if (state.featured === feat.dataset.feature) return openGame(feat.dataset.feature);
    state.featured = feat.dataset.feature;
    const g = gameById(state.featured);
    const recent = [...app.querySelectorAll('.pick')].map((b) => gameById(b.dataset.feature)).filter(Boolean);
    const tmp = document.createElement('div');
    tmp.innerHTML = heroBlock(g, recent, true);
    app.querySelector('.hero').replaceWith(tmp.firstElementChild);
    return;
  }
  const el = e.target.closest('[data-open], .tile');
  if (el && (el.dataset.open || el.dataset.id)) openGame(el.dataset.open || el.dataset.id);
});

/** Translated API error: the server returns a stable code (auth, rate, exists…) */
const ERR_KEYS = { auth: 'err.auth', login: 'err.login', setupCode: 'err.setupCode', username: 'err.username', password: 'err.password', origin: 'err.origin', private: 'err.auth', rate: 'err.rate', demo: 'err.demo', exists: 'err.exists', igdb: 'err.igdb', igdbOff: 'err.igdbOff', server: 'err.server', invalid: 'err.invalid' };
function apiError(status, data) {
  const key = ERR_KEYS[data?.error];
  return new Error(key ? t(key) : t('err.http', { n: status }));
}

// ---------- API calls ----------
/**
 * JSON request to the API. The session travels in a cookie (nothing to handle here).
 * When the session has expired, the sign-in dialog opens.
 */
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  if (res.status === 401 && data.error === 'auth') {
    state.me = { ...state.me, user: null };
    renderAccount();
    openLogin();
  }
  const err = apiError(res.status, data);
  err.data = data;
  throw err;
}

// ---------- Navigation ----------
const currentRoute = () => location.hash.replace(/^#\/?/, '');

function chrome() {
  const lib = state.lib;
  document.title = lib.museumName;
  $('#brand').textContent = lib.museumName;
  const route = currentRoute();
  const tabs = [['', t('nav.home'), null, null]]
    .concat(activePlatforms().map((p) => [p, PLATFORMS[p].label, PLATFORMS[p].color, gamesOf(p).length]))
    .concat([['100', t('pct100'), 'var(--xp)', lib.stats.completed]])
    .concat(lib.games.some(isOnline) ? [['en-ligne', t('nav.online'), '#3ddc84', lib.games.filter(isOnline).length]] : []);
  const extras = Object.entries(EXTRA_PAGES).map(([k, l]) => [k, t(l)]);
  $('#tabs').innerHTML =
    tabs.map(([href, label, c, count]) => `<a class="tab" href="#/${href}" ${route === href ? 'aria-current="page"' : ''} ${c ? `style="--c:${c}"` : ''}>${c ? '<span class="dot"></span>' : ''}${label}${count !== null ? `<span class="n">${n(count)}</span>` : ''}</a>`).join('') +
    '<span class="tab-sep" aria-hidden="true"></span>' +
    extras.map(([href, label]) => `<a class="tab" href="#/${href}" ${route === href ? 'aria-current="page"' : ''}>${label}</a>`).join('') +
    ((lib.hiddenGames || []).length ? `<a class="tab" href="#/masques" ${route === 'masques' ? 'aria-current="page"' : ''}>${t('nav.hidden')}<span class="n">${n(lib.hiddenGames.length)}</span></a>` : '');

  const notes = [];
  if (lib.demo) notes.push(`<div class="notice info">${t('demo')}</div>`);
  for (const [p, i] of Object.entries(lib.platforms || {})) {
    if (i.enabled && i.ok === false) notes.push(`<div class="notice">${esc(t('platFail', { p: PLATFORMS[p]?.label || p }))} ${esc(i.error)}</div>`);
  }
  $('#notices').innerHTML = notes.join('');
  $('#footer').textContent = t('footer', { ago: ago(lib.generatedAt), date: date(lib.generatedAt) });
  $('#syncBtn').hidden = !isOwner();
  renderAccount();
  renderLivePill();
}

function renderPage() {
  const r = currentRoute();
  if (PLATFORMS[r] || LIST_PAGES[r]) renderList(r);
  else if (r === 'activite') renderActivity();
  else if (r === 'pile') renderPile();
  else if (r === 'notes') renderNotes();
  else if (r === 'masques') renderHidden();
  else if (r === 'settings') renderSettings();
  else renderHome();
  // On small screens the calendar scrolls: show the most recent weeks first
  app.querySelectorAll('.heatmap').forEach((h) => (h.scrollLeft = h.scrollWidth));
}

function route() {
  if (!state.lib || state.me?.setup) return;
  if ($('#gamepage').open) $('#gamepage').close();
  state.view = {};
  chrome();
  renderPage();
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);

// ---------- Account: setup, sign-in, settings ----------
const PLATFORM_FIELDS = [
  { id: 'steam', label: 'Steam', color: 'var(--steam)', help: 'set.steamHelp', link: 'https://steamcommunity.com/dev/apikey',
    fields: [['steamApiKey', 'set.steamKey', true], ['steamId', 'set.steamId', false]] },
  { id: 'playstation', label: 'PlayStation', color: 'var(--playstation)', help: 'set.psnHelp', link: 'https://ca.account.sony.com/api/v1/ssocookie',
    fields: [['psnNpsso', 'set.npsso', true]] },
  { id: 'xbox', label: 'Xbox', color: 'var(--xbox)', help: 'set.xboxHelp', link: 'https://xbl.io',
    fields: [['openxblKey', 'set.xbl', true]] },
  { id: 'igdb', label: 'IGDB', color: 'var(--xp)', help: 'set.igdbHelp', link: 'https://dev.twitch.tv/console/apps',
    fields: [['igdbClientId', 'set.igdbId', false], ['igdbClientSecret', 'set.igdbSecret', true]] },
];

/**
 * API key fields. current: saved values (text) or { set, hint } for a secret.
 * typed: what was already typed during setup (so going back loses nothing).
 */
function keyFields(current = {}, invalid = [], typed = {}) {
  return PLATFORM_FIELDS.map((p) => `<fieldset class="key-group" style="--c:${p.color}">
      <legend><span class="dot"></span>${p.label}</legend>
      <p class="muted key-help">${t(p.help)} <a href="${p.link}" target="_blank" rel="noopener noreferrer">${esc(p.link.replace('https://', ''))}</a></p>
      ${p.fields.map(([name, label, secret]) => {
        const cur = current[name];
        const isSet = secret ? Boolean(cur?.set ?? cur) : false;
        const ph = secret ? (isSet ? `${t('set.configured', { hint: cur?.hint || '' }).trim()} · ${t('set.keep')}` : t('set.notSet')) : '';
        return `<label class="field ${invalid.includes(name) ? 'is-invalid' : ''}"><span>${t(label)}</span>
          <div class="key-row"><input class="select" name="${name}" ${secret ? 'type="password" autocomplete="off"' : 'type="text"'} spellcheck="false"
            value="${esc(typed[name] ?? (secret ? '' : typeof cur === 'string' ? cur : ''))}" placeholder="${esc(ph)}">
          ${secret && isSet ? `<label class="key-clear"><input type="checkbox" name="clear-${name}"> ${t('set.remove')}</label>` : ''}</div></label>`;
      }).join('')}
    </fieldset>`).join('');
}

/** Entered values: an empty secret stays unchanged, "Remove" clears it */
function readKeyFields(form, { includeEmptyText = true } = {}) {
  const out = {};
  for (const p of PLATFORM_FIELDS) {
    for (const [name, , secret] of p.fields) {
      const v = form.elements[name].value.trim();
      if (secret) {
        if (form.elements[`clear-${name}`]?.checked) out[name] = '';
        else if (v) out[name] = v;
      } else if (v || includeEmptyText) out[name] = v;
    }
  }
  return out;
}

function fieldsError(data) {
  if (data?.error !== 'fields') return null;
  const names = Object.fromEntries(PLATFORM_FIELDS.flatMap((p) => p.fields.map(([n, l]) => [n, t(l)])));
  names.museumName = t('set.name');
  return t('err.fields', { list: data.fields.map((f) => names[f] || f).join(', ') });
}

// Account button in the top bar
function renderAccount() {
  const el = $('#account');
  if (!state.me || state.me.demo || state.me.setup) return (el.innerHTML = '');
  el.innerHTML = state.me.user
    ? `<a class="sync acc-btn" href="#/settings" title="${esc(t('acc.settings'))}">${esc(state.me.user)}</a>`
    : `<button class="sync acc-btn" id="signIn">${t('acc.signIn')}</button>`;
  $('#signIn')?.addEventListener('click', openLogin);
}

function loginForm(id) {
  return `<form class="login-form" id="${id}">
    <label class="field"><span>${t('login.user')}</span><input class="select" name="username" autocomplete="username" required maxlength="32"></label>
    <label class="field"><span>${t('login.pass')}</span><input class="select" name="password" type="password" autocomplete="current-password" required maxlength="200"></label>
    <p class="form-error" hidden></p>
    <button class="btn" type="submit">${t('login.submit')}</button>
  </form>`;
}

function bindLogin(form, onDone) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api('POST', '/api/login', { username: form.elements.username.value, password: form.elements.password.value });
      onDone();
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
      form.elements.password.value = '';
      form.elements.password.focus();
    }
    btn.disabled = false;
  });
}

function openLogin() {
  const d = $('#loginDlg');
  if (d.open) return;
  d.innerHTML = `<button class="gp-close" id="loginClose" aria-label="${esc(t('btn.close'))}">✕</button>
    <h2 id="loginTitle">${t('login.title')}</h2>${loginForm('loginForm')}`;
  $('#loginClose').addEventListener('click', () => d.close());
  bindLogin($('#loginForm'), () => {
    d.close();
    load();
  });
  d.showModal();
  $('#loginForm').elements.username.focus();
}

// Private collection: sign-in page instead of the site
function renderLoginPage() {
  document.title = 'Playroom';
  $('#tabs').innerHTML = '';
  $('#notices').innerHTML = '';
  $('#footer').textContent = '';
  $('#syncBtn').hidden = true;
  $('#live').hidden = true;
  $('#account').innerHTML = '';
  app.innerHTML = `<section class="auth-page"><div class="auth-card">
    <h1>${t('login.privateT')}</h1><p class="muted">${t('login.private')}</p>${loginForm('pageLogin')}</div></section>`;
  bindLogin($('#pageLogin'), load);
}

// First launch: account creation in 3 steps
function renderSetup() {
  document.title = 'Playroom';
  $('#tabs').innerHTML = '';
  $('#notices').innerHTML = '';
  $('#footer').textContent = '';
  $('#syncBtn').hidden = true;
  $('#live').hidden = true;
  $('#account').innerHTML = '';
  const st = (state.setup ??= { step: 1, values: {}, invalid: [], error: null });
  const v = st.values;
  const steps = [t('setup.step1'), t('setup.step2'), t('setup.step3')];
  const configured = Object.fromEntries(Object.entries(state.me.configured || {}).map(([k, set]) => [k, { set, hint: '' }]));
  let body = '';
  if (st.step === 1) {
    body = `<label class="field"><span>${t('setup.code')}</span><input class="select code-input" name="code" required autocomplete="off" spellcheck="false" maxlength="9" placeholder="XXXX-XXXX" value="${esc(v.code || '')}">
        <small class="muted">${t('setup.codeHint')}</small></label>
      <label class="field"><span>${t('login.user')}</span><input class="select" name="username" required autocomplete="username" pattern="[\\p{L}\\p{N}._\\-]{3,32}" maxlength="32" value="${esc(v.username || '')}">
        <small class="muted">${t('setup.userHint')}</small></label>
      <label class="field"><span>${t('login.pass')}</span><input class="select" name="password" type="password" required minlength="10" maxlength="200" autocomplete="new-password" value="${esc(v.password || '')}">
        <small class="muted">${t('setup.passHint')}</small></label>
      <label class="field"><span>${t('setup.pass2')}</span><input class="select" name="password2" type="password" required minlength="10" maxlength="200" autocomplete="new-password" value="${esc(v.password2 || '')}"></label>`;
  } else if (st.step === 2) {
    body = `<p class="muted">${t('setup.skip')}</p>${keyFields(configured, st.invalid, v.keys || {})}<p class="muted">${t('set.nintendo')}</p>`;
  } else {
    body = `<label class="field"><span>${t('set.name')}</span><input class="select" name="museumName" maxlength="60" value="${esc(v.museumName ?? 'Playroom')}"></label>
      ${visibilityField(v.visibility || 'public')}`;
  }
  app.innerHTML = `<section class="auth-page"><div class="auth-card wide">
    <h1>${t('setup.title')}</h1><p class="muted">${t('setup.intro')}</p>
    <ol class="steps">${steps.map((s, i) => `<li class="${i + 1 === st.step ? 'is-current' : i + 1 < st.step ? 'is-done' : ''}">${esc(s)}</li>`).join('')}</ol>
    <form id="setupForm" class="setup-form" novalidate>${body}
      ${st.error ? `<p class="form-error">${esc(st.error)}</p>` : ''}
      <div class="reel-actions">
        ${st.step > 1 ? `<button class="btn ghost" type="button" id="setupBack">${t('setup.back')}</button>` : ''}
        <button class="btn" type="submit">${st.step < 3 ? t('setup.next') : t('setup.finish')}</button>
      </div>
    </form></div></section>`;

  const form = $('#setupForm');
  const keep = () => {
    if (st.step === 1) for (const k of ['code', 'username', 'password', 'password2']) v[k] = form.elements[k].value;
    if (st.step === 2) v.keys = readKeyFields(form, { includeEmptyText: false });
    if (st.step === 3) Object.assign(v, { museumName: form.elements.museumName.value, visibility: form.elements.visibility.value });
  };
  $('#setupBack')?.addEventListener('click', () => {
    keep();
    st.step--;
    st.error = null;
    renderSetup();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    keep();
    st.error = null;
    if (st.step === 1) {
      if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(v.username)) st.error = t('err.username');
      else if ((v.password || '').length < 10) st.error = t('err.password');
      else if (v.password !== v.password2) st.error = t('setup.mismatch');
      else if (!v.code.trim()) st.error = t('err.setupCode');
      else st.step = 2;
      return renderSetup();
    }
    if (st.step === 2) {
      st.step = 3;
      return renderSetup();
    }
    try {
      await api('POST', '/api/setup', {
        code: v.code, username: v.username, password: v.password,
        settings: { ...(v.keys || {}), museumName: v.museumName || 'Playroom', visibility: v.visibility },
      });
      state.setup = null;
      load();
    } catch (ex) {
      const data = ex.data || {};
      st.invalid = data.fields || [];
      st.error = fieldsError(data) || ex.message;
      if (['setupCode', 'username', 'password'].includes(data.error)) st.step = 1;
      else if (data.error === 'fields') st.step = st.invalid.every((f) => f === 'museumName') ? 3 : 2;
      renderSetup();
    }
  });
}

function visibilityField(current) {
  return `<fieldset class="field radio-group"><legend>${t('set.visibility')}</legend>
    <label><input type="radio" name="visibility" value="public" ${current === 'public' ? 'checked' : ''}> ${t('set.public')}</label>
    <label><input type="radio" name="visibility" value="private" ${current === 'private' ? 'checked' : ''}> ${t('set.private')}</label></fieldset>`;
}

async function renderSettings() {
  if (!isOwner()) {
    app.innerHTML = '';
    return openLogin();
  }
  let cur;
  try {
    cur = await api('GET', '/api/settings');
  } catch (e) {
    app.innerHTML = `<div class="wrap"><div class="empty"><strong>${esc(e.message)}</strong></div></div>`;
    return;
  }
  const widgetUrl = (key) => `${location.origin}/api/widget${cur.visibility === 'private' ? `?key=${encodeURIComponent(key)}` : ''}`;
  app.innerHTML = `
    <div class="wrap settings">
      <h1>${t('set.title')}</h1>
      <form class="panel set-block" id="setForm">
        <h2>${t('set.collection')}</h2>
        <label class="field"><span>${t('set.name')}</span><input class="select" name="museumName" maxlength="60" required value="${esc(cur.museumName)}"></label>
        ${visibilityField(cur.visibility)}
        <h2>${t('set.platforms')}</h2>
        ${keyFields(cur)}
        <p class="muted">${t('set.nintendo')}</p>
        <p class="form-error" id="setError" hidden></p><p class="form-ok" id="setOk" hidden></p>
        <div class="reel-actions"><button class="btn" type="submit">${t('set.save')}</button></div>
      </form>
      <section class="panel set-block">
        <h2>${t('set.widget')}</h2><p class="muted">${t('set.widgetHint')}</p>
        <div class="key-row"><input class="select" id="widgetUrl" readonly value="${esc(widgetUrl(cur.widgetKey))}">
          <button class="btn ghost" type="button" id="widgetCopy">${t('set.copy')}</button>
          <button class="btn ghost" type="button" id="widgetNew">${t('set.widgetNew')}</button></div>
      </section>
      <form class="panel set-block" id="passForm">
        <h2>${t('set.password')}</h2>
        <input type="text" name="username" autocomplete="username" value="${esc(state.me.user)}" hidden>
        <label class="field"><span>${t('set.current')}</span><input class="select" name="current" type="password" required autocomplete="current-password" maxlength="200"></label>
        <label class="field"><span>${t('set.newPass')}</span><input class="select" name="next" type="password" required minlength="10" maxlength="200" autocomplete="new-password">
          <small class="muted">${t('setup.passHint')}</small></label>
        <p class="form-error" hidden></p><p class="form-ok" hidden></p>
        <div class="reel-actions"><button class="btn ghost" type="submit">${t('set.changePass')}</button></div>
      </form>
      <div class="reel-actions"><button class="btn ghost danger" id="signOut">${t('acc.signOut')}</button></div>
    </div>`;

  const form = $('#setForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#setError');
    const ok = $('#setOk');
    err.hidden = ok.hidden = true;
    form.querySelectorAll('.is-invalid').forEach((x) => x.classList.remove('is-invalid'));
    try {
      await api('PUT', '/api/settings', { ...readKeyFields(form), museumName: form.elements.museumName.value, visibility: form.elements.visibility.value });
      await api('POST', '/api/sync').catch(() => {});
      ok.hidden = false;
      ok.textContent = t('set.saved');
      renderSettings().then(() => {
        const o = $('#setOk');
        o.hidden = false;
        o.textContent = t('set.saved');
      });
      chrome();
    } catch (ex) {
      for (const f of ex.data?.fields || []) form.elements[f]?.closest('.field')?.classList.add('is-invalid');
      err.hidden = false;
      err.textContent = fieldsError(ex.data) || ex.message;
    }
  });
  $('#widgetCopy').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText($('#widgetUrl').value);
      e.target.textContent = t('set.copied');
    } catch {
      $('#widgetUrl').select();
    }
  });
  $('#widgetNew').addEventListener('click', async () => {
    const { widgetKey } = await api('POST', '/api/settings/widget-key');
    $('#widgetUrl').value = widgetUrl(widgetKey);
  });
  const pf = $('#passForm');
  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = pf.querySelector('.form-error');
    const ok = pf.querySelector('.form-ok');
    err.hidden = ok.hidden = true;
    try {
      await api('PUT', '/api/password', { current: pf.elements.current.value, next: pf.elements.next.value });
      pf.reset();
      ok.hidden = false;
      ok.textContent = t('set.passChanged');
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  });
  $('#signOut').addEventListener('click', async () => {
    await api('POST', '/api/logout').catch(() => {});
    location.hash = '#/';
    load();
  });
}

// ---------- Language ----------
/** Static texts of the page (outside the views) */
function staticTexts() {
  $('#tabs').setAttribute('aria-label', t('nav.platforms'));
  const sync = $('#syncBtn');
  if (!sync.disabled) sync.textContent = t('sync');
  sync.title = t('syncHint');
  $('#gpClose').setAttribute('aria-label', t('gp.closeLabel'));
  const sel = $('#langSel');
  sel.setAttribute('aria-label', t('lang'));
  sel.parentElement.title = t('lang');
  sel.innerHTML = LANGS.map(([code, name]) => `<option value="${code}" ${code === getLang() ? 'selected' : ''} lang="${code}">${name}</option>`).join('');
  const boot = app.querySelector('.boot');
  if (boot && !boot.textContent.trim()) boot.insertAdjacentText('beforeend', t('loading'));
}

$('#langSel').addEventListener('change', async (e) => {
  await setLang(e.target.value);
  refreshFormats();
  staticTexts();
  if (state.me?.setup) return renderSetup();
  if (!state.lib) return load();
  if ($('#gamepage').open) $('#gamepage').close();
  chrome();
  renderPage();
});

// ---------- Data ----------
async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  return { status: res.status, data: await res.json() };
}

async function load() {
  try {
    state.me = (await getJson('/api/me')).data;
    if (state.me.setup) return renderSetup();
    const [{ status, data }, act, pres] = await Promise.all([
      getJson('/api/library'),
      getJson('/api/activity').catch(() => ({ data: null })),
      getJson('/api/presence').catch(() => ({ data: null })),
    ]);
    if (status === 401) return renderLoginPage();
    if (status === 503) {
      app.innerHTML = `<div class="boot"><span class="spinner"></span>${t('boot')}</div>`;
      return setTimeout(load, 4000);
    }
    state.lib = data;
    state.notes = data.notes || {};
    applyOverrides();
    state.activity = act.data;
    state.presence = pres.data;
    route();
  } catch (e) {
    app.innerHTML = `<div class="empty"><strong>${t('downT')}</strong>${t('down')} (${esc(e.message)})</div>`;
  }
}

// Presence refreshed every minute
setInterval(async () => {
  if (!state.lib) return;
  const before = JSON.stringify(nowPlaying());
  try {
    state.presence = (await getJson('/api/presence')).data;
  } catch {
    return;
  }
  if (JSON.stringify(nowPlaying()) === before) return;
  renderLivePill();
  if (currentRoute() === '' && !state.featured && !$('#gamepage').open) renderHome();
}, 60_000);

$('#live').addEventListener('click', () => {
  const id = $('#live').dataset.open;
  if (id) openGame(id);
});

$('#syncBtn').addEventListener('click', async () => {
  const btn = $('#syncBtn');
  try {
    await api('POST', '/api/sync');
  } catch (e) {
    return alert(e.message);
  }
  btn.disabled = true;
  btn.textContent = t('syncing');
  const poll = setInterval(async () => {
    const s = await fetch('/api/status').then((r) => r.json()).catch(() => null);
    if (s && !s.syncing) {
      clearInterval(poll);
      btn.disabled = false;
      btn.textContent = t('sync');
      load();
    }
  }, 3000);
});

initLang().then(() => {
  refreshFormats();
  staticTexts();
  load();
});
