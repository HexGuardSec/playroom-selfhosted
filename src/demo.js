// Fake library to try Playroom before connecting any account (DEMO=true)
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const steamCover = (id) => ({
  cover: `${CDN}/${id}/library_600x900.jpg`,
  coverFallback: `${CDN}/${id}/header.jpg`,
  hero: `${CDN}/${id}/library_hero.jpg`,
  logo: `${CDN}/${id}/logo.png`,
});

export function buildDemoLibrary(config) {
  const r = rng(42);
  const games = [];

  const steam = [
    [1245620, 'ELDEN RING', 184, 42, 42], [1086940, "Baldur's Gate 3", 212, 54, 41], [367520, 'Hollow Knight', 61, 63, 63],
    [413150, 'Stardew Valley', 143, 40, 31], [1145360, 'Hades', 88, 49, 49], [620, 'Portal 2', 19, 51, 34],
    [292030, 'The Witcher 3: Wild Hunt', 156, 78, 52], [504230, 'Celeste', 34, 32, 32], [646570, 'Slay the Spire', 97, 46, 29],
    [1091500, 'Cyberpunk 2077', 74, 57, 30], [588650, 'Dead Cells', 45, 122, 37], [105600, 'Terraria', 66, 88, 20],
    [814380, 'Sekiro: Shadows Die Twice', 52, 34, 34], [1794680, 'Vampire Survivors', 38, 204, 160], [230410, 'Warframe', 0, 0, 0],
    [1174180, 'Red Dead Redemption 2', 0, 51, 0], [990080, 'Hogwarts Legacy', 0, 46, 0], [435150, 'Divinity: Original Sin 2', 0, 54, 0],
    [268910, 'Cuphead', 0, 28, 0], [220, 'Half-Life 2', 0, 33, 0], [2050650, 'Resident Evil 4', 0, 39, 0], [632470, 'Disco Elysium', 1.2, 45, 2],
    [252490, 'Rust', 412, 116, 47], [730, 'Counter-Strike 2', 268, 0, 0], [252950, 'Rocket League', 131, 88, 51], [1172470, 'Apex Legends', 74, 0, 0],
  ];
  const ONLINE = [230410, 252490, 730, 252950, 1172470];
  const TTB = { 1174180: 50, 990080: 26, 435150: 60, 268910: 11, 220: 13, 2050650: 16, 632470: 22, 230410: null };
  steam.forEach(([appid, title, hours, total, unlocked], i) => {
    const pct = total ? Math.round((unlocked / total) * 1000) / 10 : null;
    games.push({
      id: `steam-${appid}`, platform: 'steam', system: 'PC', title, ...steamCover(appid),
      hours, recentHours: i < 3 ? Math.round(r() * 12) : 0, lastPlayed: hours ? daysAgo(i * 9 + Math.round(r() * 5)) : null,
      achievements: total ? { unlocked, total, percent: pct } : null, completed: pct === 100,
      ...(appid === 632470 ? { lastPlayed: daysAgo(260) } : {}),
      completedAt: pct === 100 ? daysAgo(30 + i * 40) : null, url: `https://store.steampowered.com/app/${appid}`,
      ...(TTB[appid] ? { timeToBeat: TTB[appid] } : {}),
      online: ONLINE.includes(appid),
    });
  });

  const psn = [
    [1593500, 'God of War', 'PS5', 48, 100, { platinum: 1, gold: 8, silver: 12, bronze: 16 }],
    [1817070, "Marvel's Spider-Man Remastered", 'PS5', 36, 100, { platinum: 1, gold: 4, silver: 9, bronze: 37 }],
    [1151640, 'Horizon Zero Dawn', 'PS4', 61, 87, { platinum: 0, gold: 6, silver: 14, bronze: 40 }],
    [2215430, 'Ghost of Tsushima', 'PS5', 72, 100, { platinum: 1, gold: 5, silver: 13, bronze: 32 }],
    [1649240, 'Returnal', 'PS5', 29, 54, { platinum: 0, gold: 2, silver: 6, bronze: 13 }],
    [1888930, 'The Last of Us Part I', 'PS5', 22, 68, { platinum: 0, gold: 3, silver: 6, bronze: 20 }],
  ];
  psn.forEach(([appid, title, system, hours, pct, t], i) => {
    const unlocked = t.platinum + t.gold + t.silver + t.bronze;
    games.push({
      id: `psn-demo-${i}`, platform: 'playstation', system, title, ...steamCover(appid), hours,
      lastPlayed: daysAgo(i * 13 + 2), achievements: { unlocked, total: Math.round(unlocked / (pct / 100)), percent: pct },
      trophies: { ...t, hasPlatinum: true }, completed: pct === 100, completedAt: pct === 100 ? daysAgo(60 + i * 50) : null, url: null,
    });
  });

  const xbox = [
    [1551360, 'Forza Horizon 5', 'Xbox Series', 93, 128, 211, 1840, 3500], [976730, 'Halo: The Master Chief Collection', 'Xbox One', 118, 412, 700, 4210, 7000],
    [1817230, 'Hi-Fi RUSH', 'Xbox Series', 17, 50, 50, 1000, 1000], [1172620, 'Sea of Thieves', 'Xbox Series', 54, 61, 240, 980, 5000],
  ];
  xbox.forEach(([appid, title, system, hours, unlocked, total, gs, gst], i) => {
    const pct = Math.round((unlocked / total) * 100);
    games.push({
      id: `xbox-demo-${i}`, platform: 'xbox', system, title, ...steamCover(appid), hours, lastPlayed: daysAgo(i * 17 + 5),
      achievements: { unlocked, total, percent: pct }, gamerscore: { current: gs, total: gst }, online: title === 'Sea of Thieves',
      completed: pct === 100, completedAt: pct === 100 ? daysAgo(120) : null, url: null,
    });
  });

  // Fake time-to-beat values for the demo (rushed, main story, 100%)
  const DEMO_TTB = { 'ELDEN RING': [40, 58, 133], "Baldur's Gate 3": [52, 75, 147], 'Hollow Knight': [20, 27, 63], 'Hades': [16, 22, 95],
    'The Witcher 3: Wild Hunt': [35, 51, 173], 'Cyberpunk 2077': [20, 26, 104], 'Celeste': [6, 8, 38], 'God of War': [16, 21, 51],
    'Ghost of Tsushima': [19, 25, 62], 'Horizon Zero Dawn': [16, 22, 60], 'The Legend of Zelda: Tears of the Kingdom': [42, 59, 154],
    'Super Mario Odyssey': [10, 12, 64], 'Metroid Dread': [7, 9, 13] };
  const nintendo = [
    ['The Legend of Zelda: Tears of the Kingdom', 'Switch', 164, true], ['Super Mario Odyssey', 'Switch', 58, true],
    ['Mario Kart 8 Deluxe', 'Switch', 91, false, true], ['Animal Crossing: New Horizons', 'Switch', 240, false],
    ['Metroid Dread', 'Switch', 14, true], ['Pokémon Scarlet', 'Switch', 47, false], ['Donkey Kong Bananza', 'Switch 2', 26, false],
  ];
  nintendo.forEach(([title, system, hours, completed, online = false], i) => {
    games.push({
      online,
      id: `nintendo-demo-${i}`, platform: 'nintendo', system, title, cover: null, coverFallback: null, hero: null, hours,
      lastPlayed: daysAgo(i * 11 + 1), achievements: null, completed, completedAt: completed ? daysAgo(90 + i * 30) : null, url: null,
    });
  });

  for (const g of games) {
    const t = DEMO_TTB[g.title];
    if (t) {
      g.timeToBeat = t[1];
      g.timeToBeatDetail = { hastily: t[0], normally: t[1], completely: t[2] };
    }
  }

  const ok = (name) => ({ enabled: true, ok: true, profile: { name, avatar: null, url: null }, syncedAt: new Date().toISOString() });
  return {
    museumName: config.museumName,
    demo: true,
    generatedAt: new Date().toISOString(),
    platforms: { steam: ok('DemoPlayer'), playstation: ok('Demo_PSN'), xbox: ok('Demo Gamertag'), nintendo: ok('Nintendo') },
    games,
  };
}

/** Fake history: about 11 months of sessions and achievements */
export function buildDemoHistory(games) {
  const r = rng(7);
  const played = games.filter((g) => g.hours > 5);
  const days = {};
  const achievements = {};
  for (let d = 330; d >= 0; d--) {
    const weekend = [0, 6].includes(new Date(Date.now() - d * 86400000).getDay());
    if (r() < (weekend ? 0.25 : 0.42)) continue; // days without playing
    const day = new Date(Date.now() - d * 86400000).toLocaleDateString('sv-SE');
    const n = r() < 0.3 ? 2 : 1;
    days[day] = {};
    for (let k = 0; k < n; k++) {
      // The "current" games change every ~2 months
      const pool = played.slice((Math.floor(d / 60) * 3) % played.length).concat(played).slice(0, 5);
      const g = pool[Math.floor(r() * pool.length)];
      days[day][g.id] = Math.round((0.4 + r() * (weekend ? 5.5 : 3)) * 10) / 10;
      if (g.achievements && r() < 0.55) (achievements[day] ??= {})[g.id] = 1 + Math.floor(r() * 4);
    }
  }
  const since = new Date(Date.now() - 330 * 86400000).toLocaleDateString('sv-SE');
  return { since, last: {}, days, achievements };
}

export const demoNotes = () => ({
  'steam-1245620': { tier: 'S', rating: 10, status: 'done', review: 'Best open world I have played. Malenia took me four evenings.', updatedAt: daysAgo(40) },
  'steam-367520': { tier: 'S', rating: 9.5, status: 'done', review: 'Stunning art direction, and the final Pantheon is a real challenge.', updatedAt: daysAgo(80) },
  'psn-demo-3': { tier: 'A', rating: 9, status: 'done', review: 'Gorgeous. The photo mode alone is worth it.', updatedAt: daysAgo(100) },
  'steam-1086940': { tier: 'A', rating: 9, status: 'playing', review: 'Second run as the Dark Urge, still full of surprises.', updatedAt: daysAgo(3) },
  'nintendo-demo-0': { tier: 'S', rating: 10, status: 'done', review: '', updatedAt: daysAgo(90) },
  'steam-1091500': { tier: 'B', rating: 7.5, status: 'done', review: 'Much better since 2.0.', updatedAt: daysAgo(150) },
  'xbox-demo-3': { tier: 'C', rating: 6, status: 'dropped', review: 'Fun with friends, too repetitive alone.', updatedAt: daysAgo(200) },
  'steam-230410': { tier: null, rating: null, status: 'ignored', review: '', updatedAt: daysAgo(10) },
});

export const demoPresence = (games) => {
  const g = games.find((x) => x.id === 'steam-1086940');
  return {
    updatedAt: new Date().toISOString(),
    online: { steam: true, playstation: false, xbox: false },
    playing: g ? [{ platform: 'steam', gameId: g.id, title: g.title, since: new Date(Date.now() - 47 * 60000).toISOString() }] : [],
  };
};
