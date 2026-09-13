/*
 * The music under the promo videos, made by the app's own beatmaker.
 *
 * Nothing licensed, nothing downloaded: the same synthesised kick, snare,
 * hats and bass the editor offers a person with clips and no track. Each
 * style is rendered in Playwright's Chromium (the beatmaker needs
 * OfflineAudioContext) and written out as a WAV plus a JSON of its beat
 * grid, which comp.js reads so scene changes land on the beat.
 *
 *   PROMO_ASSETS=/somewhere node tools/promo/studio/music.mjs
 *
 * Writes $PROMO_ASSETS/music/<style>-<bpm>-<seconds>s.wav and .json.
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
const OUT = path.join(ASSETS, 'music');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PORT || 8263);
fs.mkdirSync(OUT, { recursive: true });

/* [style, bpm, seconds]: the short ones for TikTok, the long ones for YouTube. */
const JOBS = [
  ['hype', 150, 24], ['trap', 140, 24], ['phonk', 132, 24], ['house', 126, 24],
  ['cinematic', 90, 24], ['dnb', 174, 24], ['lofi', 84, 24], ['drill', 142, 24],
  ['hype', 150, 100], ['cinematic', 90, 100], ['house', 126, 100],
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
await page.goto(`http://127.0.0.1:${PORT}/studio/app/index.html`, { waitUntil: 'domcontentloaded' });

for (const [style, bpm, seconds] of JOBS) {
  const r = await page.evaluate(async ({ style, bpm, seconds }) => {
    const m = await import('/studio/app/js/engine/beatmaker.js');
    const made = await m.renderBeat({ style, bpm, seconds });
    const bytes = new Uint8Array(await m.bufferToWav(made.buffer, 'beat.wav').arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { b64: btoa(s), beats: made.beats, bpm: made.bpm, seconds: made.seconds };
  }, { style, bpm, seconds });
  const name = `${style}-${bpm}-${seconds}s`;
  fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.from(r.b64, 'base64'));
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ bpm: r.bpm, seconds: r.seconds, beats: r.beats }));
  console.log(`${name}  ${r.seconds.toFixed(1)}s  ${r.beats.length} beats`);
}
await browser.close();
server.close();
console.log('music written to', OUT);
