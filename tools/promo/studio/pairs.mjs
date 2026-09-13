/*
 * The before/after material for the videos that show a result.
 *
 * Two scenes in the set do not show a panel, they show an outcome: the eraser
 * taking a can out of a shot, and the audio repair taking the hum, hiss and
 * clicks out of a recording. Both would be trivial to fake and worthless if
 * faked, so neither is drawn — this runs the app's own engines and keeps what
 * they produce.
 *
 *   erase-before.png / erase-after.png
 *     One frame of the table clip, and that frame after erase.js filled the
 *     can out of it. The region comes from pickRegion, from one tap found by
 *     looking for the can rather than by a hard-coded coordinate; the fill
 *     borrows from a background plate taken later in the same shot, which is
 *     what buildPlate arrives at by median on a still camera.
 *
 *   audio-repair.json
 *     A deliberately awful recording — a voice at three distances, hiss, 60Hz
 *     mains hum, four clicks, a level that wanders — and the same recording
 *     after audio-repair.js. Kept: both envelopes, both noise floors, both
 *     spectra, where the clicks were, and the app's own repair report. The
 *     decibel figure the video shows is computed from the two floors.
 *
 *   PROMO_ASSETS=/somewhere node tools/promo/studio/pairs.mjs
 *
 * Writes $PROMO_ASSETS/footage/erase-{before,after}.png and
 * $PROMO_ASSETS/audio-repair.json. Needs footage.mjs to have run first.
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const OUT = path.join(ASSETS, 'footage');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT || 8263);
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

/* The one copy of the scene: read out of footage.mjs, so the wipe in the video
   and the screenshot of the app are unmistakably the same shot. */
const src = fs.readFileSync(path.join(HERE, 'footage.mjs'), 'utf8');
const TABLE = /\btable: `([\s\S]*?)`,\n/.exec(src)?.[1];
if (!TABLE) throw new Error('footage.mjs has no table clip to draw');

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--hide-scrollbars'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', (e) => console.log('  page error:', e.message));
await page.goto(`http://127.0.0.1:${PORT}/studio/app/index.html`, { waitUntil: 'domcontentloaded' });

/* ---------------------------------------------------------------- the eraser */
const pair = await page.evaluate(async ({ draw: drawSrc }) => {
  const E = await import('/studio/app/js/engine/erase.js');
  // eslint-disable-next-line no-eval -- the clip's own draw function, from this repo
  const draw = eval(drawSrc);
  const W = 1600, H = 900, AT = 1.0, LATER = 5.6;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  draw(ctx, AT, W, H);
  const before = cv.toDataURL('image/png');

  /* Where a person would put their finger: the middle of the can's body, a
     fifth of the way down — below the darker lid, above the label. Found by
     looking for the can so that moving it in the clip cannot silently move
     the tap onto the table. */
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, cnt = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * 4;
    if (data[i] > 110 && data[i] > data[i + 1] * 1.9 && data[i] > data[i + 2] * 1.9) {
      cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (cnt < 200) return { error: `no can in the frame (${cnt} red pixels)` };
  const tapX = Math.round((x0 + x1) / 2), tapY = Math.round(y0 + (y1 - y0) * 0.2);

  const pick = E.pickRegion(data, W, H, tapX, tapY, { tolerance: 34 });
  if (!pick.bbox) return { error: 'the tap picked nothing' };
  const shape = E.packShape(pick.mask, W, H, pick.bbox);
  const cx = (pick.bbox.x0 + pick.bbox.x1) / 2 / W, cy = (pick.bbox.y0 + pick.bbox.y1) / 2 / H;

  const plate = document.createElement('canvas'); plate.width = W; plate.height = H;
  draw(plate.getContext('2d'), LATER, W, H);

  const t0 = performance.now();
  const done = E.eraseRegion(ctx, W, H, shape, {
    cx, cy, grow: 20, feather: 10, fill: 'auto', texture: 0.5,
    others: () => [{ canvas: plate, clear: true }],
  });
  const ms = performance.now() - t0;
  const after = cv.toDataURL('image/png');

  /* What is left of the can where it stood: the check that this is a removal
     and not a smudge. */
  const box = E.shapeRect(shape, W, H, cx, cy, 1);
  const px = ctx.getImageData(Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h)).data;
  let red = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 110 && px[i] > px[i + 1] * 1.5 && px[i] > px[i + 2] * 1.5) red++;
  return { before, after, done, ms, area: pick.area, cells: `${shape.cols}x${shape.rows}`,
    tap: [tapX / W, tapY / H], redPct: (red / (px.length / 4)) * 100 };
}, { draw: TABLE });

if (pair.error) throw new Error(`eraser: ${pair.error}`);
if (!pair.done) throw new Error('eraser: eraseRegion did nothing');
if (pair.redPct > 0.5) throw new Error(`eraser: ${pair.redPct.toFixed(2)}% of the can survived — the pair would be a lie`);
fs.writeFileSync(path.join(OUT, 'erase-before.png'), Buffer.from(pair.before.split(',')[1], 'base64'));
fs.writeFileSync(path.join(OUT, 'erase-after.png'), Buffer.from(pair.after.split(',')[1], 'base64'));
console.log(`erase pair  ${pair.ms.toFixed(0)}ms  picked ${pair.area}px (${pair.cells})  tap ${pair.tap.map((v) => v.toFixed(3)).join(',')}  ${pair.redPct.toFixed(2)}% left`);

/* ---------------------------------------------------------------- audio repair */
const audio = await page.evaluate(async () => {
  const A = await import('/studio/app/js/engine/audio-repair.js');
  const SR = 48000, SEC = 3.2, N = Math.round(SR * SEC);
  const buf = new OfflineAudioContext(1, N, SR).createBuffer(1, N, SR);
  const d = buf.getChannelData(0);

  /* A voice: three words, at three distances from the microphone. */
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
  const words = [[0.25, 0.75, 0.30], [1.15, 1.75, 0.09], [2.15, 2.95, 0.22]];
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let v = 0;
    for (const [a, z, gain] of words) {
      if (t < a || t > z) continue;
      const env = Math.sin(Math.PI * ((t - a) / (z - a))) ** 0.6;
      const f0 = 118 + 26 * Math.sin(2 * Math.PI * 1.7 * t);
      let sig = 0;
      for (let k = 1; k <= 9; k++) sig += Math.sin(2 * Math.PI * f0 * k * t) / (k * 1.35);
      v += sig * env * gain * 0.5;
    }
    /* Everything wrong with it: mains hum and its harmonics, and the room. */
    v += 0.055 * Math.sin(2 * Math.PI * 60 * t) + 0.022 * Math.sin(2 * Math.PI * 120 * t) + 0.011 * Math.sin(2 * Math.PI * 180 * t);
    v += rnd() * 0.030;
    d[i] = v;
  }
  const clicks = [0.52, 1.31, 1.92, 2.61];
  for (const t of clicks) { const i = Math.round(t * SR); d[i] += 0.85; d[i + 1] -= 0.62; d[i + 2] += 0.30; }

  const dirty = Float32Array.from(d);
  const { buffer: fixed, report } = await A.repair(buf, { noise: 1.8, hum: true, clicks: true, level: true });
  const clean = fixed.getChannelData(0);

  const BUCKETS = 260;
  const env = (arr) => {
    const o = [];
    for (let k = 0; k < BUCKETS; k++) {
      const a = Math.floor((k * arr.length) / BUCKETS), z = Math.floor(((k + 1) * arr.length) / BUCKETS);
      let m = 0; for (let i = a; i < z; i++) { const v = Math.abs(arr[i]); if (v > m) m = v; }
      o.push(Number(m.toFixed(4)));
    }
    return o;
  };
  /* The noise floor: the tenth percentile of the envelope, which is what a
     listener hears as hiss between the words. */
  const floor = (arr) => { const e = env(arr).slice().sort((x, y) => x - y); return e[Math.floor(e.length * 0.1)]; };

  return {
    seconds: SEC, clicks,
    before: env(dirty), after: env(clean),
    floorBefore: Number(floor(dirty).toFixed(4)), floorAfter: Number(floor(clean).toFixed(4)),
    report, words: A.describeRepair(report),
  };
});

const dB = 20 * Math.log10(audio.floorAfter / audio.floorBefore);
if (!(dB < -6)) throw new Error(`audio repair only moved the noise floor ${dB.toFixed(1)} dB — nothing worth showing`);
if (!audio.report.hum) throw new Error('audio repair did not find the hum that was put there');
fs.writeFileSync(path.join(ASSETS, 'audio-repair.json'), JSON.stringify(audio));
console.log(`audio pair  ${audio.words}`);
console.log(`            noise floor ${audio.floorBefore} → ${audio.floorAfter}  (${dB.toFixed(1)} dB)`);

await browser.close();
server.close();
console.log('pairs written to', ASSETS);
