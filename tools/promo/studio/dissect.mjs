#!/usr/bin/env node
/*
 * Take an edit apart so it can be rebuilt.
 *
 * Point this at any MP4 — a screen recording of somebody else's TikTok, a
 * reference somebody sent, one of our own — and it reports the thing you
 * actually need in order to copy the edit: where every cut lands, how long each
 * shot is, what the pace is, and a contact sheet of the frame just after each
 * cut so the content of every shot can be read at a glance.
 *
 *   FFMPEG=/path/to/ffmpeg node tools/promo/studio/dissect.mjs <file.mp4> [--out dir] [--threshold 0.25]
 *
 * Writes <out>/cuts.json, <out>/shot-NN.jpg and <out>/contact.jpg.
 *
 * Why measured rather than eyeballed: a copy that is a few frames out on every
 * cut reads as a worse version of the original, and the difference between
 * "cut every 0.42s" and "cut on the beat of a 142 BPM track" is the difference
 * between a rebuild that lands and one that feels slightly wrong for reasons
 * nobody can name. The app's own beat detector does the second half of that job;
 * this does the first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const OUT = path.resolve(opt('out', path.join(path.dirname(file || '.'), 'dissected')));
/* 0.25 catches a hard cut without firing on a fast pan. A busy edit wants it
   higher, a slow one lower; the number is printed so it can be tuned. */
const THRESHOLD = Number(opt('threshold', 0.25));

if (!file || !fs.existsSync(file)) {
  console.error('usage: dissect.mjs <file.mp4> [--out dir] [--threshold 0.25]');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const run = (a) => spawnSync(FFMPEG, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/* ---- what the file is ---- */
const probe = run(['-i', file]).stderr || '';
const dur = (() => {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
})();
const size = (/, (\d+)x(\d+)/.exec(probe) || []).slice(1, 3).map(Number);
const fps = Number((/([\d.]+) fps/.exec(probe) || [])[1]) || 30;
const hasAudio = / Audio: /.test(probe);

/* ---- where the cuts are ----
   showinfo prints a line per frame the scene filter keeps; the pts_time on each
   is the moment the picture changed. */
const scenes = run(['-i', file, '-filter:v', `select='gt(scene,${THRESHOLD})',showinfo`, '-f', 'null', '-']).stderr || '';
const cuts = [...scenes.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
/* A cut in the first tenth of a second is the first frame, not a cut. */
const marks = [0, ...cuts.filter((t) => t > 0.1)];

/*
 * A one-frame "shot" is a transition, not a shot.
 *
 * A white flash on the cut trips the scene filter twice — once going in, once
 * coming out — so an edit with five shots and a flash between each reports as
 * nine, four of them 33ms long. Rebuilding from that gives you four cuts that
 * do not exist. Anything under two frames is folded into what follows it, and
 * counted as a transition instead.
 */
const MIN = 2 / fps;
const raw = marks.map((t, i) => ({ at: t, end: i + 1 < marks.length ? marks[i + 1] : dur }));
const kept = [];
let flashes = 0;
for (const r of raw) {
  if (r.end - r.at < MIN) { flashes++; continue; }
  kept.push(r);
}
/* Each kept shot runs to the next kept one, so the folded frames go back into
   the shot they interrupted rather than vanishing from the running time. */
const shots = kept.map((r, i) => {
  const end = i + 1 < kept.length ? kept[i + 1].at : dur;
  return { n: i + 1, at: Number(r.at.toFixed(3)), dur: Number((end - r.at).toFixed(3)) };
});

/* ---- a frame from the middle of each shot ----
   The middle, not the first frame: the frame on a cut is often mid-transition
   and tells you nothing about what the shot contains. */
for (const s of shots) {
  const at = Math.min(dur - 0.05, s.at + Math.min(0.35, s.dur / 2));
  run(['-y', '-loglevel', 'error', '-ss', String(at), '-i', file, '-frames:v', '1',
    path.join(OUT, `shot-${String(s.n).padStart(2, '0')}.jpg`)]);
}

/* ---- one image of the whole edit ----
   Six across, scaled down: the point is to see the shape of the thing in one
   look, not to read the text. */
/* tile, not xstack: the frames are already a numbered sequence, and tile takes
   a grid without a layout expression per cell. */
const tiles = shots.length;
if (tiles) {
  const cols = Math.min(6, tiles);
  const rows = Math.ceil(tiles / cols);
  const r = run(['-y', '-loglevel', 'error', '-i', path.join(OUT, 'shot-%02d.jpg'),
    '-vf', `scale=240:-1,tile=${cols}x${rows}:padding=6:margin=6:color=0x11161f`,
    '-frames:v', '1', path.join(OUT, 'contact.jpg')]);
  if (r.status !== 0) console.error(`  (contact sheet failed: ${(r.stderr || '').trim().split('\n').pop()})`);
}

/* ---- the pace, said plainly ---- */
const lens = shots.map((s) => s.dur).filter((d) => d > 0);
const median = lens.length ? [...lens].sort((a, b) => a - b)[Math.floor(lens.length / 2)] : 0;
const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
/*
 * Whether the edit is cut to a track, and at what tempo.
 *
 * The single most useful thing to know before rebuilding one, because if it is,
 * matching the beat matters more than matching the times to the frame. A shot
 * length only implies a tempo if some whole number of beats fits it at a tempo
 * music is actually made at — 60 over a 4.5-second shot is 13 BPM, which is not
 * a tempo, it is arithmetic. So: try one, two, four and eight beats a cut and
 * keep the readings that land in the range real tracks live in.
 */
const even = lens.length > 2 && lens.filter((d) => Math.abs(d - median) < median * 0.25).length / lens.length > 0.6;
const tempos = median > 0.05
  ? [1, 2, 4, 8].map((beats) => ({ beats, bpm: Math.round((60 / median) * beats) }))
    .filter((t) => t.bpm >= 60 && t.bpm <= 200)
  : [];

const report = {
  file: path.basename(file),
  seconds: Number(dur.toFixed(2)),
  size: size.length === 2 ? `${size[0]}x${size[1]}` : 'unknown',
  fps, hasAudio, threshold: THRESHOLD,
  shots: shots.length,
  transitions: flashes,
  medianShot: Number(median.toFixed(3)),
  meanShot: Number(mean.toFixed(3)),
  looksCutToMusic: even && tempos.length > 0,
  impliedTempo: tempos.length
    ? tempos.map((t) => `${t.bpm} BPM at ${t.beats === 1 ? 'a cut a beat' : `a cut every ${t.beats} beats`}`)
    : null,
  cuts: shots,
};
fs.writeFileSync(path.join(OUT, 'cuts.json'), JSON.stringify(report, null, 1));

console.log(`${report.file} — ${report.seconds}s, ${report.size}, ${fps}fps, audio: ${hasAudio ? 'yes' : 'no'}`);
console.log(`${shots.length} shots, median ${report.medianShot}s, mean ${report.meanShot}s`
  + (flashes ? `, ${flashes} flash/whip transitions folded in` : ''));
if (report.looksCutToMusic) console.log(`evenly cut — ${report.impliedTempo.join(', or ')}`);
else if (even) console.log('evenly cut, but too slow for the shot length to imply a tempo');
console.log(shots.map((s) => `${s.at}s (${s.dur}s)`).join('  '));
console.log(`\nwritten to ${OUT}`);
