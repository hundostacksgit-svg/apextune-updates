/*
 * Colour lookup tables and tone curves.
 *
 * Both of these were on the pricing page before they were in the app, which is
 * the wrong way round and is fixed here. They are also the two things a
 * colourist asks for first, and the reason a grading panel gets called a toy
 * without them: sliders move the whole picture, a curve moves one part of the
 * range, and a LUT is somebody else's finished look applied exactly.
 *
 * .cube is the format everything writes — Resolve, Premiere, every LUT pack
 * anyone has ever bought — so that is what this reads. Nothing is converted on
 * a server and nothing is uploaded; the file is parsed here and stays here.
 *
 * Speed
 * -----
 * A 33x33x33 LUT is 36k entries and a 1080p frame is 2M pixels, so the lookup
 * is the hot path, not the parse. Two things keep it affordable:
 *
 *   • Trilinear interpolation between the eight surrounding entries, which is
 *     what makes a 33-point table look smooth instead of banded. Nearest
 *     neighbour is faster and visibly posterises skies.
 *   • The work happens at a capped resolution, like every other pixel pass in
 *     this app — a LUT is a smooth function of colour, so it carries no detail
 *     finer than the grid it is sampled on.
 */

import { pixels } from './fx-utils.js';

/* ------------------------------------------------------------------ *
 * .cube parsing
 * ------------------------------------------------------------------ */

/**
 * Parse a .cube file into a LUT.
 *
 * Deliberately forgiving about everything except the data. Real LUT files in
 * the wild have Windows line endings, comments, out-of-order headers, tabs
 * instead of spaces, a DOMAIN_MIN/MAX that is not 0..1, and a TITLE with
 * quotes in it. A parser that rejects those is a parser that rejects most of
 * what people actually own.
 */
export function parseCube(text) {
  const lines = String(text).split(/\r?\n/);
  let size = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  let title = '';
  const data = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE')) {
      title = line.slice(5).trim().replace(/^"|"$/g, '');
      continue;
    }
    if (upper.startsWith('LUT_3D_SIZE')) { size = parseInt(line.split(/\s+/)[1], 10); continue; }
    if (upper.startsWith('LUT_1D_SIZE')) {
      throw new Error('That is a 1D LUT. This reads 3D .cube files — the kind grading packs ship.');
    }
    if (upper.startsWith('DOMAIN_MIN')) { domainMin = line.split(/\s+/).slice(1).map(Number); continue; }
    if (upper.startsWith('DOMAIN_MAX')) { domainMax = line.split(/\s+/).slice(1).map(Number); continue; }

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const r = Number(parts[0]), g = Number(parts[1]), b = Number(parts[2]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
    data.push(r, g, b);
  }

  if (!size) throw new Error('No LUT_3D_SIZE line — this does not look like a 3D .cube file.');
  const want = size * size * size * 3;
  if (data.length < want) {
    throw new Error(`This .cube says it is ${size}×${size}×${size} but only has ${
      Math.floor(data.length / 3)} of ${size ** 3} entries. The file looks truncated.`);
  }

  // A Float32Array rather than a plain array: it is a third of the memory and
  // the lookup reads from it a few million times a frame.
  return {
    title, size,
    domainMin, domainMax,
    data: Float32Array.from(data.slice(0, want)),
  };
}

/* ------------------------------------------------------------------ *
 * Applying
 * ------------------------------------------------------------------ */

/** One entry, as three floats. */
function at(lut, r, g, b, out) {
  const n = lut.size;
  // .cube is red-fastest: index = r + g*n + b*n*n.
  const i = (r + g * n + b * n * n) * 3;
  out[0] = lut.data[i]; out[1] = lut.data[i + 1]; out[2] = lut.data[i + 2];
}

const c000 = new Float32Array(3), c100 = new Float32Array(3);
const c010 = new Float32Array(3), c110 = new Float32Array(3);
const c001 = new Float32Array(3), c101 = new Float32Array(3);
const c011 = new Float32Array(3), c111 = new Float32Array(3);

/**
 * Look one colour up, interpolating between the eight surrounding entries.
 *
 * Writes into `out` rather than returning, and the corner buffers above are
 * reused, because this runs once per pixel — allocating anything here would
 * mean millions of short-lived objects a second and a garbage collector that
 * never stops.
 */
function sample(lut, rf, gf, bf, out) {
  const n = lut.size, max = n - 1;
  const r = Math.min(max, Math.max(0, rf * max));
  const g = Math.min(max, Math.max(0, gf * max));
  const b = Math.min(max, Math.max(0, bf * max));

  const r0 = Math.floor(r), g0 = Math.floor(g), b0 = Math.floor(b);
  const r1 = Math.min(max, r0 + 1), g1 = Math.min(max, g0 + 1), b1 = Math.min(max, b0 + 1);
  const dr = r - r0, dg = g - g0, db = b - b0;

  at(lut, r0, g0, b0, c000); at(lut, r1, g0, b0, c100);
  at(lut, r0, g1, b0, c010); at(lut, r1, g1, b0, c110);
  at(lut, r0, g0, b1, c001); at(lut, r1, g0, b1, c101);
  at(lut, r0, g1, b1, c011); at(lut, r1, g1, b1, c111);

  for (let k = 0; k < 3; k++) {
    const x00 = c000[k] + (c100[k] - c000[k]) * dr;
    const x10 = c010[k] + (c110[k] - c010[k]) * dr;
    const x01 = c001[k] + (c101[k] - c001[k]) * dr;
    const x11 = c011[k] + (c111[k] - c011[k]) * dr;
    const y0 = x00 + (x10 - x00) * dg;
    const y1 = x01 + (x11 - x01) * dg;
    out[k] = y0 + (y1 - y0) * db;
  }
}

const rgb = new Float32Array(3);

/**
 * Put a LUT through a frame.
 *
 * `amount` cross-fades against the original, so a LUT is a dial and not a
 * switch — which is how they are actually used. A film LUT at 100% is usually
 * too much; the useful setting is somewhere around 60.
 */
export function applyLut(ctx, w, h, lut, amount = 1) {
  if (!lut || amount <= 0.002) return;
  const mix = Math.min(1, amount);

  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').drawImage(ctx.canvas, 0, 0);

  const dMin = lut.domainMin, dMax = lut.domainMax;
  const span = [
    (dMax[0] - dMin[0]) || 1,
    (dMax[1] - dMin[1]) || 1,
    (dMax[2] - dMin[2]) || 1,
  ];

  const done = pixels(src, w, h, 1400, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      // Into the LUT's own domain, which is 0..1 for almost every file but is
      // not required to be — a log LUT can declare something else entirely.
      const rf = (d[i] / 255 - dMin[0]) / span[0];
      const gf = (d[i + 1] / 255 - dMin[1]) / span[1];
      const bf = (d[i + 2] / 255 - dMin[2]) / span[2];
      sample(lut, rf, gf, bf, rgb);
      d[i] += (Math.min(255, Math.max(0, rgb[0] * 255)) - d[i]) * mix;
      d[i + 1] += (Math.min(255, Math.max(0, rgb[1] * 255)) - d[i + 1]) * mix;
      d[i + 2] += (Math.min(255, Math.max(0, rgb[2] * 255)) - d[i + 2]) * mix;
    }
  }, 6);
  if (!done) return;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(done, 0, 0, done.width, done.height, 0, 0, w, h);
}

/** Read a .cube the person picked. Rejected files say why, in a sentence. */
export async function loadCubeFile(file) {
  if (file.size > 64 * 1024 * 1024) {
    throw new Error('That file is over 64MB. A 3D LUT is normally well under one — this looks like something else.');
  }
  const lut = parseCube(await file.text());
  return { ...lut, name: lut.title || file.name.replace(/\.cube$/i, '') };
}

/* ------------------------------------------------------------------ *
 * Tone curves
 * ------------------------------------------------------------------ */

/*
 * A curve is a handful of control points; what it produces is a 256-entry
 * lookup table.
 *
 * Interpolation is monotone cubic (Fritsch–Carlson), not a plain spline. That
 * is the whole difference between a curve control that feels right and one
 * that fights you: an ordinary cubic through control points overshoots between
 * them, so dragging a midpoint up can make a darker input produce a *lighter*
 * output than a brighter one. On a picture that shows up as halos around
 * edges and inverted patches in gradients — the artefact people describe as
 * "the curve went weird". Monotone interpolation cannot overshoot, so the
 * curve only ever does what its shape says.
 */

export const NEUTRAL_CURVE = [[0, 0], [1, 1]];

export function curveIsNeutral(points) {
  if (!points || points.length !== 2) return false;
  const [a, b] = points;
  return Math.abs(a[0]) < 0.002 && Math.abs(a[1]) < 0.002
    && Math.abs(b[0] - 1) < 0.002 && Math.abs(b[1] - 1) < 0.002;
}

/** Build the 256-entry table a curve describes. */
export function curveTable(points) {
  const table = new Uint8ClampedArray(256);
  const p = [...(points || NEUTRAL_CURVE)]
    .map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))])
    .sort((a, b) => a[0] - b[0]);

  if (p.length < 2) {
    for (let i = 0; i < 256; i++) table[i] = i;
    return table;
  }

  const n = p.length;
  const dx = [], dy = [], slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0];
    dy[i] = p[i + 1][1] - p[i][1];
    // Two points at the same x would divide by zero; treat it as flat.
    slope[i] = dx[i] > 1e-6 ? dy[i] / dx[i] : 0;
  }

  // Tangents, clamped so no segment can overshoot its own endpoints.
  const m = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m[i] = 0;          // a turning point stays put
    else m[i] = (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i], b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {                                          // Fritsch–Carlson limit
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    while (seg < n - 2 && x > p[seg + 1][0]) seg++;
    let y;
    if (x <= p[0][0]) y = p[0][1];
    else if (x >= p[n - 1][0]) y = p[n - 1][1];
    else {
      const h = dx[seg] || 1e-6;
      const t = (x - p[seg][0]) / h;
      const t2 = t * t, t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * p[seg][1]
        + (t3 - 2 * t2 + t) * h * m[seg]
        + (-2 * t3 + 3 * t2) * p[seg + 1][1]
        + (t3 - t2) * h * m[seg + 1];
    }
    table[i] = Math.round(Math.min(1, Math.max(0, y)) * 255);
  }
  return table;
}

/**
 * Put curves through a frame.
 *
 * `curves` is `{ rgb, r, g, b }`, each a list of points or absent. The master
 * runs first and the per-channel curves after it, which is the order every
 * grading application uses — so a curve copied off a tutorial lands the same
 * way here.
 */
export function applyCurves(ctx, w, h, curves) {
  if (!curves) return;
  const master = curves.rgb && !curveIsNeutral(curves.rgb) ? curveTable(curves.rgb) : null;
  const cr = curves.r && !curveIsNeutral(curves.r) ? curveTable(curves.r) : null;
  const cg = curves.g && !curveIsNeutral(curves.g) ? curveTable(curves.g) : null;
  const cb = curves.b && !curveIsNeutral(curves.b) ? curveTable(curves.b) : null;
  if (!master && !cr && !cg && !cb) return;

  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').drawImage(ctx.canvas, 0, 0);

  const done = pixels(src, w, h, 1600, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (master) { r = master[r]; g = master[g]; b = master[b]; }
      if (cr) r = cr[r];
      if (cg) g = cg[g];
      if (cb) b = cb[b];
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }, 6);
  if (!done) return;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(done, 0, 0, done.width, done.height, 0, 0, w, h);
}

/** Ready-made curve shapes, so the panel is useful before anyone drags a point. */
export const CURVE_PRESETS = [
  { id: 'neutral', name: 'Neutral', points: [[0, 0], [1, 1]] },
  { id: 'filmS', name: 'Film S-curve', points: [[0, 0.02], [0.25, 0.18], [0.75, 0.84], [1, 0.98]] },
  { id: 'contrast', name: 'More contrast', points: [[0, 0], [0.3, 0.22], [0.7, 0.78], [1, 1]] },
  { id: 'soft', name: 'Softer', points: [[0, 0], [0.3, 0.34], [0.7, 0.68], [1, 1]] },
  { id: 'lifted', name: 'Lifted blacks', points: [[0, 0.09], [0.5, 0.52], [1, 1]] },
  { id: 'crushed', name: 'Crushed blacks', points: [[0, 0], [0.18, 0.04], [0.6, 0.62], [1, 1]] },
  { id: 'faded', name: 'Faded', points: [[0, 0.11], [0.5, 0.5], [1, 0.92]] },
  { id: 'bright', name: 'Brighter', points: [[0, 0], [0.4, 0.5], [1, 1]] },
  { id: 'dark', name: 'Darker', points: [[0, 0], [0.6, 0.5], [1, 1]] },
  { id: 'matte', name: 'Matte', points: [[0, 0.13], [0.35, 0.4], [0.75, 0.8], [1, 0.9]] },
];

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

/*
 * Loaded LUTs live here, keyed by id, and clips refer to them by that id.
 *
 * A 33-point cube is 36,000 floats. Storing it on the clip would put it in the
 * project file, in every undo entry and in every autosave — megabytes per clip
 * for a table that is identical every time. So the table lives here for the
 * session and the clip stores a string.
 *
 * The consequence is honest and worth stating: reopening a project on a
 * machine that has not loaded that .cube grades without it. That beats every
 * alternative — refusing to open the project, or silently bloating it — and
 * the panel says which LUT is missing so it can be re-added in one tap.
 */
const registry = new Map();

export function registerLut(lut) {
  const id = lut.id || `lut_${Math.random().toString(36).slice(2, 10)}`;
  const entry = { ...lut, id };
  registry.set(id, entry);
  return entry;
}

export function lutById(id) { return registry.get(id) || null; }
export function loadedLuts() { return [...registry.values()]; }
export function forgetLut(id) { registry.delete(id); }
