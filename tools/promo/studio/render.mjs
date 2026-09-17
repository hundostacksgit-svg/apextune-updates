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
/*
 * --scale 2 renders 4K, --scale 4 renders 8K, at the same layout.
 *
 * The composition is laid out in 1080x1920 logical pixels and every scene is
 * written against those numbers. Rather than re-lay it out at 2160x3840 — which
 * would double every constant in every scene — the browser is told the device
 * has more pixels per logical pixel, exactly as a phone screen does. Text and
 * vectors come out sharp at the full resolution; a canvas scene reads the
 * ratio from the page URL and allocates at device pixels so it does too.
 */
const SCALE = Number(opt('scale', 1));
const RES = SCALE >= 4 ? '-8k' : SCALE >= 2 ? '-4k' : '';
const JOBS = Number(opt('jobs', 2));
const STILL_MODE = args.includes('--stills');
/*
 * --silent: the picture, and no audio track at all.
 *
 * Not a debug switch. A video posted with a sound already on it is a video
 * TikTok files as its own; one posted silent lets you pick a trending sound in
 * the app, which is a real distribution signal and the one lever that costs
 * nothing. It is also the only honest way to put music people recognise under
 * these — anything licensed would be claimed or muted on upload, and the claim
 * lands on your account, not on the song.
 */
const SILENT = args.includes('--silent');
/*
 * --cold: re-cut so the video opens on the app doing something rather than on a
 * line of text. The hook still plays, second. See comp.js.
 */
const COLD = args.includes('--cold');
const FRAME = opt('frame', null);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT || 8262);
const SIZES = { tiktok: [1080, 1920], yt: [1920, 1080], feed: [1080, 1350], thumb: [1280, 720] };

/** Seconds of a WAV, read out of its header rather than by decoding it. */
function wavSeconds(file) {
  const b = fs.readFileSync(file);
  const rate = b.readUInt32LE(24), bytesPerSec = b.readUInt32LE(28);
  let off = 12, dataLen = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), len = b.readUInt32LE(off + 4);
    if (id === 'data') { dataLen = len; break; }
    off += 8 + len + (len % 2);
  }
  return bytesPerSec ? dataLen / bytesPerSec : dataLen / (rate * 2);
}

for (const need of ['shots', 'music', 'fonts', 'footage']) {
  if (!fs.existsSync(path.join(ASSETS, need))) { console.error(`missing ${path.join(ASSETS, need)} — run shots.mjs / music.mjs / footage.mjs first (see README)`); process.exit(1); }
}

/* ---- a server for the composition and its assets ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.webm': 'video/webm' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(rq.url.split('?')[0]);
  let f;
  /* The favicon too, so a clean render logs nothing: Chromium asks for it on
     every page and its 404 was the one line of noise in every render log. */
  if (p === '/promo-assets/mark.svg' || p === '/favicon.ico') f = path.join(ROOT, 'studio/assets/mark.svg');
  else if (p.startsWith('/promo-assets/')) f = path.join(ASSETS, p.slice('/promo-assets/'.length));
  else f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { console.error(`  404 ${p}`); rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--hide-scrollbars', '--disable-gpu-vsync', '--force-device-scale-factor=1'] });

async function openComp(id, fmt) {
  const [w, h] = SIZES[fmt] || SIZES.tiktok;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`  [${id}] page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`  [${id}] console: ${m.text()}`); });
  /* The frame rate goes to the page so a cut can land on the nearest frame
     rather than the next one — see the half-frame tolerance in comp.js. */
  await page.goto(`http://127.0.0.1:${PORT}/tools/promo/studio/comp.html?video=${encodeURIComponent(id)}&fmt=${fmt}&fps=${FPS}&dpr=${SCALE}${COLD ? '&cold=1' : ''}`, { waitUntil: 'load' });
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
  const [w, h] = SIZES[fmt] || SIZES.tiktok;
  const dir = path.join(OUT, fmt); fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${spec.id}${COLD ? '-cold' : ''}${SILENT ? '-silent' : ''}${RES}${FPS !== 30 ? `-${FPS}fps` : ''}.mp4`);
  /*
   * A tour is narrated and has no music; everything else has music and no
   * narration. The voice is not faded out at the end — a fade over the last
   * second of a sentence sounds like the upload broke.
   */
  const wav = SILENT ? null : (spec.voice
    ? path.join(ASSETS, 'voice', `${spec.id}.wav`)
    : path.join(ASSETS, 'music', `${spec.music}.wav`));
  if (wav && !fs.existsSync(wav)) {
    throw new Error(spec.voice
      ? `No narration for ${spec.id}. Run voice.mjs first.`
      : `No music track ${spec.music} for ${spec.id}.`);
  }
  /*
   * A bed shorter than the video is not a small problem: -shortest then cuts
   * the picture to the length of the audio, and the video quietly comes out
   * missing its end card. Looping would be worse — the cuts are on this
   * track's grid, so a seam puts every cut after it off the beat. Say so and
   * stop, so the fix is a shorter video or a longer bed rather than a file
   * nobody checked the end of.
   */
  const bed = wav ? wavSeconds(wav) : Infinity;
  if (bed + 0.05 < duration) {
    throw new Error(`${spec.id} is ${duration.toFixed(1)}s but ${path.basename(wav)} is only ${bed.toFixed(1)}s. `
      + 'Shorten the scenes, or make a longer bed in music.mjs.');
  }
  const total = Math.round(duration * FPS);
  const fade = Math.min(1.2, duration / 4);
  const audio = spec.voice
    ? `[1:a]atrim=0:${duration.toFixed(3)},afade=t=in:st=0:d=0.04,volume=1.0[a]`
    : `[1:a]atrim=0:${duration.toFixed(3)},afade=t=in:st=0:d=0.05,afade=t=out:st=${(duration - fade).toFixed(3)}:d=${fade.toFixed(3)},volume=0.9[a]`;
  const ff = spawn(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...(wav ? ['-i', wav, '-filter_complex', audio, '-map', '0:v', '-map', '[a]'] : ['-map', '0:v', '-an']),
    '-c:v', 'libx264', '-preset', SCALE > 1 ? 'fast' : 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    ...(SCALE > 1 ? ['-level', '6.2', '-x264-params', 'threads=8'] : []),
    ...(wav ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg exited ${c} for ${spec.id}`)) : res())));
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await seekTo(page, i / FPS);
    /* The clip's `scale` is what makes this a device-pixel capture. Without
       it CDP hands back CSS pixels — 1080x1920 — however many device pixels
       the context was given, and a "4K" render silently is not. Playwright's
       own page.screenshot sets this for you, which is why the check frames
       were the right size while the video was not. */
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93,
      clip: { x: 0, y: 0, width: w, height: h, scale: SCALE } });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i && i % 300 === 0) console.log(`  [${spec.id}] ${i}/${total} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await done;
  await ctx.close();
  console.log(`done ${fmt}/${path.basename(out)}  ${duration.toFixed(1)}s  ${((Date.now() - t0) / 1000).toFixed(0)}s to render`);
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
