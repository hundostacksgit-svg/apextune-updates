// Makes the OmniDx Edition's pictures: the desktop wallpaper and the lock
// screen (the site's black-and-purple background, still, with the logo), the
// app icons, the account picture and the small logo Settings shows. Every
// picture here is drawn from the site's own design; nothing is Microsoft's.
//
//   NODE_PATH=$(npm root -g) node edition/assets/make-assets.cjs
//
// Needs Playwright's Chromium and Python with Pillow (for the two .bmp files).
// The output sits next to this file and is committed, like the site's images.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const HERE = __dirname;
const REPO = path.resolve(HERE, '..', '..');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(REPO, 'studio/assets/logo/omnidx-logo.png')).toString('base64');
const head = 'data:image/png;base64,' + fs.readFileSync(path.join(REPO, 'studio/assets/logo/omnidx-head-1024.png')).toString('base64');

// The site's background (studio.js, initBackground), one still frame, painted at full size with a fixed seed so
// the picture is the same every time this runs.
const scene = (w, h, seed, logoBox) => `<!doctype html><html><head><style>html,body{margin:0;background:#000}canvas{display:block}</style></head><body>
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
let s = ${seed} >>> 0;
const rand = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = (a, b) => a + rand() * (b - a);
const c = document.getElementById('c'), ctx = c.getContext('2d');
const W = ${w}, H = ${h}, U = W / 1920;
ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
// Four soft purple shades.
ctx.globalCompositeOperation = 'lighter';
const blobs = [[270, .16, .20, .42], [286, .80, .30, .38], [258, .58, .86, .46], [296, .30, .72, .34]];
for (const [hue, ax, ay, r0] of blobs) {
  const cx = (ax + rnd(-.05, .05)) * W, cy = (ay + rnd(-.05, .05)) * H, r = r0 * Math.max(W, H);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'hsla(' + hue + ',85%,52%,.24)'); g.addColorStop(.5, 'hsla(' + hue + ',85%,52%,.07)'); g.addColorStop(1, 'hsla(' + hue + ',85%,52%,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}
ctx.globalCompositeOperation = 'source-over';
// A faint grid across the top, fading out, as on the site.
ctx.save();
const gm = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * .62);
gm.addColorStop(0, 'rgba(27,20,48,.55)'); gm.addColorStop(1, 'rgba(27,20,48,0)');
ctx.strokeStyle = gm; ctx.lineWidth = Math.max(1, U);
const step = 64 * U;
ctx.beginPath();
for (let x = 0; x <= W; x += step) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H * .7); }
for (let y = 0; y <= H * .7; y += step) { ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); }
ctx.stroke(); ctx.restore();
// Bolts, chips and motes at different depths.
const bolt = (x, y, sc, rot) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.beginPath(); ctx.moveTo(4, -12); ctx.lineTo(-6, 2); ctx.lineTo(0, 2); ctx.lineTo(-3, 12); ctx.lineTo(7, -3); ctx.lineTo(1, -3); ctx.closePath(); ctx.fill(); ctx.restore(); };
const chip = (x, y, sz, rot) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.roundRect(-sz, -sz, sz * 2, sz * 2, sz * .35); ctx.fill(); ctx.restore(); };
const L = ${JSON.stringify(logoBox)};
for (let i = 0; i < 70; i++) {
  const k = rand(), z = rnd(.25, 1), sz = rnd(.55, 1.4), a = rnd(.35, .95) * (.3 + .7 * z) * .85;
  const x = rand() * W, y = rand() * H, rot = rnd(0, 6.28);
  // Keep the logo clear.
  if (L && x > L[0] * W - 60 * U && x < (L[0] + L[2]) * W + 60 * U && y > L[1] * H - 60 * U && y < L[1] * H + L[2] * W * .52 + 60 * U) continue;
  ctx.fillStyle = 'rgba(192,132,252,' + a.toFixed(3) + ')';
  if (k < .34) bolt(x, y, sz * z * 1.15 * U * 1.4, rot);
  else if (k < .58) chip(x, y, 5.5 * sz * z * U * 1.3, rot);
  else {
    const rr = (1.4 * sz * z + .6) * 4 * U * 1.3;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(192,132,252,' + (.9 * a).toFixed(3) + ')'); g.addColorStop(.35, 'rgba(192,132,252,' + (.25 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(192,132,252,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
}
window.done = new Promise((ok) => {
  if (!L) return ok();
  const img = new Image();
  img.onload = () => {
    const lw = L[2] * W, lh = lw * img.height / img.width, lx = L[0] * W, ly = L[1] * H;
    // A glow behind the logo, then the logo.
    const g = ctx.createRadialGradient(lx + lw / 2, ly + lh / 2, 0, lx + lw / 2, ly + lh / 2, lw * .62);
    g.addColorStop(0, 'rgba(139,92,246,.20)'); g.addColorStop(1, 'rgba(139,92,246,0)');
    ctx.fillStyle = g; ctx.fillRect(lx - lw, ly - lw, lw * 3, lw * 3);
    ctx.drawImage(img, lx, ly, lw, lh);
    ok();
  };
  img.src = ${JSON.stringify(logo)};
});
</script></body></html>`;

// The app icons: the site's gradient square with a white sign on it. Search is a lens, Browser a ring with the bolt
// through it, Hub is the tune's own mark (three bars, cut, and the bolt).
const GRAD = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d28d9"/><stop offset=".45" stop-color="#8b5cf6"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/>';
const icons = {
  search: GRAD + '<circle cx="28" cy="28" r="12.5" fill="none" stroke="#fff" stroke-width="6"/><path d="M37.5 37.5 L49 49" stroke="#fff" stroke-width="7" stroke-linecap="round"/>',
  browser: GRAD + '<circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="5"/><path d="M35 18 L24.5 34.5 L31 34.5 L28.5 46 L39.5 29 L33 29 Z" fill="#fff"/>',
  hub: GRAD + '<rect x="12" y="17" width="30" height="6" rx="3" fill="#fff" opacity=".92"/><rect x="12" y="29" width="20" height="6" rx="3" fill="#fff" opacity=".68"/><rect x="12" y="41" width="11" height="6" rx="3" fill="#fff" opacity=".45"/><path d="M47 14 L37 34 L45 34 L41 50 L53 28 L45 28 Z" fill="#fff"/>',
  boost: GRAD + '<path d="M36 10 L20 36 L30 36 L26 54 L44 26 L34 26 Z" fill="#fff"/>',
};
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];

// An .ico of PNG images (Windows Vista and later read these at every size).
function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let off = 6 + dir.length;
  pngs.forEach(([size, png], i) => {
    const d = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, d); dir.writeUInt8(size >= 256 ? 0 : size, d + 1);
    dir.writeUInt8(0, d + 2); dir.writeUInt8(0, d + 3); dir.writeUInt16LE(1, d + 4); dir.writeUInt16LE(32, d + 6);
    dir.writeUInt32LE(png.length, d + 8); dir.writeUInt32LE(off, d + 12); off += png.length;
  });
  return Buffer.concat([head, dir, ...pngs.map((p) => p[1])]);
}

(async () => {
  const browser = await chromium.launch();
  const shoot = async (html, w, h, file, opts = {}) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => window.done || null);
    const buf = await page.screenshot({ type: opts.png ? 'png' : 'jpeg', quality: opts.png ? undefined : 92, omitBackground: !!opts.png });
    fs.writeFileSync(path.join(HERE, file), buf);
    await page.close();
    console.log(file, (buf.length / 1024).toFixed(0) + ' KB');
  };
  // The desktop: the logo right of centre, clear of the icons down the left.
  await shoot(scene(3840, 2160, 20260925, [0.44, 0.30, 0.40]), 3840, 2160, 'wallpaper.jpg');
  // The lock screen: Windows puts the clock high in the middle, so the logo sits low.
  await shoot(scene(3840, 2160, 777, [0.33, 0.60, 0.34]), 3840, 2160, 'lockscreen.jpg');

  for (const [name, body] of Object.entries(icons)) {
    const pngs = [];
    for (const n of SIZES) {
      const page = await browser.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
      await page.setContent(`<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${n}" height="${n}" style="display:block">${body}</svg></body></html>`);
      pngs.push([n, await page.screenshot({ omitBackground: true })]);
      await page.close();
    }
    fs.writeFileSync(path.join(HERE, name + '.ico'), ico(pngs));
    fs.writeFileSync(path.join(HERE, name + '-256.png'), pngs[pngs.length - 1][1]);
    console.log(name + '.ico', SIZES.join(','));
  }

  // The account picture: the eagle's head on the dark purple, square (Windows crops it to a circle).
  const tile = (n) => `<html><body style="margin:0"><div style="width:${n}px;height:${n}px;background:radial-gradient(circle at 60% 40%,#3b1d78 0%,#12081f 62%,#05030a 100%);display:flex;align-items:center;justify-content:center;overflow:hidden">
    <img src="${head}" style="width:${Math.round(n * 0.98)}px;height:${Math.round(n * 0.98)}px;margin-left:${Math.round(-n * 0.10)}px;margin-top:${Math.round(n * 0.04)}px"></div></body></html>`;
  fs.mkdirSync(path.join(HERE, 'account'), { recursive: true });
  for (const n of [448, 192, 48, 40, 32]) {
    const page = await browser.newPage({ viewport: { width: n, height: n } });
    await page.setContent(tile(n), { waitUntil: 'load' });
    fs.writeFileSync(path.join(HERE, 'account', n === 448 ? 'user.png' : `user-${n}.png`), await page.screenshot());
    await page.close();
  }
  // The small logo Windows shows for the PC's maker: the mark on black, 120 x 120.
  {
    const page = await browser.newPage({ viewport: { width: 120, height: 120 } });
    await page.setContent(`<html><body style="margin:0;background:#000"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="120" height="120">${icons.hub}</svg></body></html>`);
    fs.writeFileSync(path.join(HERE, 'oem.png'), await page.screenshot());
    await page.close();
  }
  await browser.close();
  // The logo the Hub's welcome page shows.
  fs.copyFileSync(path.join(REPO, 'studio/assets/logo/omnidx-logo-480.png'), path.join(HERE, 'logo.png'));
  // Windows wants two of them as .bmp.
  execFileSync('python3', ['-c', `
from PIL import Image
import os
h = ${JSON.stringify(HERE)}
Image.open(os.path.join(h, 'account', 'user.png')).convert('RGB').save(os.path.join(h, 'account', 'user.bmp'))
Image.open(os.path.join(h, 'oem.png')).convert('RGB').save(os.path.join(h, 'oem.bmp'))
os.remove(os.path.join(h, 'oem.png'))
`]);
  console.log('account pictures and oem.bmp');
})().catch((e) => { console.error(e); process.exit(1); });
