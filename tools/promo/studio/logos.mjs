#!/usr/bin/env node
/*
 * Turn supplied logo files into cut-outs the comp can put on black.
 *
 *   PROMO_ASSETS=/somewhere FFMPEG=/path/to/ffmpeg \
 *   node tools/promo/studio/logos.mjs --davinci a.jpg --ae b.png --capcut c.png
 *
 * Writes $PROMO_ASSETS/logos/<name>.png with a real alpha channel.
 *
 * Why this is a step rather than files in the repo: these are other companies'
 * trademarks. The generator can use them — naming and showing a competitor is
 * ordinary comparison — but they are not ours to redistribute, so they live in
 * PROMO_ASSETS with the rest of the generated input, which is not in git. Anyone
 * rebuilding this supplies their own copies and runs this.
 *
 * Two kinds of source, because the three logos are not the same problem:
 *
 *  - A coloured mark on white (After Effects' navy square). Key the white out
 *    and keep the colours. `colorkey` rather than a hard threshold so the
 *    anti-aliased edge survives instead of turning into a staircase.
 *
 *  - A round mark on white (DaVinci's circle). Keyed by colour it comes out
 *    with holes: the three lobes have white specular highlights near their tips
 *    and the key takes those too. Masked to a circle instead, which cannot
 *    punch a hole in the interior because it never looks at the interior.
 *
 *  - A black mark on white (CapCut's). Keying the white leaves a black shape
 *    that is invisible on a black background, which is the whole point of the
 *    scene. So: throw the colour away and use the source's own luminance as the
 *    alpha, painting the mark white. That is exact rather than approximate —
 *    every grey pixel of the anti-aliased edge becomes exactly that much white.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const OUT = path.join(ASSETS, 'logos');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

/* name → [source flag, how to cut it out]. `invert` is the black-on-white case. */
const WANT = [
  { name: 'davinci', flag: 'davinci', how: 'circle', radius: 0.458 },
  { name: 'aftereffects', flag: 'ae', how: 'key', similarity: 0.09 },
  { name: 'capcut', flag: 'capcut', how: 'invert' },
];

/* 512 so the comp can push in on one without it going soft. */
const SIZE = Number(process.env.LOGO_SIZE || 512);

fs.mkdirSync(OUT, { recursive: true });
let made = 0;
for (const w of WANT) {
  const src = opt(w.flag);
  if (!src) { console.log(`  skip ${w.name} (no --${w.flag})`); continue; }
  if (!fs.existsSync(src)) { console.error(`  ${w.name}: ${src} not found`); process.exitCode = 1; continue; }
  const dst = path.join(OUT, `${w.name}.png`);
  /* format first: the PNGs are pal8, and scaling a palette before expanding it
     interpolates palette indexes, which is not a colour operation. */
  const base = `format=rgba,scale=${SIZE}:${SIZE}:flags=lanczos`;
  /* One pixel of feather on the circle, so the edge is anti-aliased rather than
     a staircase — the same thing `blend` buys on a colour key. */
  const circle = `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)'`
    + `:a='clip((${SIZE} * ${w.radius} - hypot(X - ${SIZE / 2}, Y - ${SIZE / 2})) * 255, 0, 255)'`;
  const vf = w.how === 'invert'
    /* The source is black on white, so every channel is the same and r(X,Y) is
       its luminance. Alpha becomes "how dark was this pixel" and the mark comes
       out white at exactly the source's own edge softness — exact rather than a
       threshold, so nothing staircases. */
    ? `${base},geq=r=255:g=255:b=255:a='255-r(X,Y)'`
    : w.how === 'circle' ? `${base},${circle}`
    /* blend a little under similarity, so the edge fades rather than cliffs. */
    : `${base},colorkey=0xFFFFFF:${w.similarity}:0.04`;
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', src, '-vf', vf, '-frames:v', '1', dst],
    { encoding: 'utf8' });
  if (r.status !== 0) { console.error(`  ${w.name} failed: ${(r.stderr || '').trim()}`); process.exitCode = 1; continue; }
  console.log(`  ${w.name} -> ${dst}`);
  made++;
}
console.log(`${made} logo${made === 1 ? '' : 's'} written to ${OUT}`);
