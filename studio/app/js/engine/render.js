/*
 * The compositor.
 *
 * One function matters: draw the timeline at time t onto a canvas. The preview
 * calls it sixty times a second and the exporter calls it for every frame it
 * writes, so what you see while editing is what comes out the other end —
 * there is no second rendering path to disagree with the first.
 *
 * Per clip the order is: source frame → crop → transform → CSS-filter grade →
 * composited grade passes → blend onto the frame. Transitions take two of
 * those finished clip canvases and combine them.
 */

import { activeAt, clipsOn, valueAt, animatedColor, mediaById, sourceTime, speedAt } from './project.js';
import { hasMask, combinedMatte, qualifierIsOn, maskMatte } from './mask.js';
import {
  resolved, cssFilter, applyPasses, isIdentity,
  wheelFilter, applyWheelsFallback, wheelsAreNeutral, supportsUrlFilters,
} from './filters.js';
import { drawTransition } from './transitions.js';
import { drawText, CAPTION_STYLES } from './titles.js';
import { applyEffects } from './effects.js';
import { drawSticker } from './stickers.js';
import { elementFor } from './media.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.scratch = [document.createElement('canvas'), document.createElement('canvas')];
    this.scratchCtx = this.scratch.map((c) => c.getContext('2d'));
    this.quality = 1;
    this.pendingSeeks = new Set();
    this.onNeedsRedraw = null;
    // Set by the app so beat-reactive effects know where they are in the bar.
    this.beats = null;
    this.fps = 30;
    // Motion blur re-renders the clip at sub-frame offsets, which needs a
    // canvas nothing else is using that frame.
    this._blur = document.createElement('canvas');
    this._blurCtx = this._blur.getContext('2d');
  }

  resize(w, h) {
    /*
     * The guard checks the scratch as well as the output.
     *
     * It used to test the output canvas alone and return early, which assumes
     * the scratch is always in step with it — true once the app is running,
     * and false the first time, when the output has already been sized by
     * whoever created it and the scratch is still at the HTML default of
     * 300x150. Everything then rendered at 300x150 and was sampled at the real
     * size, so every measurement landed somewhere else on the picture.
     */
    const sized = this.canvas.width === w && this.canvas.height === h
      && this.scratch.every((c) => c.width === w && c.height === h);
    if (sized) return;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const c of this.scratch) { c.width = w; c.height = h; }
    this._blur.width = w;
    this._blur.height = h;
  }

  /** Where we are between beats, 0 at the beat and 1 just before the next. */
  _beatPhase(t) {
    const grid = this.beats;
    if (!grid?.period) return undefined;
    const since = t - (grid.beats?.[0] ?? 0);
    if (since < 0) return undefined;
    return (since % grid.period) / grid.period;
  }

  /**
   * Paint the whole frame.
   *
   * `playing` matters: while the transport is running the video elements are
   * playing themselves and we just take whatever frame they're showing. When
   * parked we have to seek them, which is asynchronous — so a scrub paints the
   * nearest available frame immediately and repaints when the seek lands.
   * That is why scrubbing stays responsive instead of stuttering.
   */
  draw(project, t, { playing = false, forExport = false } = {}) {
    const { ctx } = this;
    const w = this.canvas.width, h = this.canvas.height;

    /*
     * Looking at the matte instead of the picture.
     *
     * Not a debugging view — it is how a qualifier is actually set. Nobody
     * keys a colour by looking at the picture; you look at the selection, get
     * its edges clean, and only then look at what the grade did. Never used
     * for export, which is why it is checked here and not stored on the clip.
     */
    if (this.showMatte && !forExport) {
      const drawn = this._drawMatte(project, t, w, h);
      if (drawn) return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = project.settings.background || '#000';
    ctx.fillRect(0, 0, w, h);

    const visible = activeAt(project, t).filter((c) => {
      const track = project.tracks.find((tr) => tr.id === c.trackId);
      return track && track.kind === 'video' && !track.hidden;
    });

    for (const clip of visible) {
      const trans = this._transitionAt(project, clip, t);
      if (trans) {
        const to = this._clipCanvas(project, clip, t, 0, playing, forExport);
        const from = this._clipCanvas(project, trans.other, t, 1, playing, forExport);
        drawTransition(trans.type, ctx, w, h, from, to, trans.progress);
      } else {
        const cv = this._clipCanvas(project, clip, t, 0, playing, forExport);
        if (cv) {
          const local = t - clip.start;
          const op = valueAt(clip, 'transform.opacity', local, clip.transform.opacity ?? 1);
          ctx.globalAlpha = Math.max(0, Math.min(1, op));
          ctx.globalCompositeOperation = blendOf(clip.transform.blend);
          ctx.drawImage(cv, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    this._drawCaptions(project, t, w, h);
    ctx.restore();
  }

  /**
   * Paint the selection of whatever clip is under the playhead, in black and
   * white. Returns false when there is nothing selected to show, so the normal
   * draw carries on rather than leaving a black screen with no explanation.
   */
  _drawMatte(project, t, w, h) {
    const clip = activeAt(project, t).find((c) => {
      const track = project.tracks.find((tr) => tr.id === c.trackId);
      return track && track.kind === 'video' && !track.hidden
        && (hasMask(c, 'grade') || hasMask(c, 'clip') || qualifierIsOn(c.color?.qualifier));
    });
    if (!clip) return false;

    // The qualifier keys off the picture, so the picture has to exist first.
    const src = this._clipCanvas(project, clip, t, 0, false, false, true);
    if (!src) return false;
    const target = this._gradeCtx(w, h);
    target.clearRect(0, 0, w, h);
    target.drawImage(src, 0, 0);

    const matte = combinedMatte(clip, hasMask(clip, 'clip') ? 'clip' : 'grade',
      target, w, h, t - clip.start);
    const { ctx } = this;
    ctx.save();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (matte) {
      // The matte carries its shape in alpha; painted white on black it is the
      // black-and-white picture a colourist expects to see.
      ctx.drawImage(matte, 0, 0);
    }
    ctx.restore();
    return true;
  }

  /** The off-screen canvas a windowed grade is built on. One, reused. */
  _gradeCtx(w, h) {
    if (!this._gradeCanvas || this._gradeCanvas.width !== w || this._gradeCanvas.height !== h) {
      this._gradeCanvas = document.createElement('canvas');
      this._gradeCanvas.width = w;
      this._gradeCanvas.height = h;
      this._gradeCtxCache = this._gradeCanvas.getContext('2d', { willReadFrequently: true });
    }
    return this._gradeCtxCache;
  }

  /* ---------------- one clip, fully graded, on a scratch canvas -------- */

  _clipCanvas(project, clip, t, slot, playing, forExport, skipEffects = false) {
    const cv = this.scratch[slot];
    const ctx = this.scratchCtx[slot];
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);

    if (clip.kind === 'title') {
      const local = t - clip.start;
      drawText(ctx, w, h, clip.text, Math.max(0, local), clip.dur);
      if (!skipEffects && clip.effects?.length) this._runEffects(ctx, w, h, clip, t, project);
      return cv;
    }

    if (clip.kind === 'sticker') {
      const local = t - clip.start;
      drawSticker(ctx, w, h, clip.sticker, Math.max(0, local), clip.dur, this._beatPhase(t));
      if (!skipEffects && clip.effects?.length) this._runEffects(ctx, w, h, clip, t, project);
      return cv;
    }

    const media = mediaById(project, clip.mediaId);
    if (!media || media.missing) return null;
    // forExport is the only thing that decides this, and it must stay that way.
    const node = elementFor(media, clip.id, { preferProxy: !forExport });
    if (!node) return null;

    // Where in the source we want to be. Deliberately not clamped to the clip:
    // during a transition the outgoing clip keeps rolling past its out point,
    // which is what makes a cross dissolve look like a dissolve and not a
    // freeze frame held against the incoming shot.
    const local = t - clip.start;
    // Deliberately not clamped to the clip: during a transition the outgoing
    // clip keeps rolling past its out point, which is what makes a cross
    // dissolve look like a dissolve rather than a freeze held against the
    // incoming shot. sourceTime handles the ramp; this handles the overrun.
    const src = local < 0 || local > clip.dur
      ? clip.in + local * speedAt(clip, Math.max(0, Math.min(clip.dur, local)))
      : sourceTime(clip, t);

    if (media.kind === 'video') {
      if (!node.videoWidth) return null;
      if (!playing || forExport) this._seek(node, src, forExport);
    } else if (media.kind === 'image') {
      if (!node.complete || !node.naturalWidth) return null;
    } else {
      return null;                             // audio contributes no picture
    }

    const sw = media.kind === 'image' ? node.naturalWidth : node.videoWidth;
    const sh = media.kind === 'image' ? node.naturalHeight : node.videoHeight;
    if (!sw || !sh) return null;

    /* ---- crop, in source pixels ---- */
    const crop = clip.transform.crop || { t: 0, r: 0, b: 0, l: 0 };
    const cx = sw * (crop.l || 0);
    const cy = sh * (crop.t || 0);
    const cw = sw * (1 - (crop.l || 0) - (crop.r || 0));
    const ch = sh * (1 - (crop.t || 0) - (crop.b || 0));
    if (cw <= 1 || ch <= 1) return null;

    /* ---- fit the cropped source into the frame, then transform ---- */
    const cover = Math.max(w / cw, h / ch);          // fill the frame, no bars
    const scale = cover * valueAt(clip, 'transform.scale', local, clip.transform.scale ?? 1);
    const dw = cw * scale, dh = ch * scale;
    const dx = (w - dw) / 2 + valueAt(clip, 'transform.x', local, clip.transform.x || 0) * w;
    const dy = (h - dh) / 2 + valueAt(clip, 'transform.y', local, clip.transform.y || 0) * h;
    const rotate = valueAt(clip, 'transform.rotate', local, clip.transform.rotate || 0);

    // Keyframed exposure, contrast, saturation and the rest resolve here, so a
    // grade can ramp across a clip the same way a position can.
    const graded = animatedColor(clip, local);
    const grade = resolved(graded);

    /*
     * A windowed grade is two renders, not one.
     *
     * The grade is a filter on the draw, so limiting it to a shape means
     * drawing the clip twice — once plain, once graded — and letting the mask
     * decide which one you see where. There is no cheaper way round it in
     * Canvas 2D, and it only happens when a window or a qualifier is actually
     * switched on, which for most clips is never.
     */
    const windowed = hasMask(clip, 'grade') || qualifierIsOn(clip.color?.qualifier);

    if (windowed) {
      // Pass one: the ungraded picture, which is what shows outside the window.
      ctx.save();
      if (rotate) {
        ctx.translate(w / 2, h / 2);
        ctx.rotate((rotate * Math.PI) / 180);
        ctx.translate(-w / 2, -h / 2);
      }
      try { ctx.drawImage(node, cx, cy, cw, ch, dx, dy, dw, dh); }
      catch { ctx.restore(); return null; }
      ctx.restore();
    }

    // The wheels are an SVG filter chained onto the CSS one, so both stages
    // happen in a single GPU pass rather than a read-back.
    const wheels = wheelFilter(clip.id, clip.color.wheels);
    const css = cssFilter(grade);
    const target = windowed ? this._gradeCtx(w, h) : ctx;
    if (windowed) target.clearRect(0, 0, w, h);
    ctx.save();
    if (windowed) { /* the graded pass is built off screen and masked back on */ }
    ctx.filter = wheels ? (css === 'none' ? wheels : `${css} ${wheels}`) : css;
    if (rotate) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.translate(-w / 2, -h / 2);
    }
    if (windowed) {
      target.save();
      target.filter = ctx.filter;
      if (rotate) {
        target.translate(w / 2, h / 2);
        target.rotate((rotate * Math.PI) / 180);
        target.translate(-w / 2, -h / 2);
      }
      try { target.drawImage(node, cx, cy, cw, ch, dx, dy, dw, dh); }
      catch { target.restore(); ctx.restore(); return null; }
      target.restore();
      target.filter = 'none';
      ctx.restore();
      ctx.filter = 'none';
    } else {
      try {
        ctx.drawImage(node, cx, cy, cw, ch, dx, dy, dw, dh);
      } catch {
        ctx.restore();
        return null;                                 // frame not decoded yet
      }
      ctx.restore();
      ctx.filter = 'none';
    }

    if (!isIdentity(graded)) applyPasses(target, w, h, grade);
    // Only when the GPU path is unavailable — otherwise this would double up.
    if (!supportsUrlFilters() && !wheelsAreNeutral(clip.color.wheels)) {
      applyWheelsFallback(target, w, h, clip.color.wheels);
    }

    if (windowed) {
      /*
       * The qualifier reads the *graded* pass on purpose.
       *
       * Keying off the original would mean the selection drifts as soon as you
       * touch the grade — you pick the sky, push the blue, and the key you
       * picked no longer describes what is on screen. Reading the result keeps
       * what you selected and what you are looking at the same thing.
       */
      const matte = combinedMatte(clip, 'grade', target, w, h, local);
      if (matte) {
        target.globalCompositeOperation = 'destination-in';
        target.drawImage(matte, 0, 0);
        target.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(target.canvas, 0, 0);
    }

    if (!skipEffects && clip.effects?.length) {
      applyEffects(ctx, w, h, clip, {
        clip,
        local,
        time: t,
        fps: project.settings.fps || this.fps,
        beatPhase: this._beatPhase(t),
        // Motion blur asks for the clip at other moments in the exposure. It
        // renders into a canvas of its own with effects off, so this cannot
        // recurse.
        redrawClip: (localT) => {
          const src = this._clipCanvas(
            project, clip, clip.start + localT, slot === 0 ? 1 : 0, playing, forExport, true,
          );
          if (!src) return null;
          this._blurCtx.clearRect(0, 0, w, h);
          this._blurCtx.drawImage(src, 0, 0);
          return this._blur;
        },
      });
    }

    /*
     * A mask aimed at the clip cuts the picture itself, not the grade.
     *
     * This is the compositing use — the shape of a layer rather than the reach
     * of a treatment — so it runs after the effects, where what is left is the
     * finished picture. Anything outside it becomes transparent and whatever
     * is on the layer below shows through.
     */
    if (hasMask(clip, 'clip')) {
      const cut = maskMatte(clip, 'clip', w, h, local);
      if (cut) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(cut, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Clip-level fades sit on top of everything, including the grade.
    const fade = fadeAlpha(clip, local);
    if (fade < 1) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    return cv;
  }

  /** Effects for clips with no source frame (titles, stickers). */
  _runEffects(ctx, w, h, clip, t, project) {
    applyEffects(ctx, w, h, clip, {
      clip,
      local: t - clip.start,
      time: t,
      fps: project.settings.fps || this.fps,
      beatPhase: this._beatPhase(t),
      redrawClip: null,
    });
  }

  /* ---------------- transitions ---------------- */

  /**
   * Is this clip inside a transition right now, and with which neighbour?
   * A transition is stored on the incoming clip and occupies its first
   * `dur` seconds, so only one clip ever owns it and there is no chance of two
   * neighbours disagreeing about what should happen at the cut.
   */
  _transitionAt(project, clip, t) {
    const tin = clip.transitionIn;
    if (!tin || !tin.dur) return null;
    const into = t - clip.start;
    if (into < 0 || into > tin.dur) return null;

    const neighbours = clipsOn(project, clip.trackId);
    const idx = neighbours.findIndex((c) => c.id === clip.id);
    const prev = idx > 0 ? neighbours[idx - 1] : null;
    // A transition with nothing before it becomes a fade from the background,
    // which is what people mean when they put one at the top of a timeline.
    return { type: tin.type || 'dissolve', progress: into / tin.dur, other: prev };
  }

  /* ---------------- captions ---------------- */

  _drawCaptions(project, t, w, h) {
    if (!project.captions?.length) return;
    for (const cue of project.captions) {
      if (t < cue.start || t >= cue.end) continue;
      const style = { ...(CAPTION_STYLES[cue.style || 'tiktok'] || CAPTION_STYLES.tiktok) };
      drawText(this.ctx, w, h, {
        ...style,
        content: cue.text,
        maxWidth: 0.84,
        size: style.size,
        y: cue.y ?? style.y,
        animDur: 0.22,
      }, t - cue.start, cue.end - cue.start);
    }
  }

  /* ---------------- seeking ---------------- */

  /**
   * Nudge a video element to the frame we want.
   *
   * The tolerance is roughly one frame. Seeking on every draw would thrash the
   * decoder and make scrubbing worse, not better, so we only ask when the
   * element is genuinely showing the wrong moment, and we never queue a second
   * seek while one is in flight.
   */
  _seek(node, time, waitForIt) {
    const target = Math.max(0, Math.min(time, (node.duration || 0) - 0.02));
    if (Math.abs(node.currentTime - target) < 0.034) return;
    if (this.pendingSeeks.has(node) && !waitForIt) return;

    this.pendingSeeks.add(node);
    const done = () => {
      this.pendingSeeks.delete(node);
      if (!waitForIt) this.onNeedsRedraw?.();
    };
    node.addEventListener('seeked', done, { once: true });
    try { node.currentTime = target; } catch { this.pendingSeeks.delete(node); }
  }

  /** Export needs every element parked on the exact frame before it captures. */
  async settle(project, t) {
    const jobs = [];
    for (const clip of activeAt(project, t)) {
      const media = mediaById(project, clip.mediaId);
      if (!media || media.kind !== 'video') continue;
      const node = elementFor(media, clip.id);
      if (!node || !node.duration) continue;
      const target = Math.max(0, Math.min(sourceTime(clip, t), node.duration - 0.02));
      if (Math.abs(node.currentTime - target) < 0.012) continue;
      jobs.push(new Promise((resolve) => {
        const finish = () => { clearTimeout(bail); resolve(); };
        const bail = setTimeout(finish, 900);
        node.addEventListener('seeked', finish, { once: true });
        try { node.currentTime = target; } catch { finish(); }
      }));
    }
    await Promise.all(jobs);
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function fadeAlpha(clip, local) {
  let a = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) a = Math.min(a, local / clip.fadeIn);
  const fromEnd = clip.dur - local;
  if (clip.fadeOut > 0 && fromEnd < clip.fadeOut) a = Math.min(a, fromEnd / clip.fadeOut);
  return Math.max(0, Math.min(1, a));
}

const BLENDS = {
  normal: 'source-over', screen: 'screen', multiply: 'multiply', overlay: 'overlay',
  add: 'lighter', darken: 'darken', lighten: 'lighten', 'soft-light': 'soft-light',
  'hard-light': 'hard-light', difference: 'difference', exclusion: 'exclusion',
};
export const BLEND_MODES = Object.keys(BLENDS);
function blendOf(name) { return BLENDS[name] || 'source-over'; }
