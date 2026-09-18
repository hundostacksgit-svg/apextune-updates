#!/usr/bin/env node
/*
 * The face of the ambient channel: a profile picture, a banner and a thumbnail
 * for every loop, drawn from the loops' own frames so the channel looks like
 * its videos and nothing else.
 *
 *   PROMO_ASSETS=/somewhere node tools/promo/studio/channel.mjs \
 *     [--name "Dim Hours"] [--line "for sleep, study and the middle of the night"] \
 *     [--hours 1] [--out $PROMO_ASSETS/out/channel]
 *
 * It needs one still of each loop in $PROMO_ASSETS/out/check, which
 * render.mjs makes in a few seconds each:
 *
 *   node tools/promo/studio/render.mjs --fmt yt --silent --scale 2 --frame 20 --video amb-02-rain
 *
 * Writes:
 *   pfp-800.png            800x800, what YouTube asks for; it is shown as a circle
 *   banner-2560x1440.jpg   the channel banner; the name sits in the 1546x423 safe
 *                          area YouTube shows on every device
 *   thumb-<look>-<N>h.jpg  1280x720, under 2 MB, one per loop, for N hours
 *
 * No OmniDx mark anywhere: the channel earns on its own, and a sleep video
 * with a software plug on it reads as an advert.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright not found — npm i -g playwright, or set PLAYWRIGHT_MODULE to its folder');
}
const { chromium } = loadPlaywright();

const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const NAME = opt('name', 'Dim Hours');
const LINE = opt('line', 'rain · fire · ocean · northern lights · space — for sleep and study');
const HOURS = Number(opt('hours', 1));
const OUT = path.resolve(opt('out', path.join(ASSETS, 'out', 'channel')));
const PORT = Number(process.env.PORT || 8263);
fs.mkdirSync(OUT, { recursive: true });

/* The word on each thumbnail is what somebody typed into the search box. */
const LOOKS = [
  { look: 'rain', id: 'amb-02-rain', word: 'RAIN', accent: '#a9cdff' },
  { look: 'aurora', id: 'amb-01-aurora', word: 'NORTHERN<br>LIGHTS', accent: '#8af0cc' },
  { look: 'space', id: 'amb-03-space', word: 'SPACE', accent: '#c0b0ff' },
  { look: 'embers', id: 'amb-04-embers', word: 'FIRE', accent: '#ffb46e' },
  { look: 'ocean', id: 'amb-05-ocean', word: 'OCEAN', accent: '#93d3ff' },
  /* the fusions */
  { look: 'rainsea', id: 'amb-06-rainsea', word: 'RAIN<br>AT SEA', accent: '#a9cdff' },
  { look: 'auroraocean', id: 'amb-07-auroraocean', word: 'LIGHTS<br>OVER THE SEA', accent: '#8af0cc' },
  { look: 'firerain', id: 'amb-08-firerain', word: 'FIRE<br>& RAIN', accent: '#ffb46e' },
  { look: 'starsea', id: 'amb-09-starsea', word: 'STARS<br>OVER THE SEA', accent: '#c0b0ff' },
];
const still = (id) => path.join(ASSETS, 'out', 'check', `${id}-yt-20.00.png`);
for (const l of LOOKS) {
  if (!fs.existsSync(still(l.id))) {
    console.error(`missing ${still(l.id)} — node tools/promo/studio/render.mjs --fmt yt --silent --scale 2 --frame 20 --video ${l.id}`);
    process.exit(1);
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const CSS = `
  @font-face { font-family: 'Sora'; src: url(/fonts/Sora-800.woff2) format('woff2'); font-weight: 800; }
  @font-face { font-family: 'Inter'; src: url(/fonts/Inter-700.woff2) format('woff2'); font-weight: 700; }
  @font-face { font-family: 'Inter'; src: url(/fonts/Inter-600.woff2) format('woff2'); font-weight: 600; }
  * { margin: 0; box-sizing: border-box; }
  html, body { background: #06090f; overflow: hidden; }
  body { font-family: 'Inter', system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
  .stage { position: relative; overflow: hidden; }
  .bg { position: absolute; inset: 0; background-size: cover; background-position: center; }

  /* The mark: a moon with a veil of cloud across its lower half. Reads at 98px. */
  .mark { position: relative; }
  .mark .glow { position: absolute; border-radius: 50%; background: radial-gradient(circle, rgba(236,240,255,.28), rgba(236,240,255,0) 70%); }
  .mark .moon { position: absolute; border-radius: 50%; background: radial-gradient(circle at 42% 38%, #fbf9f2, #d9dde6 62%, #b9c0cc); }
  .mark .veil { position: absolute; border-radius: 50%; background: #0a1120; filter: blur(var(--soft)); }

  .pfp { width: 800px; height: 800px; background: radial-gradient(circle at 50% 42%, #14203a, #070b14 70%); }
  .pfp .mark { position: absolute; left: 0; top: 0; width: 800px; height: 800px; --soft: 22px; }
  .pfp .glow { left: 150px; top: 130px; width: 500px; height: 500px; }
  .pfp .moon { left: 250px; top: 230px; width: 300px; height: 300px; }
  .pfp .veil { left: 300px; top: 430px; width: 520px; height: 300px; }

  .banner { width: 2560px; height: 1440px; }
  .banner .bg { filter: brightness(.8); }
  .banner .shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 55%, rgba(6,9,15,.05), rgba(6,9,15,.6) 78%); }
  .banner .safe { position: absolute; left: 507px; top: 508px; width: 1546px; height: 423px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; text-align: center; }
  .banner .mark { width: 110px; height: 110px; --soft: 5px; flex: none; }
  .banner .glow { left: -20px; top: -20px; width: 150px; height: 150px; }
  .banner .moon { left: 15px; top: 15px; width: 80px; height: 80px; }
  .banner .veil { left: 30px; top: 66px; width: 130px; height: 80px; }
  .banner h1 { font: 800 148px/1 'Sora', sans-serif; letter-spacing: -.01em; text-shadow: 0 6px 40px rgba(0,0,0,.6); }
  .banner p { font: 600 40px/1.3 'Inter', sans-serif; color: rgba(255,255,255,.82); letter-spacing: .01em; text-shadow: 0 3px 20px rgba(0,0,0,.7); }

  .thumb { width: 1280px; height: 720px; }
  .thumb .bg { filter: brightness(1.08); }
  .thumb .shade { position: absolute; inset: 0; background: linear-gradient(100deg, rgba(4,7,12,.86) 0%, rgba(4,7,12,.55) 42%, rgba(4,7,12,0) 68%); }
  .thumb .text { position: absolute; left: 72px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .thumb h1 { font: 800 152px/.94 'Sora', sans-serif; letter-spacing: -.02em; text-shadow: 0 8px 40px rgba(0,0,0,.75); }
  .thumb h1.two { font-size: 118px; }
  .thumb p { font: 700 46px/1 'Inter', sans-serif; letter-spacing: .06em; color: var(--accent); text-shadow: 0 4px 24px rgba(0,0,0,.8); }
  .thumb .brand { position: absolute; right: 44px; bottom: 34px; display: flex; align-items: center; gap: 14px; opacity: .78; }
  .thumb .brand .mark { width: 44px; height: 44px; --soft: 2px; }
  .thumb .brand .glow { left: -10px; top: -10px; width: 64px; height: 64px; }
  .thumb .brand .moon { left: 6px; top: 6px; width: 32px; height: 32px; }
  .thumb .brand .veil { left: 12px; top: 27px; width: 52px; height: 32px; }
  .thumb .brand span { font: 600 26px/1 'Inter', sans-serif; letter-spacing: .02em; text-shadow: 0 2px 12px rgba(0,0,0,.8); }
`;
const MARK = `<div class="mark"><div class="glow"></div><div class="moon"></div><div class="veil"></div></div>`;

function page(kind, q) {
  let body;
  if (kind === 'pfp') {
    body = `<div class="stage pfp">${MARK}</div>`;
  } else if (kind === 'banner') {
    body = `<div class="stage banner"><div class="bg" style="background-image:url(/out/check/amb-01-aurora-yt-20.00.png)"></div><div class="shade"></div>
      <div class="safe">${MARK}<h1>${esc(NAME)}</h1><p>${esc(LINE)}</p></div></div>`;
  } else {
    const l = LOOKS.find((x) => x.look === q.look);
    const hours = Number(q.hours);
    body = `<div class="stage thumb" style="--accent:${l.accent}"><div class="bg" style="background-image:url(/out/check/${l.id}-yt-20.00.png)"></div><div class="shade"></div>
      <div class="text"><h1 class="${l.word.includes('<br>') ? 'two' : ''}">${l.word}</h1><p>${hours} HOUR${hours === 1 ? '' : 'S'} · FOR SLEEP</p></div>
      <div class="brand">${MARK}<span>${esc(NAME)}</span></div></div>`;
  }
  return `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${body}`;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://x');
  if (u.pathname === '/page') {
    rs.writeHead(200, { 'content-type': 'text/html' });
    rs.end(page(u.searchParams.get('kind'), Object.fromEntries(u.searchParams)));
    return;
  }
  const f = path.join(ASSETS, decodeURIComponent(u.pathname));
  if (!f.startsWith(ASSETS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'] });
async function shoot(kind, q, size, file, type) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const qs = new URLSearchParams({ kind, ...q }).toString();
  await p.goto(`http://127.0.0.1:${PORT}/page?${qs}`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: file, type, ...(type === 'jpeg' ? { quality: 92 } : {}) });
  await ctx.close();
  console.log(`  ${path.basename(file)}  ${(fs.statSync(file).size / 1048576).toFixed(2)} MB`);
}

await shoot('pfp', {}, { width: 800, height: 800 }, path.join(OUT, 'pfp-800.png'), 'png');
await shoot('banner', {}, { width: 2560, height: 1440 }, path.join(OUT, 'banner-2560x1440.jpg'), 'jpeg');
for (const l of LOOKS) {
  await shoot('thumb', { look: l.look, hours: String(HOURS) }, { width: 1280, height: 720 }, path.join(OUT, `thumb-${l.look}-${HOURS}h.jpg`), 'jpeg');
}
await browser.close();
server.close();
console.log(`written to ${OUT}`);
