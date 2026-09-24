/*
 * Renders the tutorial: tutorial.html frame by frame in Chromium, the score in
 * the same browser's OfflineAudioContext, then ffmpeg encodes the site's two
 * files and the poster.
 *
 *   node tools/promo/tune/render.mjs                 the whole thing
 *   node tools/promo/tune/render.mjs --stills 12,30  PNG stills at those seconds (for review)
 *   node tools/promo/tune/render.mjs --audio         the score alone
 *
 * Environment:
 *   FONTS      folder with InterVariable.ttf and JetBrainsMono-{Regular,Medium,Bold}.ttf
 *              (fetched into it on first use if missing; they are OFL fonts and stay out of git)
 *   WORK       scratch folder for the intermediate picture and sound (default: /tmp/omnidx-tutorial)
 *   CHROME     a Chromium binary (default: Playwright's headless shell)
 *   FFMPEG     an ffmpeg binary with libx264, libvpx-vp9, libopus and aac
 *
 * Writes studio/assets/video/omnidx-tune-how-it-works.{webm,mp4,jpg}.
 */
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync('/opt/node22/lib/node_modules/playwright') ? '/opt/node22/lib/node_modules/playwright' : 'playwright'));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const WORK = process.env.WORK || '/tmp/omnidx-tutorial';
const FONTS = process.env.FONTS || path.join(WORK, 'fonts');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const OUT = path.join(ROOT, 'studio/assets/video');
const NAME = 'omnidx-tune-how-it-works';
const PORT = Number(process.env.PORT || 8271);
const args = process.argv.slice(2);
fs.mkdirSync(WORK, { recursive: true });

async function ensureFonts() {
  const need = { 'InterVariable.ttf': 'https://github.com/rsms/inter/raw/v4.1/docs/font-files/InterVariable.ttf' };
  fs.mkdirSync(FONTS, { recursive: true });
  for (const [f, url] of Object.entries(need)) {
    if (fs.existsSync(path.join(FONTS, f))) continue;
    const r = await fetch(url); if (!r.ok) throw new Error(`could not fetch ${f}`);
    fs.writeFileSync(path.join(FONTS, f), Buffer.from(await r.arrayBuffer()));
  }
  for (const w of ['Regular', 'Medium', 'Bold']) {
    const f = `JetBrainsMono-${w}.ttf`;
    if (fs.existsSync(path.join(FONTS, f))) continue;
    const r = await fetch(`https://github.com/JetBrains/JetBrainsMono/raw/v2.304/fonts/ttf/${f}`); if (!r.ok) throw new Error(`could not fetch ${f}`);
    fs.writeFileSync(path.join(FONTS, f), Buffer.from(await r.arrayBuffer()));
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf' };
function serve() {
  const server = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split('?')[0]);
    const base = p.startsWith('/fonts/') ? FONTS : ROOT;
    if (p.startsWith('/fonts/')) p = p.slice('/fonts'.length);
    const f = path.join(base, p);
    if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rs);
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

async function openPage(browser, file) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/tools/promo/tune/${file}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  return page;
}

async function renderAudio(browser) {
  const page = await openPage(browser, 'score.html');
  const b64 = await page.evaluate(async () => {
    const bytes = new Uint8Array(await window.renderScore());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await page.close();
  const wav = path.join(WORK, 'score.wav');
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  console.log('score', wav, fs.statSync(wav).size, 'bytes');
  return wav;
}

async function renderPicture(browser) {
  const page = await openPage(browser, 'tutorial.html');
  const { dur, fps } = await page.evaluate(() => ({ dur: window.DURATION, fps: window.FPS }));
  const frames = Math.round(dur * fps);
  const master = path.join(WORK, 'picture.mp4');
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', String(fps), master], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.seek(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg picture ' + c)))));
  await page.close();
  return master;
}

async function stills(browser, list) {
  const page = await openPage(browser, 'tutorial.html');
  const dir = path.join(WORK, 'stills'); fs.mkdirSync(dir, { recursive: true });
  for (const t of list) {
    await page.evaluate((x) => window.seek(x), t);
    const f = path.join(dir, `t${String(t.toFixed(2)).padStart(6, '0')}.png`);
    await page.screenshot({ path: f });
    console.log(f);
  }
  await page.close();
}

function encode(master, wav) {
  fs.mkdirSync(OUT, { recursive: true });
  const loud = path.join(WORK, 'score-loud.wav');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', '48000', loud]);
  const mp4 = path.join(OUT, `${NAME}.mp4`), webm = path.join(OUT, `${NAME}.webm`), jpg = path.join(OUT, `${NAME}.jpg`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', master, '-i', loud, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-tune', 'animation',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4]);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', master, '-i', loud, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '39', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p',
    '-c:a', 'libopus', '-b:a', '128k', '-shortest', webm]);
  // The poster: the result card, 214 down to 86, over the window that got it there.
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', process.env.POSTER_AT || '48.5', '-i', master, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '4', jpg]);
  for (const f of [mp4, webm, jpg]) console.log(path.relative(ROOT, f), (fs.statSync(f).size / 1e6).toFixed(2), 'MB');
}

await ensureFonts();
const server = await serve();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text', '--autoplay-policy=no-user-gesture-required'] });
try {
  const si = args.indexOf('--stills');
  if (si >= 0) await stills(browser, args[si + 1].split(',').map(Number));
  else if (args.includes('--audio')) await renderAudio(browser);
  else {
    const wav = args.includes('--reuse-audio') && fs.existsSync(path.join(WORK, 'score.wav')) ? path.join(WORK, 'score.wav') : await renderAudio(browser);
    const master = args.includes('--reuse-picture') && fs.existsSync(path.join(WORK, 'picture.mp4')) ? path.join(WORK, 'picture.mp4') : await renderPicture(browser);
    encode(master, wav);
  }
} finally {
  await browser.close();
  server.close();
}
