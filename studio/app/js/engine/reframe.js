/*
 * Reframing an edit for another shape.
 *
 * The renderer already fills the frame: a clip is scaled to cover the canvas
 * and the transform's x and y slide the picture behind it. So a 16:9 edit
 * becomes a 9:16 one by changing the canvas and deciding, per clip, which
 * part of the wider picture to keep. Left alone, that is the middle — which
 * is right for a centred subject and wrong for a person standing at the
 * left of a wide shot. When a clip has been tracked, the track knows where
 * the subject is, and the crop is centred on it instead.
 *
 * The person's own framing is respected: a clip they have already slid or
 * scaled keeps that on the new canvas, clamped so the frame stays covered.
 * Nothing here touches the project on the timeline; it works on a copy.
 */

import { RATIOS } from './project.js';

/** A deep copy with the canvas set to `ratio`, every shot reframed. */
export function reframedCopy(project, ratio, { tracks = null } = {}) {
  const r = RATIOS[ratio];
  if (!r) throw new Error(`${ratio} is not a ratio this app knows.`);
  const copy = JSON.parse(JSON.stringify(project));
  const from = { w: project.settings.width, h: project.settings.height };
  copy.settings.ratio = ratio;
  copy.settings.width = r.w;
  copy.settings.height = r.h;
  const trackFor = (clip) => (tracks || project.motionTracks || []).find((t) => t.sourceClipId === clip.id && t.points?.length);
  for (const clip of copy.clips) {
    if (clip.kind === 'title' || clip.kind === 'sticker') continue;
    const media = project.media.find((m) => m.id === clip.mediaId);
    if (!media?.width || !media?.height) continue;
    const t = clip.transform || {};
    const crop = t.crop || { t: 0, r: 0, b: 0, l: 0 };
    const cw = media.width * (1 - (crop.l || 0) - (crop.r || 0));
    const ch = media.height * (1 - (crop.t || 0) - (crop.b || 0));
    const userScale = t.scale ?? 1;
    const track = trackFor(clip);
    if (track) {
      // The subject's average position in source coordinates (the tracker
      // reads the source frame), sat at the centre of the new canvas.
      const pts = track.points.filter((p) => !p.filled);
      const use = pts.length ? pts : track.points;
      const sx = use.reduce((a, p) => a + p.x, 0) / use.length;
      const sy = use.reduce((a, p) => a + p.y, 0) / use.length;
      Object.assign(clip.transform, centreOn(r, cw, ch, userScale, sx, sy));
    } else {
      // Keep what they had, expressed for the new canvas, and keep it covered.
      const cover0 = Math.max(from.w / cw, from.h / ch);
      const cover1 = Math.max(r.w / cw, r.h / ch);
      const dw0 = cw * cover0 * userScale, dh0 = ch * cover0 * userScale;
      const dw1 = cw * cover1 * userScale, dh1 = ch * cover1 * userScale;
      // The offset in source pixels stays the same; it is re-expressed as a fraction of the new canvas.
      const offX = (t.x || 0) * from.w / (dw0 / cw);
      const offY = (t.y || 0) * from.h / (dh0 / ch);
      clip.transform.x = clampOffset(offX * (dw1 / cw) / r.w, dw1, r.w);
      clip.transform.y = clampOffset(offY * (dh1 / ch) / r.h, dh1, r.h);
    }
  }
  return copy;
}

/*
 * The transform that puts source point (sx, sy) — fractions of the cropped
 * source — at the centre of a canvas of size r. Cover scale dw × dh; the
 * point lands at dx + sx·dw where dx = (W − dw)/2 + x·W, so x = dw(½ − sx)/W,
 * clamped to what keeps the canvas covered.
 */
function centreOn(r, cw, ch, userScale, sx, sy) {
  const cover = Math.max(r.w / cw, r.h / ch) * userScale;
  const dw = cw * cover, dh = ch * cover;
  return {
    x: clampOffset((dw * (0.5 - sx)) / r.w, dw, r.w),
    y: clampOffset((dh * (0.5 - sy)) / r.h, dh, r.h),
  };
}

function clampOffset(x, drawn, canvas) {
  const room = Math.max(0, (drawn - canvas) / 2 / canvas);
  return Number(Math.max(-room, Math.min(room, x)).toFixed(4));
}

/** The everyday shapes, in the order people post them. */
export const PLATFORM_SET = [
  { ratio: '9:16', label: 'Vertical — TikTok, Reels, Shorts', suffix: 'vertical' },
  { ratio: '16:9', label: 'Landscape — YouTube', suffix: 'landscape' },
  { ratio: '1:1', label: 'Square — feed', suffix: 'square' },
  { ratio: '4:5', label: 'Portrait — Instagram feed', suffix: 'portrait' },
];
