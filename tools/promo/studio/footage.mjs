/*
 * Footage for the editor to be photographed with.
 *
 * The promo shows the real app, and a real app needs clips in it. We cannot
 * ship anyone's footage, so these are drawn: a sunset over water, a city at
 * night, a forest from a drone, a lit silhouette in a studio — each a few
 * seconds of canvas animation, captured frame by frame and encoded to VP9,
 * which the browser the shots are taken in can decode without codecs it
 * does not have. A still of each is kept for the promo's own timeline scene.
 *
 *   PROMO_ASSETS=/somewhere FFMPEG=/path/to/ffmpeg node tools/promo/studio/footage.mjs
 *
 * Writes $PROMO_ASSETS/footage/<name>.webm and <name>-preview.png.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const OUT = path.join(ASSETS, 'footage');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const W = 960, H = 540, FPS = 30, SECONDS = 6;
fs.mkdirSync(OUT, { recursive: true });

/* Each clip is a function of time: (ctx, t, W, H) => paints the frame. Sent to the page as source. */
const DRAW = {
  sunset: `(ctx,t,W,H)=>{const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#2b1055');g.addColorStop(.45,'#ff6a3d');g.addColorStop(.62,'#ffb347');g.addColorStop(.63,'#1b3a5c');g.addColorStop(1,'#061a2e');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const sy=H*.55-t*4;ctx.fillStyle='#fff1b8';ctx.beginPath();ctx.arc(W*.62,sy,54,0,7);ctx.fill();
    for(let i=0;i<26;i++){const y=H*.64+i*14;ctx.strokeStyle='rgba(255,220,160,'+(.06+i*.01)+')';ctx.lineWidth=2;ctx.beginPath();for(let x=0;x<=W;x+=8){ctx.lineTo(x,y+Math.sin(x*.02+t*2+i)*3+Math.sin(x*.05-t*3)*2);}ctx.stroke();}
    ctx.fillStyle='rgba(255,200,120,.25)';ctx.fillRect(W*.55,H*.63,W*.14,H*.37);
    const cl=(x,y,s)=>{ctx.fillStyle='rgba(255,120,90,.35)';for(let k=0;k<4;k++){ctx.beginPath();ctx.arc(x+k*s*.6,y+(k%2)*s*.2,s*.5,0,7);ctx.fill();}};cl(120+t*10,110,60);cl(600+t*6,70,44);}`,
  city: `(ctx,t,W,H)=>{ctx.fillStyle='#050a18';ctx.fillRect(0,0,W,H);const g=ctx.createRadialGradient(W*.5,H*.9,10,W*.5,H*.9,W*.7);g.addColorStop(0,'rgba(60,40,120,.7)');g.addColorStop(1,'rgba(5,10,24,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    let s=7;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};const cols=['#ff4fa3','#4fd1ff','#ffd24f','#7a5cff','#4fffa3'];
    for(let i=0;i<70;i++){const x=(rnd()*W+t*(10+rnd()*30))%W;const y=rnd()*H;const r=8+rnd()*34;ctx.fillStyle=cols[i%5];ctx.globalAlpha=.25+.2*Math.sin(t*2+i);ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();}
    ctx.globalAlpha=1;for(let i=0;i<40;i++){const x=i*26+Math.sin(i)*6;const h=60+rnd()*220;ctx.fillStyle='#02040c';ctx.fillRect(x,H-h,22,h);for(let w=0;w<5;w++){if(rnd()>.5){ctx.fillStyle='rgba(255,220,150,'+(.3+rnd()*.5)+')';ctx.fillRect(x+4+(w%2)*8,H-h+10+w*14,5,7);}}}}`,
  forest: `(ctx,t,W,H)=>{const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#cfe8ea');g.addColorStop(1,'#5fa8a3');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const layer=(k,col,sp,amp,base)=>{ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=6){ctx.lineTo(x,base+Math.sin(x*.006+k+t*sp*.1)*amp+Math.sin(x*.02+k*3+t*sp*.05)*amp*.3);}ctx.lineTo(W,H);ctx.closePath();ctx.fill();};
    layer(1,'#3f8f8a',1,60,H*.45);layer(2,'#2f6f6a',2,50,H*.55);layer(3,'#1f4f4a',3,40,H*.68);layer(4,'#12332f',4,30,H*.8);
    ctx.fillStyle='rgba(255,255,255,.18)';for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse((i*260+t*25)%(W+300)-150,H*.6+i*20,220,26,0,0,7);ctx.fill();}
    for(let i=0;i<60;i++){const x=(i*17+t*40*(1+(i%3)))%W;const y=H*.6+(i*37)%(H*.4);ctx.fillStyle='#0b2622';ctx.beginPath();ctx.moveTo(x,y-18-(i%4)*6);ctx.lineTo(x-7,y);ctx.lineTo(x+7,y);ctx.closePath();ctx.fill();}}`,
  studio: `(ctx,t,W,H)=>{ctx.fillStyle='#0a0b12';ctx.fillRect(0,0,W,H);const a=ctx.createRadialGradient(W*.25,H*.3,10,W*.25,H*.3,W*.6);a.addColorStop(0,'rgba(122,92,255,.7)');a.addColorStop(1,'rgba(10,11,18,0)');ctx.fillStyle=a;ctx.fillRect(0,0,W,H);
    const c=ctx.createRadialGradient(W*.8,H*.7,10,W*.8,H*.7,W*.6);c.addColorStop(0,'rgba(0,209,255,.55)');c.addColorStop(1,'rgba(10,11,18,0)');ctx.fillStyle=c;ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#05060a';const bx=W*.5+Math.sin(t*.8)*8,by=H*.62;ctx.beginPath();ctx.ellipse(bx,by+150,120,140,0,0,7);ctx.fill();ctx.beginPath();ctx.arc(bx,by-40,62,0,7);ctx.fill();
    ctx.strokeStyle='rgba(0,209,255,.8)';ctx.lineWidth=6;ctx.beginPath();ctx.arc(bx,by-40,62,-.9,.9);ctx.stroke();ctx.beginPath();ctx.ellipse(bx,by+150,120,140,0,-.9,.6);ctx.stroke();
    for(let i=0;i<30;i++){ctx.fillStyle='rgba(255,255,255,'+(.15+.15*Math.sin(t*3+i))+')';ctx.beginPath();ctx.arc((i*97+t*12)%W,(i*53+t*7)%H,1.5+(i%3),0,7);ctx.fill();}}`,
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--hide-scrollbars'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
await page.setContent(`<canvas id="c" width="${W}" height="${H}" style="display:block"></canvas><style>body{margin:0;background:#000}</style>`);

for (const [name, src] of Object.entries(DRAW)) {
  await page.evaluate((src) => { window.__draw = eval(src); }, src);
  const file = path.join(OUT, `${name}.webm`);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libvpx-vp9', '-b:v', '1200k', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg exited ${c}`)) : res())));
  for (let i = 0; i < FPS * SECONDS; i++) {
    const jpg = await page.evaluate((t) => {
      const c = document.getElementById('c'); const ctx = c.getContext('2d'); ctx.globalAlpha = 1;
      window.__draw(ctx, t, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, i / FPS);
    if (!ff.stdin.write(Buffer.from(jpg, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '2', '-i', file, '-frames:v', '1', path.join(OUT, `${name}-preview.png`)], { stdio: 'inherit' });
  console.log('footage', name);
}
await browser.close();
console.log('footage written to', OUT);
