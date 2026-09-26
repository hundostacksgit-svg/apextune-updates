/*
 * Removing a thing from a shot.
 *
 * Tap the thing. The region under the tap is grown outwards while the colour
 * stays the thing's colour and no hard edge is crossed, which is what a
 * person means by "that" — the can, the sign, the cable — without a model to
 * download. The shape is kept, pinned to a motion track so it follows the
 * thing, and every frame the pixels inside it are replaced.
 *
 * Replaced with what, honestly:
 *
 *   1. THE BACKGROUND, when the shot has it. If the thing moves across a
 *      still camera, the background behind it was visible a moment ago or
 *      will be a moment later. Frames either side are asked for, the shape is
 *      looked up where it was at those moments, and any pixel that is inside
 *      the shape now but outside it then is real background. That is the
 *      honest removal — the actual wall, not a guess at it.
 *
 *   2. THE SURROUNDINGS, everywhere else. A pull-push pyramid fills the hole
 *      from its rim: the colours around the edge are pulled up through
 *      coarser and coarser levels until nothing is missing, then pushed back
 *      down, so the fill is a smooth blend of what borders it. Matched grain
 *      from the rim goes on top, because a perfectly smooth patch on a noisy
 *      frame is its own kind of visible.
 *
 * All of it works on a crop around the shape at a modest resolution, then
 * the result is scaled back and blended in through a soft edge. That is why
 * it plays in real time on a phone, and why a patch the size of a thumb costs
 * the same as one the size of a hand.
 */

/* ------------------------------------------------------------------ *
 * Picking: the region under a tap
 * ------------------------------------------------------------------ */

/* Luma and chroma of a pixel: shading changes Y, the thing's colour lives in Cb/Cr. */
function ycc(r, g, b, out) {
  const y = r * 0.299 + g * 0.587 + b * 0.114;
  out[0] = y; out[1] = (b - y) * 0.564; out[2] = (r - y) * 0.713;
  return out;
}

/**
 * Grow a region from (px, py).
 *
 * A pixel joins when its colour is near the tapped colour, or near the pixel
 * it grew from (so a can that shades from lit to shadowed side still reads as
 * one can) — and never across a strong luma edge, which is where one thing
 * stops and the next starts. Chroma counts more than luma in the distance so
 * that shading does not split a thing in two.
 *
 * If the region runs away and takes more of the frame than a tapped thing
 * plausibly is, the tolerance tightens and it tries again: a tap on the sky
 * should give the sky, but a tap on a cup should never give the table.
 */
export function pickRegion(rgba, w, h, px, py, { tolerance = 30, maxFrac = 0.35, edge = 1 } = {}) {
  px = Math.max(0, Math.min(w - 1, Math.round(px)));
  py = Math.max(0, Math.min(h - 1, Math.round(py)));
  const n = w * h;
  const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
  const c = [0, 0, 0];
  for (let i = 0, j = 0; i < n; i++, j += 4) { ycc(rgba[j], rgba[j + 1], rgba[j + 2], c); Y[i] = c[0]; Cb[i] = c[1]; Cr[i] = c[2]; }
  /* Edge strength: the biggest luma step to a neighbour. Cheap, and enough. */
  const E = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = Math.abs(Y[i + 1] - Y[i - 1]), gy = Math.abs(Y[i + w] - Y[i - w]);
    E[i] = Math.max(gx, gy);
  }
  /* The tapped colour: a 3x3 mean, so a tap on a speck of noise still means the thing around it. */
  let sy = 0, scb = 0, scr = 0, sc = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = px + dx, y = py + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x; sy += Y[i]; scb += Cb[i]; scr += Cr[i]; sc++;
  }
  sy /= sc; scb /= sc; scr /= sc;
  const dist = (i, y0, cb0, cr0) => {
    const dy = (Y[i] - y0) * 0.55, dcb = (Cb[i] - cb0) * 1.5, dcr = (Cr[i] - cr0) * 1.5;
    return Math.sqrt(dy * dy + dcb * dcb + dcr * dcr);
  };

  let tol = tolerance;
  let mask = null, area = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    mask = new Uint8Array(n);
    const stack = new Int32Array(n);
    let top = 0;
    const seed = py * w + px;
    mask[seed] = 1; stack[top++] = seed; area = 1;
    const edgeStop = 34 * edge + tol * 0.5;
    while (top) {
      const i = stack[--top];
      const x = i % w, y = (i - x) / w;
      const yi = Y[i], cbi = Cb[i], cri = Cr[i];
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (let k = 0; k < 4; k++) {
        const j = nb[k];
        if (j < 0 || mask[j]) continue;
        if (E[j] > edgeStop) continue;
        const dSeed = dist(j, sy, scb, scr);
        if (dSeed < tol || (dist(j, yi, cbi, cri) < tol * 0.35 && dSeed < tol * 1.9)) {
          mask[j] = 1; stack[top++] = j; area++;
        }
      }
    }
    if (area <= maxFrac * n) break;
    tol *= 0.6;
  }

  closeHoles(mask, w, h, 2);
  keepSeedBlob(mask, w, h, px, py);
  fillEnclosed(mask, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1; area = 0;
  for (let i = 0; i < n; i++) if (mask[i]) { const x = i % w, y = (i - x) / w; area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { mask, area: 0, bbox: null, tolerance: tol };
  return { mask, area, bbox: { x0, y0, x1, y1 }, tolerance: tol };
}

/** Dilate then erode: fills specks and pinholes inside the region. */
function closeHoles(mask, w, h, r) {
  dilate(mask, w, h, r);
  erode(mask, w, h, r);
}

/* Separable square dilation / erosion, in place. */
export function dilate(mask, w, h, r) {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && mask[row + xx]) v = 1; }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1; }
    mask[y * w + x] = v;
  }
  return mask;
}
function erode(mask, w, h, r) {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let k = -r; k <= r && v; k++) { const xx = x + k; if (xx < 0 || xx >= w || !mask[row + xx]) v = 0; }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let v = 1;
    for (let k = -r; k <= r && v; k++) { const yy = y + k; if (yy < 0 || yy >= h || !tmp[yy * w + x]) v = 0; }
    mask[y * w + x] = v;
  }
  return mask;
}

/*
 * Anything the region surrounds is part of it: the label on a can, the eye in
 * a face, the logo on a shirt. Those are a different colour on purpose, and a
 * pick that leaves them behind leaves a floating label where the can was.
 * Background is whatever can be reached from the edge of the frame without
 * crossing the region; everything else that is not region, is.
 */
function fillEnclosed(mask, w, h) {
  const n = w * h;
  const outside = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const push = (i) => { if (!mask[i] && !outside[i]) { outside[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (top) {
    const i = stack[--top];
    const x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < n; i++) if (!mask[i] && !outside[i]) mask[i] = 1;
}

/* Only the blob the tap is in: closing can bridge to a neighbour that shares a colour. */
function keepSeedBlob(mask, w, h, px, py) {
  const n = w * h;
  const seed = py * w + px;
  if (!mask[seed]) return;
  const keep = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  keep[seed] = 1; stack[top++] = seed;
  while (top) {
    const i = stack[--top];
    const x = i % w, y = (i - x) / w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (let k = 0; k < 4; k++) { const j = nb[k]; if (j >= 0 && mask[j] && !keep[j]) { keep[j] = 1; stack[top++] = j; } }
  }
  mask.set(keep);
}

/* ------------------------------------------------------------------ *
 * The shape: a small bitmap that travels with the effect
 * ------------------------------------------------------------------ */

const CELLS = 96;   // the longest side of a stored shape, in cells

/**
 * Pack a picked region into something a project file can hold: its box as
 * fractions of the frame, and its bitmap at no more than 96 cells a side,
 * run-length encoded. A can is a few hundred bytes.
 */
export function packShape(mask, w, h, bbox) {
  const bw = bbox.x1 - bbox.x0 + 1, bh = bbox.y1 - bbox.y0 + 1;
  const s = Math.min(1, CELLS / Math.max(bw, bh));
  const cols = Math.max(1, Math.round(bw * s)), rows = Math.max(1, Math.round(bh * s));
  const bits = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    /* Majority of the source block, so thin parts survive and specks do not. */
    const xa = Math.floor(c * bw / cols), xb = Math.max(xa + 1, Math.floor((c + 1) * bw / cols));
    const ya = Math.floor(r * bh / rows), yb = Math.max(ya + 1, Math.floor((r + 1) * bh / rows));
    let on = 0, tot = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const px = bbox.x0 + x, py = bbox.y0 + y;
      if (px >= w || py >= h) continue;
      tot++; if (mask[py * w + px]) on++;
    }
    bits[r * cols + c] = tot && on * 2 >= tot ? 1 : 0;
  }
  const runs = [];
  let cur = 0, len = 0;
  for (let i = 0; i < bits.length; i++) { if (bits[i] === cur) len++; else { runs.push(len); cur = bits[i]; len = 1; } }
  runs.push(len);
  return {
    x: bbox.x0 / w, y: bbox.y0 / h, w: bw / w, h: bh / h,
    cols, rows, rle: runs.join(','),
  };
}

const unpacked = new Map();
/** The bitmap back out of a packed shape (cached: the same shape is asked for every frame). */
export function unpackShape(shape) {
  if (!shape || !shape.rle) return null;
  const key = `${shape.cols}x${shape.rows}:${shape.rle}`;
  let bits = unpacked.get(key);
  if (bits) return bits;
  bits = new Uint8Array(shape.cols * shape.rows);
  let i = 0, cur = 0;
  for (const run of shape.rle.split(',')) { const len = Number(run); if (cur) bits.fill(1, i, i + len); i += len; cur ^= 1; }
  if (unpacked.size > 64) unpacked.clear();
  unpacked.set(key, bits);
  return bits;
}

/**
 * Where the shape sits in a frame of w x h when the effect says its centre is
 * at (cx, cy) fractions and it has grown by `scale` since it was picked. The
 * effect's x/y are the centre of the picked box, so at the picking moment this
 * is exactly where the tap was.
 */
export function shapeRect(shape, w, h, cx, cy, scale = 1) {
  const rw = shape.w * w * scale, rh = shape.h * h * scale;
  return { x: cx * w - rw / 2, y: cy * h - rh / 2, w: rw, h: rh };
}

/* Is frame pixel (x, y) inside the shape placed at rect r, grown by g cells? */
function insideAt(bits, shape, r, x, y, g = 0) {
  const c = Math.floor(((x - r.x) / r.w) * shape.cols), rr = Math.floor(((y - r.y) / r.h) * shape.rows);
  if (g <= 0) return c >= 0 && rr >= 0 && c < shape.cols && rr < shape.rows && bits[rr * shape.cols + c] === 1;
  for (let dy = -g; dy <= g; dy++) for (let dx = -g; dx <= g; dx++) {
    const cc = c + dx, r2 = rr + dy;
    if (cc >= 0 && r2 >= 0 && cc < shape.cols && r2 < shape.rows && bits[r2 * shape.cols + cc] === 1) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * The background plate
 * ------------------------------------------------------------------ */

/*
 * A plate is the median of frames across the clip: on a still camera, a
 * thing that moves is not in it. Built once when the thing is removed (the
 * matte engine's buildPlate), kept here by clip id, never written to the
 * project file — a project that is reopened fills from the surroundings
 * until the thing is removed again, which is honest and still looks fine.
 */
const plates = new Map();
export function keepPlate(clipId, plate) { if (clipId && plate?.canvas) plates.set(clipId, plate); }
export function plateFor(clipId) { return plates.get(clipId) || null; }
export function forgetPlate(clipId) { plates.delete(clipId); }

/* ------------------------------------------------------------------ *
 * Filling
 * ------------------------------------------------------------------ */

/**
 * Pull-push hole filling on an RGB float buffer with a weight per pixel
 * (1 = known, 0 = hole). Coarser levels average the known pixels; the push
 * writes each level's holes from the level above. Linear in the pixel count,
 * and it never leaves a hole however big the shape is.
 */
function pullPush(rgb, wgt, w, h) {
  const levels = [{ rgb, wgt, w, h }];
  let cur = levels[0];
  while (cur.w > 1 || cur.h > 1) {
    const nw = Math.max(1, Math.ceil(cur.w / 2)), nh = Math.max(1, Math.ceil(cur.h / 2));
    const nrgb = new Float32Array(nw * nh * 3), nwgt = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let sw = 0, r = 0, g = 0, b = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = x * 2 + dx, sy = y * 2 + dy;
        if (sx >= cur.w || sy >= cur.h) continue;
        const i = sy * cur.w + sx, wv = cur.wgt[i];
        if (!wv) continue;
        sw += wv; r += cur.rgb[i * 3] * wv; g += cur.rgb[i * 3 + 1] * wv; b += cur.rgb[i * 3 + 2] * wv;
      }
      const o = y * nw + x;
      if (sw > 0) { nrgb[o * 3] = r / sw; nrgb[o * 3 + 1] = g / sw; nrgb[o * 3 + 2] = b / sw; nwgt[o] = Math.min(1, sw); }
    }
    cur = { rgb: nrgb, wgt: nwgt, w: nw, h: nh };
    levels.push(cur);
  }
  for (let L = levels.length - 2; L >= 0; L--) {
    const fine = levels[L], coarse = levels[L + 1];
    for (let y = 0; y < fine.h; y++) for (let x = 0; x < fine.w; x++) {
      const i = y * fine.w + x;
      const wv = fine.wgt[i];
      if (wv >= 1) continue;
      /* Bilinear from the coarse level, at this pixel's centre. */
      const fx = Math.min(coarse.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), fy = Math.min(coarse.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(coarse.w - 1, x0 + 1), y1 = Math.min(coarse.h - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      const a = y0 * coarse.w + x0, b = y0 * coarse.w + x1, c = y1 * coarse.w + x0, d = y1 * coarse.w + x1;
      for (let k = 0; k < 3; k++) {
        const up = coarse.rgb[a * 3 + k] * (1 - tx) * (1 - ty) + coarse.rgb[b * 3 + k] * tx * (1 - ty)
          + coarse.rgb[c * 3 + k] * (1 - tx) * ty + coarse.rgb[d * 3 + k] * tx * ty;
        fine.rgb[i * 3 + k] = fine.rgb[i * 3 + k] * wv + up * (1 - wv);
      }
      fine.wgt[i] = 1;
    }
  }
}

/* One canvas per purpose, reused: getImageData on a fresh canvas every frame is what makes a preview stutter. */
const pool = new Map();
function canvasFor(name, w, h) {
  let c = pool.get(name);
  if (!c) { c = document.createElement('canvas'); c._ctx = c.getContext('2d', { willReadFrequently: true }); pool.set(name, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

/* Deterministic grain: the same for the same pixel and frame, different frame to frame. */
function grain(x, y, f) {
  let s = (x * 73856093) ^ (y * 19349663) ^ (f * 83492791);
  s = (s ^ (s >>> 13)) * 1274126177;
  s = (s ^ (s >>> 16)) >>> 0;
  return s / 4294967296 - 0.5;
}

/**
 * Erase the shape from the picture on `ctx`.
 *
 *   shape         packed shape (packShape)
 *   cx, cy        where its centre is now, 0..1
 *   scale         how much bigger it is than when picked
 *   grow          extra margin round it, percent of the thing's own size
 *   feather       edge softness, percent of the thing's own size
 *   fill          'auto' | 'background' | 'surroundings'
 *   texture       0..1, how much of the rim's grain to put on the patch
 *   fast          true while playing: smaller working size
 *   frameIndex    for the grain, so it moves
 *   others        () => [{ canvas, cx, cy, scale }] — the clip at other moments,
 *                 with where the shape was then; or { canvas, clear: true } for a
 *                 background plate with nothing in it. Any size: it is scaled to
 *                 the frame. Null when there is nothing to borrow from.
 */
export function eraseRegion(ctx, w, h, shape, {
  cx, cy, scale = 1, grow = 4, feather = 8, fill = 'auto', texture = 0.35, fast = false, frameIndex = 0, others = null,
} = {}) {
  const bits = unpackShape(shape);
  if (!bits) return false;
  const r = shapeRect(shape, w, h, cx, cy, scale);
  if (r.w < 1 || r.h < 1) return false;
  /* Margin and softness scale with the thing, not the frame: a can and a car
     both want an edge a few percent of themselves wide. */
  const size = Math.max(r.w, r.h);
  const growPx = (grow / 100) * size;
  const featherPx = (feather / 100) * size;
  /* The crop: the shape, its margin, its soft edge, and a ring of context to fill from. */
  const ring = Math.max(24, Math.round(Math.max(r.w, r.h) * 0.4));
  const pad = growPx + featherPx + ring;
  const R = {
    x: Math.max(0, Math.floor(r.x - pad)), y: Math.max(0, Math.floor(r.y - pad)),
  };
  R.w = Math.min(w, Math.ceil(r.x + r.w + pad)) - R.x;
  R.h = Math.min(h, Math.ceil(r.y + r.h + pad)) - R.y;
  if (R.w < 2 || R.h < 2) return false;

  /* Working size: enough to fill smoothly, small enough to do every frame. */
  const cap = fast ? 160 : 320;
  const s = Math.min(1, cap / Math.max(R.w, R.h));
  const aw = Math.max(2, Math.round(R.w * s)), ah = Math.max(2, Math.round(R.h * s));
  const work = canvasFor('erase-work', aw, ah);
  work._ctx.drawImage(ctx.canvas, R.x, R.y, R.w, R.h, 0, 0, aw, ah);
  const src = work._ctx.getImageData(0, 0, aw, ah).data;

  /* The hole at working size. */
  const n = aw * ah;
  const hole = new Uint8Array(n);
  const toFrame = (ax, ay) => [R.x + (ax + 0.5) / s, R.y + (ay + 0.5) / s];
  for (let ay = 0; ay < ah; ay++) for (let ax = 0; ax < aw; ax++) {
    const [fx, fy] = toFrame(ax, ay);
    if (insideAt(bits, shape, r, fx, fy, 0)) hole[ay * aw + ax] = 1;
  }

  const samples = fill !== 'surroundings' && others ? (others() || []).filter((m) => m?.canvas) : [];
  const other = canvasFor('erase-other', aw, ah);
  const cropOf = (smp) => {
    const sx = smp.canvas.width / w, sy = smp.canvas.height / h;
    other._ctx.drawImage(smp.canvas, R.x * sx, R.y * sy, R.w * sx, R.h * sy, 0, 0, aw, ah);
    return other._ctx.getImageData(0, 0, aw, ah).data;
  };
  /* Does this sample's background sit where ours does? Compared outside the
     hole and a band round it; a pan fails this and is not borrowed from. */
  const agrees = (od, keepOut) => {
    let diff = 0, cnt = 0;
    for (let i = 0; i < n; i += 3) {
      if (keepOut[i]) continue;
      diff += Math.abs(od[i * 4] - src[i * 4]) + Math.abs(od[i * 4 + 1] - src[i * 4 + 1]) + Math.abs(od[i * 4 + 2] - src[i * 4 + 2]);
      cnt++;
    }
    return cnt > 0 && diff / cnt <= (fill === 'background' ? 60 : 36);
  };

  /*
   * A plate knows more about the thing's edge than the tap did. Where the
   * frame disagrees with the plate just outside the picked shape — the lid
   * that was a different colour, the shadow the thing casts — that is still
   * the thing, and it joins the hole.
   */
  const plate = samples.find((m) => m.clear);
  if (plate) {
    const pd = cropOf(plate);
    const band = new Uint8Array(hole);
    dilate(band, aw, ah, Math.max(2, Math.round((growPx * 2.5 + featherPx) * s)));
    if (agrees(pd, band)) {
      for (let i = 0; i < n; i++) {
        if (!band[i] || hole[i]) continue;
        const d = Math.abs(pd[i * 4] - src[i * 4]) + Math.abs(pd[i * 4 + 1] - src[i * 4 + 1]) + Math.abs(pd[i * 4 + 2] - src[i * 4 + 2]);
        if (d > 90) hole[i] = 1;
      }
      closeHoles(hole, aw, ah, 1);
    }
  }

  /* Then grown once by the margin plus half the soft edge, so the blurred
     edge's midpoint sits outside the thing rather than across its rim. */
  dilate(hole, aw, ah, Math.max(1, Math.round((growPx + featherPx * 0.6) * s)));
  let holes = 0;
  for (let i = 0; i < n; i++) if (hole[i]) holes++;
  if (!holes) return false;

  const rgb = new Float32Array(n * 3), wgt = new Float32Array(n);
  const fromOther = new Uint8Array(n);   // holes that got real background, which has its own grain
  for (let i = 0; i < n; i++) { rgb[i * 3] = src[i * 4]; rgb[i * 3 + 1] = src[i * 4 + 1]; rgb[i * 3 + 2] = src[i * 4 + 2]; wgt[i] = hole[i] ? 0 : 1; }

  /* 1. The background from other moments, where the shot allows it. */
  let fromOthers = 0;
  if (samples.length) {
    const acc = new Float32Array(n * 3), cnt = new Uint8Array(n);
    for (const smp of samples) {
      const od = cropOf(smp);
      if (!agrees(od, hole)) continue;
      const r2 = smp.clear ? null : shapeRect(shape, w, h, smp.cx, smp.cy, smp.scale ?? 1);
      for (let ay = 0; ay < ah; ay++) for (let ax = 0; ax < aw; ax++) {
        const i = ay * aw + ax;
        if (!hole[i]) continue;
        const [fx, fy] = toFrame(ax, ay);
        if (r2 && insideAt(bits, shape, r2, fx, fy, 1)) continue;   // the thing was here then too
        acc[i * 3] += od[i * 4]; acc[i * 3 + 1] += od[i * 4 + 1]; acc[i * 3 + 2] += od[i * 4 + 2]; cnt[i]++;
      }
    }
    for (let i = 0; i < n; i++) {
      if (!cnt[i]) continue;
      rgb[i * 3] = acc[i * 3] / cnt[i]; rgb[i * 3 + 1] = acc[i * 3 + 1] / cnt[i]; rgb[i * 3 + 2] = acc[i * 3 + 2] / cnt[i];
      wgt[i] = 1; fromOther[i] = 1; fromOthers++;
    }
  }

  /* 2. The surroundings, for whatever is still missing. */
  if (fromOthers < holes) {
    pullPush(rgb, wgt, aw, ah);
    if (texture > 0) {
      /* Grain matched to the rim: how much the rim's luma departs from its own blur. */
      let dev = 0, cnt3 = 0;
      for (let ay = 1; ay < ah - 1; ay++) for (let ax = 1; ax < aw - 1; ax++) {
        const i = ay * aw + ax;
        if (hole[i]) continue;
        const l = (v) => src[v * 4] * 0.299 + src[v * 4 + 1] * 0.587 + src[v * 4 + 2] * 0.114;
        const m = (l(i - 1) + l(i + 1) + l(i - aw) + l(i + aw)) / 4;
        dev += Math.abs(l(i) - m); cnt3++;
      }
      const amp = cnt3 ? (dev / cnt3) * texture * 1.6 : 0;
      if (amp > 0.2) for (let ay = 0; ay < ah; ay++) for (let ax = 0; ax < aw; ax++) {
        const i = ay * aw + ax;
        if (!hole[i] || fromOther[i]) continue;
        const g = grain(ax, ay, frameIndex) * amp * 2;
        rgb[i * 3] += g; rgb[i * 3 + 1] += g; rgb[i * 3 + 2] += g;
      }
    }
  }

  /* Back to pixels, back to size, in through the soft edge. */
  const out = work._ctx.createImageData(aw, ah);
  const od = out.data;
  for (let i = 0; i < n; i++) {
    od[i * 4] = Math.max(0, Math.min(255, rgb[i * 3])); od[i * 4 + 1] = Math.max(0, Math.min(255, rgb[i * 3 + 1]));
    od[i * 4 + 2] = Math.max(0, Math.min(255, rgb[i * 3 + 2])); od[i * 4 + 3] = 255;
  }
  work._ctx.putImageData(out, 0, 0);

  const patch = canvasFor('erase-patch', R.w, R.h);
  patch._ctx.clearRect(0, 0, R.w, R.h);
  patch._ctx.imageSmoothingEnabled = true;
  patch._ctx.drawImage(work, 0, 0, aw, ah, 0, 0, R.w, R.h);

  /* The edge: the hole as an alpha, blurred by the feather. The hole is drawn at
     working size and scaled up, so its edge is already soft by the scale. */
  const mk = canvasFor('erase-mask', aw, ah);
  const md = mk._ctx.createImageData(aw, ah);
  for (let i = 0; i < n; i++) if (hole[i]) { md.data[i * 4] = 255; md.data[i * 4 + 1] = 255; md.data[i * 4 + 2] = 255; md.data[i * 4 + 3] = 255; }
  mk._ctx.putImageData(md, 0, 0);
  const alpha = canvasFor('erase-alpha', R.w, R.h);
  alpha._ctx.clearRect(0, 0, R.w, R.h);
  alpha._ctx.filter = featherPx > 0.5 ? `blur(${featherPx.toFixed(1)}px)` : 'none';
  alpha._ctx.drawImage(mk, 0, 0, aw, ah, 0, 0, R.w, R.h);
  alpha._ctx.filter = 'none';

  patch._ctx.globalCompositeOperation = 'destination-in';
  patch._ctx.drawImage(alpha, 0, 0);
  patch._ctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(patch, R.x, R.y);
  return true;
}
