#!/usr/bin/env node
/*
 * A one-minute loop and a bed, joined for an hour or eight.
 *
 *   FFMPEG=/path/to/ffmpeg node tools/promo/studio/longform.mjs \
 *     --loop out/yt/amb-02-rain-silent-4k.mp4 --bed ambient/rain.mp3 --hours 8 --out rain-8h.mp4
 *
 * No re-encode of the picture: the loop is repeated with stream copy and the
 * bed is looped under it, so an eight-hour 4K file takes about as long as
 * writing it to disk. The loop's own last frame equals its first, so the
 * repeats are invisible; the bed has a fade at both ends, so its repeats are
 * silent joins rather than clicks.
 */
import { spawnSync } from 'node:child_process';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const a = process.argv.slice(2);
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
const loop = opt('loop'), bed = opt('bed'), hours = Number(opt('hours', 1)), out = opt('out', `long-${hours}h.mp4`);
if (!loop || !bed) { console.error('usage: longform.mjs --loop <mp4> --bed <mp3> --hours N --out <mp4>'); process.exit(1); }
const seconds = Math.round(hours * 3600);
/* -stream_loop -1 repeats the input forever; -t cuts the output to length. */
const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error',
  '-stream_loop', '-1', '-i', loop,
  '-stream_loop', '-1', '-i', bed,
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
  '-t', String(seconds), '-movflags', '+faststart', out], { stdio: 'inherit' });
process.exit(r.status || 0);
