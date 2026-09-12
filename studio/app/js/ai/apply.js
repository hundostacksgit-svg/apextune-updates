/*
 * Performing a plan.
 *
 * Every operation here is something you could have done by hand with the mouse.
 * That is the whole design: the AI does not have a private back door into the
 * project, it drives the same functions the timeline does. Which is why one
 * Ctrl+Z after an AI run puts everything back, and why you can keep half of
 * what it did and change the rest.
 */

import {
  addClip, addTrack, clipsOn, clipById, mediaById, duration,
  removeClips, closeGaps, setKeyframe, sourceSpan, RATIOS, defaultTransform,
} from '../engine/project.js';
import { decode, detectSilence, detectBeats, energyCurve } from '../engine/media.js';
import { defaultText, TITLE_PRESETS } from '../engine/titles.js';
import { LOOK_BY_ID } from '../engine/filters.js';
import { defaultSticker } from '../engine/stickers.js';
import { makeEffect, EFFECTS } from '../engine/effects.js';
import { applyRamp } from '../engine/speed-ramps.js';
import { renderBeat, bufferToWav } from '../engine/beatmaker.js';
import { applyTextStyle } from '../engine/text-styles.js';
import { PRESETS as EXPRESSION_PRESETS, check as checkExpression } from '../engine/expressions.js';
import { setExpression } from '../engine/project.js';
import { defaultShape, SHAPE_PRESET_BY_ID } from '../engine/shapes.js';
import { TEXT_ANIMATOR_BY_ID } from '../engine/titles.js';

/**
 * Run a plan against a project. Mutates `project` and returns a report.
 * Each op is wrapped so one failure can't abandon the rest of the edit —
 * a plan that got eight steps in and stopped is more useful than one that
 * rolled everything back.
 */
export async function applyPlan(project, plan, ctx = {}) {
  const done = [];
  const failed = [];

  for (const step of plan.steps) {
    const fn = OPS[step.op];
    if (!fn) { failed.push({ step, why: `Unknown operation "${step.op}"` }); continue; }
    try {
      // eslint-disable-next-line no-await-in-loop -- steps build on each other
      const note = await fn(project, step.args || {}, ctx);
      done.push({ step, note });
    } catch (err) {
      failed.push({ step, why: err.message });
    }
  }
  project.updatedAt = Date.now();
  return { done, failed, warnings: plan.warnings || [] };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function videoTracks(p) { return p.tracks.filter((t) => t.kind === 'video'); }
function audioTracks(p) { return p.tracks.filter((t) => t.kind === 'audio'); }
function mainVideoTrack(p) { return videoTracks(p).at(-1) || addTrack(p, 'video'); }
function mainAudioTrack(p) { return audioTracks(p)[0] || addTrack(p, 'audio'); }

/** The story clips that fall inside a remembered montage section. */
function sectionClips(p, index) {
  const bounds = p.montageSections?.[index];
  const clips = storyClips(p);
  if (!bounds) return clips;
  return clips.filter((c) => c.start >= bounds.from - 0.01 && c.start < bounds.to - 0.01);
}

function visualMedia(p) {
  return p.media.filter((m) => (m.kind === 'video' || m.kind === 'image') && !m.missing);
}

/**
 * The footage, in play order.
 *
 * Titles and stickers live on video tracks but they are not shots: laying them
 * out, grading them or re-timing them onto the beat is always wrong. Every
 * operation that means "the actual clips" goes through here.
 */
function storyClips(p) {
  return videoTracks(p)
    .flatMap((t) => clipsOn(p, t.id))
    .filter((c) => c.kind !== 'title' && c.kind !== 'sticker')
    .sort((a, b) => a.start - b.start);
}

/**
 * The most interesting `length` seconds of a piece of media.
 * Loudness is a crude proxy for "something is happening", but it is a good one:
 * it finds the wave breaking, the door slamming, the person starting to talk.
 * With no audio to go on we take from just after the start, because the first
 * second of a handheld clip is almost always the camera settling.
 */
async function bestSegment(media, length) {
  const usable = Math.max(0, (media.duration || 0) - length);
  if (usable <= 0.05) return 0;
  if (media.kind === 'image') return 0;
  const buffer = await decode(media).catch(() => null);
  if (!buffer) return Math.min(usable, media.duration * 0.15);

  const step = 0.25;
  const curve = energyCurve(buffer, step);
  const win = Math.max(1, Math.round(length / step));
  let best = 0, bestSum = -1;
  for (let i = 0; i + win <= curve.length; i++) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += curve[j];
    if (sum > bestSum) { bestSum = sum; best = i * step; }
  }
  return Math.min(best, usable);
}

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Clear the video tracks so a layout op starts from a blank timeline. */
function clearStory(p) {
  const ids = storyClips(p).map((c) => c.id);
  removeClips(p, ids);
}

/* ------------------------------------------------------------------ */
/* the operations                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Saying which clips
 * ------------------------------------------------------------------ */

/*
 * Why this exists.
 *
 * Every operation used to mean "do this to everything", and that — not the
 * language parsing — was the real reason the assistant could not follow a
 * specific instruction. "Make the third clip black and white" is not a hard
 * sentence to understand; it was a sentence with no way to say it. There was
 * no vocabulary for *which* clip, so no amount of intelligence upstream could
 * produce a plan that did it.
 *
 * So every op now takes an optional `target`, and the shapes it accepts are
 * the ways people actually refer to parts of an edit:
 *
 *   "all"            everything (the default, so nothing that worked breaks)
 *   "selected"       whatever is highlighted on the timeline right now
 *   "first" / "last" the obvious ones
 *   3                the third clip, counting from one like a person does
 *   [1, 3, 5]        those clips
 *   "2-4"            a range, inclusive
 *   "odd" / "even"   alternating, for accents
 *   { from, to }     everything overlapping those seconds on the timeline
 *
 * One-based, deliberately. Somebody saying "the third clip" means the third
 * one, and an assistant that silently applies things to the fourth because the
 * code counts from zero is worse than one that cannot do it at all.
 */
export function resolveTarget(p, target, { selection = [] } = {}) {
  /*
   * Layers that are not footage — titles, shapes, nulls, stickers — are
   * asked for by kind, because "make the title wiggle" names one of them
   * and none of the shots. "title" is the most recent one, which is nearly
   * always the one just made; "titles" is all of them.
   */
  if (target === 'title' || target === 'titles') {
    const titles = p.clips.filter((c) => c.kind === 'title').sort((a, b) => a.start - b.start);
    if (!titles.length) throw new Error('There is no title on the timeline yet — add one first.');
    return target === 'title' ? titles.slice(-1) : titles;
  }
  if (target === 'shapes' || target === 'shape') {
    const shapes = p.clips.filter((c) => c.kind === 'shape').sort((a, b) => a.start - b.start);
    if (!shapes.length) throw new Error('There is no shape layer yet — add one first.');
    return target === 'shape' ? shapes.slice(-1) : shapes;
  }
  if (target === 'null' || target === 'nulls') {
    const nulls = p.clips.filter((c) => c.kind === 'null');
    if (!nulls.length) throw new Error('There is no null object yet — add one first.');
    return target === 'null' ? nulls.slice(-1) : nulls;
  }
  if (target === 'stickers' || target === 'sticker') {
    const st = p.clips.filter((c) => c.kind === 'sticker').sort((a, b) => a.start - b.start);
    if (!st.length) throw new Error('There is no sticker yet — add one first.');
    return target === 'sticker' ? st.slice(-1) : st;
  }
  const clips = storyClips(p);
  if (!clips.length) return [];
  if (target === undefined || target === null || target === 'all') return clips;

  if (target === 'selected') {
    const picked = clips.filter((c) => selection.includes(c.id));
    // Falling back to everything would be the wrong kind of helpful: somebody
    // who said "this clip" and had nothing selected wants to be told, not to
    // have the whole timeline changed under them.
    if (!picked.length) throw new Error('Nothing is selected — click a clip on the timeline first.');
    return picked;
  }
  if (target === 'first') return clips.slice(0, 1);
  if (target === 'last') return clips.slice(-1);
  if (target === 'odd') return clips.filter((_, i) => i % 2 === 0);
  if (target === 'even') return clips.filter((_, i) => i % 2 === 1);

  if (typeof target === 'number') {
    const one = clips[Math.round(target) - 1];
    if (!one) throw new Error(`There is no clip ${target} — there ${clips.length === 1 ? 'is' : 'are'} ${clips.length}.`);
    return [one];
  }

  if (Array.isArray(target)) {
    const out = target.map((n) => clips[Math.round(n) - 1]).filter(Boolean);
    if (!out.length) throw new Error('None of those clip numbers exist.');
    return out;
  }

  if (typeof target === 'string') {
    const range = target.match(/^\s*(\d+)\s*[-–to]+\s*(\d+)\s*$/i);
    if (range) {
      const lo = Math.min(Number(range[1]), Number(range[2]));
      const hi = Math.max(Number(range[1]), Number(range[2]));
      const out = clips.slice(lo - 1, hi);
      if (!out.length) throw new Error(`There are no clips ${lo} to ${hi}.`);
      return out;
    }
    const single = target.match(/^\s*(\d+)\s*$/);
    if (single) return resolveTarget(p, Number(single[1]), { selection });
  }

  if (typeof target === 'object') {
    const from = Number(target.from ?? 0);
    const to = Number(target.to ?? Infinity);
    // Overlap, not containment: "the bit from 3 to 8 seconds" means the shots
    // you can see during that stretch, including one that starts at 2 and runs
    // to 6. Requiring a clip to sit entirely inside the range would skip
    // exactly the shot somebody was pointing at.
    const out = clips.filter((c) => c.start < to && c.start + c.dur > from);
    if (!out.length) throw new Error(`Nothing is on the timeline between ${from}s and ${to}s.`);
    return out;
  }

  return clips;
}

const OPS = {

  setRatio(p, { ratio }) {
    const r = RATIOS[ratio];
    if (!r) throw new Error(`${ratio} is not a ratio this app knows.`);
    p.settings.ratio = ratio;
    p.settings.width = r.w;
    p.settings.height = r.h;
    return `Canvas is now ${r.w}×${r.h}.`;
  },

  /** Lay every usable clip down back to back, trimmed to a consistent length. */
  async layout(p, { targetDur, clipLength = 2.2, shuffle = false, pickBest = true }) {
    const pool = visualMedia(p);
    if (!pool.length) throw new Error('There is no footage in the media pool.');

    clearStory(p);
    const track = mainVideoTrack(p);
    const order = shuffle ? shuffled(pool) : pool;

    // How many shots we need, and how long each holds. When a target length is
    // given, the shot length bends to hit it rather than the count changing —
    // "a 30 second edit" means 30 seconds, not "roughly 30".
    let count = order.length;
    let each = clipLength;
    if (targetDur) {
      count = Math.max(1, Math.round(targetDur / clipLength));
      each = targetDur / count;
    }

    let t = 0;
    for (let i = 0; i < count; i++) {
      const media = order[i % order.length];
      const len = Math.min(each, media.kind === 'image' ? each : media.duration);
      if (len < 0.15) continue;
      // eslint-disable-next-line no-await-in-loop -- analysis is per clip
      const inPoint = pickBest ? await bestSegment(media, len) : 0;
      addClip(p, { mediaId: media.id, trackId: track.id, start: t, dur: len, in: inPoint });
      t += len;
    }
    return `${count} shots, ${t.toFixed(1)}s total.`;
  },

  /** Same idea, but every cut lands on a beat of the music. */
  async beatCut(p, { targetDur, every = 4, shuffle = false }, ctx) {
    const music = p.media.find((m) => m.kind === 'audio');
    if (!music) throw new Error('No music track to cut against.');
    const buffer = ctx.beatBuffer || await decode(music);
    if (!buffer) throw new Error('That music file could not be decoded for beat detection.');

    const detected = ctx.beats || detectBeats(buffer);
    if (!detected?.beats?.length) throw new Error('No steady beat was found in that track.');

    const pool = visualMedia(p);
    if (!pool.length) throw new Error('There is no footage in the media pool.');

    clearStory(p);
    const track = mainVideoTrack(p);
    const order = shuffle ? shuffled(pool) : pool;

    // Cut points: every Nth beat, stopping at the target length.
    const cuts = detected.beats.filter((_, i) => i % every === 0);
    const limit = targetDur || cuts.at(-1) || 30;
    let i = 0;
    for (let c = 0; c < cuts.length - 1; c++) {
      const start = cuts[c];
      const end = Math.min(cuts[c + 1], limit);
      if (start >= limit) break;
      const len = end - start;
      if (len < 0.12) continue;
      const media = order[i % order.length];
      i++;
      const usable = Math.min(len, media.kind === 'image' ? len : media.duration);
      // eslint-disable-next-line no-await-in-loop -- analysis is per clip
      const inPoint = await bestSegment(media, usable);
      addClip(p, { mediaId: media.id, trackId: track.id, start, dur: usable, in: inPoint });
    }
    return `${i} shots at ${detected.bpm} BPM, cutting every ${every} beats.`;
  },

  /** Drop the quiet parts and close the gaps — the jump-cut look. */
  async removeSilence(p, { minLen = 0.35, pad = 0.08 }) {
    const clips = storyClips(p);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');

    let removed = 0;
    for (const clip of clips) {
      const media = mediaById(p, clip.mediaId);
      if (!media || !media.hasAudio) continue;
      // eslint-disable-next-line no-await-in-loop -- decode is per media file
      const buffer = await decode(media);
      if (!buffer) continue;
      const quiet = detectSilence(buffer, { minLen, pad });
      if (!quiet.length) continue;

      // Keep only the loud stretches inside this clip's in/out range.
      const from = clip.in;
      const to = clip.in + clip.dur * (clip.speed || 1);
      const keeps = [];
      let cursor = from;
      for (const range of quiet) {
        if (range.end <= from || range.start >= to) continue;
        const gapStart = Math.max(from, range.start);
        if (gapStart - cursor > 0.12) keeps.push([cursor, gapStart]);
        cursor = Math.max(cursor, Math.min(to, range.end));
        removed++;
      }
      if (to - cursor > 0.12) keeps.push([cursor, to]);
      if (!keeps.length || keeps.length === 1) continue;

      const trackId = clip.trackId;
      const startAt = clip.start;
      removeClips(p, [clip.id]);
      let t = startAt;
      for (const [a, b] of keeps) {
        const len = (b - a) / (clip.speed || 1);
        const made = addClip(p, { mediaId: media.id, trackId, start: t, dur: len, in: a });
        made.color = structuredClone(clip.color);
        made.transform = structuredClone(clip.transform);
        made.volume = clip.volume;
        made.speed = clip.speed;
        t += len;
      }
    }
    for (const track of videoTracks(p)) closeGaps(p, track.id);
    return removed ? `${removed} silent stretch${removed === 1 ? '' : 'es'} cut out.` : 'No silences long enough to cut.';
  },

  setSpeed(p, { speed }) {
    const clips = storyClips(p);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');
    for (const clip of clips) {
      clip.speed = speed;
      clip.dur = clip.dur / speed;
    }
    for (const track of videoTracks(p)) closeGaps(p, track.id);
    return `${clips.length} clips at ${speed}×.`;
  },

  applyLook(p, { look, strength = 1 }) {
    const clips = storyClips(p);
    if (!clips.length) throw new Error('There is nothing on the timeline to grade.');
    for (const clip of clips) {
      clip.color.look = look;
      clip.color.strength = strength;
    }
    return `${clips.length} clips graded.`;
  },

  /*
   * The whole cut, shaped.
   *
   * Sections each take a share of the length and cut at their own pace —
   * beats per cut on the music grid, or seconds at 120 BPM without one. The
   * section boundaries are remembered on the project so the steps that
   * follow can say "the drop" and mean a range of clips, which is what makes
   * a ramp for the drop land on the drop and nowhere else.
   */
  async structuredCut(p, { targetDur = 30, sections = [], shuffle = false }, ctx) {
    const pool = visualMedia(p);
    if (!pool.length) throw new Error('There is no footage in the media pool.');
    if (!sections.length) sections = [{ name: 'All', share: 1, every: 4 }];

    const music = p.media.find((m) => m.kind === 'audio');
    let grid = null;
    if (music) {
      const buffer = ctx.beatBuffer || await decode(music);
      const detected = ctx.beats?.beats?.length ? ctx.beats : (buffer ? detectBeats(buffer) : null);
      if (detected?.beats?.length > 4) grid = detected;
    }
    const period = grid ? grid.period : 0.5;      // 120 BPM without music
    const wanted = Math.min(targetDur, grid && music ? Math.max(4, music.duration) : targetDur);
    // Without music the grid is still a grid: 120 BPM, so the same code runs.
    const beats = grid ? grid.beats : Array.from({ length: Math.ceil(wanted / period) + 2 }, (_, k) => k * period);
    const nearest = (t) => beats.reduce((best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best), beats[0]);

    /*
     * Section edges land on beats, and so does the end, so a section is a
     * whole number of beats and the last cut is on one too. Every shot starts
     * where the last one ended and ends on a beat, so there is never a black
     * gap between two shots. A file shorter than its slot is the one thing
     * that can break the grid: it is skipped for one that fits, and only when
     * nothing fits does the whole short file play, with the next shot picking
     * the grid back up at the following beat.
     */
    const total = Math.max(period, nearest(wanted) <= (music?.duration ?? Infinity) ? nearest(wanted) : beats.filter((b) => b <= wanted).at(-1) ?? wanted);
    const edges = [0];
    let acc = 0;
    for (const sec of sections) { acc += sec.share; edges.push(Math.max(edges.at(-1), Math.min(total, nearest(acc * total)))); }
    edges[edges.length - 1] = total;

    clearStory(p);
    const track = mainVideoTrack(p);
    const order = shuffle ? shuffled(pool) : pool;
    const bounds = [];
    let t = 0, i = 0, next = 0;
    const pick = (len) => {
      for (let k = 0; k < order.length; k++) {
        const m = order[(next + k) % order.length];
        if (m.kind === 'image' || m.duration >= len - 0.02) { next = (next + k + 1) % order.length; return m; }
      }
      const m = order[next % order.length]; next = (next + 1) % order.length; return m;
    };
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const secEnd = edges[si + 1];
      const step = Math.max(0.12, period * Math.max(0.5, sec.every));
      const from = t;
      while (t < secEnd - 0.06) {
        const start = t;
        // The first beat at or after a full step from here, unless the section ends first.
        const nb = beats.find((x) => x >= start + step - 0.01);
        let end = nb !== undefined ? Math.min(nb, secEnd) : secEnd;
        if (secEnd - end < 0.1) end = secEnd;    // never leave a sliver at the end of a section
        const len = end - start;
        if (len < 0.1) break;
        const media = pick(len); i++;
        const usable = Math.min(len, media.kind === 'image' ? len : media.duration);
        // eslint-disable-next-line no-await-in-loop -- analysis is per clip
        const inPoint = await bestSegment(media, usable);
        addClip(p, { mediaId: media.id, trackId: track.id, start, dur: usable, in: inPoint });
        t = start + usable;
      }
      bounds.push({ name: sec.name, from, to: t });
    }
    p.montageSections = bounds;
    return `${i} shots in ${sections.length} sections${grid ? ` at ${grid.bpm} BPM` : ''}, ${t.toFixed(1)}s.`;
  },

  /**
   * A speed ramp on every shot inside a section.
   *
   * The shots keep their length — the cuts are on the beat and stay there.
   * A ramp that needs more footage than the shot has in front of it first
   * slides the in-point earlier to find it, and only then plays quieter.
   */
  sectionRamp(p, { section, ramp }) {
    const clips = sectionClips(p, section);
    if (!clips.length) throw new Error('That section has no shots in it.');
    let n = 0, quieter = 0;
    for (const clip of clips) {
      const media = mediaById(p, clip.mediaId);
      if (!media || media.kind === 'image') continue;
      const probe = { dur: clip.dur, speed: 1 };
      const need = applyRamp(probe, ramp).need;
      if (media.duration && clip.in + need > media.duration) clip.in = Math.max(0, media.duration - need);
      const available = media.duration ? Math.max(0.2, media.duration - clip.in) : Infinity;
      const out = applyRamp(clip, ramp, { available, keepDur: true });
      if (out.scaled < 0.999) quieter++;
      n++;
    }
    return `${ramp} on ${n} shots${quieter ? ` (${quieter} eased to fit the footage)` : ''}.`;
  },

  /**
   * Make a beat and put it in the media pool, as a real file.
   *
   * Runs through the same import as an upload, so it gets a waveform, a
   * duration, a fingerprint and a place in the pool. Its beat grid is set
   * on the context for the cut that follows, exactly — no detection needed.
   */
  async generateBeat(p, { style = 'trap', bpm = null, seconds = 32 }, ctx) {
    if (p.media.some((m) => m.kind === 'audio')) return 'There is already music in the pool — using that.';
    if (!ctx.importFile) throw new Error('This build cannot import a generated file.');
    const made = await renderBeat({ style, bpm, seconds });
    const file = bufferToWav(made.buffer, `Beat — ${style} ${made.bpm} BPM.wav`);
    const rec = await ctx.importFile(file);
    if (!rec) throw new Error('The beat could not be added to the pool.');
    ctx.beats = { bpm: made.bpm, period: 60 / made.bpm, beats: made.beats, confidence: 1 };
    ctx.beatBuffer = made.buffer;
    return `A ${style} beat at ${made.bpm} BPM, ${made.seconds.toFixed(0)}s.`;
  },

  addTransitions(p, { type = 'dissolve', dur = 0.4, section = null }) {
    let count = 0;
    const only = section === null || section === undefined ? null : new Set(sectionClips(p, section).map((c) => c.id));
    for (const track of videoTracks(p)) {
      const list = clipsOn(p, track.id).filter((c) => c.kind !== 'title');
      list.forEach((clip, i) => {
        if (i === 0) return;
        if (only && !only.has(clip.id)) return;
        // Never let a transition eat more than a third of the shorter shot.
        const room = Math.min(clip.dur, list[i - 1].dur) / 3;
        clip.transitionIn = { type, dur: Math.min(dur, room) };
        count++;
      });
    }
    return count ? `${count} transitions added.` : 'Only one shot — nothing to transition between.';
  },

  kenBurns(p, { amount = 0.12 }) {
    let count = 0;
    for (const clip of storyClips(p)) {
      const media = mediaById(p, clip.mediaId);
      if (!media || media.kind !== 'image') continue;
      // Alternate the direction so a run of photos doesn't pulse in unison.
      const inward = count % 2 === 0;
      setKeyframe(clip, 'transform.scale', 0, inward ? 1 : 1 + amount, 'linear');
      setKeyframe(clip, 'transform.scale', clip.dur, inward ? 1 + amount : 1, 'linear');
      count++;
    }
    return count ? `Movement added to ${count} photo${count === 1 ? '' : 's'}.` : 'No photos on the timeline.';
  },

  /**
   * Captions.
   *
   * With a transcription key configured we get the words and the timings. With
   * no key we still do the hard half — finding where speech actually is — and
   * leave empty cues you type into. That is far better than nothing and it is
   * the honest version of "offline auto-captions".
   */
  async captions(p, { style = 'tiktok' }, ctx) {
    const clips = storyClips(p);
    const withVoice = clips.filter((c) => mediaById(p, c.mediaId)?.hasAudio);
    if (!withVoice.length) throw new Error('No audio on the timeline to caption.');

    if (ctx.transcribe) {
      const cues = await ctx.transcribe(p);
      if (cues?.length) {
        p.captions = cues.map((c) => ({ ...c, style }));
        return `${cues.length} captions transcribed and timed.`;
      }
    }

    const cues = [];
    for (const clip of withVoice) {
      const media = mediaById(p, clip.mediaId);
      // eslint-disable-next-line no-await-in-loop -- decode is per media file
      const buffer = await decode(media);
      if (!buffer) continue;
      const quiet = detectSilence(buffer, { minLen: 0.28, pad: 0.05 });
      const from = clip.in;
      const to = clip.in + clip.dur * (clip.speed || 1);
      let cursor = from;
      for (const gap of [...quiet, { start: to, end: to }]) {
        if (gap.start <= from) { cursor = Math.max(cursor, gap.end); continue; }
        const speechEnd = Math.min(gap.start, to);
        if (speechEnd - cursor > 0.4) {
          const startOnTimeline = clip.start + (cursor - from) / (clip.speed || 1);
          const endOnTimeline = clip.start + (speechEnd - from) / (clip.speed || 1);
          // Long stretches get split, because a caption on screen for eight
          // seconds is a wall of text nobody reads.
          const span = endOnTimeline - startOnTimeline;
          const pieces = Math.max(1, Math.round(span / 2.4));
          for (let i = 0; i < pieces; i++) {
            cues.push({
              start: Number((startOnTimeline + (span / pieces) * i).toFixed(3)),
              end: Number((startOnTimeline + (span / pieces) * (i + 1)).toFixed(3)),
              text: '',
              style,
            });
          }
        }
        cursor = Math.max(cursor, gap.end);
        if (cursor >= to) break;
      }
    }
    p.captions = cues;
    return cues.length
      ? `${cues.length} caption slots placed on the speech. Type the words in the Captions panel — the timing is already done.`
      : 'No speech found to caption.';
  },

  /* ---------------- motion design ---------------- */

  /**
   * An expression on a property of chosen layers: a named preset from the
   * library, or the source written out. A preset knows which properties it
   * is for, so "wiggle" lands on position and "spin" on rotation without
   * the sentence saying so.
   */
  addExpression(p, { target, preset = null, prop = null, source = null }, ctx = {}) {
    const clips = resolveTarget(p, target, ctx);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');
    let src = source;
    let props = prop ? [prop] : [];
    let name = 'Expression';
    if (preset) {
      const def = EXPRESSION_PRESETS.find((x) => x.id === preset || x.name.toLowerCase() === String(preset).toLowerCase());
      if (!def) throw new Error(`There is no "${preset}" expression — try wiggle, spin, beat, audio, loop, drift, blink.`);
      src = def.src;
      name = def.name;
      if (!props.length) props = def.for || ['transform.scale'];
    }
    if (!src) throw new Error('Say which expression: a preset like wiggle, spin or beat, or the source itself.');
    if (!props.length) props = ['transform.x'];
    const bad = checkExpression(src);
    if (bad) throw new Error(`That expression does not read: ${bad}`);
    for (const clip of clips) for (const pr of props) setExpression(clip, pr, src);
    return `${name} on ${props.map((x) => x.replace('transform.', '')).join(' and ')} of ${clips.length} layer${clips.length === 1 ? '' : 's'}.`;
  },

  /** A shape layer: a raw type, or a finished piece from the library. */
  addShape(p, { type = 'rect', preset = null, at = 0, dur = 3, name = null }) {
    let track = videoTracks(p).find((t) => t.name === 'Shapes');
    if (!track) track = addTrack(p, 'video', 'Shapes');
    const piece = preset ? SHAPE_PRESET_BY_ID[preset] : null;
    if (preset && !piece) throw new Error(`There is no "${preset}" shape.`);
    const clip = addClip(p, { trackId: track.id, start: Math.max(0, Number(at) || 0), dur: Math.max(0.2, Number(dur) || 3), kind: 'shape' });
    clip.shape = defaultShape(type);
    if (piece) { piece.build(clip, clip.dur); clip.shape.name = piece.name; }
    clip.label = name || clip.shape.name;
    return `${clip.label} added at ${clip.start.toFixed(1)}s.`;
  },

  /** A text animator on the titles: how the letters arrive, from the library of finished moves. */
  textAnimator(p, { target = 'titles', preset = 'fadeByChar' }, ctx = {}) {
    const def = TEXT_ANIMATOR_BY_ID[preset];
    if (!def) throw new Error(`There is no "${preset}" text animator.`);
    const clips = resolveTarget(p, target ?? 'titles', ctx).filter((c) => c.kind === 'title');
    if (!clips.length) throw new Error('There is no title to animate — add one first.');
    for (const clip of clips) def.build(clip, clip.dur);
    return `${def.name} on ${clips.length} title${clips.length === 1 ? '' : 's'}.`;
  },

  /** A null object: a layer with no picture, there to be a parent. */
  addNull(p, { name = null, at = 0, dur = null }) {
    let track = videoTracks(p).find((t) => t.name === 'Controls');
    if (!track) track = addTrack(p, 'video', 'Controls');
    const n = p.clips.filter((c) => c.kind === 'null').length + 1;
    const clip = addClip(p, {
      mediaId: null, trackId: track.id, start: Math.max(0, Number(at) || 0),
      dur: Math.max(1, Number(dur) || duration(p) || 5), in: 0, kind: 'null',
    });
    clip.label = name || `Null ${n}`;
    return `${clip.label} added — parent any layer to it.`;
  },

  /** Make one layer the parent of others: they follow its position, scale and rotation. */
  setParent(p, { target, parent }, ctx = {}) {
    const children = resolveTarget(p, target, ctx);
    if (!children.length) throw new Error('Say which layers should follow.');
    const parentClip = parent === null || parent === 'none' ? null : resolveTarget(p, parent ?? 'null', ctx)[0];
    for (const clip of children) {
      if (parentClip && clip.id === parentClip.id) continue;
      // A chain that leads back to the child is a loop; refuse it rather than draw nothing for ever.
      let up = parentClip, hops = 0, loop = false;
      while (up && hops++ < 64) { if (up.id === clip.id) { loop = true; break; } up = up.parentId ? clipById(p, up.parentId) : null; }
      if (loop) continue;
      clip.parentId = parentClip ? parentClip.id : null;
    }
    return parentClip
      ? `${children.length} layer${children.length === 1 ? '' : 's'} now follow${children.length === 1 ? 's' : ''} ${parentClip.label || parentClip.text?.content || 'the parent'}.`
      : `${children.length} layer${children.length === 1 ? '' : 's'} unparented.`;
  },

  addTitle(p, { content, preset = 'headline', at = 0, dur = 2.2, style = null, anim = null }) {
    const presetDef = TITLE_PRESETS.find((t) => t.id === preset) || TITLE_PRESETS[0];
    // Titles go on their own track above the picture so they never displace a shot.
    let track = videoTracks(p).find((t) => t.name === 'Titles');
    if (!track) { track = addTrack(p, 'video', 'Titles'); }
    const text = { ...defaultText(content), ...presetDef.text, content };
    // A named style replaces the preset's fill and shadow but keeps its
    // placement; an animation name replaces the preset's entrance.
    if (style) applyTextStyle(text, style);
    if (anim) text.anim = anim;
    const clip = addClip(p, {
      trackId: track.id, start: at, dur, kind: 'title',
      text,
    });
    return `Title "${String(content).slice(0, 30)}" added at ${at.toFixed(1)}s.`;
  },

  fitMusic(p, { fadeOut = 1.2, duck = true }) {
    const music = p.media.find((m) => m.kind === 'audio');
    if (!music) throw new Error('No music in the media pool.');
    const track = mainAudioTrack(p);
    if (duck) track.duck = false;      // the music track itself is the one ducked

    const total = duration(p) || 15;
    // Replace any existing copy rather than stacking a second one.
    removeClips(p, clipsOn(p, track.id).filter((c) => c.mediaId === music.id).map((c) => c.id));
    const len = Math.min(total, music.duration);
    const clip = addClip(p, { mediaId: music.id, trackId: track.id, start: 0, dur: len, in: 0 });
    clip.fadeOut = Math.min(fadeOut, len / 3);
    clip.volume = 0.8;
    track.duck = true;
    return `${music.name} trimmed to ${len.toFixed(1)}s with a ${clip.fadeOut.toFixed(1)}s fade.`;
  },

  fadeEnds(p, { dur = 0.5 }) {
    const clips = storyClips(p);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');
    const first = clips[0];
    const last = clips.at(-1);
    first.fadeIn = Math.min(dur, first.dur / 2);
    last.fadeOut = Math.min(dur, last.dur / 2);
    return 'Faded in and out.';
  },

  /* ---------------- one clip at a time ---------------- */
  /*
   * The operations below are what make a specific instruction expressible.
   *
   * Everything above this line acts on the whole edit, which is right for
   * "make it an anime edit" and useless for "slow the second shot down and
   * mute it". These take a target, so the sentence has somewhere to land.
   */

  /** Colour on chosen clips: a look, or individual controls, or both. */
  setColor(p, { target, look, strength = 1, ...values }, ctx = {}) {
    const clips = resolveTarget(p, target, ctx);
    const known = ['exposure', 'contrast', 'saturation', 'temperature', 'tint',
      'highlights', 'shadows', 'vignette', 'grain', 'blur'];
    for (const clip of clips) {
      clip.color ||= {};
      if (look !== undefined) {
        if (look !== 'none' && !LOOK_BY_ID[look]) throw new Error(`There is no "${look}" look.`);
        clip.color.look = look;
        clip.color.strength = strength;
      }
      for (const key of known) {
        if (values[key] !== undefined) clip.color[key] = Number(values[key]);
      }
    }
    return `Colour set on ${clips.length} clip${clips.length === 1 ? '' : 's'}.`;
  },

  /** Speed on chosen clips, rather than the flat one that hits everything. */
  setClipSpeed(p, { target, speed = 1 }, ctx = {}) {
    const clips = resolveTarget(p, target, ctx);
    const v = Math.max(0.1, Math.min(10, Number(speed) || 1));
    for (const clip of clips) {
      // The clip has to get shorter or longer to match, or the speed change is
      // invisible — the picture runs faster inside a slot of the same length
      // and the rest of the edit never moves.
      const was = clip.speed || 1;
      clip.speed = v;
      clip.dur = Math.max(0.05, clip.dur * (was / v));
      clip.speedKeys = null;
    }
    return `${v}× on ${clips.length} clip${clips.length === 1 ? '' : 's'}.`;
  },

  /** Volume, mute and fades on chosen clips. */
  setVolume(p, { target, volume, mute, fadeIn, fadeOut }, ctx = {}) {
    const clips = resolveTarget(p, target, ctx);
    for (const clip of clips) {
      if (mute !== undefined) clip.muted = Boolean(mute);
      if (volume !== undefined) clip.volume = Math.max(0, Math.min(2, Number(volume)));
      if (fadeIn !== undefined) clip.fadeIn = Math.max(0, Math.min(clip.dur / 2, Number(fadeIn)));
      if (fadeOut !== undefined) clip.fadeOut = Math.max(0, Math.min(clip.dur / 2, Number(fadeOut)));
    }
    return `Audio set on ${clips.length} clip${clips.length === 1 ? '' : 's'}.`;
  },

  /** Position, scale, rotation and opacity on chosen clips. */
  setTransform(p, { target, scale, x, y, rotate, opacity, blend }, ctx = {}) {
    const clips = resolveTarget(p, target, ctx);
    for (const clip of clips) {
      clip.transform ||= defaultTransform();
      if (scale !== undefined) clip.transform.scale = Math.max(0.05, Math.min(8, Number(scale)));
      if (x !== undefined) clip.transform.x = Number(x);
      if (y !== undefined) clip.transform.y = Number(y);
      if (rotate !== undefined) clip.transform.rotate = Number(rotate);
      if (opacity !== undefined) clip.transform.opacity = Math.max(0, Math.min(1, Number(opacity)));
      if (blend !== undefined) clip.transform.blend = String(blend);
    }
    return `Framing set on ${clips.length} clip${clips.length === 1 ? '' : 's'}.`;
  },

  /** Remove chosen clips and close the gap behind them. */
  deleteClips(p, { target, ripple = true }, ctx = {}) {
    const clips = resolveTarget(p, target, ctx);
    const ids = new Set(clips.map((c) => c.id));
    const trackIds = [...new Set(clips.map((c) => c.trackId))];
    p.clips = p.clips.filter((c) => !ids.has(c.id));
    if (ripple) {
      // Closing up is almost always what was meant: "delete the third shot"
      // does not usually mean "leave a hole where it was".
      for (const trackId of trackIds) {
        let at = 0;
        for (const c of clipsOn(p, trackId)) { c.start = at; at += c.dur; }
      }
    }
    return `Removed ${clips.length} clip${clips.length === 1 ? '' : 's'}.`;
  },

  /** Trim chosen clips to a length, or by an amount off either end. */
  trimClips(p, { target, dur, head = 0, tail = 0, ripple = true }, ctx = {}) {
    const clips = resolveTarget(p, target, ctx);
    for (const clip of clips) {
      if (dur !== undefined) clip.dur = Math.max(0.05, Number(dur));
      if (head) { const d = Math.min(Number(head), clip.dur - 0.05); clip.in += d; clip.dur -= d; }
      if (tail) clip.dur = Math.max(0.05, clip.dur - Number(tail));
    }
    if (ripple) {
      for (const trackId of [...new Set(clips.map((c) => c.trackId))]) {
        let at = 0;
        for (const c of clipsOn(p, trackId)) { c.start = at; at += c.dur; }
      }
    }
    return `Trimmed ${clips.length} clip${clips.length === 1 ? '' : 's'}.`;
  },

  /** Take an effect back off chosen clips. */
  removeEffect(p, { target, effect }, ctx = {}) {
    const clips = resolveTarget(p, target, ctx);
    let n = 0;
    for (const clip of clips) {
      if (!clip.effects?.length) continue;
      const before = clip.effects.length;
      clip.effects = effect ? clip.effects.filter((f) => f.id !== effect) : [];
      n += before - clip.effects.length;
    }
    return `Removed ${n} effect${n === 1 ? '' : 's'}.`;
  },

  /** Put the clips in a given order, by their current numbers. */
  reorderClips(p, { order }, ctx = {}) {
    const clips = storyClips(p);
    if (!Array.isArray(order) || !order.length) throw new Error('No new order was given.');
    const picked = order.map((n) => clips[Math.round(n) - 1]).filter(Boolean);
    if (picked.length !== clips.length) {
      throw new Error(`That order lists ${picked.length} clips but there are ${clips.length}.`);
    }
    let at = 0;
    for (const clip of picked) { clip.start = at; at += clip.dur; }
    void ctx;
    return `Reordered ${picked.length} clips.`;
  },

  /* ---------------- effects ---------------- */

  /**
   * Put an effect on some or all clips.
   *
   * `scope` is 'all', 'accent' (every Nth shot, so it stays an accent) or
   * 'first'. Adding the same effect twice replaces it rather than stacking two
   * copies, because two chromatic splits is a bug every time.
   */
  addEffect(p, { effect, params = {}, scope = 'all', every = 3, section = null, target }, ctx = {}) {
    if (!EFFECTS[effect]) throw new Error(`There is no "${effect}" effect.`);
    // A target names particular layers ("the title", "clip 3"); a scope
    // spreads over the story. Given a target, the scope is not consulted.
    const clips = target !== undefined && target !== null && target !== 'all' ? resolveTarget(p, target, ctx) : storyClips(p);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');

    const targets = target !== undefined && target !== null && target !== 'all' ? clips
      : scope === 'first' ? clips.slice(0, 1)
      : scope === 'accent' ? clips.filter((_, i) => i % Math.max(2, every) === 0)
      : scope === 'section' ? sectionClips(p, section)
      : clips;

    for (const clip of targets) {
      clip.effects ||= [];
      const made = makeEffect(effect);
      Object.assign(made.params, params);
      const existing = clip.effects.findIndex((f) => f.id === effect);
      if (existing >= 0) clip.effects[existing] = made;
      else clip.effects.push(made);
    }
    return `${EFFECTS[effect].name} on ${targets.length} clip${targets.length === 1 ? '' : 's'}.`;
  },

  /**
   * Punch in on every beat.
   *
   * Written as keyframes on each clip rather than a special mode, so you can
   * open any shot and soften, move or delete its punch like anything else.
   */
  beatZoom(p, { amount = 0.16, hold = 0.14, section = null }, ctx) {
    const clips = section === null || section === undefined ? storyClips(p) : sectionClips(p, section);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');
    const beats = ctx.beats?.beats;

    let count = 0;
    for (const clip of clips) {
      const base = clip.transform.scale || 1;
      const hits = beats
        ? beats.filter((b) => b >= clip.start - 0.02 && b < clip.start + clip.dur).map((b) => b - clip.start)
        : [0];
      if (!hits.length) hits.push(0);

      const keys = [];
      for (const at of hits) {
        keys.push({ t: Math.max(0, at - 0.02), v: base, ease: 'out' });
        keys.push({ t: Math.max(0, at), v: base * (1 + amount), ease: 'out' });
        keys.push({ t: Math.min(clip.dur, at + hold), v: base, ease: 'ease' });
      }
      clip.keyframes['transform.scale'] = keys.sort((a, b) => a.t - b.t);
      count++;
    }
    return `${count} clips punch in on the beat.`;
  },

  /**
   * Impact frames — the one or two inverted frames an anime cut slams on.
   * Placed at the start of every Nth shot, where the cut already is.
   */
  impactFrames(p, { every = 4, style = 'invert', length = 0.07, section = null }) {
    const clips = section === null || section === undefined ? storyClips(p) : sectionClips(p, section);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');
    let count = 0;
    clips.forEach((clip, i) => {
      if (i === 0 || i % Math.max(1, every) !== 0) return;
      clip.effects ||= [];
      const fx = makeEffect('invertPulse');
      fx.params.at = 0;
      fx.params.length = length;
      fx.params.mode = style;
      clip.effects = clip.effects.filter((f) => f.id !== 'invertPulse');
      clip.effects.push(fx);
      count++;
    });
    return count ? `${count} impact frames.` : 'Not enough shots for impact frames.';
  },

  /**
   * Speed ramps.
   *
   * Each shot slows at its head and accelerates out of its tail, which is what
   * makes cuts feel like they are being thrown at you. This is a real time
   * curve, so audio follows it and the source is consumed at the right rate.
   */
  speedRamp(p, { peak = 2.4, floor = 0.6, curve = 'ease' }) {
    const clips = storyClips(p);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');
    for (const clip of clips) {
      const media = mediaById(p, clip.mediaId);
      clip.speedKeys = [
        { t: 0, v: floor },
        { t: clip.dur * 0.45, v: (floor + peak) / 2 },
        { t: clip.dur, v: peak },
      ];
      // A ramp eats more source than a flat clip. If the file cannot supply it,
      // shorten the clip rather than freezing on its last frame.
      if (media?.duration) {
        const need = sourceSpan(clip);
        const have = media.duration - clip.in;
        if (need > have) clip.dur = Math.max(0.15, clip.dur * (have / need) * 0.98);
      }
    }
    void curve;
    for (const track of videoTracks(p)) closeGaps(p, track.id);
    return `${clips.length} shots ramp from ${floor}× to ${peak}×.`;
  },

  /**
   * Re-time what is already on the timeline onto the beat.
   *
   * This is the one people ask for by name: keep my clips, keep my order, keep
   * my content — just make the cuts land on the music. Nothing is replaced and
   * nothing is reordered; each shot is trimmed or extended so its out point
   * sits exactly on a beat.
   */
  async syncToTrack(p, { every = 4, keepOrder = true, trim = true }, ctx) {
    const clips = storyClips(p);
    if (!clips.length) throw new Error('Put some clips on the timeline first, then ask me to sync them.');

    const music = p.media.find((m) => m.kind === 'audio');
    let grid = ctx.beats;
    if (!grid?.beats?.length) {
      if (!music) throw new Error('There is no music to sync to. Import a track and ask again.');
      const buffer = await decode(music);
      if (!buffer) throw new Error('That music file could not be decoded for beat detection.');
      grid = detectBeats(buffer);
    }
    if (!grid?.beats?.length) throw new Error('No steady beat was found in that track.');

    const cuts = grid.beats.filter((_, i) => i % Math.max(1, every) === 0);
    if (cuts.length < 2) throw new Error('The track is too short for that many beats between cuts.');

    let moved = 0;
    let cutIndex = 0;
    let cursor = cuts[0];
    for (const clip of clips) {
      // Find the first cut point far enough ahead to hold this shot; if the
      // shot is longer than one gap it gets several, which keeps a long clip
      // long instead of chopping it to the grid.
      const wanted = clip.dur;
      let next = cutIndex + 1;
      while (next < cuts.length - 1 && cuts[next] - cursor < wanted * 0.6) next++;
      const end = cuts[next] ?? (cursor + wanted);
      const newDur = Math.max(0.12, end - cursor);

      if (trim) {
        const media = mediaById(p, clip.mediaId);
        const available = media?.duration ? media.duration - clip.in : Infinity;
        clip.dur = Math.min(newDur, available / (clip.speed || 1));
      } else {
        clip.dur = newDur;
      }
      clip.start = cursor;
      cursor += clip.dur;
      cutIndex = next;
      moved++;
      if (cutIndex >= cuts.length - 1) break;
    }

    void keepOrder;
    return `${moved} cuts moved onto the beat at ${grid.bpm} BPM. Your clips and their order are untouched.`;
  },

  /**
   * Alternate the framing across jump cuts.
   *
   * After silence removal a talking head is one static shot chopped up, which
   * reads as broken. Alternating a small push between takes is what every
   * YouTube editor does by hand.
   */
  autoZoomSpeech(p, { amount = 0.09, alternate = true }) {
    const clips = storyClips(p);
    if (clips.length < 2) throw new Error('Not enough cuts to alternate the framing.');
    clips.forEach((clip, i) => {
      const inward = alternate ? i % 2 === 1 : true;
      clip.transform.scale = (clip.transform.scale || 1) * (inward ? 1 + amount : 1);
      // A pushed-in shot re-framed slightly off centre reads as a second camera
      // rather than the same one cropped.
      if (inward) clip.transform.x = (i % 4 === 1 ? 0.02 : -0.02);
    });
    return `${clips.length} shots alternate their framing.`;
  },

  /** Number every shot, for a countdown or a list. */
  numberClips(p, { countdown = true, preset = 'counter' }) {
    const clips = storyClips(p);
    if (!clips.length) throw new Error('There is nothing on the timeline yet.');
    let track = videoTracks(p).find((t) => t.name === 'Titles');
    if (!track) track = addTrack(p, 'video', 'Titles');

    // Clear any previous numbering so running this twice does not double up.
    removeClips(p, clipsOn(p, track.id).filter((c) => c.label === 'number').map((c) => c.id));

    const presetDef = TITLE_PRESETS.find((t) => t.id === preset) || TITLE_PRESETS[0];
    clips.forEach((clip, i) => {
      const n = countdown ? clips.length - i : i + 1;
      const made = addClip(p, {
        trackId: track.id,
        start: clip.start + 0.05,
        dur: Math.min(1.6, clip.dur - 0.1),
        kind: 'title',
        text: { ...defaultText(String(n)), ...presetDef.text, content: String(n) },
      });
      made.label = 'number';
    });
    return `${clips.length} shots numbered${countdown ? ', counting down' : ''}.`;
  },

  /** Drop a sticker or callout on the timeline. */
  addSticker(p, { kind = 'emoji', value = '🔥', at = 0, dur = 1.6, x = 0.5, y = 0.4, size = 0.18, anim = 'pop', text = '' }) {
    let track = videoTracks(p).find((t) => t.name === 'Stickers');
    if (!track) track = addTrack(p, 'video', 'Stickers');
    const total = duration(p);
    const start = at < 0 ? Math.max(0, total + at) : at;
    addClip(p, {
      trackId: track.id, start, dur, kind: 'sticker',
      sticker: { ...defaultSticker(kind, value), x, y, size, anim, text },
    });
    return `${kind === 'emoji' ? value : value} added at ${start.toFixed(1)}s.`;
  },
};

export const OPERATIONS = Object.keys(OPS);

/**
 * What each operation takes, in one place.
 *
 * Sent to the cloud planner so it writes arguments that actually work instead
 * of plausible-looking ones, and used by the panel to explain a step. Keeping
 * it next to the implementations is the only way it stays true.
 */
export const OP_SPEC = {
  setRatio: { args: 'ratio: "9:16"|"16:9"|"1:1"|"4:5"|"2.39:1"', does: 'Set the canvas shape. Always first.' },
  layout: { args: 'targetDur?: seconds, clipLength?: seconds, shuffle?: bool, pickBest?: bool',
    does: 'Replace the video tracks with every clip in the pool, trimmed to a consistent length. Use when there is no music or no beat.' },
  beatCut: { args: 'targetDur?: seconds, every?: beats per cut (1|2|4|8), shuffle?: bool',
    does: 'Replace the video tracks, cutting on the beat grid. Needs music. every:2 is fast, 4 normal, 8 slow.' },
  syncToTrack: { args: 'every?: beats per cut, keepOrder?: bool, trim?: bool',
    does: 'KEEP the clips already on the timeline and their order — only move the cuts onto beats. Use whenever someone says sync/re-time/match the music rather than build me an edit.' },
  removeSilence: { args: 'minLen?: seconds, pad?: seconds', does: 'Cut quiet stretches and close the gaps. The jump-cut look.' },
  setSpeed: { args: 'speed: multiplier', does: 'A flat speed change on every clip.' },
  speedRamp: { args: 'peak?: multiplier, floor?: multiplier', does: 'A real speed curve inside each shot — slow head, fast tail. The velocity-edit look.' },
  applyLook: { args: 'look: id, strength?: 0-1.5',
    does: 'Grade every clip. Looks: none, punch, cinematic, mono, warm, cool, fade, noir, vivid, soft, kodak, fuji, bleach, vhs, neon, sunburn, moonlight, pastel, crush, infra.' },
  addEffect: { args: 'effect: id, params?: object, scope?: "all"|"accent"|"first"|"section", every?: n, section?: index',
    does: 'Add an effect. scope "accent" puts it on every Nth shot only; "section" on one montage section.' },
  beatZoom: { args: 'amount?: 0-0.4, hold?: seconds', does: 'Keyframed punch-in on every beat.' },
  impactFrames: { args: 'every?: n shots, style?: "invert"|"white"|"black"|"edge", length?: seconds',
    does: 'The one-or-two-frame slam an anime cut lands on.' },
  kenBurns: { args: 'amount?: 0-0.4', does: 'Slow push on photos so stills are not dead on screen.' },
  autoZoomSpeech: { args: 'amount?: 0-0.2, alternate?: bool', does: 'Alternate the framing across jump cuts so a chopped-up talking head does not look static.' },
  addTransitions: { args: 'type: id, dur: seconds, section?: index',
    does: 'Transitions: dissolve, dipBlack, dipWhite, slideLeft, slideUp, wipe, circle, zoomPunch, whip, blurDissolve, glitch, filmBurn, spin.' },
  addTitle: { args: 'content: string, preset?: "headline"|"lower"|"subtitle"|"hook"|"counter"|"quote"|"glitchy"|"endcard", at?: seconds (negative counts from the end), dur?: seconds, style?: text style id, anim?: text animation id',
    does: 'A text clip on its own track.' },
  addSticker: { args: 'kind: "emoji"|"shape", value: emoji or shape id, at?: seconds, dur?: seconds, x?/y?: 0-1, size?: 0-1, anim?: id, text?: string',
    does: 'Shapes: arrow, circle, box, burst, bubble, progress, countdown, bar, scribble, focus.' },
  numberClips: { args: 'countdown?: bool, preset?: title preset', does: 'One big number per shot, for a list or countdown.' },
  captions: { args: 'style?: "tiktok"|"youtube"|"bold"|"karaoke"|"clean"', does: 'Caption cues timed to the speech.' },
  structuredCut: { args: 'targetDur?: seconds, sections: [{name, share: 0-1, every: beats per cut}], shuffle?: bool',
    does: 'Replace the video tracks with a cut whose pace changes per section (intro slow, drop fast). Remembers the sections so later steps can target one. Use for any montage.' },
  sectionRamp: { args: 'section: index, ramp: id', does: 'A speed ramp on every shot in a section. Ramps: velocity, slowmo-hit, bullet-time, punch, kickback, land, ease-in, ease-out, dip, double-tap, stutter, timelapse, hyper, reveal, freeze-go, heartbeat.' },
  generateBeat: { args: 'style?: "phonk"|"trap"|"drill"|"house"|"hype"|"cinematic"|"lofi"|"dnb", bpm?: number, seconds?: number',
    does: 'When there is no music, make a beat in the pool to cut to. Its grid is exact. Put it before structuredCut.' },
  fitMusic: { args: 'fadeOut?: seconds, duck?: bool', does: 'Trim the music to the edit length. Always last but one.' },
  fadeEnds: { args: 'dur?: seconds', does: 'Fade the first and last shot.' },

  /*
   * Everything below takes a `target`, which is how a specific instruction
   * gets said at all. Without it every operation meant "do this to the whole
   * timeline", and a sentence like "slow the third shot down" had nowhere to
   * land no matter how well it was understood.
   *
   * target: "all" | "selected" | "first" | "last" | "odd" | "even"
   *       | 3 (the third clip, counting from one)
   *       | [1,3,5] | "2-4" | { from: seconds, to: seconds }
   */
  setColor: {
    args: 'target?, look?: id, strength?: 0-1.5, exposure?/contrast?/saturation?/temperature?/tint?/highlights?/shadows?/vignette?/grain?/blur?: -100..100',
    does: 'Grade chosen clips. Use for "make clip 2 black and white", "warm up the first half".' },
  setClipSpeed: {
    args: 'target?, speed: multiplier',
    does: 'Speed on chosen clips only, and the clip is re-timed to match so the edit actually moves.' },
  setVolume: {
    args: 'target?, volume?: 0-2, mute?: bool, fadeIn?: seconds, fadeOut?: seconds',
    does: 'Loudness, muting and fades on chosen clips. Use for "mute the third one".' },
  setTransform: {
    args: 'target?, scale?: 0.05-8, x?/y?: fraction of frame, rotate?: degrees, opacity?: 0-1, blend?: mode',
    does: 'Framing and opacity on chosen clips. Use for "zoom into the second shot", "make the overlay half transparent".' },
  deleteClips: {
    args: 'target, ripple?: bool (default true)',
    does: 'Remove chosen clips and close the gap. Use for "get rid of the last two".' },
  trimClips: {
    args: 'target, dur?: seconds, head?: seconds off the front, tail?: seconds off the end, ripple?: bool',
    does: 'Shorten chosen clips. Use for "make every shot two seconds", "cut a second off the start of clip 4".' },
  removeEffect: {
    args: 'target?, effect?: id (omit to clear everything on them)',
    does: 'Take effects back off chosen clips.' },

  /* motion design — target may also be "title" (the newest title), "titles", "shape", "shapes", "null", "sticker" */
  addExpression: {
    args: 'target?, preset?: wiggle|wiggleRot|wiggleScale|loop|pingpong|offset|inertia|beat|beatOpacity|audio|audioBass|audioRot|spin|drift|fadeInOut|blink|stutter|shakeDecay, prop?: "transform.x"|"transform.y"|"transform.scale"|"transform.rotate"|"transform.opacity", source?: expression text',
    does: 'A movement without keyframes: wiggle, spin, pop on the beat, scale with the music, loop the keys. Use for "make the title wiggle", "spin the logo", "pulse with the music".' },
  textAnimator: {
    args: 'target?: "title"|"titles", preset: typewriterHard|fadeByChar|riseByChar|fallByChar|scaleByWord|zoomByWord|rotateIn|blurIn|trackingIn|trackingOut|randomPop|slideFromLeft|waveLoop|jitterLoop|beatBounce|audioScale',
    does: 'How the letters of a title arrive or move: one by one, word by word, typed on, tracking in. Put it after addTitle.' },
  addShape: {
    args: 'preset?: progressBar|underline|lineReveal|ringFill|boxOutline|circleBurst|starPop|burstLines|dashedOrbit|dotGrid|spiralSquares|saberLine|neonRing|wobbleBlob|scribbleCircle|burstStar|hexagon|arrowIn, type?: rect|ellipse|line|polygon|star, at?: seconds, dur?: seconds',
    does: 'A shape layer that animates itself: a line that draws on, a ring that fills, a progress bar, a burst.' },
  addNull: { args: 'name?: string, at?: seconds, dur?: seconds', does: 'A null object — an invisible layer other layers can follow.' },
  setParent: { args: 'target, parent: a target ("null", "title", a clip number) or null to unparent',
    does: 'Make layers follow another: "parent the title to the null", "make clip 2 follow the logo".' },
  reorderClips: {
    args: 'order: [clip numbers in the new order]',
    does: 'Rearrange the timeline. Use for "put the last shot first".' },
};
