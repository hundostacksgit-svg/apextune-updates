/*
 * The project document, and every operation that changes it.
 *
 * A project is plain JSON — no classes, no live references — for three
 * reasons that all showed up in other editors' complaint threads:
 *   1. Undo can be a snapshot, so it can never miss a change.
 *   2. The file is readable, diffable and portable between machines.
 *   3. Media is referenced by a content hash, so moving files doesn't break it.
 *
 * Timeline positions are seconds. Frames are a display concern only.
 */

import { uid, clamp } from '../ui.js';

export const SCHEMA = 1;

export const RATIOS = {
  '9:16':   { w: 1080, h: 1920, label: 'TikTok / Reels / Shorts' },
  '16:9':   { w: 1920, h: 1080, label: 'YouTube / landscape' },
  '1:1':    { w: 1080, h: 1080, label: 'Square' },
  '4:5':    { w: 1080, h: 1350, label: 'Instagram feed' },
  '2.39:1': { w: 1920, h: 803,  label: 'Cinemascope' },
};

export function defaultTransform() {
  return { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, crop: { t: 0, r: 0, b: 0, l: 0 }, blend: 'normal' };
}

export function defaultColor() {
  return {
    look: 'none', strength: 1,
    exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0,
    highlights: 0, shadows: 0, vignette: 0, grain: 0, blur: 0, sharpen: 0,
  };
}

export function newProject(opts = {}) {
  const ratio = opts.ratio || '9:16';
  const r = RATIOS[ratio];
  return {
    schema: SCHEMA,
    id: uid('p'),
    name: opts.name || 'Untitled project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      ratio,
      width: r.w,
      height: r.h,
      fps: opts.fps || 30,
      background: '#000000',
      sampleRate: 48000,
    },
    media: [],
    tracks: [
      { id: 'v1', kind: 'video', name: 'Video 1', height: 62, muted: false, hidden: false, locked: false },
      { id: 'a1', kind: 'audio', name: 'Audio 1', height: 46, muted: false, hidden: false, locked: false },
    ],
    clips: [],
    markers: [],
    captions: [],
    motionTracks: [],
    brand: null,
  };
}

/* ------------------------------------------------------------------ */
/* queries                                                             */
/* ------------------------------------------------------------------ */

export function duration(p) {
  return p.clips.reduce((max, c) => Math.max(max, c.start + c.dur), 0);
}

export function clipsOn(p, trackId) {
  return p.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
}

export function clipById(p, id) {
  return p.clips.find((c) => c.id === id) || null;
}

export function mediaById(p, id) {
  return p.media.find((m) => m.id === id) || null;
}

export function trackById(p, id) {
  return p.tracks.find((t) => t.id === id) || null;
}

/** Clips live at time t on the given track (at most one, they can't overlap). */
export function clipAt(p, trackId, t) {
  return clipsOn(p, trackId).find((c) => t >= c.start && t < c.start + c.dur) || null;
}

/** Every clip alive at time t, bottom video track first — i.e. draw order. */
export function activeAt(p, t) {
  const order = new Map(p.tracks.map((tr, i) => [tr.id, i]));
  return p.clips
    .filter((c) => t >= c.start && t < c.start + c.dur)
    .sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0));
}

/*
 * Every clip alive at a moment, with compounds opened out.
 *
 * The renderer draws a compound by rendering its inner timeline, so it never
 * needs this. The audio graph does: sound has no equivalent of "draw this
 * canvas", so a compound's clips have to be reached individually and shifted
 * into the outer timeline's clock. Without it a grouped sequence looks right
 * and plays silent, which is the kind of bug people find after exporting.
 */
export function audibleAt(p, t, { depth = 0 } = {}) {
  const out = [];
  for (const clip of activeAt(p, t)) {
    if (clip.kind !== 'compound') { out.push(clip); continue; }
    if (!clip.inner?.clips?.length || depth > 6) continue;
    const speed = clip.speed || 1;
    const innerT = (t - clip.start) * speed + (clip.in || 0);
    for (const child of audibleAt(clip.inner, innerT, { depth: depth + 1 })) {
      /*
       * A copy, shifted and scaled into the outer clock, not the clip itself.
       *
       * The audio engine keys its graph on the clip object, and handing it the
       * same object at two different times is how one of them ends up playing
       * at the other's offset.
       */
      out.push({
        ...child,
        id: `${clip.id}/${child.id}`,
        start: clip.start + (child.start - (clip.in || 0)) / speed,
        dur: child.dur / speed,
        speed: (child.speed || 1) * speed,
        trackId: clip.trackId,
        volume: (child.volume ?? 1) * (clip.volume ?? 1),
        _fromCompound: clip.id,
      });
    }
  }
  return out;
}

/**
 * Speed at a moment inside a clip.
 *
 * A flat `speed` is the common case. `speedKeys` — [{t, v}] in clip-local
 * seconds — is a real ramp: the speed changes continuously through the shot,
 * which is what a velocity edit and a slow-motion highlight both need and what
 * a speed dropdown cannot express.
 */
export function speedAt(clip, localT) {
  const keys = clip.speedKeys;
  if (!keys?.length) return clip.speed || 1;
  if (keys.length === 1) return keys[0].v;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  if (localT <= sorted[0].t) return sorted[0].v;
  if (localT >= sorted.at(-1).t) return sorted.at(-1).v;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (localT >= a.t && localT <= b.t) {
      const f = (localT - a.t) / ((b.t - a.t) || 1);
      // Smoothstep, so a ramp accelerates into and out of its extremes rather
      // than changing rate abruptly at each key.
      const e = f * f * (3 - 2 * f);
      return a.v + (b.v - a.v) * e;
    }
  }
  return clip.speed || 1;
}

/** How much source a clip consumes between two local times. */
function consumed(clip, fromLocal, toLocal, samples = 48) {
  const span = toLocal - fromLocal;
  if (span <= 0) return 0;
  const step = span / samples;
  let acc = 0;
  for (let i = 0; i < samples; i++) acc += speedAt(clip, fromLocal + step * (i + 0.5)) * step;
  return acc;
}

/**
 * Where in the source file we are at timeline time t.
 * Speed, speed ramps and reverse all fold into this one function so nothing
 * downstream has to think about them.
 */
export function sourceTime(clip, t) {
  const local = clamp(t - clip.start, 0, clip.dur);

  if (clip.speedKeys?.length) {
    const total = consumed(clip, 0, clip.dur);
    const used = consumed(clip, 0, local);
    return clip.in + (clip.reversed ? total - used : used);
  }

  const speed = clip.speed || 1;
  const off = clip.reversed ? (clip.dur - local) * speed : local * speed;
  return clip.in + off;
}

/** Total source seconds a clip uses — what a trim has to stay inside. */
export function sourceSpan(clip) {
  return clip.speedKeys?.length ? consumed(clip, 0, clip.dur) : clip.dur * (clip.speed || 1);
}

/* ------------------------------------------------------------------ */
/* mutations — every one takes the project and returns it, mutated      */
/* ------------------------------------------------------------------ */

export function addTrack(p, kind = 'video', name) {
  const same = p.tracks.filter((t) => t.kind === kind);
  const track = {
    id: uid(kind === 'video' ? 'v' : 'a'),
    kind,
    name: name || `${kind === 'video' ? 'Video' : 'Audio'} ${same.length + 1}`,
    height: kind === 'video' ? 62 : 46,
    muted: false, hidden: false, locked: false,
  };
  // Video tracks stack upward, audio stays underneath — the usual arrangement.
  if (kind === 'video') p.tracks.unshift(track);
  else p.tracks.push(track);
  return track;
}

export function removeTrack(p, trackId) {
  if (p.tracks.length <= 1) return false;
  p.tracks = p.tracks.filter((t) => t.id !== trackId);
  p.clips = p.clips.filter((c) => c.trackId !== trackId);
  return true;
}

/** Next free slot on a track at or after `from`. */
export function nextFreeStart(p, trackId, from = 0, length = 0) {
  const list = clipsOn(p, trackId);
  let t = from;
  for (const c of list) {
    if (t + length <= c.start) break;
    if (t < c.start + c.dur) t = c.start + c.dur;
  }
  return t;
}

export function addClip(p, {
  mediaId, trackId, start, dur: d, in: inPoint = 0, kind = 'clip', text = null, sticker = null,
}) {
  const clip = {
    id: uid('c'),
    kind,
    mediaId: mediaId || null,
    trackId,
    start: Math.max(0, start),
    dur: Math.max(0.05, d),
    in: Math.max(0, inPoint),
    speed: 1,
    reversed: false,
    transform: defaultTransform(),
    color: defaultColor(),
    /* Shape masks: power windows for the grade, or the outline of the layer
       itself. Empty on every clip until somebody draws one. */
    masks: [],
    /*
     * Extra correctors, in series after the clip's own grade.
     *
     * Empty on every clip, and that is the point: `color` and `masks` above
     * are corrector one, exactly as they always were, so every project ever
     * saved still opens and still grades identically. A second corrector is
     * only ever a thing somebody asked for, and then it is a real one — its
     * own wheels, its own windows, its own qualifier, reading the output of
     * the corrector before it. That serial chain is the difference between a
     * colour panel and a grading suite: you cannot key the sky, push it, and
     * then key the skin out of the result with a single set of controls.
     */
    grades: [],
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transitionIn: null,
    transitionOut: null,
    keyframes: {},
    effects: [],
    /* One creative audio filter per clip — underwater, telephone, cathedral.
       Null means the clip is heard as recorded. See engine/audio-fx.js. */
    audioFx: null,
    /* The technical half: EQ, compressor, limiter, pan. Null until somebody
       touches it, so a clip costs nothing to carry. See audio-strip.js. */
    strip: null,
    text,
    sticker,
    label: null,
  };
  p.clips.push(clip);
  return clip;
}

/**
 * Split at timeline time t. Returns the new right-hand clip, or null when t
 * isn't strictly inside a clip (splitting exactly on an edge does nothing,
 * which is what people expect and what stops stray zero-length clips).
 */
export function splitClip(p, clipId, t) {
  const c = clipById(p, clipId);
  if (!c) return null;
  const local = t - c.start;
  if (local <= 0.02 || local >= c.dur - 0.02) return null;

  const right = structuredClone(c);
  right.id = uid('c');
  right.start = t;
  right.dur = c.dur - local;
  right.in = sourceTime(c, t);
  right.fadeIn = 0;
  right.transitionIn = null;
  right.keyframes = shiftKeyframes(c.keyframes, -local, right.dur);

  c.dur = local;
  c.fadeOut = 0;
  c.transitionOut = null;
  c.keyframes = cropKeyframes(c.keyframes, 0, local);

  p.clips.push(right);
  return right;
}

/** Keyframe times are clip-relative, so a split has to move and clip them. */
function shiftKeyframes(kf, delta, maxT) {
  const out = {};
  for (const [prop, list] of Object.entries(kf || {})) {
    const moved = list.map((k) => ({ ...k, t: k.t + delta })).filter((k) => k.t >= -0.001 && k.t <= maxT + 0.001);
    if (moved.length) out[prop] = moved;
  }
  return out;
}
function cropKeyframes(kf, from, to) {
  const out = {};
  for (const [prop, list] of Object.entries(kf || {})) {
    const kept = list.filter((k) => k.t >= from - 0.001 && k.t <= to + 0.001);
    if (kept.length) out[prop] = kept;
  }
  return out;
}

/** Trim an edge. `edge` is 'l' or 'r'; delta is in seconds on the timeline. */
export function trimClip(p, clipId, edge, delta, { ripple = false, minDur = 0.08 } = {}) {
  const c = clipById(p, clipId);
  if (!c) return;
  const media = mediaById(p, c.mediaId);
  const speed = c.speed || 1;

  if (edge === 'l') {
    // Can't pull the head back past the start of the source file.
    const maxLeft = c.kind === 'clip' && media ? c.in / speed : Infinity;
    const d = clamp(delta, -maxLeft, c.dur - minDur);
    c.start += d;
    c.dur -= d;
    if (c.kind === 'clip') c.in += d * speed;
  } else {
    const room = c.kind === 'clip' && media && media.duration
      ? (media.duration - c.in) / speed - c.dur
      : Infinity;
    const d = clamp(delta, minDur - c.dur, room);
    c.dur += d;
    if (ripple) shiftAfter(p, c.trackId, c.start + c.dur - d, d, c.id);
  }
}

/* ------------------------------------------------------------------ */
/* compound clips                                                      */
/* ------------------------------------------------------------------ */

/*
 * A compound clip is a timeline inside a clip.
 *
 * The job it does is not "tidiness": it is that a sequence you have finished
 * with should behave like one thing. Ten shots that make a title sequence want
 * to be dragged, graded, sped up and reused as a unit, and doing any of that to
 * ten clips is ten chances to get one of them wrong.
 *
 * The inner timeline is a real project — same shape, same clips, same tracks —
 * so everything that already works on a project works inside one, including
 * another compound. It carries no media of its own; the media stays in the
 * outer project's pool, which is what stops grouping from duplicating a file
 * and what lets ungrouping put the clips straight back.
 */

/** Everything selected, gathered into one clip on the timeline. */
export function makeCompound(p, ids, { name = 'Compound' } = {}) {
  const picked = ids.map((id) => clipById(p, id)).filter(Boolean);
  if (picked.length < 2) return null;

  const from = Math.min(...picked.map((c) => c.start));
  const to = Math.max(...picked.map((c) => c.start + c.dur));

  /*
   * Which tracks come along: the ones the clips are actually on, in the same
   * order. Copying every track would leave empty layers inside a compound that
   * exist for no reason and show up as rows in the timeline when it is opened.
   */
  const usedIds = new Set(picked.map((c) => c.trackId));
  const tracks = p.tracks.filter((t) => usedIds.has(t.id)).map((t) => ({ ...t }));

  const inner = {
    schema: SCHEMA,
    name,
    settings: { ...p.settings },
    tracks,
    // Rebased to zero, so the inside of a compound starts at its own start
    // rather than carrying the outer timeline's offset around forever.
    clips: picked.map((c) => ({ ...structuredClone(c), start: c.start - from })),
    markers: (p.markers || [])
      .filter((m) => m.t >= from && m.t <= to)
      .map((m) => ({ ...m, t: m.t - from })),
    captions: [],
  };

  // The clips leave the outer timeline; the media does not.
  removeClips(p, picked.map((c) => c.id));

  const host = addClip(p, {
    mediaId: null,
    trackId: tracks.find((t) => t.kind === 'video')?.id || picked[0].trackId,
    start: from,
    dur: Math.max(0.08, to - from),
    in: 0,
    kind: 'compound',
  });
  host.inner = inner;
  host.label = name;
  return host;
}

/** Put a compound's clips back on the timeline and remove the wrapper. */
export function breakCompound(p, clipId) {
  const host = clipById(p, clipId);
  if (!host || host.kind !== 'compound' || !host.inner) return [];

  const made = [];
  for (const c of host.inner.clips) {
    // Any layer the compound used that no longer exists outside comes back.
    let track = trackById(p, c.trackId);
    if (!track) {
      const spec = host.inner.tracks.find((t) => t.id === c.trackId);
      track = addTrack(p, spec?.kind || 'video', spec?.name);
    }
    const fresh = addClip(p, {
      mediaId: c.mediaId, trackId: track.id,
      start: host.start + c.start, dur: c.dur, in: c.in,
      kind: c.kind, text: c.text, sticker: c.sticker,
    });
    Object.assign(fresh, structuredClone({
      ...c, id: fresh.id, trackId: fresh.trackId, start: fresh.start,
    }));
    made.push(fresh);
  }
  removeClips(p, [host.id]);
  return made;
}

/** How long a compound's contents run, ignoring where the wrapper was trimmed. */
export function innerDuration(clip) {
  const inner = clip?.inner;
  if (!inner?.clips?.length) return 0;
  return Math.max(...inner.clips.map((c) => c.start + c.dur));
}

/* ------------------------------------------------------------------ */
/* the four trims                                                      */
/* ------------------------------------------------------------------ */

/*
 * Ripple, roll, slip and slide.
 *
 * These four are the whole vocabulary of editing, and an editor without them
 * is a toy no matter how many effects it ships with. Each answers a different
 * question, and the difference between them is exactly which of three things
 * is allowed to change — what you see, where it sits, and how long everything
 * after it is:
 *
 *   ripple  the clip gets longer or shorter and everything after it moves.
 *           The edit changes length. This is "make this shot longer".
 *   roll    the cut between two clips moves. One grows by what the other
 *           loses, so nothing after it moves at all. This is "cut a beat
 *           later" — the single most common trim in a finished edit.
 *   slip    the clip stays exactly where it is and exactly as long, and a
 *           different part of the source plays in it. This is "same hole,
 *           different moment".
 *   slide   the clip keeps its content and length and moves in time, while
 *           its neighbours absorb the movement. This is "this reaction lands
 *           too early".
 *
 * All four refuse rather than approximate when the media runs out. A trim that
 * silently gives you less than you asked for leaves you checking every edit by
 * eye, which is worse than being told no.
 */

/** How much handle a clip has either side: unused source before and after. */
export function handles(p, clip) {
  const media = mediaById(p, clip.mediaId);
  const speed = clip.speed || 1;
  if (clip.kind !== 'clip' || !media?.duration) return { head: Infinity, tail: Infinity };
  return {
    head: Math.max(0, clip.in / speed),
    tail: Math.max(0, (media.duration - clip.in) / speed - clip.dur),
  };
}

/** The clip immediately before this one on its track, touching or not. */
export function neighbourBefore(p, clip) {
  return clipsOn(p, clip.trackId)
    .filter((c) => c.id !== clip.id && c.start + c.dur <= clip.start + 0.0005)
    .sort((a, b) => (b.start + b.dur) - (a.start + a.dur))[0] || null;
}

export function neighbourAfter(p, clip) {
  return clipsOn(p, clip.trackId)
    .filter((c) => c.id !== clip.id && c.start >= clip.start + clip.dur - 0.0005)
    .sort((a, b) => a.start - b.start)[0] || null;
}

/**
 * Move the cut between this clip and its neighbour.
 *
 * The one trim that changes nothing downstream: whatever one clip gains the
 * other gives up, so every frame after the pair stays exactly where it was.
 * Returns how far it actually moved, which is not always how far you asked.
 */
export function rollEdit(p, clipId, edge, delta, { minDur = 0.08 } = {}) {
  const c = clipById(p, clipId);
  if (!c) return 0;
  const other = edge === 'l' ? neighbourBefore(p, c) : neighbourAfter(p, c);
  if (!other) return 0;
  // Only a real cut can be rolled. Two clips with a gap between them share no
  // edit point, and pretending otherwise would silently close the gap.
  const touching = edge === 'l'
    ? Math.abs(other.start + other.dur - c.start) < 0.002
    : Math.abs(c.start + c.dur - other.start) < 0.002;
  if (!touching) return 0;

  const cHandles = handles(p, c);
  const oHandles = handles(p, other);
  const speed = c.speed || 1;
  const oSpeed = other.speed || 1;

  let d = delta;
  if (edge === 'l') {
    // Moving left: this clip grows off its head, the one before gives up tail.
    d = clamp(d, Math.max(-cHandles.head, -(other.dur - minDur)),
                 Math.min(oHandles.tail, c.dur - minDur));
    c.start += d; c.dur -= d; c.in += d * speed;
    other.dur += d;
  } else {
    d = clamp(d, Math.max(-(c.dur - minDur), -oHandles.head),
                 Math.min(cHandles.tail, other.dur - minDur));
    c.dur += d;
    other.start += d; other.dur -= d; other.in += d * oSpeed;
  }
  return d;
}

/**
 * Change which part of the source plays, without moving the clip.
 *
 * Positive slips the source later — you see a moment further into the take, in
 * the same slot. Bounded by the handles either side, because there is no
 * footage outside the file.
 */
export function slipClip(p, clipId, delta) {
  const c = clipById(p, clipId);
  if (!c || c.kind !== 'clip') return 0;
  const { head, tail } = handles(p, c);
  const d = clamp(delta, -head, tail);
  c.in += d * (c.speed || 1);
  return d;
}

/**
 * Move the clip in time while its neighbours absorb it.
 *
 * The clip's own content and length never change; the one before gets longer
 * or shorter and the one after does the opposite. Needs a neighbour on both
 * sides with handles to spend, and says how far it got.
 */
export function slideClip(p, clipId, delta, { minDur = 0.08 } = {}) {
  const c = clipById(p, clipId);
  if (!c) return 0;
  const before = neighbourBefore(p, c);
  const after = neighbourAfter(p, c);
  const touchBefore = before && Math.abs(before.start + before.dur - c.start) < 0.002;
  const touchAfter = after && Math.abs(c.start + c.dur - after.start) < 0.002;

  let lo = -Infinity, hi = Infinity;
  if (touchBefore) {
    lo = Math.max(lo, -(before.dur - minDur));
    hi = Math.min(hi, handles(p, before).tail);
  } else {
    lo = Math.max(lo, -c.start);                 // nothing before: stop at zero
  }
  if (touchAfter) {
    const h = handles(p, after);
    lo = Math.max(lo, -h.head);
    hi = Math.min(hi, after.dur - minDur);
  }
  if (!touchBefore && !touchAfter) return 0;     // nothing to slide against

  const d = clamp(delta, lo, hi);
  if (!d) return 0;
  c.start += d;
  if (touchBefore) before.dur += d;
  if (touchAfter) {
    after.start += d;
    after.dur -= d;
    after.in += d * (after.speed || 1);
  }
  return d;
}

/**
 * Ripple: trim an edge and move everything after it by the same amount.
 *
 * The existing trimClip rippled on the right edge only, which meant trimming a
 * head left a hole that had to be closed by hand — and closing it by hand is
 * how sync gets lost on a long timeline.
 */
export function rippleTrim(p, clipId, edge, delta, { minDur = 0.08 } = {}) {
  const c = clipById(p, clipId);
  if (!c) return 0;
  const { head, tail } = handles(p, c);

  if (edge === 'l') {
    const d = clamp(delta, -head, c.dur - minDur);
    if (!d) return 0;
    c.start += d; c.dur -= d;
    if (c.kind === 'clip') c.in += d * (c.speed || 1);
    // The head moved, so everything from here on moves with it — including
    // this clip, which is why it slides back to where its head now is.
    c.start -= d;
    shiftAfter(p, c.trackId, c.start + c.dur + 0.0001, -d, c.id);
    return d;
  }
  const d = clamp(delta, minDur - c.dur, tail);
  if (!d) return 0;
  c.dur += d;
  shiftAfter(p, c.trackId, c.start + c.dur - d + 0.0001, d, c.id);
  return d;
}

/** Push every clip on a track that starts at or after `from` by `delta`. */
export function shiftAfter(p, trackId, from, delta, exceptId = null) {
  for (const c of p.clips) {
    if (c.trackId !== trackId || c.id === exceptId) continue;
    if (c.start >= from - 0.0001) c.start = Math.max(0, c.start + delta);
  }
}

/** Move a clip, refusing overlaps by nudging it to the nearest free spot. */
export function moveClip(p, clipId, { start, trackId }) {
  const c = clipById(p, clipId);
  if (!c) return;
  const target = trackId || c.trackId;
  const track = trackById(p, target);
  if (!track) return;
  /*
   * A video clip dropped on an audio track becomes audio only.
   *
   * This is not a special mode — it falls out of how the app already works.
   * The renderer only draws clips whose track is a video track, and the audio
   * engine plays anything with sound wherever it sits. So a clip on an audio
   * track is silent-picture-free by construction: you hear it, you do not see
   * it. Drag it back up and the picture returns, because nothing was thrown
   * away.
   *
   * It is also the single most common thing people want from a timeline —
   * take the sound off this shot and keep it under the others — and it used to
   * be refused outright as though it were a slip of the hand.
   *
   * The reverse still is one. A music file on a video track would draw
   * nothing, so all it can produce is a black hole in the picture with no clue
   * why, which is never what anybody meant.
   */
  if (c.kind === 'audio' && track.kind !== 'audio') return;

  c.trackId = target;
  c.start = Math.max(0, start);
  resolveOverlaps(p, target, c.id);
}

/** After a move, push neighbours out of the way rather than stacking clips. */
function resolveOverlaps(p, trackId, movedId) {
  const list = clipsOn(p, trackId);
  const moved = clipById(p, movedId);
  if (!moved) return;
  for (const c of list) {
    if (c.id === movedId) continue;
    const overlap = Math.min(c.start + c.dur, moved.start + moved.dur) - Math.max(c.start, moved.start);
    if (overlap <= 0.001) continue;
    if (c.start < moved.start) c.start = Math.max(0, moved.start - c.dur);
    else c.start = moved.start + moved.dur;
  }
}

export function removeClips(p, ids, { ripple = false } = {}) {
  const set = new Set(ids);
  const doomed = p.clips.filter((c) => set.has(c.id));
  p.clips = p.clips.filter((c) => !set.has(c.id));
  if (!ripple) return;
  // Close the gaps, newest-first so earlier shifts don't move the target.
  for (const c of doomed.sort((a, b) => b.start - a.start)) {
    shiftAfter(p, c.trackId, c.start + c.dur - 0.0001, -c.dur);
  }
}

export function duplicateClips(p, ids) {
  const made = [];
  for (const id of ids) {
    const c = clipById(p, id);
    if (!c) continue;
    const copy = structuredClone(c);
    copy.id = uid('c');
    copy.start = nextFreeStart(p, c.trackId, c.start + c.dur, c.dur);
    p.clips.push(copy);
    made.push(copy);
  }
  return made;
}

/** Close every gap on a track, in order. */
export function closeGaps(p, trackId) {
  let t = 0;
  for (const c of clipsOn(p, trackId)) { c.start = t; t += c.dur; }
}

/* ------------------------------------------------------------------ */
/* snapping                                                            */
/* ------------------------------------------------------------------ */

/** Every edge worth snapping to: clip edges, markers, the playhead, zero. */
export function snapPoints(p, { exclude = [], playhead = null } = {}) {
  const skip = new Set(exclude);
  const pts = [0];
  for (const c of p.clips) {
    if (skip.has(c.id)) continue;
    pts.push(c.start, c.start + c.dur);
  }
  for (const m of p.markers) pts.push(m.t);
  if (playhead !== null) pts.push(playhead);
  return pts;
}

export function snapTo(value, points, tolerance) {
  let best = value, bestD = tolerance;
  for (const pt of points) {
    const d = Math.abs(pt - value);
    if (d < bestD) { bestD = d; best = pt; }
  }
  return { value: best, snapped: best !== value };
}

/* ------------------------------------------------------------------ */
/* keyframes                                                           */
/* ------------------------------------------------------------------ */

const EASES = {
  linear: (t) => t,
  ease: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  hold: () => 0,
};

/** Value of a keyframed property at clip-relative time t, or `fallback`. */
export function valueAt(clip, prop, t, fallback) {
  const list = clip.keyframes?.[prop];
  if (!list || !list.length) return fallback;
  const sorted = [...list].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].v;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].v;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const f = (EASES[a.ease || 'ease'] || EASES.ease)((t - a.t) / span);
      return a.v + (b.v - a.v) * f;
    }
  }
  return fallback;
}

export function setKeyframe(clip, prop, t, v, ease = 'ease') {
  const list = clip.keyframes[prop] || (clip.keyframes[prop] = []);
  const existing = list.find((k) => Math.abs(k.t - t) < 0.02);
  if (existing) { existing.v = v; existing.ease = ease; }
  else list.push({ t, v, ease });
  list.sort((a, b) => a.t - b.t);
}

export function clearKeyframes(clip, prop) {
  if (prop) delete clip.keyframes[prop];
  else clip.keyframes = {};
}

/**
 * The clip's grade at a moment, with any keyframed channel resolved.
 *
 * Returns the very same object when nothing on the grade is animated, which is
 * almost always — the renderer calls this once per clip per frame, and a
 * spread there would allocate a fresh object sixty times a second for every
 * layer on screen, for nothing.
 */
export function animatedColor(clip, t) {
  const keys = clip.keyframes;
  if (!keys) return clip.color;
  let out = null;
  for (const prop in keys) {
    if (!prop.startsWith('color.')) continue;
    const field = prop.slice(6);
    out ||= { ...clip.color };
    out[field] = valueAt(clip, prop, t, clip.color[field]);
  }
  return out || clip.color;
}

/* ------------------------------------------------------------------ */
/* the grade chain                                                      */
/* ------------------------------------------------------------------ */

/**
 * A new corrector, neutral, with nothing selected.
 *
 * Shaped like the part of a clip that gets graded — `color` and `masks` —
 * rather than like a clip, because that is exactly what the renderer and the
 * matte builder already know how to read. A corrector can therefore be handed
 * to `combinedMatte` in place of a clip and it simply works.
 */
export function newGradeNode(label = '') {
  return {
    id: uid('n'),
    label,
    on: true,
    color: defaultColor(),
    masks: [],
  };
}

/**
 * The whole chain, corrector one first.
 *
 * Corrector one is not stored — it *is* the clip's own `color` and `masks`,
 * presented here under a node's name so the graph has one kind of thing in it
 * instead of two. `base: true` marks it, because it cannot be deleted and its
 * edits go somewhere different.
 */
export function gradeNodes(clip) {
  if (!clip) return [];
  const base = {
    id: `${clip.id}:base`,
    base: true,
    label: 'Corrector 1',
    on: clip.gradeOn !== false,
    color: clip.color,
    masks: clip.masks || [],
  };
  return [base, ...(clip.grades || []).map((n, i) => ({ ...n, label: n.label || `Corrector ${i + 2}` }))];
}

/** Add a corrector to the end of the chain and return it. */
export function addGradeNode(clip, label) {
  clip.grades ||= [];
  const node = newGradeNode(label);
  clip.grades.push(node);
  return node;
}

export function removeGradeNode(clip, id) {
  if (!clip.grades) return clip;
  clip.grades = clip.grades.filter((n) => n.id !== id);
  return clip;
}

/** Find one corrector by id, base included. */
export function gradeNodeById(clip, id) {
  return gradeNodes(clip).find((n) => n.id === id) || null;
}

/**
 * The live corrector for editing — the stored object, not the copy.
 *
 * `gradeNodes` spreads the extra correctors so the base can be synthesised
 * alongside them, which means writing to what it returns writes to a copy and
 * nothing happens. Anything that edits has to come through here.
 */
export function liveGradeNode(clip, id) {
  if (!clip) return null;
  if (!id || id === `${clip.id}:base`) return clip;          // the clip itself is corrector one
  return (clip.grades || []).find((n) => n.id === id) || null;
}

/**
 * Read whatever `transform.x` or `color.exposure` or `effects.glow.amount`
 * points at. One dotted path resolver, so the keyframe UI never has to know
 * the shape of a clip.
 */
export function readPath(clip, path) {
  const parts = path.split('.');
  if (parts[0] === 'effects') {
    const fx = clip.effects?.find((f) => f.id === parts[1]);
    return fx?.params?.[parts[2]];
  }
  let node = clip;
  for (const part of parts) {
    if (node == null) return undefined;
    node = node[part];
  }
  return node;
}

/** The writing half of readPath. Used when a keyframe is scrubbed onto a clip. */
export function writePath(clip, path, value) {
  const parts = path.split('.');
  if (parts[0] === 'effects') {
    const fx = clip.effects?.find((f) => f.id === parts[1]);
    if (fx) (fx.params ||= {})[parts[2]] = value;
    return;
  }
  let node = clip;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] ||= {};
  node[parts[parts.length - 1]] = value;
}

/** Move one keyframe in time, keeping the list sorted. */
export function moveKeyframe(clip, prop, from, to) {
  const list = clip.keyframes?.[prop];
  if (!list) return;
  const k = list.find((x) => Math.abs(x.t - from) < 0.0005);
  if (!k) return;
  k.t = Math.max(0, Math.min(clip.dur, to));
  list.sort((a, b) => a.t - b.t);
}

/** Remove one keyframe, and the property itself once its last key is gone. */
export function removeKeyframe(clip, prop, t) {
  const list = clip.keyframes?.[prop];
  if (!list) return;
  const i = list.findIndex((k) => Math.abs(k.t - t) < 0.0005);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) delete clip.keyframes[prop];
}

/** The list of eases a key can carry, in the order the UI cycles them. */
export const EASE_NAMES = ['linear', 'ease', 'in', 'out', 'hold'];

/* ------------------------------------------------------------------ */
/* serialisation                                                       */
/* ------------------------------------------------------------------ */

/** What gets written to disk: everything but the runtime-only media handles. */
export function serialize(p) {
  return JSON.stringify({
    ...p,
    media: p.media.map(({ el: _el, blob: _blob, objectUrl: _url, buffer: _buf, ...rest }) => rest),
  }, null, 2);
}

export function deserialize(json) {
  const p = typeof json === 'string' ? JSON.parse(json) : json;
  if (!p || typeof p !== 'object' || !Array.isArray(p.clips)) {
    throw new Error('That file is not an OmniDx project.');
  }
  return migrate(p);
}

/** Fill in anything a newer schema added, so old projects always open. */
function migrate(p) {
  p.schema = SCHEMA;
  p.settings = { fps: 30, background: '#000000', sampleRate: 48000, ...(p.settings || {}) };
  if (!p.settings.width) {
    const r = RATIOS[p.settings.ratio] || RATIOS['9:16'];
    p.settings.width = r.w; p.settings.height = r.h;
  }
  p.markers ||= [];
  p.captions ||= [];
  p.motionTracks ||= [];
  p.media ||= [];
  for (const c of p.clips) {
    c.transform = { ...defaultTransform(), ...(c.transform || {}) };
    c.color = { ...defaultColor(), ...(c.color || {}) };
    // Projects saved before masks existed have neither; both are optional
    // everywhere they are read, so the default is simply "none".
    c.masks ||= [];
    c.keyframes ||= {};
    c.effects ||= [];
    c.audioFx ??= null;
    c.speed ??= 1;
    if (c.speedKeys && !Array.isArray(c.speedKeys)) c.speedKeys = null;
    c.volume ??= 1;
    c.fadeIn ??= 0;
    c.fadeOut ??= 0;
    c.kind ||= 'clip';
  }
  return p;
}
