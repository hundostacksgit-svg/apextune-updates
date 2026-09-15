#!/usr/bin/env node
/*
 * The promo generator's data, checked without rendering anything.
 *
 *   PROMO_ASSETS=/path/to/assets FFMPEG=/path/to/ffmpeg \
 *   node tools/promo/studio/verify.mjs
 *
 * videos.js is a 40-entry data file that render.mjs turns into MP4s at about
 * two minutes each. A mistyped shot name does not throw — it renders a cell
 * with a broken image in it, which is only visible by watching the finished
 * video, which is the one thing nobody does forty times. So: every reference
 * every spec makes is resolved here against what is actually on disk, and the
 * house copy rules are enforced on the text while it is still text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

let fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : ' FAIL '} ${n}${d ? ' — ' + d : ''}`); if (!c) fail++; };

const { VIDEOS, DROP_TONES } = await import('./videos.js');

/* Every scene in every video, flattened, so a check can be written once. */
const scenes = VIDEOS.flatMap((v) => (v.scenes || []).map((s, i) => ({ v, s, i })));
/*
 * Anywhere a picture can be named, and which folder it comes out of.
 *
 * A `wipe` scene's `shot` is a piece of footage — comp.js resolves it as
 * `footage/<name>-preview.png` — while everywhere else it is a screenshot out
 * of `shots/`. Checking both against the same folder finds files that are not
 * missing, which is worse than not checking at all.
 */
const shotRefs = [];
for (const { v, s, i } of scenes) {
  const where = s.type === 'wipe' ? 'footage' : 'shots';
  const add = (name, w = where) => { if (name) shotRefs.push({ v: v.id, at: `scene ${i}`, name, where: w }); };
  add(s.shot);
  if (s.pair) { add(`${s.pair}-before`, 'footage'); add(`${s.pair}-after`, 'footage'); }
  for (const f of s.frames || []) add(f.shot, 'shots');
  for (const f of s.cells || []) add(f.shot, 'shots');
}

console.log('\n== ids and formats ==');
{
  const ids = VIDEOS.map((v) => v.id);
  ok('every id is unique', new Set(ids).size === ids.length,
    `${ids.length} videos, ${new Set(ids).size} distinct`);
  ok('every video has a title', VIDEOS.every((v) => v.title));
  const known = new Set(['tiktok', 'reel', 'feed', 'yt', 'thumb']);
  const bad = VIDEOS.filter((v) => (v.formats || []).some((f) => !known.has(f)));
  ok('every format is one render.mjs knows', bad.length === 0, bad.map((v) => v.id).join(', '));
}

console.log('\n== every asset a spec names exists ==');
{
  const listing = (dir) => new Set(fs.existsSync(path.join(ASSETS, dir))
    ? fs.readdirSync(path.join(ASSETS, dir)).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''))
    : []);
  const have = { shots: listing('shots'), footage: listing('footage') };
  /* A wipe with no `pair` shows one picture twice, graded two ways, so it needs
     `<name>-preview.png` rather than `<name>.png`. */
  const missing = shotRefs.filter((r) => !(r.where === 'footage'
    ? (have.footage.has(r.name) || have.footage.has(`${r.name}-preview`))
    : have.shots.has(r.name)));
  ok(`${shotRefs.length} shot references all resolve`, missing.length === 0,
    missing.map((r) => `${r.v} ${r.at}: ${r.name}`).slice(0, 6).join(' | '));

  const musicDir = path.join(ASSETS, 'music');
  const haveMusic = new Set(fs.existsSync(musicDir)
    ? fs.readdirSync(musicDir).filter((f) => f.endsWith('.wav')).map((f) => f.replace(/\.wav$/, '')) : []);
  /* A video with `voice` takes its audio from voice.mjs, not the library. */
  const needMusic = VIDEOS.filter((v) => v.music && !v.voice);
  const noMusic = needMusic.filter((v) => !haveMusic.has(v.music));
  ok(`${needMusic.length} music beds all exist`, noMusic.length === 0,
    noMusic.map((v) => `${v.id}: ${v.music}`).join(', '));

  ok('the mark the end cards use exists', fs.existsSync(path.join(ROOT, 'studio/assets/mark.svg')));

  /*
   * The competitors' marks a `rivals` scene shows.
   *
   * These are not in the repo — they are other companies' trademarks, supplied
   * by whoever is building and cut out by logos.mjs into PROMO_ASSETS. Missing,
   * the scene renders three empty boxes and the whole first twelve seconds is
   * blank, which is exactly the kind of thing nobody notices until it is
   * posted. So it is checked, and the message says how to make them.
   */
  const logoRefs = scenes.filter((x) => x.s.type === 'rivals')
    .flatMap(({ v, s: sc }) => (sc.logos || []).map((n) => ({ v: v.id, name: n })));
  const haveLogos = listing('logos');
  const noLogos = logoRefs.filter((r) => !haveLogos.has(r.name));
  ok(`${logoRefs.length} competitor marks are cut out`, noLogos.length === 0,
    noLogos.length ? `${noLogos.map((r) => r.name).join(', ')} — run logos.mjs` : '');
}

console.log('\n== measured cut lists are coherent ==');
for (const { v, s, i } of scenes.filter((x) => x.s.type === 'drop')) {
  const cuts = s.cuts || [];
  const sorted = cuts.every((c, n) => n === 0 || c.at >= cuts[n - 1].at);
  ok(`${v.id} scene ${i}: cuts are in order`, sorted);
  /* The times come out of dissect.mjs rounded to the millisecond, so a cut can
     miss the next one by 0.001 purely from rounding. A third of a frame is the
     smallest gap that could be real. */
  const gaps = cuts.filter((c, n) => n + 1 < cuts.length && Math.abs(c.at + c.dur - cuts[n + 1].at) > 1 / 90);
  ok(`${v.id} scene ${i}: no gap or overlap between cuts`, gaps.length === 0,
    gaps.map((c) => `${c.at}s`).slice(0, 4).join(', '));
  const last = cuts[cuts.length - 1];
  ok(`${v.id} scene ${i}: the scene is long enough for its last cut`,
    !last || s.dur >= last.at + last.dur - 0.001,
    last ? `scene ${s.dur}s, cuts end ${(last.at + last.dur).toFixed(3)}s` : '');
  ok(`${v.id} scene ${i}: at least one frame per cut to draw`,
    (s.frames || []).length > 0 && cuts.length > 0);
}

console.log('\n== held scenes are coherent ==');
for (const { v, s: sc, i } of scenes.filter((x) => x.s.type === 'rivals')) {
  const cuts = sc.cuts || [];
  ok(`${v.id} scene ${i}: shots are in order`,
    cuts.every((c, n) => n === 0 || c.at >= cuts[n - 1].at));
  const gaps = cuts.filter((c, n) => n + 1 < cuts.length && Math.abs(c.at + c.dur - cuts[n + 1].at) > 1 / 90);
  ok(`${v.id} scene ${i}: no gap or overlap between shots`, gaps.length === 0,
    gaps.map((c) => `${c.at}s`).slice(0, 4).join(', '));
  const last = cuts[cuts.length - 1];
  ok(`${v.id} scene ${i}: the scene is long enough for its last shot`,
    !last || sc.dur >= last.at + last.dur - 0.001,
    last ? `scene ${sc.dur}s, shots end ${(last.at + last.dur).toFixed(3)}s` : '');
  /* The call-out has to land inside the scene, and inside the last shot rather
     than on a cut — landing it on a cut is what makes it read as another cut
     instead of as the moment. */
  const at = sc.mog?.at;
  ok(`${v.id} scene ${i}: the call-out lands inside the last held shot`,
    at == null || (last && at > last.at && at < sc.dur),
    at == null ? 'none' : `at ${at}s, last shot ${last?.at}..${sc.dur}s`);
  /* Every mark centred by a shot has to exist, or the camera pushes in on
     nothing. */
  const n = (sc.logos || []).length;
  const bad = cuts.filter((c) => c.on != null && (c.on < 0 || c.on >= n));
  ok(`${v.id} scene ${i}: every shot frames a mark that exists`, bad.length === 0,
    bad.map((c) => `${c.at}s -> ${c.on}`).join(', '));
}

console.log('\n== consecutive cuts are visibly different ==');
/*
 * The failure this catches, measured rather than watched.
 *
 * Every screenshot in this app is dark chrome, so two consecutive panels can
 * differ by less than a scene detector's threshold and the cut between them
 * simply does not read — the first build of the mog lost six of thirty-one that
 * way. Each frame's crop is scaled to a single grey pixel, which IS its mean
 * luma, and neighbouring cuts have to differ by enough to see.
 */
{
  const { spawnSync } = await import('node:child_process');
  const lumaOf = (shot, cx = 0.5, cy = 0.5, w = 0.55) => {
    const src = path.join(ASSETS, 'shots', `${shot}.png`);
    if (!fs.existsSync(src)) return null;
    const r = spawnSync(FFMPEG, ['-v', 'error', '-i', src, '-vf',
      `crop=iw*${w}:ih*${w}:iw*${cx}-iw*${w}/2:ih*${cy}-ih*${w}/2,scale=1:1`,
      '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
    return r.stdout && r.stdout.length ? r.stdout[0] : null;
  };
  /* The same grade comp.js applies, from the same table, so what is measured
     here is what ends up on screen. */
  const TONES = DROP_TONES;
  const MIN_DELTA = 8;
  for (const { v, s, i } of scenes.filter((x) => x.s.type === 'drop')) {
    const frames = s.frames || [];
    const seen = (s.cuts || []).map((c, n) => {
      const f = frames[n % frames.length] || {};
      if (f.mark) return { lit: 255, what: 'the mark' };
      const base = lumaOf(f.shot, f.cx, f.cy, f.w);
      if (base == null) return { lit: null, what: f.shot };
      const t = TONES[f.tone] || (n % 2 ? TONES.warm : TONES.cool);
      return { lit: Math.min(255, base * t.b), what: `${f.shot} ${t.b > 1 ? 'warm' : 'cool'}` };
    });
    const dim = [];
    for (let n = 1; n < seen.length; n++) {
      const a = seen[n - 1], b = seen[n];
      if (a.lit == null || b.lit == null) continue;
      if (Math.abs(a.lit - b.lit) < MIN_DELTA) dim.push(`${n}: ${a.what}→${b.what} Δ${Math.abs(a.lit - b.lit).toFixed(0)}`);
    }
    ok(`${v.id} scene ${i}: every cut clears Δ${MIN_DELTA} luma`, dim.length === 0,
      dim.slice(0, 5).join(' | '));
  }
}

console.log('\n== house copy rules ==');
{
  /* Everything a spec puts on screen, as one searchable string per video. */
  const textOf = (v) => JSON.stringify([v.title, v.caption, v.tags, v.scenes]);

  /* "AI-powered" as a bare adjective is the single most scam-shaped phrase a
     small app can print, and PROMOTION.md §3 bans it outright. */
  const powered = VIDEOS.filter((v) => /\bAI[- ]powered\b/i.test(textOf(v)));
  ok('nothing says "AI-powered"', powered.length === 0, powered.map((v) => v.id).join(', '));

  /* A claim about a competitor is a claim that can be wrong, and being wrong
     about a company with lawyers is not a risk worth the engagement. Naming one
     is fine; "better than" one is not. */
  const RIVALS = 'CapCut|Premiere|DaVinci|Resolve|Final Cut|Adobe|After Effects|Filmora|Canva';
  const versus = new RegExp(`\\b(better|faster|cheaper|stronger|smarter)\\s+than\\s+(${RIVALS})`, 'i');
  const beats = new RegExp(`\\b(beats|destroys|kills|replaces|mogs)\\s+(${RIVALS})`, 'i');
  const claims = VIDEOS.filter((v) => versus.test(textOf(v)) || beats.test(textOf(v)));
  ok('no video makes a claim about a named competitor', claims.length === 0,
    claims.map((v) => v.id).join(', '));

  /*
   * Every price on screen has to be a price the pricing page carries.
   *
   * Read off the page rather than listed here, so the two cannot drift: if a
   * tier's price moves, the videos that still show the old one fail this on the
   * next sweep instead of going out wrong. The extras are the subscription
   * arithmetic in the mog, which is about rented editors generally and is
   * derived from a figure the page already states.
   */
  const page = fs.readFileSync(path.join(ROOT, 'studio/pricing/index.html'), 'utf8');
  const PRICED = new Set([...page.matchAll(/\$([\d,]+\.\d\d)/g)].map((m) => m[1].replace(/,/g, '')));
  PRICED.add('0.00');
  PRICED.add('1379.40');
  const bad = [];
  for (const v of VIDEOS) {
    for (const m of textOf(v).matchAll(/\$([\d,]+\.\d\d)/g)) {
      const n = m[1].replace(/,/g, '');
      if (!PRICED.has(n)) bad.push(`${v.id}: $${m[1]}`);
    }
  }
  ok('every price shown is one the pricing page carries', bad.length === 0, bad.slice(0, 5).join(', '));

  /* Transcription is not built. PROMOTION.md forbids claiming it until the
     model ships — see FEATURE-GAPS.md §1. */
  const transcribe = VIDEOS.filter((v) => /\b(transcri|speech.to.text|auto.caption)/i.test(textOf(v)));
  ok('nothing claims transcription', transcribe.length === 0, transcribe.map((v) => v.id).join(', '));

  /* TikTok allows five. A sixth is not rejected, it is just the tell that the
     account is running a bot. */
  const over = VIDEOS.filter((v) => (v.formats || []).includes('tiktok')
    && typeof v.tags === 'string' && (v.tags.match(/#/g) || []).length > 5);
  ok('no TikTok video carries more than five hashtags', over.length === 0,
    over.map((v) => v.id).join(', '));
}

console.log(fail ? `\n${fail} failed` : '\nall good');
process.exit(fail ? 1 : 0);
