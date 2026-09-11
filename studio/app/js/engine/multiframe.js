/*
 * Seeing every platform's crop at once.
 *
 * The problem this solves is a specific, expensive one: you cut a video in
 * 9:16, post it, and the subject's head is out of frame on YouTube — or you cut
 * in 16:9 and the caption you carefully placed is under TikTok's UI. You find
 * out after posting, because the editor only ever showed you one shape.
 *
 * So the frame is composited once, at the project's own ratio, and then
 * *inspected* through every other ratio's crop. Nothing is re-rendered per
 * ratio: there is one picture, and the overlays are windows onto it. That is
 * what makes this affordable enough to leave switched on while you work — it
 * costs one extra draw per ratio at thumbnail size, not four full renders.
 *
 * What it deliberately does NOT do is change the project. The canvas stays the
 * shape you set. This answers "what would this look like over there", which is
 * a question you want answered continuously and without committing to anything.
 */

import { RATIOS } from './project.js';

/* The three anyone actually posts to, in the order they matter to most people
   here. More exist in RATIOS; showing all five is a wall, not a check. */
export const CHECK_RATIOS = ['9:16', '16:9', '1:1'];

/**
 * The rectangle a target ratio takes out of a source frame.
 *
 * Centre-cropped, which is what every platform does when it reframes for you —
 * so this shows the crop that will actually happen, not a kinder one.
 */
export function cropFor(srcW, srcH, targetRatio) {
  const t = RATIOS[targetRatio];
  if (!t) return { x: 0, y: 0, w: srcW, h: srcH };
  const want = t.w / t.h;
  const have = srcW / srcH;
  if (have > want) {
    const w = srcH * want;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  const h = srcW / want;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}

/**
 * Where a platform's own interface covers the picture.
 *
 * Fractions of the frame, measured from real screenshots of each app. They are
 * approximate by nature — every app moves its buttons eventually — but being
 * roughly right about where TikTok's caption block sits is worth far more than
 * being exactly right about nothing, which is the alternative.
 */
export const PLATFORM_UI = {
  '9:16': { top: 0.06, bottom: 0.24, right: 0.16, label: 'TikTok / Reels / Shorts' },
  '16:9': { top: 0.0, bottom: 0.12, right: 0, label: 'YouTube' },
  '1:1':  { top: 0.0, bottom: 0.08, right: 0, label: 'Feed post' },
};

/**
 * Draw one ratio's view of the frame into a thumbnail canvas.
 *
 * `showUi` shades the parts a platform's own interface sits over. That shading
 * is the whole point of the feature for captions: a subtitle that is legible in
 * the editor and behind TikTok's description is a subtitle nobody reads.
 */
export function drawCheck(dest, source, ratio, { showUi = true } = {}) {
  const ctx = dest.getContext('2d');
  const W = dest.width, H = dest.height;
  ctx.clearRect(0, 0, W, H);
  if (!source || !source.width) return;

  const crop = cropFor(source.width, source.height, ratio);
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);

  if (!showUi) return;
  const ui = PLATFORM_UI[ratio];
  if (!ui) return;
  ctx.fillStyle = 'rgba(4,8,16,.56)';
  if (ui.top) ctx.fillRect(0, 0, W, H * ui.top);
  if (ui.bottom) ctx.fillRect(0, H * (1 - ui.bottom), W, H * ui.bottom);
  if (ui.right) ctx.fillRect(W * (1 - ui.right), H * ui.top, W * ui.right, H * (1 - ui.top - ui.bottom));

  // A hairline at the edge of the safe area rather than only shading. On a
  // dark shot the shading alone is nearly invisible, which is exactly when
  // somebody puts a caption where it will be covered.
  ctx.strokeStyle = 'rgba(255,214,10,.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.rect(0.5, H * ui.top + 0.5, W * (1 - ui.right) - 1, H * (1 - ui.top - ui.bottom) - 1);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * How much of the frame a ratio throws away.
 *
 * Reported as a percentage because "you lose 44% of this shot on YouTube" is a
 * sentence somebody acts on, and a crop rectangle is not.
 */
export function lossFor(srcW, srcH, ratio) {
  const crop = cropFor(srcW, srcH, ratio);
  return 1 - (crop.w * crop.h) / (srcW * srcH);
}
