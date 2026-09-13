/*
 * Dragging a window on the picture.
 *
 * Numeric fields alone would be technically complete and nobody would use
 * them: a window is a shape over a face, and you place it by looking at the
 * face. Five handles — the body to move it, four corners to size it, and one
 * arm to turn it — which is the same set every grading tool offers because it
 * is the smallest set that does the job.
 *
 * Everything is a fraction of the frame, never pixels, so a window placed on a
 * 540p preview is in the same place in a 4K export.
 */

import { $, drag, clamp } from './ui.js';
import { S, actions, drawFrame } from './main.js';
import { pickedMask, setPicked, pickerArmed, pickColourAt } from './panels/masks.js';

let layer = null;
let onChange = null;

export function initMaskUi({ refreshPanel } = {}) {
  layer = $('#mask-layer');
  onChange = refreshPanel;
  if (!layer) return;

  layer.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip) return;
    startDrag(e, grip.dataset.grip);
  });

  /*
   * The eyedropper reads the canvas, not the screen.
   *
   * Reading the screen would give whatever the browser composited — including
   * the page's own background where the picture is letterboxed — and picking a
   * colour off the letterbox is a confusing way to select nothing.
   */
  const stage = $('#stage') || $('.stage');
  stage?.addEventListener('click', (e) => {
    if (!pickerArmed()) return;
    const cv = $('#preview');
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * cv.width);
    const y = Math.round(((e.clientY - r.top) / r.height) * cv.height);
    if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    if (pickColourAt(d[0], d[1], d[2])) { onChange?.(); drawFrame(); }
  }, true);
}

function selectedClip() {
  const sel = [...S.sel];
  return sel.length === 1 ? S.project.clips.find((c) => c.id === sel[0]) : null;
}

function currentMask() {
  const clip = selectedClip();
  const id = pickedMask();
  if (!clip || !id) return null;
  const mask = (clip.masks || []).find((m) => m.id === id);
  return mask ? { clip, mask } : null;
}

/** Redraw the handles. Called whenever the frame or the selection changes. */
export function paintMaskUi() {
  if (!layer) return;
  const found = currentMask();
  const cv = $('#preview');
  if (!found || !cv) { layer.hidden = true; layer.innerHTML = ''; return; }

  const { mask } = found;
  /*
   * Positioned against the canvas rather than the stage.
   *
   * The picture is letterboxed inside the stage whenever the canvas aspect and
   * the stage aspect differ, and a handle placed against the stage sits in the
   * black bars — near the shape at 16:9 and nowhere near it at 9:16.
   */
  const stage = layer.parentElement;
  const sr = stage.getBoundingClientRect();
  const cr = cv.getBoundingClientRect();
  const left = cr.left - sr.left, top = cr.top - sr.top;

  const px = (fx) => left + fx * cr.width;
  const py = (fy) => top + fy * cr.height;
  const w = mask.w * cr.width, h = mask.h * cr.height;
  const cx = px(mask.x), cy = py(mask.y);

  layer.hidden = false;
  layer.innerHTML = `
    <div class="mask-shape ${mask.shape}" data-grip="move" style="
      left:${cx}px; top:${cy}px; width:${w}px; height:${h}px;
      transform:translate(-50%,-50%) rotate(${mask.angle || 0}deg);">
      <span class="mg tl" data-grip="tl"></span>
      <span class="mg tr" data-grip="tr"></span>
      <span class="mg bl" data-grip="bl"></span>
      <span class="mg br" data-grip="br"></span>
      <span class="mg rot" data-grip="rot"></span>
    </div>`;
}

function startDrag(e, grip) {
  const found = currentMask();
  if (!found) return;
  const { clip, mask } = found;
  const cv = $('#preview');
  if (!cv) return;
  const cr = cv.getBoundingClientRect();

  const from = { x: mask.x, y: mask.y, w: mask.w, h: mask.h, angle: mask.angle || 0 };
  const startAngle = Math.atan2(e.clientY - (cr.top + mask.y * cr.height),
                                e.clientX - (cr.left + mask.x * cr.width));
  let touched = false;

  drag(e, {
    move: (dx, dy, ev) => {
      const fx = dx / cr.width, fy = dy / cr.height;
      if (grip === 'move') {
        mask.x = clamp(from.x + fx, -0.5, 1.5);
        mask.y = clamp(from.y + fy, -0.5, 1.5);
      } else if (grip === 'rot') {
        const a = Math.atan2(ev.clientY - (cr.top + mask.y * cr.height),
                             ev.clientX - (cr.left + mask.x * cr.width));
        let deg = from.angle + ((a - startAngle) * 180) / Math.PI;
        // Shift snaps to fifteen degrees, so a horizon window can be level.
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        mask.angle = ((deg + 540) % 360) - 180;
      } else {
        /*
         * A corner resizes about the centre rather than about the opposite
         * corner. A window is a thing you put *over* something, so keeping the
         * middle still is what keeps it over it — dragging a corner and
         * watching the shape walk off the face is the alternative.
         */
        const signX = grip.includes('l') ? -1 : 1;
        const signY = grip.includes('t') ? -1 : 1;
        mask.w = clamp(from.w + signX * fx * 2, 0.02, 3);
        mask.h = clamp(from.h + signY * fy * 2, 0.02, 3);
      }
      touched = true;
      paintMaskUi();
      drawFrame();
    },
    end: () => {
      if (!touched) return;
      actions.commit('Move the window', `mask:${mask.id}`);
      onChange?.();
    },
  });
  void clip;
}

export { setPicked };
