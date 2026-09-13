/*
 * Screenshots of the real editor, for the promo videos.
 *
 * The videos show the actual app, not a mock-up, so this opens OmniDx Studio
 * in Playwright's Chromium with a project that looks like a real one (four
 * clips of drawn footage from footage.mjs and a beat from music.mjs), opens
 * every panel in turn and screenshots each at 2x, so the videos can zoom into
 * a panel and it stays sharp.
 *
 *   PROMO_ASSETS=/somewhere node tools/promo/studio/shots.mjs
 *
 * Writes $PROMO_ASSETS/shots/*.png. Needs $PROMO_ASSETS/footage and
 * $PROMO_ASSETS/music to exist first (footage.mjs, music.mjs).
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const OUT = path.join(ASSETS, 'shots');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT || 8261);
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--hide-scrollbars'] });

/* The project every shot shows: a "Summer reel" with four clips and a beat. */
const FILES = [
  ['sunset_beach.webm', 'video/webm', path.join(ASSETS, 'footage/sunset.webm')],
  ['city_night.webm', 'video/webm', path.join(ASSETS, 'footage/city.webm')],
  ['forest_drone.webm', 'video/webm', path.join(ASSETS, 'footage/forest.webm')],
  ['studio_talk.webm', 'video/webm', path.join(ASSETS, 'footage/studio.webm')],
  ['phonk_132.wav', 'audio/wav', path.join(ASSETS, 'music/phonk-132-24s.wav')],
];

async function openEditor({ level, viewport, scale, mobile }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript((lv) => {
    try {
      localStorage.setItem('omnidx.studio.level', lv);
      localStorage.setItem('omnidx.studio.tour.v1', 'skipped');
      localStorage.setItem('omnidx.studio.purchase.v1', JSON.stringify({ edition: 'studio', at: Date.now() }));
    } catch {}
  }, level);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/studio/app/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#start.on', { timeout: 20000 });
  await page.waitForTimeout(500);
  /* Nothing in a screenshot should be a transient: no undo bar, no toasts, and
     the multicam dock only matters when there are angles. */
  await page.addStyleTag({ content: '#undo-bar,.toast,#angles{display:none!important}' });
  await page.screenshot({ path: path.join(OUT, mobile ? 'phone-start.png' : 'start.png') });
  await page.fill('#start-name', 'Summer reel');
  await page.click('#start-create');
  await page.waitForSelector('#start', { state: 'hidden' });
  await page.setInputFiles('#file-input', FILES.map(([name, mimeType, file]) => ({ name, mimeType, buffer: fs.readFileSync(file) })));
  await page.waitForTimeout(4000);
  await page.evaluate(async () => {
    const m = await import('/studio/app/js/main.js');
    for (const r of m.S.project.media) m.actions.appendMedia(r.id);
    m.actions.select([m.S.project.clips[0].id]);
    m.actions.seek(1.2);
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#zoom-fit')?.click());
  await page.waitForTimeout(600);
  return { ctx, page };
}

const shot = async (page, name) => {
  /* The multicam dock reserves a band above the timeline while the page carries
     ws-angles; a screenshot with an empty band in it looks broken. */
  await page.evaluate(() => document.documentElement.classList.remove('ws-angles'));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', name);
};

/* Desktop, Professional level, 2x. */
{
  const { ctx, page } = await openEditor({ level: 'expert', viewport: { width: 1600, height: 1000 }, scale: 2, mobile: false });
  await shot(page, 'editor');
  for (const p of ['effects', 'ai', 'templates', 'filters', 'transitions', 'overlays', 'color', 'text', 'stickers', 'shapes', 'audio', 'sound', 'captions']) {
    await page.click(`#rail button[data-panel="${p}"]`);
    await page.waitForTimeout(700);
    await shot(page, `panel-${p}`);
  }
  /* The AI panel with a real plan on screen: the planner runs on-device, so this is the app's own answer. */
  await page.click('#rail button[data-panel="ai"]');
  await page.waitForTimeout(500);
  await page.fill('#ai-prompt', 'Make a 20 second phonk edit, cut on the beat, speed lines on the drops and a VHS look');
  await page.click('#ai-plan');
  await page.waitForTimeout(3500);
  await shot(page, 'panel-ai-plan');
  await page.click('#rail button[data-panel="media"]');
  await page.waitForTimeout(400);
  await page.click('#btn-export');
  await page.waitForTimeout(900);
  await shot(page, 'export');
  await ctx.close();
}

/* A phone, Beginner level, 3x. */
{
  const { ctx, page } = await openEditor({ level: 'beginner', viewport: { width: 390, height: 844 }, scale: 3, mobile: true });
  await shot(page, 'phone');
  await ctx.close();
}

await browser.close();
server.close();
console.log('shots written to', OUT);
