/*
 * Shape layers.
 *
 * Vector shapes drawn by the compositor rather than footage drawn by a
 * camera: a rectangle, an ellipse, a polygon, a star, a line, an arrow, a
 * ring, or a path of points — with a fill, a stroke, a dash, and the three
 * operations that make motion graphics out of them. Trim Paths draws a
 * stroke from nothing to all of itself (the line that writes itself on, the
 * ring that fills up); the Repeater turns one shape into a row, a grid or a
 * ring of copies, each a step further along; Wiggle and Zigzag rough up the
 * outline so a circle is hand-drawn or a burst.
 *
 * Everything about a shape is a number, so everything can be keyframed or
 * driven by an expression: the renderer hands drawShape a `read(prop,
 * fallback)` that resolves the animated value of any property, and the
 * shape's own fields are only the fallbacks. Every shape is built as a
 * polyline in pixels first — curves flattened to enough segments to be
 * smooth at 4K — because a trim, a wiggle and a repeater are all operations
 * on a list of points, and Path2D cannot give the list back.
 *
 * Sizes are fractions of the frame's height (a 0.3 circle is the same
 * circle on a phone and a cinema screen); positions are fractions of the
 * frame. Nothing here allocates per frame beyond the point arrays, which
 * are small.
 */

export const SHAPE_TYPES = [
  ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['polygon', 'Polygon'], ['star', 'Star'],
  ['line', 'Line'], ['arrow', 'Arrow'], ['ring', 'Ring'], ['path', 'Path'],
];

export const CAPS = [['round', 'Round'], ['butt', 'Flat'], ['square', 'Square']];

export function defaultShape(type = 'rect') {
  return {
    type,
    name: SHAPE_TYPES.find(([id]) => id === type)?.[1] || 'Shape',
    x: 0.5, y: 0.5,            // centre, fractions of the frame
    w: 0.3, h: 0.3,            // fractions of the frame's height
    rotate: 0,
    round: 0,                  // corner radius, fraction of the shorter side
    sides: 6,                  // polygon and star
    inner: 0.5,                // star: inner radius as a fraction of the outer
    thickness: 0.25,           // ring: as a fraction of the radius
    points: [],                // path: [{x, y}] in fractions of the frame
    closed: false,             // path only
    fillOn: true,
    fill: '#00d1ff',
    strokeOn: false,
    stroke: '#ffffff',
    strokeWidth: 0.012,        // fraction of the frame's height
    cap: 'round',
    dash: 0, gap: 0,           // fractions of the frame's height; 0 = solid
    opacity: 1,
    trim: { start: 0, end: 1, offset: 0 },
    repeat: { count: 1, dx: 0, dy: 0, rotate: 0, scale: 1, fade: 0 },
    wiggle: { amount: 0, detail: 6, speed: 1 },
    zigzag: { amount: 0, ridges: 12 },
    glow: null,                // colour, or null
    glowBlur: 0.4,             // fraction of the stroke width × 20
    saber: false,              // a light-sabre stroke: white core, coloured halo
  };
}

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

/* Enough segments for a curve to look round at the size it is drawn. */
function segmentsFor(radiusPx) { return Math.max(24, Math.min(160, Math.round(radiusPx / 3))); }

/** The shape's outline as a polyline about (0,0), in pixels, before any operation. */
function outline(s, read, h) {
  const type = s.type;
  const W = read('w', s.w) * h, H = read('h', s.h) * h;
  const pts = [];
  let closed = true;

  if (type === 'rect') {
    const r = Math.min(W, H) / 2 * Math.max(0, Math.min(1, read('round', s.round)));
    if (r <= 0.5) {
      pts.push([-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]);
    } else {
      const n = segmentsFor(r) / 4;
      const corner = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
      corner(W / 2 - r, -H / 2 + r, -Math.PI / 2);
      corner(W / 2 - r, H / 2 - r, 0);
      corner(-W / 2 + r, H / 2 - r, Math.PI / 2);
      corner(-W / 2 + r, -H / 2 + r, Math.PI);
    }
  } else if (type === 'ellipse' || type === 'ring') {
    const n = segmentsFor(Math.max(W, H) / 2);
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; pts.push([Math.cos(a) * W / 2, Math.sin(a) * H / 2]); }
  } else if (type === 'polygon' || type === 'star') {
    const sides = Math.max(3, Math.round(read('sides', s.sides)));
    const inner = Math.max(0.05, Math.min(1, read('inner', s.inner)));
    const steps = type === 'star' ? sides * 2 : sides;
    for (let i = 0; i < steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
      const k = type === 'star' && i % 2 === 1 ? inner : 1;
      pts.push([Math.cos(a) * W / 2 * k, Math.sin(a) * H / 2 * k]);
    }
  } else if (type === 'line') {
    // Centred by default; from the origin when `pivot` is 'start', so a
    // repeater turning copies about the origin radiates them outward.
    const x0 = s.pivot === 'start' ? 0 : -W / 2;
    pts.push([x0, 0], [x0 + W, 0]);
    closed = false;
  } else if (type === 'arrow') {
    // A line with a head at the end; the head is a fraction of the length.
    const head = Math.min(W * 0.35, H);
    const x0 = s.pivot === 'start' ? 0 : -W / 2;
    pts.push([x0, 0], [x0 + W, 0], [x0 + W - head, -head * 0.55], [x0 + W, 0], [x0 + W - head, head * 0.55]);
    closed = false;
  } else if (type === 'path') {
    for (const p of s.points || []) pts.push([(p.x - read('x', s.x)) * h * (1 / 1), (p.y - read('y', s.y)) * h]);
    closed = Boolean(s.closed);
  }
  return { pts, closed };
}

/* Resample a polyline to roughly `n` evenly spaced points, so wiggle and
   zigzag have something to displace on a four-point rectangle. */
function resample(pts, closed, n) {
  const path = closed ? [...pts, pts[0]] : pts;
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = lens[lens.length - 1];
  if (total <= 0) return pts;
  const out = [];
  const count = closed ? n : n + 1;
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const d = (i / n) * total;
    while (seg < path.length - 2 && lens[seg + 1] < d) seg++;
    const f = (d - lens[seg]) / ((lens[seg + 1] - lens[seg]) || 1);
    out.push([path[seg][0] + (path[seg + 1][0] - path[seg][0]) * f, path[seg][1] + (path[seg + 1][1] - path[seg][1]) * f]);
  }
  return out;
}

/* Unit normal at point i, from its neighbours. */
function normalAt(pts, i, closed) {
  const n = pts.length;
  const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
  const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function smooth(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = hash(i + seed * 91.7) * 2 - 1, b = hash(i + 1 + seed * 91.7) * 2 - 1;
  return a + (b - a) * u;
}

/* Wiggle: every point pushed along its normal by smooth noise that drifts with time. */
function wigglePath(pts, closed, amount, detail, speed, t, h) {
  if (amount <= 0) return pts;
  const n = Math.max(pts.length, Math.round(detail * 6));
  const base = resample(pts, closed, n);
  return base.map((p, i) => {
    const [nx, ny] = normalAt(base, i, closed);
    const d = smooth(i * 0.9 + t * speed * 2, 3) * amount * h * 0.08;
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

/* Zigzag: alternating points in and out, along the normal. */
function zigzagPath(pts, closed, amount, ridges, h) {
  if (amount <= 0) return pts;
  const base = resample(pts, closed, Math.max(pts.length, Math.round(ridges) * 2));
  return base.map((p, i) => {
    const [nx, ny] = normalAt(base, i, closed);
    const d = (i % 2 === 0 ? 1 : -1) * amount * h * 0.06;
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

/*
 * Trim Paths. The polyline's arc length from start to end, offset along
 * it; a closed path wraps, so a ring trimmed 0.9→1.1 is the arc across the
 * top. Returns a list of open sub-paths (two when the window wraps the
 * seam of an open path is impossible, so at most one there).
 */
function trimPath(pts, closed, start, end, offset) {
  const path = closed ? [...pts, pts[0]] : pts;
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = lens[lens.length - 1];
  if (total <= 0) return [];
  let a = Math.min(start, end) + offset, bnd = Math.max(start, end) + offset;
  if (bnd - a >= 1) return [{ pts: path, closed }];
  if (bnd - a <= 0.0005) return [];
  const pointAt = (d) => {
    let seg = 0;
    while (seg < path.length - 2 && lens[seg + 1] < d) seg++;
    const f = (d - lens[seg]) / ((lens[seg + 1] - lens[seg]) || 1);
    return [path[seg][0] + (path[seg + 1][0] - path[seg][0]) * f, path[seg][1] + (path[seg + 1][1] - path[seg][1]) * f];
  };
  const slice = (u0, u1) => {
    const d0 = u0 * total, d1 = u1 * total;
    const out = [pointAt(d0)];
    for (let i = 0; i < path.length; i++) if (lens[i] > d0 && lens[i] < d1) out.push(path[i]);
    out.push(pointAt(d1));
    return { pts: out, closed: false };
  };
  if (closed) {
    a = ((a % 1) + 1) % 1; bnd = a + (Math.max(start, end) - Math.min(start, end));
    if (bnd <= 1) return [slice(a, bnd)];
    return [slice(a, 1), slice(0, bnd - 1)];
  }
  a = Math.max(0, Math.min(1, a)); bnd = Math.max(0, Math.min(1, bnd));
  return bnd > a ? [slice(a, bnd)] : [];
}

/* ------------------------------------------------------------------ */
/* drawing                                                             */
/* ------------------------------------------------------------------ */

function trace(ctx, sub) {
  ctx.beginPath();
  sub.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (sub.closed) ctx.closePath();
}

/**
 * Draw a shape at local time `t`. `read(prop, fallback)` resolves any of the
 * shape's animatable numbers ('trim.end', 'repeat.count', 'w'…) — the
 * renderer wires it to the clip's keyframes and expressions. `beatPhase` is
 * 0..1 through the current beat, or undefined without a grid.
 */
export function drawShape(ctx, w, h, shape, t = 0, clipDur = 2, read = (p, f) => f, beatPhase) {
  const s = { ...defaultShape(shape?.type || 'rect'), ...(shape || {}) };
  const alpha = Math.max(0, Math.min(1, read('opacity', s.opacity)));
  if (alpha <= 0.002) return;
  const cx = read('x', s.x) * w, cy = read('y', s.y) * h;
  const rotate = read('rotate', s.rotate);

  let { pts, closed } = outline(s, read, h);
  if (pts.length < 2) return;
  pts = wigglePath(pts, closed, read('wiggle.amount', s.wiggle?.amount ?? 0), s.wiggle?.detail ?? 6, s.wiggle?.speed ?? 1, t, h);
  pts = zigzagPath(pts, closed, read('zigzag.amount', s.zigzag?.amount ?? 0), s.zigzag?.ridges ?? 12, h);

  const trimStart = read('trim.start', s.trim?.start ?? 0);
  const trimEnd = read('trim.end', s.trim?.end ?? 1);
  const trimOff = read('trim.offset', s.trim?.offset ?? 0);
  const trimmed = trimStart !== 0 || trimEnd !== 1 || trimOff !== 0;
  const subs = trimmed ? trimPath(pts, closed, trimStart, trimEnd, trimOff) : [{ pts, closed }];
  if (!subs.length) return;

  const strokeW = Math.max(0, read('strokeWidth', s.strokeWidth)) * h;
  const dash = read('dash', s.dash) * h, gap = read('gap', s.gap) * h;
  const isRing = s.type === 'ring';
  // A ring is a stroke, by definition; the fill is what the rest are.
  const strokeOn = isRing || s.strokeOn || s.type === 'line' || s.type === 'arrow';
  const fillOn = !isRing && s.type !== 'line' && s.type !== 'arrow' && s.fillOn && closed;
  const ringW = isRing ? Math.max(1, read('thickness', s.thickness) * Math.max(read('w', s.w), read('h', s.h)) * h / 2) : strokeW;

  const count = Math.max(1, Math.round(read('repeat.count', s.repeat?.count ?? 1)));
  const rdx = read('repeat.dx', s.repeat?.dx ?? 0) * h, rdy = read('repeat.dy', s.repeat?.dy ?? 0) * h;
  const rrot = read('repeat.rotate', s.repeat?.rotate ?? 0), rsc = read('repeat.scale', s.repeat?.scale ?? 1);
  const rfade = Math.max(0, Math.min(1, read('repeat.fade', s.repeat?.fade ?? 0)));

  ctx.save();
  ctx.translate(cx, cy);
  if (rotate) ctx.rotate((rotate * Math.PI) / 180);
  ctx.lineCap = s.cap || 'round';
  ctx.lineJoin = 'round';
  if (dash > 0) ctx.setLineDash([dash, gap > 0 ? gap : dash]);

  ctx.save();
  for (let k = 0; k < count; k++) {
    /*
     * Each copy a step further than the last, and the step is taken in the
     * previous copy's own frame: a turn plus a shift walks an arc, a turn
     * alone fans copies about the origin, a shift alone makes a row. That
     * accumulation is what a compositor's repeater does and what makes a
     * spiral out of one square.
     */
    if (k > 0) {
      ctx.translate(rdx, rdy);
      if (rrot) ctx.rotate((rrot * Math.PI) / 180);
      if (rsc !== 1) ctx.scale(rsc, rsc);
    }
    ctx.globalAlpha = alpha * (count > 1 ? 1 - rfade * (k / Math.max(1, count - 1)) : 1);

    for (const sub of subs) {
      if (fillOn && !trimmed) {
        trace(ctx, sub);
        ctx.fillStyle = s.fill;
        if (s.glow && !strokeOn) { ctx.shadowColor = s.glow; ctx.shadowBlur = h * 0.04 * (s.glowBlur ?? 0.4) * 2; }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (strokeOn && ringW > 0) {
        trace(ctx, sub);
        if (s.saber) {
          /*
           * A sabre: a soft coloured halo under a thin white core. Three
           * passes with additive blending, widest and faintest first — the
           * look every "energy line" and "neon logo" is built from.
           */
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = s.stroke;
          ctx.shadowColor = s.stroke;
          for (const [mul, a, blur] of [[4, 0.25, 6], [2.2, 0.5, 3], [1, 1, 1]]) {
            ctx.lineWidth = ringW * mul;
            ctx.globalAlpha = alpha * a;
            ctx.shadowBlur = ringW * blur;
            ctx.stroke();
          }
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1, ringW * 0.45);
          ctx.globalAlpha = alpha;
          ctx.shadowBlur = 0;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = s.stroke;
          ctx.lineWidth = ringW;
          if (s.glow) { ctx.shadowColor = s.glow; ctx.shadowBlur = ringW * 20 * (s.glowBlur ?? 0.4); ctx.stroke(); }
          ctx.shadowBlur = 0;
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
  ctx.restore();
  void clipDur; void beatPhase;
}

/* ------------------------------------------------------------------ */
/* presets                                                             */
/* ------------------------------------------------------------------ */

/*
 * Finished motion-graphics pieces, each a shape plus the keys or expression
 * that make it move. `build(clip, dur)` sets the shape and its animation on
 * a fresh shape clip; the panel and the AI both go through it, so "a line
 * that draws itself on" means the same thing from either door.
 */
export const SHAPE_PRESETS = [
  { id: 'lineReveal', name: 'Line draws on', group: 'Reveal', icon: '━', tier: 'creator',
    note: 'A line that writes itself across, left to right.',
    build(clip, dur) {
      Object.assign(clip.shape, { type: 'line', name: 'Line', w: 0.9, h: 0, strokeWidth: 0.012, stroke: '#ffffff', cap: 'round' });
      keys(clip, 'shape.trim.end', [[0, 0], [Math.min(0.8, dur * 0.5), 1]]);
    } },
  { id: 'underline', name: 'Underline', group: 'Reveal', icon: '▁', tier: 'creator',
    note: 'A short bar under a title, drawing on then holding.',
    build(clip, dur) {
      Object.assign(clip.shape, { type: 'line', name: 'Underline', y: 0.58, w: 0.34, strokeWidth: 0.014, stroke: '#00d1ff', cap: 'round' });
      keys(clip, 'shape.trim.end', [[0, 0], [Math.min(0.5, dur * 0.4), 1]]);
    } },
  { id: 'ringFill', name: 'Ring fills up', group: 'Reveal', icon: '◯', tier: 'creator',
    note: 'A ring that draws round from the top — a loading ring, a countdown.',
    build(clip, dur) {
      Object.assign(clip.shape, { type: 'ring', name: 'Ring', w: 0.34, h: 0.34, thickness: 0.18, stroke: '#00d1ff', cap: 'round' });
      keys(clip, 'shape.trim.end', [[0, 0], [Math.max(0.6, dur - 0.2), 1]]);
    } },
  { id: 'boxOutline', name: 'Box outlines itself', group: 'Reveal', icon: '▭', tier: 'creator',
    note: 'A rectangle outline that draws round from a corner.',
    build(clip, dur) {
      Object.assign(clip.shape, { type: 'rect', name: 'Box', w: 0.7, h: 0.4, fillOn: false, strokeOn: true, strokeWidth: 0.01, stroke: '#ffffff', cap: 'butt' });
      keys(clip, 'shape.trim.end', [[0, 0], [Math.min(0.9, dur * 0.6), 1]]);
    } },
  { id: 'circleBurst', name: 'Circle burst', group: 'Impact', icon: '◎', tier: 'creator',
    note: 'A ring that flashes out from a point and fades — the hit behind a word.',
    build(clip) {
      Object.assign(clip.shape, { type: 'ring', name: 'Burst', w: 0.1, h: 0.1, thickness: 0.35, stroke: '#ffffff' });
      keys(clip, 'shape.w', [[0, 0.05], [0.45, 0.5]]);
      keys(clip, 'shape.h', [[0, 0.05], [0.45, 0.5]]);
      keys(clip, 'shape.thickness', [[0, 0.5], [0.45, 0.02]]);
      keys(clip, 'shape.opacity', [[0, 1], [0.45, 0]]);
    } },
  { id: 'starPop', name: 'Star pops', group: 'Impact', icon: '★', tier: 'creator',
    note: 'A star that pops in with an overshoot and spins slowly.',
    build(clip) {
      Object.assign(clip.shape, { type: 'star', name: 'Star', w: 0.3, h: 0.3, sides: 5, inner: 0.45, fill: '#ffd93d' });
      keys(clip, 'shape.w', [[0, 0.02], [0.3, 0.34], [0.45, 0.3]]);
      keys(clip, 'shape.h', [[0, 0.02], [0.3, 0.34], [0.45, 0.3]]);
      clip.expressions ||= {};
      clip.expressions['shape.rotate'] = 'value + local * 25';
    } },
  { id: 'burstLines', name: 'Burst lines', group: 'Impact', icon: '✳', tier: 'creator',
    note: 'Twelve lines radiating from a point, shooting out and fading — the anime hit.',
    build(clip) {
      Object.assign(clip.shape, { type: 'line', name: 'Burst lines', w: 0.14, x: 0.5, y: 0.5, pivot: 'start', strokeWidth: 0.008, stroke: '#ffffff', cap: 'round',
        repeat: { count: 12, dx: 0, dy: 0, rotate: 30, scale: 1, fade: 0 } });
      // Each line is offset from the centre by the copy's own rotation, so a
      // trim that runs from the inner end to the outer end shoots outward.
      keys(clip, 'shape.trim.start', [[0, 0], [0.3, 1]]);
      keys(clip, 'shape.trim.end', [[0, 0.25], [0.22, 1]]);
      keys(clip, 'shape.w', [[0, 0.12], [0.3, 0.5]]);
    } },
  { id: 'dashedOrbit', name: 'Dashed orbit', group: 'Loop', icon: '◌', tier: 'creator',
    note: 'A dashed ring whose dashes travel round forever.',
    build(clip) {
      Object.assign(clip.shape, { type: 'ring', name: 'Orbit', w: 0.4, h: 0.4, thickness: 0.06, stroke: '#ffffff', dash: 0.03, gap: 0.02, cap: 'butt' });
      clip.expressions ||= {};
      clip.expressions['shape.rotate'] = 'value + local * 30';
    } },
  { id: 'dotGrid', name: 'Dot grid', group: 'Pattern', icon: '⁙', tier: 'creator',
    note: 'A row of dots stepping across — a background pattern, a loading row.',
    build(clip) {
      Object.assign(clip.shape, { type: 'ellipse', name: 'Dots', x: 0.12, w: 0.03, h: 0.03, fill: '#ffffff', repeat: { count: 9, dx: 0.045, dy: 0, rotate: 0, scale: 1, fade: 0.6 } });
      clip.expressions ||= {};
      clip.expressions['shape.repeat.fade'] = '0.5 + sin(local * 3) * 0.4';
    } },
  { id: 'spiralSquares', name: 'Spiral of squares', group: 'Pattern', icon: '▣', tier: 'creator',
    note: 'One square repeated into a spiral that turns — the classic repeater trick.',
    build(clip) {
      Object.assign(clip.shape, { type: 'rect', name: 'Spiral', w: 0.18, h: 0.18, fillOn: false, strokeOn: true, strokeWidth: 0.004, stroke: '#00d1ff',
        repeat: { count: 24, dx: 0.02, dy: 0.01, rotate: 12, scale: 0.94, fade: 0.3 } });
      clip.expressions ||= {};
      clip.expressions['shape.rotate'] = 'value + local * 15';
    } },
  { id: 'saberLine', name: 'Sabre line', group: 'Glow', icon: '⚡', tier: 'creator',
    note: 'A light-sabre stroke: white core, coloured halo, drawing on.',
    build(clip, dur) {
      Object.assign(clip.shape, { type: 'line', name: 'Sabre', w: 0.8, strokeWidth: 0.008, stroke: '#00d1ff', saber: true, cap: 'round' });
      keys(clip, 'shape.trim.end', [[0, 0], [Math.min(0.5, dur * 0.4), 1]]);
    } },
  { id: 'neonRing', name: 'Neon ring', group: 'Glow', icon: '◍', tier: 'creator',
    note: 'A glowing ring that breathes with the music when there is any.',
    build(clip) {
      Object.assign(clip.shape, { type: 'ring', name: 'Neon ring', w: 0.36, h: 0.36, thickness: 0.08, stroke: '#ff4fd8', glow: '#ff4fd8', glowBlur: 0.6 });
      clip.expressions ||= {};
      clip.expressions['shape.w'] = 'value + audioSmooth("all", 0.08) * 0.08 + beatPulse(8) * 0.03';
      clip.expressions['shape.h'] = 'value + audioSmooth("all", 0.08) * 0.08 + beatPulse(8) * 0.03';
    } },
  { id: 'wobbleBlob', name: 'Wobbly blob', group: 'Organic', icon: '◕', tier: 'creator',
    note: 'A circle whose outline wobbles, like a hand-drawn cartoon.',
    build(clip) {
      Object.assign(clip.shape, { type: 'ellipse', name: 'Blob', w: 0.34, h: 0.34, fill: '#ff6b6b', wiggle: { amount: 0.35, detail: 10, speed: 1.2 } });
    } },
  { id: 'scribbleCircle', name: 'Scribble circle', group: 'Organic', icon: '◌', tier: 'creator',
    note: 'A rough hand-drawn ring, drawn on around a subject.',
    build(clip, dur) {
      Object.assign(clip.shape, { type: 'ring', name: 'Scribble', w: 0.3, h: 0.3, thickness: 0.05, stroke: '#ffd93d', wiggle: { amount: 0.2, detail: 14, speed: 0.4 } });
      keys(clip, 'shape.trim.end', [[0, 0], [Math.min(0.6, dur * 0.5), 1]]);
    } },
  { id: 'burstStar', name: 'Comic burst', group: 'Organic', icon: '✸', tier: 'creator',
    note: 'A zigzag burst for a comic "POW".',
    build(clip) {
      Object.assign(clip.shape, { type: 'ellipse', name: 'Burst', w: 0.4, h: 0.32, fill: '#ffd93d', strokeOn: true, stroke: '#111111', strokeWidth: 0.008, zigzag: { amount: 0.5, ridges: 16 } });
      keys(clip, 'shape.w', [[0, 0.05], [0.25, 0.44], [0.4, 0.4]]);
      keys(clip, 'shape.h', [[0, 0.04], [0.25, 0.35], [0.4, 0.32]]);
    } },
  { id: 'progressBar', name: 'Progress bar', group: 'Reveal', icon: '▬', tier: 'creator',
    note: 'A bar that fills over the whole clip — the length of the layer is the countdown.',
    build(clip, dur) {
      Object.assign(clip.shape, { type: 'line', name: 'Progress', y: 0.92, w: 0.8, strokeWidth: 0.014, stroke: '#ffffff', cap: 'round' });
      clip.expressions ||= {};
      clip.expressions['shape.trim.end'] = 'local / duration';
      void dur;
    } },
  { id: 'hexagon', name: 'Hexagon frame', group: 'Pattern', icon: '⬡', tier: 'creator',
    note: 'A hexagon outline spinning slowly, for a logo to sit in.',
    build(clip) {
      Object.assign(clip.shape, { type: 'polygon', name: 'Hexagon', w: 0.42, h: 0.42, sides: 6, fillOn: false, strokeOn: true, stroke: '#ffffff', strokeWidth: 0.008 });
      clip.expressions ||= {};
      clip.expressions['shape.rotate'] = 'value + local * 10';
    } },
  { id: 'arrowIn', name: 'Arrow flies in', group: 'Reveal', icon: '➔', tier: 'creator',
    note: 'An arrow that draws on and points at something.',
    build(clip, dur) {
      Object.assign(clip.shape, { type: 'arrow', name: 'Arrow', x: 0.4, y: 0.5, w: 0.3, h: 0.1, strokeWidth: 0.012, stroke: '#ffd93d', cap: 'round' });
      keys(clip, 'shape.trim.end', [[0, 0], [Math.min(0.45, dur * 0.4), 1]]);
    } },
];
export const SHAPE_PRESET_BY_ID = Object.fromEntries(SHAPE_PRESETS.map((p) => [p.id, p]));

function keys(clip, prop, list) {
  clip.keyframes ||= {};
  clip.keyframes[prop] = list.map(([t, v]) => ({ t, v, ease: 'ease' }));
}

/** The properties a shape can animate, for the keyframe lanes. */
export const SHAPE_PROPS = [
  { prop: 'shape.x', label: 'Shape X', min: -0.5, max: 1.5, step: 0.002, def: 0.5, fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'shape.y', label: 'Shape Y', min: -0.5, max: 1.5, step: 0.002, def: 0.5, fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'shape.w', label: 'Width', min: 0, max: 2.5, step: 0.005, def: 0.3, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.h', label: 'Height', min: 0, max: 2.5, step: 0.005, def: 0.3, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.rotate', label: 'Shape rotation', min: -720, max: 720, step: 0.5, def: 0, fmt: (v) => `${v.toFixed(1)}°` },
  { prop: 'shape.round', label: 'Corner radius', min: 0, max: 1, step: 0.005, def: 0, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.strokeWidth', label: 'Stroke width', min: 0, max: 0.1, step: 0.001, def: 0.012, fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'shape.thickness', label: 'Ring thickness', min: 0.02, max: 1, step: 0.01, def: 0.25, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.opacity', label: 'Shape opacity', min: 0, max: 1, step: 0.01, def: 1, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.trim.start', label: 'Trim start', min: 0, max: 1, step: 0.005, def: 0, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.trim.end', label: 'Trim end', min: 0, max: 1, step: 0.005, def: 1, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.trim.offset', label: 'Trim offset', min: -1, max: 1, step: 0.005, def: 0, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.repeat.count', label: 'Copies', min: 1, max: 60, step: 1, def: 1, fmt: (v) => `${Math.round(v)}` },
  { prop: 'shape.repeat.dx', label: 'Copy shift X', min: -1, max: 1, step: 0.005, def: 0, fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'shape.repeat.dy', label: 'Copy shift Y', min: -1, max: 1, step: 0.005, def: 0, fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'shape.repeat.rotate', label: 'Copy rotation', min: -180, max: 180, step: 0.5, def: 0, fmt: (v) => `${v.toFixed(1)}°` },
  { prop: 'shape.repeat.scale', label: 'Copy scale', min: 0.2, max: 2, step: 0.01, def: 1, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.repeat.fade', label: 'Copy fade', min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.wiggle.amount', label: 'Wiggle', min: 0, max: 1, step: 0.005, def: 0, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.zigzag.amount', label: 'Zigzag', min: 0, max: 1, step: 0.005, def: 0, fmt: (v) => `${(v * 100).toFixed(0)}%` },
  { prop: 'shape.dash', label: 'Dash', min: 0, max: 0.5, step: 0.002, def: 0, fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'shape.gap', label: 'Gap', min: 0, max: 0.5, step: 0.002, def: 0, fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { prop: 'shape.sides', label: 'Sides', min: 3, max: 16, step: 1, def: 6, fmt: (v) => `${Math.round(v)}` },
  { prop: 'shape.inner', label: 'Star inner radius', min: 0.05, max: 1, step: 0.01, def: 0.5, fmt: (v) => `${(v * 100).toFixed(0)}%` },
];
