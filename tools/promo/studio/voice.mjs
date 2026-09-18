/*
 * The narration, and the timing the picture takes from it.
 *
 * These tours have no music. A line is spoken, and the scene that goes with
 * it stays up for exactly as long as the line takes — which means the voice
 * has to be made before the picture can be timed, not after. So this runs
 * first: every scene's `say` line is synthesised on its own, measured, and
 * written out with its start time. comp.js reads that file and gives each
 * scene the duration its line actually needs, and render.mjs muxes the
 * assembled track under the frames.
 *
 * The voice is a neural TTS running on this machine — no key, no request, no
 * per-word cost, and the same script always produces the same audio. It is a
 * synthetic voice and the promo kit says so; what it is not is the robot
 * everybody recognises from a platform's built-in reader.
 *
 *   PIPER=/usr/local/bin/piper VOICE=/path/en-us-ryan-high.onnx \
 *   PROMO_ASSETS=/somewhere FFMPEG=/path/to/ffmpeg \
 *   node tools/promo/studio/voice.mjs [--video id,id]
 *
 * Writes $PROMO_ASSETS/voice/<id>.wav and <id>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEOS } from './videos.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const OUT = path.join(ASSETS, 'voice');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PIPER = process.env.PIPER || 'piper';
const VOICE = process.env.VOICE || '';
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const only = (args[args.indexOf('--video') + 1] || '').split(',').filter(Boolean);

/*
 * How the speech is shaped.
 *
 *   length 1.04   a touch under conversational, because a tour has a lot to
 *                 get through and a rushed read is the usual failing of these
 *   gap 0.32      between sentences inside one line
 *   pause 0.45    between scenes, which is where the picture cuts
 */
const LENGTH = 1.04, SENTENCE_GAP = 0.32, SCENE_PAUSE = 0.45, LEAD_IN = 0.35, TAIL = 0.9;

/** Seconds of a WAV, read out of its header rather than by decoding it. */
function wavSeconds(file) {
  const b = fs.readFileSync(file);
  const rate = b.readUInt32LE(24), bytesPerSec = b.readUInt32LE(28);
  let off = 12, dataLen = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), len = b.readUInt32LE(off + 4);
    if (id === 'data') { dataLen = len; break; }
    off += 8 + len + (len % 2);
  }
  return bytesPerSec ? dataLen / bytesPerSec : dataLen / (rate * 2);
}

function speak(text, file) {
  const r = spawnSync(PIPER, ['-m', VOICE, '-f', file, '--length-scale', String(LENGTH),
    '--sentence-silence', String(SENTENCE_GAP)], { input: text, encoding: 'utf8', timeout: 300000 });
  if (r.status !== 0 || !fs.existsSync(file)) throw new Error(`piper failed on "${text.slice(0, 40)}…": ${r.stderr || r.error}`);
  return wavSeconds(file);
}

if (!VOICE || !fs.existsSync(VOICE)) throw new Error('Set VOICE to a piper .onnx voice model');

for (const spec of VIDEOS) {
  if (!spec.voice) continue;
  if (only.length && !only.includes(spec.id)) continue;
  const said = spec.scenes.map((s, i) => ({ i, say: s.say || '' }));
  const tmp = path.join(OUT, `.${spec.id}`);
  fs.mkdirSync(tmp, { recursive: true });

  const lines = [];
  let at = LEAD_IN;
  for (const { i, say } of said) {
    if (!say) {
      /* A scene with nothing to say still needs a length: the end card holds
         while the address is read, so it is given one in videos.js. */
      lines.push({ i, say: '', start: at, spoken: 0, dur: spec.scenes[i].dur || 2 });
      at += spec.scenes[i].dur || 2;
      continue;
    }
    const file = path.join(tmp, `${String(i).padStart(2, '0')}.wav`);
    const spoken = speak(say, file);
    /* A scene may also ask for a floor. The end card is the case: the address
       has to stay on screen long enough to be read and typed, which is longer
       than it takes to say. */
    const dur = Math.max(spoken + SCENE_PAUSE, spec.scenes[i].dur || 0);
    lines.push({ i, say, start: at, spoken: Number(spoken.toFixed(3)), dur: Number(dur.toFixed(3)), file: path.basename(file) });
    at += dur;
    process.stdout.write(`  ${spec.id} ${String(i).padStart(2, '0')} ${spoken.toFixed(2)}s  ${say.slice(0, 56)}\n`);
  }
  const total = at + TAIL;

  /*
   * Assembled by placing each line at its own start rather than by joining
   * them end to end: the gaps then match the scene timing exactly, and a
   * re-record of one line cannot drift the rest of the video.
   */
  const inputs = [];
  const filters = [];
  let n = 0;
  for (const l of lines) {
    if (!l.file) continue;
    inputs.push('-i', path.join(tmp, l.file));
    filters.push(`[${n}:a]adelay=${Math.round(l.start * 1000)}|${Math.round(l.start * 1000)}[d${n}]`);
    n++;
  }
  const wav = path.join(OUT, `${spec.id}.wav`);
  if (!n) throw new Error(`${spec.id} has no lines to say`);
  const mix = `${filters.join(';')};${Array.from({ length: n }, (_, k) => `[d${k}]`).join('')}amix=inputs=${n}:normalize=0:duration=longest[m];`
    + `[m]highpass=f=85,acompressor=threshold=-18dB:ratio=3:attack=8:release=120,`
    + `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,apad[a]`;
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', mix,
    '-map', '[a]', '-t', total.toFixed(3), '-ar', '48000', '-ac', '2', wav], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed assembling ${spec.id}`);

  fs.writeFileSync(path.join(OUT, `${spec.id}.json`), JSON.stringify({
    id: spec.id, total: Number(total.toFixed(3)), leadIn: LEAD_IN,
    lines: lines.map(({ i, say, start, spoken, dur }) => ({ i, say, start: Number(start.toFixed(3)), spoken, dur })),
  }, null, 1));
  console.log(`${spec.id}: ${lines.length} lines, ${total.toFixed(1)}s`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('voice written to', OUT);
