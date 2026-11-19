// Builds a static copy of the demo (DEMO=true) for GitHub Pages:
// the site files plus a snapshot of every read-only API answer the page needs.
//   node scripts/build-demo.js [output folder, default: dist]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist'));
const port = 18000 + Math.floor(Math.random() * 1000);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playroom-demo-'));

const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, DEMO: 'true', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, TZ: process.env.TZ || 'UTC' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The demo server did not start')), 30_000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('Listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on('exit', (code) => reject(new Error(`The demo server stopped (code ${code})`)));
  });

  const get = async (p) => {
    const res = await fetch(`http://127.0.0.1:${port}/${p}`);
    if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
    return res.text();
  };

  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'public'), out, { recursive: true });
  fs.mkdirSync(path.join(out, 'api'), { recursive: true });
  for (const p of ['me', 'library', 'activity', 'presence', 'status']) {
    fs.writeFileSync(path.join(out, 'api', p), await get(`api/${p}`));
  }
  // GitHub Pages cannot send security headers: the same policy goes in a meta tag
  // (frame-ancestors is not allowed there), plus no referrer to other sites
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' https: data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const indexFile = path.join(out, 'index.html');
  const html = fs.readFileSync(indexFile, 'utf8');
  const anchor = '<meta charset="utf-8">';
  if (!html.includes(anchor)) throw new Error('index.html: charset tag not found');
  fs.writeFileSync(
    indexFile,
    html.replace(anchor, `${anchor}\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <meta name="referrer" content="no-referrer">`)
  );
  // GitHub Pages: serve files as they are (no Jekyll processing)
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  const n = JSON.parse(fs.readFileSync(path.join(out, 'api', 'library'), 'utf8')).games.length;
  console.log(`Static demo written to ${path.relative(root, out) || '.'} (${n} games)`);
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
