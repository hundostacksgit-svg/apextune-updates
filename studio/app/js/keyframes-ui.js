/*
 * Keyframes on the timeline, the way a compositor expects them.
 *
 * The keyframe machinery already existed — the renderer has read animated
 * values for a long time. What did not exist was anywhere to *see* them. They
 * lived behind four buttons in the inspector and a line of text saying "3
 * keys", which tells you an animation exists but nothing about its shape, and
 * gives you no way to move one key a third of a second later.
 *
 * That is the whole difference between a phone editor and a finishing tool.
 * So: expand a clip and its animatable properties unfold underneath it as
 * their own lanes, each key a diamond you can drag, at the same scale and
 * scrolled by the same bar as the clip it belongs to. Two properties animated
 * at once are two lanes stacked, and you can see the offset between them —
 * which is the only reason anybody looks at keyframes in the first place.
 *
 * The graph editor is the other half. Diamonds tell you when; only a curve
 * tells you how fast, and "how fast" is the entire craft of a move.
 */

import { $, el, drag, clamp } from './ui.js';
import { CONTROLS } from './engine/filters.js';
import { EFFECTS } from './engine/effects.js';
import {
  readPath, setKeyframe, moveKeyframe, removeKeyframe, clearKeyframes, valueAt, EASE_NAMES,
} from './engine/project.js';

export const LANE_H = 22;          // one property row
export const GRAPH_H = 150;        // the curve editor, when it is open

/* Which clips have their properties unfolded, and which keys are selected. */
const expanded = new Set();
let graphOpen = false;
/** `${clipId}|${prop}|${t}` for each selected key — the time is the identity. */
let picked = new Set();

export function isExpanded(id) { return expanded.has(id); }
export function anyExpanded() { return expanded.size > 0; }
export function isGraphOpen() { return graphOpen && expanded.size > 0; }

export function toggleExpanded(id) {
  if (expanded.has(id)) expanded.delete(id);
  else expanded.add(id);
  if (!expanded.size) graphOpen = false;
}

export function setGraph(on) { graphOpen = on; }

/** Forget clips that are no longer in the project, so the set can't grow forever. */
export function prune(project) {
  for (const id of [...expanded]) {
    if (!project.clips.some((c) => c.id === id)) expanded.delete(id);
  }
  if (!expanded.size) graphOpen = false;
}

/* ------------------------------------------------------------------ */
/* what a clip can animate                                             */
/* ------------------------------------------------------------------ */

const TRANSFORM = [
  { prop: 'transform.x', label: 'Position X', min: -1, max: 1, step: 0.002, def: 0,
    fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'transform.y', label: 'Position Y', min: -1, max: 1, step: 0.002, def: 0,
    fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'transform.scale', label: 'Scale', min: 0.05, max: 6, step: 0.01, def: 1,
    fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'transform.rotate', label: 'Rotation', min: -720, max: 720, step: 0.5, def: 0,
    fmt: (v) => `${v.toFixed(1)}°` },
  { prop: 'transform.opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, def: 1,
    fmt: (v) => `${(v * 100).toFixed(0)}%` },
];

const VOLUME = {
  prop: 'volume', label: 'Volume', min: 0, max: 2, step: 0.01, def: 1,
  fmt: (v) => `${(v * 100).toFixed(0)}%`,
};

/*
 * The grade channels worth animating.
 *
 * Not all ten: grain and sharpen ramping over a shot is a thing almost nobody
 * wants, and every row that is never used is a row in the way of the five that
 * are. The rest stay reachable from the colour panel as they always were.
 */
const GRADE_KEYS = ['exposure', 'contrast', 'saturation', 'temperature', 'vignette', 'blur'];

/**
 * Every property this particular clip can animate, grouped the way the eye
 * reads a layer: where it is, how it looks, what is on top of it.
 */
export function propsFor(clip) {
  const out = [];
  const isAudio = clip.kind === 'audio';

  if (!isAudio) for (const p of TRANSFORM) out.push({ ...p, group: 'Transform' });
  out.push({ ...VOLUME, group: isAudio ? 'Audio' : 'Transform' });

  if (!isAudio) {
    for (const c of CONTROLS) {
      if (!GRADE_KEYS.includes(c.key)) continue;
      out.push({
        prop: `color.${c.key}`, label: c.label, min: c.min, max: c.max, step: 1, def: 0,
        group: 'Colour', fmt: (v) => v.toFixed(0),
      });
    }
  }

  for (const fx of clip.effects || []) {
    const def = EFFECTS[fx.id];
    if (!def?.params) continue;
    for (const [key, spec] of Object.entries(def.params)) {
      // A dropdown cannot be interpolated, so it is not offered as a lane —
      // a half-way point between "horizontal" and "vertical" does not exist.
      if (spec.type === 'select' || spec.type === 'color') continue;
      out.push({
        prop: `effects.${fx.id}.${key}`,
        label: `${def.name || fx.id} · ${spec.label || key}`,
        min: spec.min ?? 0, max: spec.max ?? 100, step: spec.step ?? 1,
        def: spec.def ?? 0, group: 'Effects',
        fmt: (v) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(0)),
      });
    }
  }
  return out;
}

/** Only the rows actually drawn: animated ones always, the rest on request. */
export function visibleProps(clip, showAll) {
  const all = propsFor(clip);
  if (showAll) return all;
  const animated = all.filter((p) => clip.keyframes?.[p.prop]?.length);
  return animated.length ? animated : all.filter((p) => p.group === 'Transform');
}

/* Per clip: whether every property is listed, or only the animated ones. */
const showingAll = new Set();
export function isShowingAll(id) { return showingAll.has(id); }
export function toggleShowAll(id) {
  if (showingAll.has(id)) showingAll.delete(id); else showingAll.add(id);
}

/** The live value of a property at the playhead, animation included. */
export function valueNow(clip, spec, time) {
  const local = clamp(time - clip.start, 0, clip.dur);
  const base = readPath(clip, spec.prop);
  const fallback = base === undefined || base === null ? spec.def : base;
  return valueAt(clip, spec.prop, local, fallback);
}

/* ------------------------------------------------------------------ */
/* the head column                                                     */
/* ------------------------------------------------------------------ */

/**
 * One row of controls per property: a stopwatch, the value now, and the
 * ◀ ◆ ▶ trio that walks between keys and drops one where the playhead is.
 */
export function headRows(clip, { time }) {
  const rows = [];
  const palette = paletteFor(clip);
  const specs = visibleProps(clip, showingAll.has(clip.id));
  const all = propsFor(clip);
  const animatedCount = all.filter((p) => clip.keyframes?.[p.prop]?.length).length;

  const header = el('div', { class: 'kf-head kf-title', style: `height:${LANE_H}px` });
  header.append(
    el('span', { class: 'kf-caret' }, '▾'),
    el('span', { class: 'kf-name' }, clip.label || 'Layer properties'),
    el('button', {
      class: `kf-mini ${showingAll.has(clip.id) ? 'on' : ''}`,
      'data-kf-all': clip.id,
      title: showingAll.has(clip.id) ? 'Show only animated properties' : 'Show every property',
    }, showingAll.has(clip.id) ? 'All' : `${animatedCount || 0}◆`),
    el('button', {
      class: `kf-mini ${graphOpen ? 'on' : ''}`, 'data-kf-graph': '1',
      title: 'Graph editor — drag the curve to change the speed of a move',
      'data-tip': 'The graph editor. Diamonds tell you when something changes; '
        + 'this tells you how fast. Drag a dot up or down to change the value, '
        + 'sideways to change the timing.',
    }, '∿'),
  );
  rows.push(header);

  let group = null;
  for (const spec of specs) {
    const keys = clip.keyframes?.[spec.prop] || [];
    const local = clamp(time - clip.start, 0, clip.dur);
    const onKey = keys.some((k) => Math.abs(k.t - local) < 0.02);
    const row = el('div', {
      class: `kf-head ${keys.length ? 'live' : ''}`, style: `height:${LANE_H}px`,
      'data-kf-prop': spec.prop, 'data-kf-clip': clip.id,
    });
    if (spec.group !== group) { row.classList.add('grp'); group = spec.group; }
    row.append(
      el('button', {
        class: `kf-watch ${keys.length ? 'on' : ''}`, 'data-kf-watch': spec.prop,
        title: keys.length ? 'Stop animating this — removes its keys' : 'Animate this property',
        'data-tip': keys.length
          ? 'Stop animating this. The value freezes at whatever it is right now.'
          : 'Start animating this. Press it, move the playhead somewhere else, '
            + 'change the value — and it moves between the two.',
      }, keys.length ? '⏱' : '⏲'),
      el('span', { class: 'kf-dot', style: `background:${palette.get(spec.prop)}` }),
      el('span', { class: 'kf-name', title: spec.label }, spec.label),
      el('span', { class: 'kf-val' }, spec.fmt(valueNow(clip, spec, time))),
      el('span', { class: 'kf-nav' },
        el('button', { 'data-kf-prev': spec.prop, title: 'Previous key' }, '◀'),
        el('button', {
          class: onKey ? 'on' : '', 'data-kf-toggle': spec.prop,
          title: onKey ? 'Remove the key here' : 'Add a key here',
        }, onKey ? '◆' : '◇'),
        el('button', { 'data-kf-next': spec.prop, title: 'Next key' }, '▶'),
      ),
    );
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* the lanes                                                           */
/* ------------------------------------------------------------------ */

const EASE_GLYPH = { linear: '◆', ease: '●', in: '◤', out: '◢', hold: '■' };

/**
 * The lanes themselves, aligned to the clip they belong to and to nothing
 * else. A key at clip-relative 0.5s draws at the same x as the frame it
 * changes, which is the only alignment that means anything.
 */
export function laneRows(clip, { toPx }) {
  const rows = [];
  const palette = paletteFor(clip);
  const specs = visibleProps(clip, showingAll.has(clip.id));
  const left = toPx(clip.start);
  const width = Math.max(4, toPx(clip.dur));

  const header = el('div', { class: 'kf-lane kf-lane-title', style: `height:${LANE_H}px` });
  const span = el('div', { class: 'kf-span' });
  span.style.left = `${left}px`; span.style.width = `${width}px`;
  header.appendChild(span);
  rows.push(header);

  for (const spec of specs) {
    const row = el('div', {
      class: 'kf-lane', style: `height:${LANE_H}px`,
      'data-kf-lane': spec.prop, 'data-kf-clip': clip.id,
    });
    const bed = el('div', { class: 'kf-bed' });
    bed.style.left = `${left}px`; bed.style.width = `${width}px`;
    row.appendChild(bed);

    const keys = clip.keyframes?.[spec.prop] || [];
    const hue = palette.get(spec.prop);
    // The line between the first and last key: the span that is animated, as
    // opposed to the span that merely exists.
    if (keys.length > 1) {
      const run = el('div', { class: 'kf-run' });
      run.style.left = `${left + toPx(keys[0].t)}px`;
      run.style.width = `${Math.max(2, toPx(keys[keys.length - 1].t - keys[0].t))}px`;
      run.style.background = hue;
      row.appendChild(run);
    }
    for (const k of keys) {
      const d = el('div', {
        class: `kf-key ${picked.has(`${clip.id}|${spec.prop}|${k.t}`) ? 'sel' : ''}`,
        'data-kf-key': String(k.t), 'data-kf-prop': spec.prop, 'data-kf-clip': clip.id,
        title: `${spec.label} · ${spec.fmt(k.v)} at ${k.t.toFixed(2)}s · ${k.ease || 'ease'}`
             + '\nDrag to retime · double-click to change the easing · Delete to remove',
      }, EASE_GLYPH[k.ease || 'ease'] || '◆');
      d.style.left = `${left + toPx(k.t)}px`;
      d.style.color = hue;
      row.appendChild(d);
    }
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* the graph editor                                                    */
/* ------------------------------------------------------------------ */

/**
 * Every animated property of a clip drawn as a curve over the same time axis
 * as the lanes above it, each normalised into its own full height so a
 * rotation of 180° and an opacity of 0.4 are comparable as *shapes*.
 */
export function graphRow(clip, { toPx, time }) {
  const row = el('div', { class: 'kf-graph', style: `height:${GRAPH_H}px`, 'data-kf-clip': clip.id });
  const left = toPx(clip.start);
  const width = Math.max(4, toPx(clip.dur));
  const box = el('div', { class: 'kf-graph-box' });
  box.style.left = `${left}px`; box.style.width = `${width}px`;

  const palette = paletteFor(clip);
  const specs = propsFor(clip).filter((s) => clip.keyframes?.[s.prop]?.length);
  const cv = el('canvas', { class: 'kf-graph-cv' });
  const w = Math.max(2, Math.round(width));
  const h = GRAPH_H - 12;
  cv.width = w; cv.height = h;
  cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  drawGraph(cv.getContext('2d'), clip, specs, w, h, palette);
  box.appendChild(cv);

  // A dot per key, on top of the canvas, because a key you can only look at is
  // a chart — dragging one in two axes at once is what makes it an editor.
  for (const spec of specs) {
    const { lo, hi } = graphRange(clip, spec);
    for (const k of clip.keyframes[spec.prop]) {
      const dot = el('div', {
        class: `kf-gk ${picked.has(`${clip.id}|${spec.prop}|${k.t}`) ? 'sel' : ''}`,
        'data-kf-gk': String(k.t), 'data-kf-prop': spec.prop, 'data-kf-clip': clip.id,
        title: `${spec.label} · ${spec.fmt(k.v)}\nDrag sideways to retime, up and down to change the value`,
      });
      dot.style.left = `${(k.t / clip.dur) * w}px`;
      dot.style.top = `${h - ((k.v - lo) / (hi - lo || 1)) * h}px`;
      dot.style.background = palette.get(spec.prop);
      box.appendChild(dot);
    }
  }

  if (!specs.length) {
    box.appendChild(el('div', { class: 'kf-graph-empty' },
      'Nothing is animated on this clip yet. Press a stopwatch on the left, '
      + 'move the playhead, change the value — and the curve appears here.'));
  }

  row.appendChild(box);
  return row;
}

/** A property's own value range, padded, so a flat line is not a divide by zero. */
export function graphRange(clip, spec) {
  const keys = clip.keyframes?.[spec.prop] || [];
  let lo = Infinity, hi = -Infinity;
  for (const k of keys) { lo = Math.min(lo, k.v); hi = Math.max(hi, k.v); }
  if (!keys.length) { lo = spec.min; hi = spec.max; }
  if (hi - lo < 1e-6) { const pad = Math.max(Math.abs(hi) * 0.2, spec.step * 10, 0.1); lo -= pad; hi += pad; }
  else { const pad = (hi - lo) * 0.12; lo -= pad; hi += pad; }
  return { lo, hi };
}

/*
 * A colour per property, spread by position rather than hashed from the name.
 *
 * The obvious move is to hash the name: no table to maintain across three
 * hundred effect parameters, and the same property keeps its colour forever.
 * I wrote that first, and it put Position X at hue 278 and Position Y at 279 —
 * one degree apart, and those two are the pair most likely to be on screen
 * together. A hash is stable and occasionally useless; the one thing the graph
 * has to do is let you tell two curves apart.
 *
 * So the hue walks the golden angle down the clip's own property list, which
 * spreads any number of them as far apart as they will go. The index comes
 * from the full list rather than the animated subset, so a colour only moves
 * when an effect is added — not every time a row is shown or hidden.
 */
export function paletteFor(clip) {
  const out = new Map();
  const all = propsFor(clip);
  all.forEach((spec, i) => {
    out.set(spec.prop, `hsl(${(i * 137.508 + 18) % 360} 74% ${i % 2 ? 66 : 58}%)`);
  });
  return out;
}

/** The colour one property is drawn in, on this clip. */
export function colourFor(prop, clip = null) {
  if (clip) return paletteFor(clip).get(prop) || 'hsl(205 74% 62%)';
  // No clip to position it in — used by tests and by anything that only has a
  // name. Stable, and good enough on its own.
  let n = 2166136261 >>> 0;
  for (let i = 0; i < prop.length; i++) { n ^= prop.charCodeAt(i); n = Math.imul(n, 16777619) >>> 0; }
  n = (n ^ (n >>> 15)) >>> 0;
  return `hsl(${n % 360} 74% 62%)`;
}

function drawGraph(ctx, clip, specs, w, h, palette) {
  ctx.clearRect(0, 0, w, h);

  // Time gridlines every half second, and a floor and ceiling to read against.
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1;
  const step = clip.dur > 8 ? 1 : clip.dur > 3 ? 0.5 : 0.25;
  for (let t = 0; t <= clip.dur; t += step) {
    const x = Math.round((t / clip.dur) * w) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (const f of [0, 0.5, 1]) {
    const y = Math.round(f * (h - 1)) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  for (const spec of specs) {
    const { lo, hi } = graphRange(clip, spec);
    ctx.strokeStyle = palette.get(spec.prop);
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Sampled rather than solved: the easing functions live in one place in
    // project.js, and asking them for the value is how the renderer gets it
    // too. A curve drawn from a second implementation is a curve that will
    // one day disagree with the picture.
    const steps = Math.max(24, Math.min(w, 420));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * clip.dur;
      const v = valueAt(clip, spec.prop, t, lo);
      const x = (i / steps) * w;
      const y = h - ((v - lo) / (hi - lo || 1)) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* gestures                                                            */
/* ------------------------------------------------------------------ */

/**
 * Everything you can do to a key, wired once onto the timeline element.
 *
 * `ctx` is the timeline: it owns the pixel/second conversion and the commit,
 * so this module never has to know the zoom or the undo stack.
 */
export function wire(root, ctx) {
  root.addEventListener('pointerdown', (e) => {
    const dot = e.target.closest('[data-kf-key]');
    if (dot) { dragKey(e, dot, ctx); return; }
    const gk = e.target.closest('[data-kf-gk]');
    if (gk) { dragGraphKey(e, gk, ctx); return; }
  });

  root.addEventListener('dblclick', (e) => {
    const dot = e.target.closest('[data-kf-key]');
    if (!dot) return;
    e.preventDefault();
    cycleEase(dot, ctx);
  });

  // Clicking an empty stretch of a lane drops a key there, at the value the
  // property already has at that moment — so the first click never changes
  // the picture, it only marks it.
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-kf-key]')) return;
    const lane = e.target.closest('[data-kf-lane]');
    if (!lane) return;
    const clip = ctx.clip(lane.dataset.kfClip);
    if (!clip) return;
    const spec = propsFor(clip).find((s) => s.prop === lane.dataset.kfLane);
    if (!spec) return;
    const t = laneTime(e, lane, clip, ctx);
    if (t === null) return;
    ctx.change((c) => setKeyframe(c, spec.prop, t, valueAt(c, spec.prop, t,
      readPath(c, spec.prop) ?? spec.def)), clip.id, 'Add keyframe');
  });
}

function laneTime(e, lane, clip, ctx) {
  const rect = lane.getBoundingClientRect();
  const t = ctx.toSec(e.clientX - rect.left) - clip.start;
  if (t < -0.05 || t > clip.dur + 0.05) return null;
  return clamp(t, 0, clip.dur);
}

function dragKey(e, dot, ctx) {
  const clipId = dot.dataset.kfClip;
  const prop = dot.dataset.kfProp;
  const from = Number(dot.dataset.kfKey);
  const clip = ctx.clip(clipId);
  if (!clip) return;
  /*
   * Selecting repaints the class, not the timeline.
   *
   * A full re-render here replaces the diamond between the two halves of a
   * double-click, so the second click lands on a different element and the
   * dblclick never fires — the easing menu simply would not open, with
   * nothing visibly wrong to explain it.
   */
  pick(clipId, prop, from, e.shiftKey);
  paintPicked();

  const startLeft = parseFloat(dot.style.left);
  let latest = from;
  drag(e, {
    move: (dx) => {
      const t = clamp(from + ctx.toSec(dx), 0, clip.dur);
      latest = t;
      dot.style.left = `${startLeft + ctx.toPx(t - from)}px`;
    },
    end: () => {
      if (Math.abs(latest - from) < 0.001) return;
      ctx.change((c) => moveKeyframe(c, prop, from, latest), clipId, 'Move keyframe');
    },
  });
}

function dragGraphKey(e, dot, ctx) {
  const clipId = dot.dataset.kfClip;
  const prop = dot.dataset.kfProp;
  const from = Number(dot.dataset.kfGk);
  const clip = ctx.clip(clipId);
  if (!clip) return;
  const spec = propsFor(clip).find((s) => s.prop === prop);
  if (!spec) return;
  pick(clipId, prop, from, e.shiftKey);
  paintPicked();

  const box = dot.parentElement.getBoundingClientRect();
  const h = GRAPH_H - 12;
  const { lo, hi } = graphRange(clip, spec);
  const key = clip.keyframes[prop].find((k) => Math.abs(k.t - from) < 0.0005);
  const v0 = key ? key.v : spec.def;
  const x0 = parseFloat(dot.style.left), y0 = parseFloat(dot.style.top);
  let t = from, v = v0;

  drag(e, {
    move: (dx, dy) => {
      t = clamp(from + ctx.toSec(dx), 0, clip.dur);
      v = clamp(v0 - (dy / h) * (hi - lo), spec.min, spec.max);
      dot.style.left = `${x0 + (box.width * (t - from)) / clip.dur}px`;
      dot.style.top = `${clamp(y0 + dy, 0, h)}px`;
    },
    end: () => {
      ctx.change((c) => {
        moveKeyframe(c, prop, from, t);
        const k = c.keyframes[prop]?.find((x) => Math.abs(x.t - t) < 0.0005);
        if (k) k.v = v;
      }, clipId, 'Shape keyframe');
    },
  });
}

function cycleEase(dot, ctx) {
  const { kfClip: clipId, kfProp: prop } = dot.dataset;
  const t = Number(dot.dataset.kfKey);
  ctx.change((c) => {
    const k = c.keyframes?.[prop]?.find((x) => Math.abs(x.t - t) < 0.0005);
    if (!k) return;
    const i = EASE_NAMES.indexOf(k.ease || 'ease');
    k.ease = EASE_NAMES[(i + 1) % EASE_NAMES.length];
  }, clipId, 'Change easing');
}

/** Repaint just the selection rings, without touching the rest of the timeline. */
function paintPicked() {
  for (const node of document.querySelectorAll('[data-kf-key],[data-kf-gk]')) {
    const t = node.dataset.kfKey ?? node.dataset.kfGk;
    node.classList.toggle('sel', picked.has(`${node.dataset.kfClip}|${node.dataset.kfProp}|${t}`));
  }
}

function pick(clipId, prop, t, add) {
  const id = `${clipId}|${prop}|${t}`;
  if (!add) picked = new Set([id]);
  else if (picked.has(id)) picked.delete(id);
  else picked.add(id);
}

export function clearPicked() { picked = new Set(); }
export function pickedCount() { return picked.size; }

/** Delete every selected key. Returns how many went. */
export function deletePicked(project) {
  let gone = 0;
  for (const id of picked) {
    const [clipId, prop, t] = id.split('|');
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip) continue;
    removeKeyframe(clip, prop, Number(t));
    gone++;
  }
  picked = new Set();
  return gone;
}

/* ------------------------------------------------------------------ */
/* the head-column buttons                                             */
/* ------------------------------------------------------------------ */

/**
 * Handle a click in the property head column. Returns true when it was one of
 * ours, so the timeline can stop looking.
 */
export function handleHeadClick(e, ctx) {
  const allBtn = e.target.closest('[data-kf-all]');
  if (allBtn) { toggleShowAll(allBtn.dataset.kfAll); ctx.repaint(); return true; }

  const graphBtn = e.target.closest('[data-kf-graph]');
  if (graphBtn) { graphOpen = !graphOpen; ctx.repaint(); return true; }

  const row = e.target.closest('[data-kf-prop][data-kf-clip]');
  if (!row) return false;
  const clipId = row.dataset.kfClip;
  const clip = ctx.clip(clipId);
  if (!clip) return false;
  const spec = propsFor(clip).find((s) => s.prop === row.dataset.kfProp);
  if (!spec) return false;
  const local = clamp(ctx.time() - clip.start, 0, clip.dur);
  const keys = clip.keyframes?.[spec.prop] || [];

  const watch = e.target.closest('[data-kf-watch]');
  if (watch) {
    if (keys.length) {
      // Turning the stopwatch off freezes the value the eye is currently on,
      // rather than snapping back to whatever it was before the animation —
      // the same thing After Effects does, and the only one that isn't a
      // surprise.
      const held = valueNow(clip, spec, ctx.time());
      ctx.change((c) => { writeValue(c, spec, held); clearKeyframes(c, spec.prop); },
        clipId, 'Stop animating');
    } else {
      ctx.change((c) => setKeyframe(c, spec.prop, local,
        readPath(c, spec.prop) ?? spec.def), clipId, 'Animate property');
    }
    return true;
  }

  const toggle = e.target.closest('[data-kf-toggle]');
  if (toggle) {
    const here = keys.find((k) => Math.abs(k.t - local) < 0.02);
    if (here) ctx.change((c) => removeKeyframe(c, spec.prop, here.t), clipId, 'Remove keyframe');
    else ctx.change((c) => setKeyframe(c, spec.prop, local,
      valueAt(c, spec.prop, local, readPath(c, spec.prop) ?? spec.def)), clipId, 'Add keyframe');
    return true;
  }

  const prev = e.target.closest('[data-kf-prev]');
  const next = e.target.closest('[data-kf-next]');
  if (prev || next) {
    const times = keys.map((k) => k.t).sort((a, b) => a - b);
    const target = prev
      ? [...times].reverse().find((t) => t < local - 0.005)
      : times.find((t) => t > local + 0.005);
    if (target !== undefined) ctx.seek(clip.start + target);
    return true;
  }
  return false;
}

function writeValue(clip, spec, v) {
  const parts = spec.prop.split('.');
  if (parts[0] === 'effects') {
    const fx = clip.effects?.find((f) => f.id === parts[1]);
    if (fx) (fx.params ||= {})[parts[2]] = v;
    return;
  }
  if (parts.length === 1) { clip[parts[0]] = v; return; }
  let node = clip;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] ||= {};
  node[parts[parts.length - 1]] = v;
}
