// Renders each design page to a PNG at 2x (2400x3200).
//
//   node designs/hand-tattoos/render.mjs            # all three
//   node designs/hand-tattoos/render.mjs 2          # just design 2
//
// Uses the Playwright package the repo already relies on (the global one works:
// NODE_PATH=/opt/node22/lib/node_modules) and serves the folder itself so the
// bundled woff2 fonts load without a separate web server.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PAGES = ['1-bleeding-heart', '2-soundwave', '3-pocket-watch'];
const want = process.argv[2] ? PAGES.filter(p => p.startsWith(process.argv[2])) : PAGES;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const file = path.join(DIR, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(DIR) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const exe = process.env.CHROME || undefined;
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--hide-scrollbars'] });
const c = await b.newContext({ viewport: { width: 1260, height: 1660 }, deviceScaleFactor: 2 });
const p = await c.newPage();
p.on('pageerror', e => console.error('page error:', e.message));
for (const name of want) {
  await p.goto(`http://127.0.0.1:${port}/${name}.html`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  const out = path.join(DIR, `${name}.png`);
  await p.locator('.stage').screenshot({ path: out, type: 'png' });
  console.log(`wrote ${out}`);
}
await b.close();
server.close();
