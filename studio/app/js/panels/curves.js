/*
 * The curve editor and the LUT slots.
 *
 * A curve control is judged almost entirely on how it feels to drag, so this
 * is written around that rather than around the maths:
 *
 *   • Dragging is pointer-captured, so a fast drag that leaves the canvas does
 *     not drop the point you are holding.
 *   • A point snaps to the diagonal near it, because "put this back" is the
 *     most common thing anyone does to a curve and hunting for exactly 0.5 is
 *     miserable.
 *   • The end points cannot be dragged sideways past each other, so the curve
 *     can never be made non-monotonic in x and cannot produce a table with a
 *     hole in it.
 *   • A histogram of the actual frame sits behind the grid — a curve with no
 *     reference to the picture is guesswork.
 */

import { $, $$, esc, toast } from '../ui.js';
import { S, actions, drawFrame, engine } from '../main.js';
import { CURVE_PRESETS, NEUTRAL_CURVE, curveTable, loadCubeFile, registerLut, loadedLuts } from '../engine/lut.js';
import * as licence from '../licence.js';

const CHANNELS = [
  ['rgb', 'RGB', '#e8edf6'],
  ['r', 'Red', '#ff5d5d'],
  ['g', 'Green', '#4ddc7a'],
  ['b', 'Blue', '#5d9dff'],
];

let active = 'rgb';

/*
 * Whether the Curves section is open, remembered across re-renders.
 *
 * Every drag of a point commits, and committing re-renders the panel. Without
 * this the section collapsed on the first drag and you had to open it again to
 * make a second — which makes the one control people use continuously the one
 * control that fights them. Module-level rather than in the DOM because the
 * DOM is what gets thrown away.
 */
let sectionOpen = false;

export function setCurvesOpen(open) { sectionOpen = Boolean(open); }
export function curvesOpen() { return sectionOpen; }

export function curvesMarkup(clip) {
  const curves = clip?.color?.curves || {};
  return `
    <div class="curve-head">
      ${CHANNELS.map(([id, label, col]) => `
        <button class="curve-tab ${id === active ? 'on' : ''}" data-curve-ch="${id}"
          style="--ch:${col}">${esc(label)}</button>`).join('')}
      <button class="btn btn-sm btn-ghost" data-curve-reset title="Put this channel back to a straight line">Reset</button>
    </div>
    <canvas id="curve-cv" width="480" height="480" class="curve-cv"
      role="application" aria-label="Tone curve. Drag points to reshape it."></canvas>
    <p class="tiny muted" style="margin:7px 0 10px">
      Drag to bend it. Click the line to add a point, drag one off the edge to remove it.
    </p>
    <div class="chips curve-presets">
      ${CURVE_PRESETS.map((p) => `<button class="chip" data-curve-preset="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
    </div>
    ${lutMarkup(clip)}
    <input type="file" id="lut-file" accept=".cube" class="file-hidden" tabindex="-1" aria-hidden="true">`;
}

function lutMarkup(clip) {
  const current = clip?.color?.lut;
  const luts = loadedLuts();
  return `
    <h4 class="curve-h4">LUTs</h4>
    <p class="tiny muted" style="margin:0 0 9px">
      Any <code>.cube</code> file — the format Resolve, Premiere and every LUT pack export.
      It is read on this device and never uploaded.
    </p>
    <div class="btn-row" style="margin-bottom:9px">
      <button class="btn btn-sm" id="lut-add">Load a .cube file</button>
    </div>
    ${luts.length ? `
      <div class="chips">
        <button class="chip ${!current ? 'on' : ''}" data-lut="">None</button>
        ${luts.map((l) => `<button class="chip ${current === l.id ? 'on' : ''}"
          data-lut="${esc(l.id)}" title="${esc(l.name)} — ${l.size}×${l.size}×${l.size}">${esc(l.name)}</button>`).join('')}
      </div>
      ${current ? `<label class="field" style="margin-top:10px">
        <span>Strength</span>
        <input type="range" id="lut-amt" min="0" max="100" step="1"
          value="${Math.round((clip?.color?.lutAmount ?? 1) * 100)}">
      </label>
      <p class="tiny muted" style="margin:4px 0 0">
        A film LUT at full strength is usually too much. Most land somewhere around 60.
      </p>` : ''}`
    : '<p class="tiny muted" style="margin:0">No LUTs loaded yet.</p>'}`;
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

function pointsFor(clip) {
  return clip?.color?.curves?.[active] || NEUTRAL_CURVE;
}

export function drawCurve(host) {
  const cv = $('#curve-cv', host);
  if (!cv) return;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const W = cv.width, H = cv.height;
  const clip = selectedClip();
  const pts = pointsFor(clip);
  const colour = CHANNELS.find(([id]) => id === active)[2];

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10,14,22,.72)';
  ctx.fillRect(0, 0, W, H);

  // The frame's own histogram, behind everything. A curve judged without it is
  // guesswork about where the picture actually lives in the range.
  drawHistogram(ctx, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const p = (i / 4) * W;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
  }
  // The identity diagonal, so "how far have I bent this" is always visible.
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
  ctx.setLineDash([]);

  const table = curveTable(pts);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * W;
    const y = H - (table[i] / 255) * H;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  for (const [px, py] of pts) {
    const x = px * W, y = H - py * H;
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#05080f';
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHistogram(ctx, W, H) {
  const source = engine?.renderer?.canvas || $('#stage-canvas');
  if (!source || !source.width) return;
  try {
    const small = document.createElement('canvas');
    small.width = 160; small.height = 90;
    const g = small.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    const bins = new Float32Array(64);
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      bins[Math.min(63, Math.floor(lum * 64))]++;
    }
    let peak = 0;
    for (const v of bins) if (v > peak) peak = v;
    if (!peak) return;
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    for (let i = 0; i < 64; i++) {
      // Square root, not linear: one enormous spike in the blacks otherwise
      // flattens everything else to nothing and the shape is unreadable.
      const v = Math.sqrt(bins[i] / peak) * H * 0.88;
      ctx.fillRect((i / 64) * W, H - v, W / 64 + 1, v);
    }
  } catch {
    // A tainted canvas is not worth an error — the grid alone still works.
  }
}

function selectedClip() {
  const sel = [...S.sel];
  return sel.length === 1 ? S.project.clips.find((c) => c.id === sel[0]) : null;
}

/* ------------------------------------------------------------------ *
 * Interaction
 * ------------------------------------------------------------------ */

const HIT = 0.045;          // how close counts as grabbing a point, in 0..1
const SNAP = 0.022;         // how close to the diagonal snaps back to it

/*
 * Two ways to write a curve, and the difference matters.
 *
 * `commitCurve` goes through the normal path: it pushes history and rebuilds
 * the panel. `liveCurve` writes to the clip and repaints the viewer without
 * either.
 *
 * Dragging has to use the live one. Committing rebuilds the panel, which
 * replaces the canvas the pointer is captured on — so the first commit mid-drag
 * detaches the element underneath your finger and the rest of the gesture goes
 * nowhere. It also gave one undo step per pixel moved. Live while dragging,
 * one commit when you let go, is both the fix and the behaviour people expect.
 */
function putCurve(clip, points) {
  if (!clip) return;
  clip.color ||= {};
  clip.color.curves ||= {};
  clip.color.curves[active] = points;
}

function liveCurve(points) {
  for (const id of S.sel) putCurve(S.project.clips.find((c) => c.id === id), points);
  drawFrame?.();
}

function commitCurve(points) {
  actions.patchSelected((c) => putCurve(c, points), `Curve ${active}`, `curve:${active}`);
}

export function wireCurves(host) {
  const cv = $('#curve-cv', host);
  if (cv && !cv.dataset.wired) {
    cv.dataset.wired = '1';
    let dragging = -1;

    const toCurve = (e) => {
      const r = cv.getBoundingClientRect();
      return [
        Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
      ];
    };

    cv.addEventListener('pointerdown', (e) => {
      const clip = selectedClip();
      if (!clip) { toast('Select a clip to grade it'); return; }
      const [x, y] = toCurve(e);
      const pts = pointsFor(clip).map((p) => [...p]);

      let idx = pts.findIndex(([px, py]) => Math.hypot(px - x, py - y) < HIT);
      if (idx < 0) {
        // Clicking the line adds a point there rather than doing nothing.
        pts.push([x, y]);
        pts.sort((a, b) => a[0] - b[0]);
        idx = pts.findIndex(([px, py]) => px === x && py === y);
        liveCurve(pts);
        drawCurve(host);
      }
      dragging = idx;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    cv.addEventListener('pointermove', (e) => {
      if (dragging < 0) return;
      const clip = selectedClip();
      if (!clip) return;
      const [rx, ry] = toCurve(e);
      const pts = pointsFor(clip).map((p) => [...p]);
      if (!pts[dragging]) { dragging = -1; return; }

      let x = rx, y = ry;
      // The ends stay at the ends. Letting them wander in x leaves a range with
      // no curve over it, and the table has to invent what happens there.
      if (dragging === 0) x = 0;
      else if (dragging === pts.length - 1) x = 1;
      else {
        // Never past a neighbour: that is what would make the curve fold back
        // on itself and produce a lookup table with two answers.
        const lo = pts[dragging - 1][0] + 0.012;
        const hi = pts[dragging + 1][0] - 0.012;
        x = Math.min(hi, Math.max(lo, x));
      }
      // Snap to the diagonal — "put this back" is the commonest gesture and
      // hunting for exactly the identity by hand is miserable.
      if (Math.abs(y - x) < SNAP) y = x;

      pts[dragging] = [x, y];
      liveCurve(pts);
      drawCurve(host);
      e.preventDefault();
    });

    const release = (e) => {
      if (dragging < 0) return;
      const clip = selectedClip();
      let pts = clip ? pointsFor(clip).map((p) => [...p]) : null;

      // Dragged off the top or bottom edge: remove it. Interior points only —
      // losing an end point would leave the curve undefined at that end.
      if (pts && dragging > 0 && dragging < pts.length - 1 && pts.length > 2) {
        const r = cv.getBoundingClientRect();
        if (e.clientY < r.top - 24 || e.clientY > r.bottom + 24) pts.splice(dragging, 1);
      }

      dragging = -1;
      try { cv.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
      // The one commit for the whole gesture. This rebuilds the panel, which
      // is why it cannot happen any earlier.
      if (pts) commitCurve(pts);
    };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);
  }

  host.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-curve-ch]');
    if (tab) {
      active = tab.dataset.curveCh;
      $$('[data-curve-ch]', host).forEach((b) => b.classList.toggle('on', b === tab));
      drawCurve(host);
      return;
    }

    if (e.target.closest('[data-curve-reset]')) {
      commitCurve(NEUTRAL_CURVE.map((p) => [...p]));
      return;
    }

    const preset = e.target.closest('[data-curve-preset]');
    if (preset) {
      const found = CURVE_PRESETS.find((p) => p.id === preset.dataset.curvePreset);
      if (found) {
        commitCurve(found.points.map((p) => [...p]));
      }
      return;
    }

    if (e.target.closest('#lut-add')) {
      licence.gate('luts', () => $('#lut-file', host)?.click(), { what: 'Custom LUTs' });
      return;
    }

    const pick = e.target.closest('[data-lut]');
    if (pick) {
      const id = pick.dataset.lut || null;
      actions.patchSelected((c) => {
        c.color ||= {};
        c.color.lut = id;
        if (id && c.color.lutAmount === undefined) c.color.lutAmount = 1;
      }, id ? 'Apply LUT' : 'Remove LUT');
      drawFrame?.();
    }
  });

  host.addEventListener('input', (e) => {
    if (e.target.id !== 'lut-amt') return;
    actions.patchSelected((c) => {
      c.color ||= {};
      c.color.lutAmount = Number(e.target.value) / 100;
    }, 'LUT strength', 'lut:amount');
    drawFrame?.();
  });

  $('#lut-file', host)?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const lut = registerLut(await loadCubeFile(file));
      actions.patchSelected((c) => {
        c.color ||= {};
        c.color.lut = lut.id;
        c.color.lutAmount = c.color.lutAmount ?? 1;
      }, `Apply ${lut.name}`);
      toast(`${lut.name} loaded — ${lut.size}×${lut.size}×${lut.size}`, 'ok');
      drawFrame?.();
    } catch (err) {
      // The parser's messages say what is actually wrong with the file, which
      // is far more use than "could not load".
      toast(err.message, 'bad', 6000);
    }
  });
}
