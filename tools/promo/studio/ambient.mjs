#!/usr/bin/env node
/*
 * Ambient beds, synthesised — rain, brown noise, a space drone, a fire, the sea.
 *
 *   PROMO_ASSETS=/somewhere FFMPEG=/path/to/ffmpeg \
 *   node tools/promo/studio/ambient.mjs [--minutes 30] [--only rain,fire]
 *
 * Writes $PROMO_ASSETS/ambient/<name>.mp3 (and a 20-second <name>-preview.mp3).
 *
 * Why synthesised: an ambient channel lives or dies on two things YouTube
 * checks — whether the audio is claimed, and whether the content is "reused".
 * A bed made from noise sources and filters in ffmpeg is nobody's recording,
 * so it cannot be claimed, and it is different every time it is generated, so
 * it cannot be reused. It is also free, instant, and any length.
 *
 * Each bed is a filtergraph: a noise colour, a filter to shape it, a slow LFO
 * so it breathes, and a long fade at both ends so the join between loops in a
 * long file is silent rather than a click.
 *
 * The slow LFOs are `volume` expressions rather than `tremolo`: tremolo will
 * not go below 0.1 Hz, and a gust or a swell is a ten- to thirty-second thing.
 * Fire's flicker is fast, so fire keeps tremolo.
 *
 * Twenty minutes at 128 kb/s is about 18 MB, small enough to send anywhere; the
 * long-form join loops it, so the bed's length only sets how often it repeats.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const OUT = path.join(ASSETS, 'ambient');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const MIN = Number(opt('minutes', 20));
const only = (opt('only', '') || '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

/*
 * The recipes. `anoisesrc` is the source; everything after it is the character.
 *  - rain:   white noise through a bandpass is the hiss of rain; a second,
 *            lower band amplitude-modulated slowly is the gusts.
 *  - brown:  brown noise, low-passed, the classic sleep sound. Nothing else.
 *  - space:  two brown-noise layers, very low-passed, with a long stereo
 *            echo so it sounds like a room the size of a hangar.
 *  - fire:   brown noise driven through a crusher for the crackle, under a
 *            low rumble; the tremolo makes it flicker.
 *  - sea:    pink noise low-passed, with a very slow tremolo that is the
 *            swell, plus a higher band that is the wash of the water.
 */
/*
 * Every bed ends the same way: normalised to -16 LUFS (YouTube turns louder
 * uploads down and leaves quieter ones alone, so this is the loudest a bed
 * should be), then a six-second fade at both ends so repeats join silently.
 * `bandpass` reads `w` as a Q factor unless told it is hertz — a Q of 3000
 * passes nothing at all, so every band below says `width_type=h`.
 */
const tail = (s) => `loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=6,afade=t=out:st=${s - 6}:d=6`;

const BEDS = {
  rain: (s) => `anoisesrc=d=${s}:c=white:r=44100:a=0.5[w];[w]asplit=2[w1][w2];`
    + `[w1]bandpass=f=4200:width_type=h:w=3000,volume=0.55[hiss];`
    + `[w2]bandpass=f=900:width_type=h:w=800,volume='0.4+0.6*(0.5+0.5*sin(2*PI*t*0.07))':eval=frame,volume=0.45[gust];`
    + `[hiss][gust]amix=inputs=2:normalize=0,lowpass=f=9000`,
  brown: (s) => `anoisesrc=d=${s}:c=brown:r=44100:a=0.6,lowpass=f=600,volume='0.85+0.15*(0.5+0.5*sin(2*PI*t*0.05))':eval=frame`,
  space: (s) => `anoisesrc=d=${s}:c=brown:r=44100:a=0.5[b];[b]asplit=2[b1][b2];`
    + `[b1]lowpass=f=120,volume=0.7[deep];[b2]lowpass=f=400,highpass=f=80,volume='0.5+0.5*(0.5+0.5*sin(2*PI*t*0.03))':eval=frame,volume=0.35[air];`
    + `[deep][air]amix=inputs=2:normalize=0,aecho=0.8:0.7:1200|1900:0.35|0.2`,
  fire: (s) => `anoisesrc=d=${s}:c=brown:r=44100:a=0.55[b];[b]asplit=2[b1][b2];`
    + `[b1]lowpass=f=220,volume=0.5[rumble];`
    + `[b2]highpass=f=1200,acrusher=bits=6:mode=log:aa=1:mix=0.5,tremolo=f=9:d=0.55,tremolo=f=0.4:d=0.4,volume=0.28[crackle];`
    + `[rumble][crackle]amix=inputs=2:normalize=0`,
  sea: (s) => `anoisesrc=d=${s}:c=pink:r=44100:a=0.55[p];[p]asplit=2[p1][p2];`
    + `[p1]lowpass=f=500,volume='0.2+0.8*(0.5+0.5*sin(2*PI*t*0.09))':eval=frame,volume=0.6[swell];`
    + `[p2]bandpass=f=2500:width_type=h:w=2500,volume='0.1+0.9*(0.5+0.5*sin(2*PI*t*0.09+1))':eval=frame,volume=0.35[wash];`
    + `[swell][wash]amix=inputs=2:normalize=0`,
};

let made = 0;
for (const [name, graph] of Object.entries(BEDS)) {
  if (only.length && !only.includes(name)) continue;
  for (const [len, suffix] of [[MIN * 60, ''], [20, '-preview']]) {
    const file = path.join(OUT, `${name}${suffix}.mp3`);
    const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-filter_complex', `${graph(len)},${tail(len)}`,
      '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', file], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(`${name}: ${(r.stderr || '').trim().split('\n').pop()}`); process.exitCode = 1; continue; }
    console.log(`  ${name}${suffix}: ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
    made++;
  }
}
console.log(`${made} beds written to ${OUT}`);
