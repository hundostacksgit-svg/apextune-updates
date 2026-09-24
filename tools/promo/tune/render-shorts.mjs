/*
 * Renders the TikTok cuts (shorts.js): each one's picture frame by frame,
 * its score, then one 1080 x 1920 MP4 and a cover image per cut.
 *
 *   node tools/promo/tune/render-shorts.mjs                   all of them
 *   node tools/promo/tune/render-shorts.mjs --only ram-speed  some of them (comma-separated)
 *   node tools/promo/tune/render-shorts.mjs --stills ram-speed:1,5.5,9   stills for review
 *
 * The finished videos are promotion material, not site files: they go to
 * $OUT (default $WORK/tiktok) and never into git. Same environment as
 * render.mjs (WORK, FONTS, CHROME, FFMPEG).
 */
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHORTS } from './shorts.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync('/opt/node22/lib/node_modules/playwright') ? '/opt/node22/lib/node_modules/playwright' : 'playwright'));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const WORK = process.env.WORK || '/tmp/omnidx-tutorial';
const FONTS = process.env.FONTS || path.join(WORK, 'fonts');
const OUT = process.env.OUT || path.join(WORK, 'tiktok');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PORT = Number(process.env.PORT || 8272);
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.ps1': 'text/plain' };
const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  const base = p.startsWith('/fonts/') ? FONTS : ROOT;
  if (p.startsWith('/fonts/')) p = p.slice('/fonts'.length);
  const f = path.join(base, p);
  if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text'] });

async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/tools/promo/tune/${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  return page;
}

async function audio(id) {
  const page = await open('short-score.html');
  const b64 = await page.evaluate(async (i) => {
    const bytes = new Uint8Array(await window.renderShortScore(i));
    let s = ''; for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    return btoa(s);
  }, id);
  await page.close();
  const f = path.join(WORK, `short-${id}.wav`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}

async function picture(id) {
  const page = await open(`short.html?id=${id}`);
  const { dur, fps } = await page.evaluate(() => ({ dur: window.DUR, fps: window.FPS }));
  const frames = Math.round(dur * fps), master = path.join(WORK, `short-${id}.mp4`);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '13', '-pix_fmt', 'yuv420p', master], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.seek(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`  ${id} frame ${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));
  await page.close();
  return master;
}

try {
  const st = arg('--stills');
  if (st) {
    const [id, ts] = st.split(':'); const page = await open(`short.html?id=${id}`);
    const dir = path.join(WORK, 'short-stills'); fs.mkdirSync(dir, { recursive: true });
    for (const t of ts.split(',').map(Number)) { await page.evaluate((x) => window.seek(x), t); const f = path.join(dir, `${id}-${t.toFixed(2)}.png`); await page.screenshot({ path: f }); console.log(f); }
    await page.close();
  } else {
    const only = (arg('--only') || '').split(',').filter(Boolean);
    for (const [n, S] of SHORTS.entries()) {
      if (only.length && !only.includes(S.id)) continue;
      console.log(`${S.id}`);
      const wav = await audio(S.id), pic = await picture(S.id);
      const name = `${String(n + 1).padStart(2, '0')}-${S.id}`, mp4 = path.join(OUT, `${name}.mp4`), jpg = path.join(OUT, `${name}-cover.jpg`);
      // TikTok re-encodes everything, so give it plenty to start from: high-profile H.264, 30 fps, AAC 48 kHz, loud like the feed.
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', pic, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', '30',
        '-af', 'loudnorm=I=-14:TP=-1.2:LRA=8', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', String(S.cover), '-i', pic, '-frames:v', '1', '-q:v', '2', jpg]);
      console.log(`  ${path.basename(mp4)}  ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
