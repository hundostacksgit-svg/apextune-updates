#!/usr/bin/env node
/*
 * Renders the promo videos: frames from comp.html, encoded by ffmpeg.
 *
 *   PROMO_ASSETS=/path/to/assets FFMPEG=/path/to/ffmpeg \
 *   node tools/promo/studio/render.mjs --fmt tiktok --video all --out /tmp/omnidx-promo
 *
 *   --fmt tiktok|yt     the format (tiktok is also Reels and Shorts)
 *   --video all|id,id   which of videos.js to render
 *   --stills            render STILLS (feed posts, thumbnail) as PNGs instead
 *   --frame 4.2         one PNG of --video at that second, to check a frame
 *   --fps 30 --jobs 2   frame rate; how many videos render at once
 *
 * Frames are captured with the DevTools protocol straight into ffmpeg's stdin
 * as JPEGs, so nothing is written to disk but the finished MP4. Each frame is
 * asked for by time, so a render is the same every time and never drops a
 * frame however slow the machine is.
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright not found — npm i -g playwright, or set PLAYWRIGHT_MODULE to its folder');
}
const { chromium } = loadPlaywright();
const { VIDEOS, STILLS } = await import('./videos.js');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] ?? true) : dflt; };
const FMT = String(opt('fmt', 'tiktok'));
const WANT = String(opt('video', 'all'));
const OUT = path.resolve(String(opt('out', path.join(process.env.HOME || '/tmp', 'omnidx-promo', 'out'))));
const FPS = Number(opt('fps', 30));
const JOBS = Number(opt('jobs', 2));
const STILL_MODE = args.includes('--stills');
const FRAME = opt('frame', null);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT || 8262);
const SIZES = { tiktok: [1080, 1920], yt: [1920, 1080], feed: [1080, 1350], thumb: [1280, 720] };

for (const need of ['shots', 'music', 'fonts', 'footage']) {
  if (!fs.existsSync(path.join(ASSETS, need))) { console.error(`missing ${path.join(ASSETS, need)} — run shots.mjs / music.mjs / footage.mjs first (see README)`); process.exit(1); }
}

/* ---- a server for the composition and its assets ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.webm': 'video/webm' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(rq.url.split('?')[0]);
  let f;
  if (p === '/promo-assets/mark.svg') f = path.join(ROOT, 'studio/assets/mark.svg');
  else if (p.startsWith('/promo-assets/')) f = path.join(ASSETS, p.slice('/promo-assets/'.length));
  else f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { if (p !== '/favicon.ico') console.error(`  404 ${p}`); rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--hide-scrollbars', '--disable-gpu-vsync', '--force-device-scale-factor=1'] });

async function openComp(id, fmt) {
  const [w, h] = SIZES[fmt] || SIZES.tiktok;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`  [${id}] page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`  [${id}] console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${PORT}/tools/promo/studio/comp.html?video=${encodeURIComponent(id)}&fmt=${fmt}`, { waitUntil: 'load' });
  const t0 = Date.now();
  while (!(await page.evaluate(() => window.READY === true))) {
    if (Date.now() - t0 > 30000) throw new Error(`${id}: composition never became ready`);
    await page.waitForTimeout(50);
  }
  const duration = await page.evaluate(() => window.DURATION);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, duration, w, h };
}

const seekTo = (page, t) => page.evaluate((t) => { window.seek(t); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);

async function renderVideo(spec, fmt) {
  const { ctx, page, cdp, duration } = await openComp(spec.id, fmt);
  const dir = path.join(OUT, fmt); fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${spec.id}.mp4`);
  const wav = path.join(ASSETS, 'music', `${spec.music}.wav`);
  const total = Math.round(duration * FPS);
  const fade = Math.min(1.2, duration / 4);
  const ff = spawn(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', wav,
    '-filter_complex', `[1:a]atrim=0:${duration.toFixed(3)},afade=t=in:st=0:d=0.05,afade=t=out:st=${(duration - fade).toFixed(3)}:d=${fade.toFixed(3)},volume=0.9[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg exited ${c} for ${spec.id}`)) : res())));
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await seekTo(page, i / FPS);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i && i % 300 === 0) console.log(`  [${spec.id}] ${i}/${total} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await done;
  await ctx.close();
  console.log(`done ${fmt}/${spec.id}.mp4  ${duration.toFixed(1)}s  ${((Date.now() - t0) / 1000).toFixed(0)}s to render`);
}

async function renderStill(spec) {
  const fmt = spec.fmt || 'feed';
  const { ctx, page } = await openComp(spec.id, fmt);
  const dir = path.join(OUT, 'stills'); fs.mkdirSync(dir, { recursive: true });
  await seekTo(page, spec.t ?? 2);
  await page.screenshot({ path: path.join(dir, `${spec.id}.png`), type: 'png' });
  await ctx.close();
  console.log(`done stills/${spec.id}.png`);
}

async function renderFrame(spec, fmt, t) {
  const { ctx, page } = await openComp(spec.id, fmt);
  const dir = path.join(OUT, 'check'); fs.mkdirSync(dir, { recursive: true });
  await seekTo(page, Number(t));
  const file = path.join(dir, `${spec.id}-${fmt}-${Number(t).toFixed(2)}.png`);
  await page.screenshot({ path: file, type: 'png' });
  await ctx.close();
  console.log(`frame ${file}`);
}

try {
  if (FRAME != null) {
    const id = WANT === 'all' ? VIDEOS[0].id : WANT.split(',')[0];
    const spec = [...VIDEOS, ...STILLS].find((v) => v.id === id);
    if (!spec) throw new Error(`no video ${id}`);
    await renderFrame(spec, spec.fmt || FMT, FRAME);
  } else if (STILL_MODE) {
    const list = WANT === 'all' ? STILLS : STILLS.filter((s) => WANT.split(',').includes(s.id));
    for (const s of list) await renderStill(s);
  } else {
    const list = WANT === 'all' ? VIDEOS.filter((v) => !v.formats || v.formats.includes(FMT)) : VIDEOS.filter((v) => WANT.split(',').includes(v.id));
    if (!list.length) throw new Error(`nothing to render for --video ${WANT}`);
    const queue = [...list];
    await Promise.all(Array.from({ length: Math.max(1, JOBS) }, async () => {
      while (queue.length) { const spec = queue.shift(); await renderVideo(spec, FMT); }
    }));
  }
} finally {
  await browser.close();
  server.close();
}
