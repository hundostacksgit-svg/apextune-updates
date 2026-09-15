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

/*
 * Where the controls are, measured rather than eyeballed.
 *
 * The videos drive a cursor across these screenshots and put a spotlight on
 * things, at coordinates that are fractions of the image. Reading those off by
 * eye means they quietly stop pointing at the control the moment the layout
 * moves — the cursor lands on empty chrome and nobody notices until the video
 * is posted. So every shot a video points into also records the boxes it cares
 * about, taken from the live page at the instant of the screenshot, and
 * comp.js resolves `on: 'apply'` against them.
 *
 * A mark is a CSS selector, or { sel, nth } for the nth match, or
 * { sel, text } for the first whose text starts with that.
 */
const marks = {};
async function mark(page, name, map) {
  const vp = page.viewportSize();
  const got = await page.evaluate((entries) => {
    const out = {};
    for (const [key, m] of entries) {
      const spec = typeof m === 'string' ? { sel: m } : m;
      const all = [...document.querySelectorAll(spec.sel)];
      /* `includes`, not `startsWith`: a card's text starts with an emoji and a
         summary starts with whatever the panel put in front of it. */
      const el = spec.text
        ? all.find((n) => n.textContent.trim().toLowerCase().includes(spec.text.toLowerCase()))
        : all[spec.nth || 0];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      /* A box off the top or bottom of the panel is a box the screenshot does
         not contain: pointing at it would point at whatever scrolled into its
         place. */
      if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.top >= innerHeight) continue;
      out[key] = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    return out;
  }, Object.entries(map));
  const box = {};
  for (const [key, r] of Object.entries(got)) {
    box[key] = { x: +(r.x / vp.width).toFixed(5), y: +(r.y / vp.height).toFixed(5),
      w: +(r.w / vp.width).toFixed(5), h: +(r.h / vp.height).toFixed(5) };
  }
  const missing = Object.keys(map).filter((k) => !box[k]);
  if (missing.length) console.log(`  ${name}: could not find ${missing.join(', ')}`);
  marks[name] = { ...(marks[name] || {}), ...box };
}

const shot = async (page, name, map) => {
  /* The multicam dock reserves a band above the timeline while the page carries
     ws-angles; a screenshot with an empty band in it looks broken. */
  await page.evaluate(() => document.documentElement.classList.remove('ws-angles'));
  await page.waitForTimeout(250);
  if (map) await mark(page, name, map);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', name);
};

/* Desktop, Professional level, 2x. */
{
  const { ctx, page } = await openEditor({ level: 'expert', viewport: { width: 1600, height: 1000 }, scale: 2, mobile: false });
  await shot(page, 'editor', {
    razor: '.tl-btn[data-tool="razor"]', split: '#tl-split', playhead: '#playhead',
    clip2: { sel: '#tl-inner [data-clip]', nth: 1 }, clip3: { sel: '#tl-inner [data-clip]', nth: 2 },
    exportBtn: '#btn-export', viewer: '#viewer', ruler: '#tl-ruler',
  });
  /*
   * Only what the shot actually contains. A panel opens scrolled to its top, so
   * the effects search and the colour wheels are below the fold in their
   * screenshots — mark() drops a box that is off-screen rather than record a
   * coordinate the picture does not have.
   */
  const PANEL_MARKS = {
    effects: { search: '#pr-search', preset: { sel: '#pr-lib [data-preset]', nth: 2 },
      preset2: { sel: '#pr-lib [data-preset]', nth: 5 }, group: '#pr-group > summary' },
    color: { looks: '#c-look-search', look: { sel: '#c-looks [data-look]', nth: 1 }, scope: '#c-scope-box' },
    sound: { search: '#ml-q', family: { sel: '#ml-fam [data-fam]', nth: 2 }, mood: { sel: '#ml-mood [data-mood]', nth: 1 },
      add: { sel: '#ml-list [data-track]', nth: 0 }, track2: { sel: '#ml-list [data-track]', nth: 1 } },
    ai: { prompt: '#ai-prompt', plan: '#ai-plan' },
    audio: { beats: { sel: '#panel .group', text: 'phonk_132' }, cut: '#a-beatcut', find: '#a-beats' },
    templates: { montage: { sel: '#panel [data-montage]', nth: 0 }, montage2: { sel: '#panel [data-montage]', nth: 1 } },
  };
  for (const p of ['effects', 'ai', 'templates', 'filters', 'transitions', 'overlays', 'color', 'text', 'stickers', 'shapes', 'audio', 'sound', 'captions']) {
    await page.click(`#rail button[data-panel="${p}"]`);
    await page.waitForTimeout(700);
    await shot(page, `panel-${p}`, PANEL_MARKS[p]);
  }
  /*
   * One shot per edit style, searched for by name.
   *
   * The styles panel opens on the first two montages, so a phonk video that
   * points a cursor at whatever is on screen points it at "Anime opening" —
   * true of the panel, false of the video. Typing the name puts the right card
   * under the cursor and shows the search working at the same time.
   */
  for (const name of ['phonk', 'anime', 'velocity']) {
    await page.click('#rail button[data-panel="templates"]');
    await page.waitForTimeout(450);
    const found = await page.evaluate((n) => {
      const card = [...document.querySelectorAll('#panel [data-montage]')]
        .find((el) => el.textContent.toLowerCase().includes(n));
      if (!card) return false;
      card.scrollIntoView({ block: 'center' });
      return true;
    }, name);
    if (!found) console.log(`  no ${name} montage on screen`);
    await page.waitForTimeout(450);
    await shot(page, `panel-styles-${name}`, { card: { sel: '#panel [data-montage]', text: name } });
  }

  /*
   * The audio panel scrolled to the bottom. The channel strip and the loudness
   * meter sit under the fold, so a shot of the panel's top shows the master
   * meter and nothing a claim about EQ, dynamics or loudness could point at.
   */
  await page.click('#rail button[data-panel="audio"]');
  await page.waitForTimeout(500);
  await page.evaluate(() => { const el = document.getElementById('panel'); el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(450);
  await shot(page, 'panel-audio-chain', {
    strip: { sel: '#panel details.group > summary', text: 'channel strip' },
    loudness: { sel: '#panel details.group > summary', text: 'loudness' },
    filters: { sel: '#panel details.group > summary', text: 'audio filters' },
    repair: { sel: '#panel details.group > summary', text: 'repair the audio' },
  });

  /* The AI panel with a real plan on screen: the planner runs on-device, so this is the app's own answer. */
  await page.click('#rail button[data-panel="ai"]');
  await page.waitForTimeout(500);
  await page.fill('#ai-prompt', 'Make a 20 second phonk edit, cut on the beat, speed lines on the drops and a VHS look');
  await page.click('#ai-plan');
  /* The plan lands in #ai-result, under the prompt and the montage chips, so a
     shot of the panel's top is a shot of the prompt and no plan at all. Wait
     for the steps to exist, then put them on screen. */
  await page.waitForSelector('#ai-steps', { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('ai-result')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(450);
  await shot(page, 'panel-ai-plan', {
    step1: { sel: '#ai-steps [data-step]', nth: 0 }, step2: { sel: '#ai-steps [data-step]', nth: 1 },
    step3: { sel: '#ai-steps [data-step]', nth: 2 }, doit: '#ai-apply',
  });
  await page.click('#rail button[data-panel="media"]');
  await page.waitForTimeout(400);
  await page.click('#btn-export');
  await page.waitForTimeout(900);
  await shot(page, 'export', { preset: '#x-preset', all: '#x-all', go: '#x-go', quality: '#x-quality' });
  await ctx.close();
}

/* The eraser, mid-pick: its own project with only the table clip in it, so the
   four-clip project every other shot is measured against stays exactly as it
   was. One tap on the can, and the shot is taken with the region lit up and
   "Remove it" armed — the app's own overlay, not a drawing of it. */
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('omnidx.studio.level', 'expert');
      localStorage.setItem('omnidx.studio.tour.v1', 'skipped');
      localStorage.setItem('omnidx.studio.purchase.v1', JSON.stringify({ edition: 'studio', at: Date.now() }));
    } catch {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/studio/app/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#start.on', { timeout: 20000 });
  await page.addStyleTag({ content: '#undo-bar,.toast,#angles{display:none!important}' });
  await page.fill('#start-name', 'Kitchen shot');
  await page.click('#start-create');
  await page.waitForSelector('#start', { state: 'hidden' });
  await page.setInputFiles('#file-input', [{ name: 'kitchen_table.webm', mimeType: 'video/webm', buffer: fs.readFileSync(path.join(ASSETS, 'footage/table.webm')) }]);
  await page.waitForTimeout(3000);
  await page.selectOption('#ratio', '16:9').catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const m = await import('/studio/app/js/main.js');
    for (const r of m.S.project.media) m.actions.appendMedia(r.id);
    m.actions.select([m.S.project.clips[0].id]);
    m.actions.seek(1.0);
    const t = await import('/studio/app/js/panels/tracking.js');
    t.openEraserForSelected();
  });
  await page.waitForTimeout(900);
  /* Where the can is at one second, as a fraction of the frame. */
  const hit = await page.evaluate(() => {
    const layer = document.getElementById('track-layer');
    const r = layer.getBoundingClientRect();
    return { x: r.left + r.width * 0.197, y: r.top + r.height * 0.556 };
  });
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(700);
  const picked = await page.evaluate(async () => (await import('/studio/app/js/panels/tracking.js')).eraserState()?.area || 0);
  console.log('  eraser picked', picked, 'px');
  await shot(page, 'panel-erase', { remove: '#er-go', reach: '#er-tol', msg: '#er-msg' });
  await ctx.close();
}

/* A phone, Beginner level, 3x. */
{
  const { ctx, page } = await openEditor({ level: 'beginner', viewport: { width: 390, height: 844 }, scale: 3, mobile: true });
  await shot(page, 'phone', { timeline: '#tl-scroll', viewer: '#viewer' });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(marks, null, 1));
console.log('shots written to', OUT);
console.log('marks:', Object.entries(marks).map(([k, v]) => `${k}(${Object.keys(v).length})`).join(' '));
