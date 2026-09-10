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
  // A video clip on an audio track (or the reverse) is almost always a slip of
  // the hand, so it just doesn't happen.
  const wants = c.kind === 'audio' ? 'audio' : 'video';
  if (c.kind !== 'audio' && track.kind !== 'video' && wants === 'video') return;
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
