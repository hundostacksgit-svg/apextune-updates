import { chromium } from 'playwright-core';
import fs from 'node:fs';
const PAGE = process.env.PAGE || 'promo';          // which promo html to render
const FPS = Number(process.env.FPS || 30);
const OUT = `${process.env.SP}/vid/frames-${PAGE}`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--force-device-scale-factor=1','--hide-scrollbars'] });
const c = await b.newContext({ viewport:{width:1080,height:1920}, deviceScaleFactor:1 });
const p = await c.newPage();
await p.goto(`http://127.0.0.1:8099/tools/promo/${PAGE}.html`, { waitUntil:'networkidle' });
await p.waitForTimeout(1500);
// beatcut.html loads its beat map asynchronously. Reading the duration before
// that resolves would render the 128bpm fallback grid against your song.
const src = await p.evaluate(() => window.MAP_READY ?? null);
if (src) console.log(`beat map: ${src}`);
const DUR = await p.evaluate(() => window.VIDEO_DURATION);
const total = Math.round(DUR * FPS);
console.log(`rendering ${PAGE}: ${total} frames at ${FPS}fps (${DUR}s)`);
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await p.evaluate((t) => window.seek(t), i / FPS);
  await p.screenshot({ path: `${OUT}/f${String(i).padStart(5,'0')}.jpg`, type:'jpeg', quality:92 });
  if (i % 120 === 0 && i) {
    const el = (Date.now()-t0)/1000;
    console.log(`  ${i}/${total}  ${el.toFixed(0)}s elapsed, ~${((el/i)*(total-i)).toFixed(0)}s left`);
  }
}
console.log(`done in ${((Date.now()-t0)/1000).toFixed(0)}s`);
await b.close();
