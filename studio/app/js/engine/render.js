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

import { activeAt, audibleAt, clipsOn, valueAt, animatedColor, mediaById, sourceTime, speedAt } from './project.js';
import { setFrame } from './frame-context.js';
import { analyse, analysisOf, levelAt, spectrumAt, waveAround } from './audio-analysis.js';
import { hasMask, combinedMatte, qualifierIsOn, maskMatte } from './mask.js';
import {
  resolved, cssFilter, applyPasses, isIdentity,
  wheelFilter, applyWheelsFallback, wheelsAreNeutral, supportsUrlFilters,
} from './filters.js';
import { drawTransition } from './transitions.js';
import { drawText, CAPTION_STYLES } from './titles.js';
import { applyEffects } from './effects.js';
import { drawSticker } from './stickers.js';
import { drawShape } from './shapes.js';
import { elementFor } from './media.js';
import * as clock from './media-clock.js';
import { angleView } from './multicam.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.scratch = [document.createElement('canvas'), document.createElement('canvas')];
    this.scratchCtx = this.scratch.map((c) => c.getContext('2d'));
    this.quality = 1;
    this.pendingSeeks = new Set();
    // Elements we have already bailed on once and are waiting to hear from.
    this.pendingReady = new Set();
    this.onNeedsRedraw = null;
    // Set by the app so beat-reactive effects know where they are in the bar.
    this.beats = null;
    /*
     * Before and after.
     *
     * A viewer state, never a project one — it is switched on while a finger
     * is on a key and off again when it lifts, which is exactly how you check
     * whether a grade is doing what you think. Kept on the renderer rather
     * than read from the DOM in the draw loop, because the draw loop should
     * not be asking the document about anything sixty times a second, and
     * because the exporter has a renderer of its own that must never see it.
     */
    this.bypassGrade = false;
    /*
     * Where the split-screen line sits, 0..1 across the frame. 0 is off.
     *
     * A fraction rather than a pixel column, for the same reason a mask is:
     * the preview and the export are different sizes, and a line that means
     * "40% across" means the same thing on both.
     */
    this.compareAt = 0;
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
   * `playing` matters, and it means exactly one thing: the transport is
   * running. Then every video element that contributes a picture is asked to
   * roll, through the shared media clock — nothing else in the app starts
   * them, and the clock is what stops two owners fighting over the same node.
   * When parked we seek instead, which is asynchronous, so a scrub paints the
   * nearest available frame immediately and repaints when the seek lands.
   *
   * `scrub` is a quality hint and nothing more. It used to be folded into
   * `playing` by the caller, which was harmless while `playing` only meant
   * "don't seek" and is not harmless now that it means "start playback" —
   * dragging the playhead would have started the video rolling under the
   * finger doing the dragging.
   */
  draw(project, t, opts = {}) {
    const { forExport = false } = opts;
    const w = this.canvas.width, h = this.canvas.height;
    // What expressions and audio-reactive effects may ask about this frame.
    setFrame(this._frameContext(project, t));

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

    /*
     * Split screen: graded on one side of a line, ungraded on the other.
     *
     * The single most-used check in grading, and the one thing a before/after
     * toggle cannot do — a toggle shows you two pictures a second apart and
     * asks you to remember the first one. This shows both at once, along the
     * only edge that matters, which is how you see that the skin went ruddy
     * while you were busy with the sky.
     *
     * It costs two full renders of the frame, and that is the honest price:
     * the ungraded side is not a cached copy of anything, it is the same
     * compositor with the grade switched off, so what you are comparing
     * against is the real shot and not an approximation of it.
     */
    const split = this.compareAt;
    if (split > 0.001 && split < 0.999 && !forExport && !this.bypassGrade) {
      const was = this.bypassGrade;
      this.bypassGrade = true;
      this._paint(project, t, opts);
      this.bypassGrade = was;

      const keep = this._compareCtx(w, h);
      keep.clearRect(0, 0, w, h);
      keep.drawImage(this.canvas, 0, 0);

      this._paint(project, t, opts);

      const x = Math.round(w * split);
      const { ctx } = this;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, w - x, h);
      ctx.clip();
      ctx.drawImage(keep.canvas, 0, 0);
      ctx.restore();

      // The line, so nobody mistakes a split for a shot with a hard edge in it.
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(x - 1, 0, 2, h);
      ctx.restore();
      return;
    }

    this._paint(project, t, opts);
  }

  /** The whole frame, once. Everything above decides how many times. */
  _paint(project, t, { playing = false, forExport = false, scrub = false } = {}) {
    this._scrub = scrub;
    const { ctx } = this;
    const w = this.canvas.width, h = this.canvas.height;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = project.settings.background || '#000';
    ctx.fillRect(0, 0, w, h);

    // Solo: when any video layer is soloed, only soloed layers are drawn.
    const soloed = project.tracks.some((tr) => tr.kind === 'video' && tr.solo);
    const visible = activeAt(project, t).filter((c) => {
      const track = project.tracks.find((tr) => tr.id === c.trackId);
      return track && track.kind === 'video' && !track.hidden && (!soloed || track.solo);
    });

    for (const clip of visible) {
      /*
       * An adjustment layer treats what is already on the frame.
       *
       * It has no media of its own; it grades and applies effects to
       * everything composited below it, which is the whole point — one grade
       * over a cut sequence instead of the same grade pasted onto nine clips
       * and re-pasted every time it changes. Because it runs inside the same
       * loop as everything else, track order decides what it reaches: clips on
       * layers above it are drawn afterwards and are untouched, exactly as in
       * every other editor.
       */
      if (clip.kind === 'adjust') {
        this._applyAdjustment(project, clip, t, w, h);
        continue;
      }

      const trans = this._transitionAt(project, clip, t);
      if (trans) {
        const to = this._clipCanvas(project, clip, t, 0, playing, forExport);
        const from = this._clipCanvas(project, trans.other, t, 1, playing, forExport);
        drawTransition(trans.type, ctx, w, h, from, to, trans.progress, trans.anchor ? { anchor: trans.anchor } : undefined);
      } else {
        const cv = this._clipCanvas(project, clip, t, 0, playing, forExport);
        if (cv) {
          const local = t - clip.start;
          const op = valueAt(clip, 'transform.opacity', local, clip.transform.opacity ?? 1);
          ctx.globalAlpha = Math.max(0, Math.min(1, op));
          ctx.globalCompositeOperation = blendOf(clip.transform.blend);
          if (clip.parentId) {
            /*
             * Parenting. The child's own transform is already in its canvas;
             * the parent's is applied on top as the canvas goes onto the
             * frame, so the child moves, turns and scales with its parent
             * exactly as a compositor's pick-whip makes it. A parent may be
             * a null — a layer with no picture, only a transform.
             */
            ctx.save();
            this._applyParents(ctx, project, clip, t, w, h);
            ctx.drawImage(cv, 0, 0);
            ctx.restore();
          } else {
            ctx.drawImage(cv, 0, 0);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    this._drawCaptions(project, t, w, h);
    ctx.restore();
  }

  /**
   * Grade and treat whatever is already on the frame.
   *
   * The frame is copied off, treated on the scratch canvas the clip pipeline
   * already uses, and drawn back — so an adjustment layer gets the same grade,
   * the same effects and the same windows as any clip, from the same code,
   * rather than a second implementation that would drift from it.
   */
  _applyAdjustment(project, clip, t, w, h) {
    this._applyAdjustmentOn(this.ctx, project, clip, t, w, h);
  }

  _applyAdjustmentOn(ctx, project, clip, t, w, h) {
    const local = t - clip.start;
    const opacity = valueAt(clip, 'transform.opacity', local, clip.transform?.opacity ?? 1);
    if (opacity <= 0.001) return;

    const scratch = this.scratch[0];
    const sctx = this.scratchCtx[0];
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'source-over';
    sctx.filter = 'none';
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(this.canvas, 0, 0);

    const graded = this.bypassGrade ? null : animatedColor(clip, local);
    if (!isIdentity(graded)) {
      const css = cssFilter(resolved(graded));
      const wheels = wheelFilter(clip.id, this.bypassGrade ? null : clip.color?.wheels);
      if (css !== 'none' || wheels) {
        // Filtering a canvas onto itself is not defined, so it goes via the
        // second scratch and comes back.
        const tmp = this.scratchCtx[1];
        tmp.setTransform(1, 0, 0, 1, 0, 0);
        tmp.globalAlpha = 1;
        tmp.globalCompositeOperation = 'source-over';
        tmp.filter = wheels ? (css === 'none' ? wheels : `${css} ${wheels}`) : css;
        tmp.clearRect(0, 0, w, h);
        tmp.drawImage(scratch, 0, 0);
        tmp.filter = 'none';
        sctx.clearRect(0, 0, w, h);
        sctx.drawImage(this.scratch[1], 0, 0);
      }
      applyPasses(sctx, w, h, resolved(graded));
    }

    if (clip.effects?.length) {
      applyEffects(sctx, w, h, clip, {
        clip,
        local,
        time: t,
        fps: project.settings.fps || this.fps,
        beatPhase: this._beatPhase(t),
        redrawClip: () => null,          // nothing to re-render: it has no media
      });
    }

    // Correctors two and up, over what the adjustment layer has done so far.
    this._runGradeNodes(sctx, clip, t, w, h);

    // A window on an adjustment layer is how you grade one corner of a cut
    // sequence, which is most of what they are used for.
    const matte = combinedMatte(clip, 'grade', sctx, w, h, local);
    if (matte) {
      sctx.globalCompositeOperation = 'destination-in';
      sctx.drawImage(matte, 0, 0);
      sctx.globalCompositeOperation = 'source-over';
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.globalCompositeOperation = blendOf(clip.transform?.blend);
    ctx.drawImage(scratch, 0, 0);
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

  /*
   * One canvas per nesting depth.
   *
   * A compound inside a compound needs two canvases alive at once, and sharing
   * one would mean the inner render wipes the outer one halfway through.
   */
  _innerCtx(w, h, depth) {
    this._inners ||= [];
    let pad = this._inners[depth];
    if (!pad || pad.canvas.width !== w || pad.canvas.height !== h) {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      pad = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
      this._inners[depth] = pad;
    }
    return pad;
  }

  /** Draw a project's video clips onto a context. The body of draw(), reusable. */
  _drawInto(ctx, project, t, w, h, playing, forExport) {
    // Solo: when any video layer is soloed, only soloed layers are drawn.
    const soloed = project.tracks.some((tr) => tr.kind === 'video' && tr.solo);
    const visible = activeAt(project, t).filter((c) => {
      const track = project.tracks.find((tr) => tr.id === c.trackId);
      return track && track.kind === 'video' && !track.hidden && (!soloed || track.solo);
    });
    for (const clip of visible) {
      if (clip.kind === 'adjust') { this._applyAdjustmentOn(ctx, project, clip, t, w, h); continue; }
      const cv = this._clipCanvas(project, clip, t, 0, playing, forExport);
      if (!cv) continue;
      const local = t - clip.start;
      const op = valueAt(clip, 'transform.opacity', local, clip.transform?.opacity ?? 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, op));
      ctx.globalCompositeOperation = blendOf(clip.transform?.blend);
      ctx.drawImage(cv, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** The grade, effects and windows a clip carries, applied to a finished frame. */
  _treatFrame(project, clip, t, w, h, ctx, skipEffects) {
    const local = t - clip.start;
    const graded = this.bypassGrade ? null : animatedColor(clip, local);
    if (!isIdentity(graded)) {
      /*
       * The CSS half of a grade has to go through a draw.
       *
       * Exposure, contrast and saturation are a ctx.filter on the drawImage,
       * not one of the composited passes — so applyPasses alone applies the
       * half of a grade that is drawn on top and silently drops the half that
       * is a filter. A grade on a compound looked like it did nothing.
       */
      const css = cssFilter(resolved(graded));
      const wheels = wheelFilter(clip.id, this.bypassGrade ? null : clip.color?.wheels);
      if (css !== 'none' || wheels) {
        const via = this._innerCtx(w, h, 7);      // a pad nothing else uses
        via.ctx.setTransform(1, 0, 0, 1, 0, 0);
        via.ctx.globalAlpha = 1;
        via.ctx.globalCompositeOperation = 'source-over';
        via.ctx.filter = wheels ? (css === 'none' ? wheels : `${css} ${wheels}`) : css;
        via.ctx.clearRect(0, 0, w, h);
        via.ctx.drawImage(ctx.canvas, 0, 0);
        via.ctx.filter = 'none';
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(via.canvas, 0, 0);
      }
      applyPasses(ctx, w, h, resolved(graded));
    }
    // A compound or an adjustment layer can carry a chain too — it is a clip,
    // and the grade tools do not ask what kind before writing to it.
    this._runGradeNodes(ctx, clip, t, w, h);
    if (!skipEffects && clip.effects?.length) {
      applyEffects(ctx, w, h, clip, {
        clip, local, time: t,
        fps: project.settings.fps || this.fps,
        beatPhase: this._beatPhase(t),
        redrawClip: () => null,
      });
    }
    const matte = combinedMatte(clip, 'grade', ctx, w, h, local);
    if (matte) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(matte, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** The off-screen canvas the split screen keeps its other half on. */
  _compareCtx(w, h) {
    if (!this._compareCanvas || this._compareCanvas.width !== w || this._compareCanvas.height !== h) {
      this._compareCanvas = document.createElement('canvas');
      this._compareCanvas.width = w;
      this._compareCanvas.height = h;
      this._compareCtxCache = this._compareCanvas.getContext('2d');
    }
    return this._compareCtxCache;
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
      ctx.save();
      this._layerTransform(ctx, clip, Math.max(0, local), w, h, (clip.text?.x ?? 0.5) * w, (clip.text?.y ?? 0.5) * h);
      drawText(ctx, w, h, clip.text, Math.max(0, local), clip.dur,
        (prop, fb) => valueAt(clip, `text.${prop}`, Math.max(0, local), fb));
      ctx.restore();
      if (!skipEffects && clip.effects?.length) this._runEffects(ctx, w, h, clip, t, project);
      return cv;
    }

    /* A null has no picture. It exists to be a parent: a transform other
       layers follow. Nothing to draw, and nothing is the right answer. */
    if (clip.kind === 'null') return null;

    /* A shape layer: vector geometry, every number of it animatable. The
       reader resolves 'shape.<prop>' through keyframes and expressions. */
    if (clip.kind === 'shape') {
      const local = Math.max(0, t - clip.start);
      const read = (prop, fb) => valueAt(clip, `shape.${prop}`, local, fb);
      ctx.save();
      this._layerTransform(ctx, clip, local, w, h, read('x', clip.shape?.x ?? 0.5) * w, read('y', clip.shape?.y ?? 0.5) * h);
      drawShape(ctx, w, h, clip.shape, local, clip.dur, read, this._beatPhase(t));
      ctx.restore();
      if (!skipEffects && clip.effects?.length) this._runEffects(ctx, w, h, clip, t, project);
      return cv;
    }

    /* An adjustment layer has no picture of its own — it is handled in draw(),
       against the frame. Asking for one here means something called the wrong
       path, and returning null is how that surfaces as nothing rather than as
       a black rectangle over the edit. */
    if (clip.kind === 'adjust') return null;

    /*
     * A compound renders its own timeline into the scratch canvas.
     *
     * Recursive on purpose: a compound inside a compound is a real thing
     * people build, and the alternative is a special case that works one level
     * deep and fails silently at two. Depth is capped rather than trusted,
     * because a project file that somehow refers to itself would otherwise
     * take the tab down instead of drawing something wrong.
     */
    if (clip.kind === 'compound') {
      if (!clip.inner?.clips?.length) return null;
      this._depth = (this._depth || 0) + 1;
      try {
        if (this._depth > 6) return null;
        const local = t - clip.start;
        const inner = this._innerCtx(w, h, this._depth);
        inner.ctx.setTransform(1, 0, 0, 1, 0, 0);
        inner.ctx.globalAlpha = 1;
        inner.ctx.globalCompositeOperation = 'source-over';
        inner.ctx.filter = 'none';
        inner.ctx.clearRect(0, 0, w, h);
        /*
         * The inner timeline borrows the outer pool.
         *
         * A compound deliberately carries no media of its own — that is what
         * stops grouping from duplicating a file and what lets ungrouping put
         * the clips straight back. So the render is handed a view of the inner
         * project with the outer project's media on it, rather than the inner
         * project itself, which has nowhere to look a file up.
         */
        const view = { ...clip.inner, media: project.media };
        this._drawInto(inner.ctx, view, local * (clip.speed || 1) + (clip.in || 0),
          w, h, playing, forExport);
        // Then the wrapper's own grade and effects, over the whole thing —
        // which is the point of grouping: treat ten shots as one.
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(inner.canvas, 0, 0);
        this._treatFrame(project, clip, t, w, h, ctx, skipEffects);
        return cv;
      } finally {
        this._depth -= 1;
      }
    }

    if (clip.kind === 'sticker') {
      const local = t - clip.start;
      const subject = clip.sticker?.react?.trackId ? this._subjectAt(project, clip.sticker.react.trackId, t) : null;
      ctx.save();
      this._layerTransform(ctx, clip, Math.max(0, local), w, h, (clip.sticker?.x ?? 0.5) * w, (clip.sticker?.y ?? 0.5) * h);
      drawSticker(ctx, w, h, clip.sticker, Math.max(0, local), clip.dur, this._beatPhase(t), subject);
      ctx.restore();
      if (!skipEffects && clip.effects?.length) this._runEffects(ctx, w, h, clip, t, project);
      return cv;
    }

    /*
     * A multicam clip is whichever angle is live at this moment.
     *
     * Resolved to a plain media id and in point here, once, so everything
     * below — the pool, the seek, the grade, the effects — is the ordinary
     * clip path and has never heard of multicam. The alternative is a second
     * rendering path that drifts from the first.
     */
    let source = clip;
    if (clip.kind === 'multicam') {
      const live = angleView(clip, t);
      if (!live) return null;
      source = { ...clip, mediaId: live.mediaId, in: live.in };
    }

    const media = mediaById(project, source.mediaId);
    if (!media || media.missing) return null;
    /*
     * Keyed on the angle, not just the clip.
     *
     * Two angles of a multicam clip are two different files; sharing one
     * decoder between them means every switch is a full source change and the
     * first frame after every cut is whatever the other angle was showing.
     */
    const poolKey = clip.kind === 'multicam' ? `${clip.id}:${source.mediaId}` : clip.id;
    // forExport is the only thing that decides this, and it must stay that way.
    const node = elementFor(media, poolKey, { preferProxy: !forExport });
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
      ? source.in + local * speedAt(clip, Math.max(0, Math.min(clip.dur, local)))
      : sourceTime(source, t);

    if (media.kind === 'video') {
      if (!node.videoWidth) { this._whenReady(node); return null; }
      if (playing && !forExport) {
        /*
         * Hand the element to the clock rather than seeking it.
         *
         * A reversed clip is the exception and has to keep being seeked: no
         * browser has ever supported a negative playbackRate, so the only way
         * to run one backwards is a frame at a time.
         */
        clock.want(node, src, speedAt(clip, Math.max(0, Math.min(clip.dur, local))), {
          /*
           * Parked, not played, for the two clips that cannot roll forward:
           * a reversed one, because no browser does a negative rate, and a
           * frozen one, because every frame of it is the same frame and a
           * decoder left running would slowly drift off it.
           */
          seekOnly: Boolean(clip.reversed || clip.frozen),
        });
      } else {
        this._seek(node, src, forExport);
      }
    } else if (media.kind === 'image') {
      if (!node.complete || !node.naturalWidth) { this._whenReady(node); return null; }
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
    const userScale = valueAt(clip, 'transform.scale', local, clip.transform.scale ?? 1);
    const scale = cover * userScale;
    const dw = cw * scale, dh = ch * scale;
    const offX = valueAt(clip, 'transform.x', local, clip.transform.x || 0) * w;
    const offY = valueAt(clip, 'transform.y', local, clip.transform.y || 0) * h;
    let dx = (w - dw) / 2 + offX;
    let dy = (h - dh) / 2 + offY;
    const rotate = valueAt(clip, 'transform.rotate', local, clip.transform.rotate || 0);
    /*
     * The anchor point.
     *
     * Without one — every project made before anchors existed — scale and
     * rotation happen about the centre of the frame, as they always did.
     * With one, both happen about a point on the layer: the layer's centre
     * plus the anchor, in fractions of the layer's own drawn size, which is
     * what a compositor means by an anchor point. A logo scaled about its
     * top-left corner grows down and to the right; the same logo rotated
     * about a corner swings from it.
     */
    const anchor = clip.transform.anchor;
    let pvx = w / 2, pvy = h / 2;
    if (anchor) {
      const dw0 = cw * cover, dh0 = ch * cover;
      const ax = anchor.x || 0, ay = anchor.y || 0;
      pvx = (w - dw0) / 2 + offX + dw0 / 2 + ax * dw0;
      pvy = (h - dh0) / 2 + offY + dh0 / 2 + ay * dh0;
      dx = pvx - (dw0 / 2 + ax * dw0) * userScale;
      dy = pvy - (dh0 / 2 + ay * dh0) * userScale;
    }

    // Keyframed exposure, contrast, saturation and the rest resolve here, so a
    // grade can ramp across a clip the same way a position can.
    const graded = this.bypassGrade ? null : animatedColor(clip, local);
    const grade = resolved(graded);
    // Wheels are a separate filter from the rest of the grade, so bypass has
    // to cancel them by hand or half the correction stays on screen.
    const wheelSource = this.bypassGrade ? null : clip.color.wheels;

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
        ctx.translate(pvx, pvy);
        ctx.rotate((rotate * Math.PI) / 180);
        ctx.translate(-pvx, -pvy);
      }
      try { ctx.drawImage(node, cx, cy, cw, ch, dx, dy, dw, dh); }
      catch { ctx.restore(); return null; }
      ctx.restore();
    }

    // The wheels are an SVG filter chained onto the CSS one, so both stages
    // happen in a single GPU pass rather than a read-back.
    const wheels = wheelFilter(clip.id, wheelSource);
    const css = cssFilter(grade);
    const target = windowed ? this._gradeCtx(w, h) : ctx;
    if (windowed) target.clearRect(0, 0, w, h);
    ctx.save();
    if (windowed) { /* the graded pass is built off screen and masked back on */ }
    ctx.filter = wheels ? (css === 'none' ? wheels : `${css} ${wheels}`) : css;
    if (rotate) {
      ctx.translate(pvx, pvy);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.translate(-pvx, -pvy);
    }
    if (windowed) {
      target.save();
      target.filter = ctx.filter;
      if (rotate) {
        target.translate(pvx, pvy);
        target.rotate((rotate * Math.PI) / 180);
        target.translate(-pvx, -pvy);
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
    if (!supportsUrlFilters() && !wheelsAreNeutral(wheelSource)) {
      applyWheelsFallback(target, w, h, wheelSource);
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

    // Correctors two and up, each reading the last one's output.
    this._runGradeNodes(ctx, clip, t, w, h);

    if (!skipEffects && clip.effects?.length) {
      applyEffects(ctx, w, h, clip, {
        clip,
        local,
        time: t,
        fps: project.settings.fps || this.fps,
        beatPhase: this._beatPhase(t),
        ...this._reactive(project, t),
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
      ...this._reactive(project, t),
      redrawClip: null,
    });
  }

  /* What an audio-reactive or tracked effect may ask for, at timeline time t. */
  _reactive(project, t) {
    return {
      beats: this.beats,
      audio: (band, smooth) => this._audioAt(project, t, band, smooth),
      spectrum: (out) => this._spectrumAt(project, t, out),
      wave: (seconds, n, out) => this._waveAt(project, t, seconds, n, out),
      subject: (trackId) => this._subjectAt(project, trackId, t),
    };
  }

  /* ---------------- what the frame knows ---------------- */

  /**
   * The context expressions read through frame-context.js: the project, the
   * beat grid, the music's level and a way to find a layer by name.
   */
  _frameContext(project, t) {
    return {
      project, t,
      fps: project.settings.fps || this.fps,
      beats: this.beats,
      beatPhase: (tt) => this._beatPhase(tt),
      audioAt: (tt, band, smooth) => this._audioAt(project, tt, band, smooth),
      indexOf: (clip) => Math.max(0, clipsOn(project, clip.trackId).findIndex((c) => c.id === clip.id)),
      nameOf: (clip) => clip.label || clip.text?.content || mediaById(project, clip.mediaId)?.name || '',
    };
  }

  /*
   * The clips heard at t, each with its analysis and the source time it is
   * at. A file that has not been analysed yet is sent for analysis and reads
   * as silence until it is done; the analysis then asks for a redraw, so the
   * picture catches up on its own.
   */
  _audioSources(project, t) {
    const out = [];
    for (const clip of audibleAt(project, t)) {
      const track = project.tracks.find((tr) => tr.id === clip.trackId);
      if (!track || track.muted) continue;
      const media = mediaById(project, clip.mediaId);
      if (!media || media.missing || !(media.kind === 'audio' || media.hasAudio)) continue;
      const local = Math.max(0, Math.min(clip.dur, t - clip.start));
      const volume = valueAt(clip, 'volume', local, clip.volume ?? 1);
      if (volume <= 0) continue;
      let analysis = analysisOf(media);
      if (!analysis) {
        this._audioAsked ||= new Set();
        if (!this._audioAsked.has(media.id)) {
          this._audioAsked.add(media.id);
          analyse(media).then((a) => { if (a) this.onNeedsRedraw?.(); }).catch(() => {});
        }
        continue;
      }
      out.push({ analysis, at: sourceTime(clip, t), volume: Math.min(1, volume) });
    }
    return out;
  }

  /** The level of the music at t, 0..1, for a band, smoothed over `smooth` seconds. */
  _audioAt(project, t, band = 'all', smooth = 0) {
    let level = 0;
    for (const src of this._audioSources(project, t)) level += levelAt(src.analysis, src.at, band, smooth) * src.volume;
    return Math.min(1, level);
  }

  /** The 32-band spectrum at t, the loudest source winning per band. */
  _spectrumAt(project, t, out) {
    const acc = out || (this._spec ||= new Float32Array(32));
    acc.fill(0);
    for (const src of this._audioSources(project, t)) {
      const s = spectrumAt(src.analysis, src.at, this._specTmp ||= new Float32Array(32));
      for (let i = 0; i < acc.length; i++) acc[i] = Math.max(acc[i], s[i] * src.volume);
    }
    return acc;
  }

  /** A stretch of the waveform around t. */
  _waveAt(project, t, seconds = 1, n = 128, out) {
    const acc = out || (this._waveBuf ||= new Float32Array(n));
    if (acc.length !== n) return this._waveAt(project, t, seconds, n, new Float32Array(n));
    acc.fill(0);
    for (const src of this._audioSources(project, t)) {
      const s = waveAround(src.analysis, src.at, seconds, n, this._waveTmp ||= new Float32Array(n));
      if (s.length !== acc.length) continue;
      for (let i = 0; i < n; i++) acc[i] = Math.max(acc[i], s[i] * src.volume);
    }
    return acc;
  }

  /* ---------------- parenting and anchors ---------------- */

  /** The ancestors of a clip, furthest first. Cycles and runaway chains stop. */
  _parentChain(project, clip) {
    const chain = [];
    const seen = new Set([clip.id]);
    let cur = clip;
    while (cur.parentId && chain.length < 8) {
      const parent = project.clips.find((c) => c.id === cur.parentId);
      if (!parent || seen.has(parent.id)) break;
      chain.unshift(parent);
      seen.add(parent.id);
      cur = parent;
    }
    return chain;
  }

  /*
   * Apply every ancestor's transform, outermost first, so a child of a child
   * ends up where both parents put it. Each parent's move, turn and scale
   * happen about that parent's own centre — where the layer's anchor sits
   * unless it has been moved — which is the compositor rule that makes a
   * child orbit a spinning parent instead of the frame.
   */
  _applyParents(ctx, project, clip, t, w, h) {
    for (const parent of this._parentChain(project, clip)) {
      const local = Math.max(0, Math.min(parent.dur, t - parent.start));
      const tr = parent.transform || {};
      const px = valueAt(parent, 'transform.x', local, tr.x || 0) * w;
      const py = valueAt(parent, 'transform.y', local, tr.y || 0) * h;
      const ps = valueAt(parent, 'transform.scale', local, tr.scale ?? 1);
      const pr = valueAt(parent, 'transform.rotate', local, tr.rotate || 0);
      const ax = (tr.anchor?.x || 0) * w, ay = (tr.anchor?.y || 0) * h;
      ctx.translate(w / 2 + px + ax, h / 2 + py + ay);
      ctx.rotate((pr * Math.PI) / 180);
      ctx.scale(ps, ps);
      ctx.translate(-(w / 2 + ax), -(h / 2 + ay));
    }
  }

  /*
   * A layer with no picture of its own — a title, a sticker, a shape — still
   * has a transform, so it can be keyframed, driven by an expression and
   * parented like anything else. Applied about the layer's own centre
   * (`cx, cy`, where the title or sticker has put itself) plus its anchor;
   * an untouched transform costs nothing.
   */
  _layerTransform(ctx, clip, local, w, h, cx, cy) {
    const tr = clip.transform || {};
    const x = valueAt(clip, 'transform.x', local, tr.x || 0) * w;
    const y = valueAt(clip, 'transform.y', local, tr.y || 0) * h;
    const s = valueAt(clip, 'transform.scale', local, tr.scale ?? 1);
    const r = valueAt(clip, 'transform.rotate', local, tr.rotate || 0);
    if (!x && !y && s === 1 && !r) return;
    const ax = (tr.anchor?.x || 0) * w, ay = (tr.anchor?.y || 0) * h;
    ctx.translate(cx + ax + x, cy + ay + y);
    ctx.rotate((r * Math.PI) / 180);
    ctx.scale(s, s);
    ctx.translate(-(cx + ax), -(cy + ay));
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
    return { type: tin.type || 'dissolve', progress: into / tin.dur, other: prev,
      anchor: this._transitionAnchor(project, tin, clip, prev, t) };
  }

  /**
   * The tracked subject, sampled at timeline time t.
   *
   * A track is a list of points in its clip's source seconds, so the moment
   * is first turned into that clip's source time — through its speed and
   * any ramp, which is what makes a sticker keep up with a slow-motion
   * subject. Position is interpolated between the two nearest points;
   * velocity comes from the points either side, converted back to timeline
   * seconds so "fast" means fast on screen. `at(dt)` re-samples nearby, for
   * trails and for noticing a stop. If the clip the track was made on has
   * gone, the track's own clock is used instead, so a sticker never
   * disappears because a shot was deleted.
   */
  _subjectAt(project, trackId, t) {
    const rec = (project.motionTracks || []).find((r) => r.id === trackId);
    if (!rec?.points?.length) return null;
    const pts = rec.points;
    const owner = clipsOn ? project.clips.find((c) => c.id === rec.sourceClipId) : null;
    const toSource = (tt) => (owner ? sourceTime(owner, Math.max(owner.start, Math.min(owner.start + owner.dur, tt)))
      : pts[0].t + (tt - (rec.clipStart || 0)));
    const rate = owner ? Math.abs(speedAt(owner, Math.max(0, t - owner.start))) || 1 : 1;

    const sampleAt = (tt) => {
      const src = toSource(tt);
      if (src <= pts[0].t) return { ...pts[0] };
      if (src >= pts.at(-1).t) return { ...pts.at(-1) };
      let lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].t <= src) lo = mid; else hi = mid; }
      const a = pts[lo], b = pts[hi];
      const f = (src - a.t) / ((b.t - a.t) || 1);
      return {
        x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f,
        scale: (a.scale ?? 1) + ((b.scale ?? 1) - (a.scale ?? 1)) * f,
        rot: (a.rot ?? 0) + ((b.rot ?? 0) - (a.rot ?? 0)) * f,
      };
    };
    const build = (tt) => {
      const here = sampleAt(tt);
      const dt = 0.1;
      const before = sampleAt(tt - dt), after = sampleAt(tt + dt);
      // Frame units per timeline second, through the clip's playback rate.
      const vx = ((after.x - before.x) / (2 * dt)) * rate;
      const vy = ((after.y - before.y) / (2 * dt)) * rate;
      return { x: here.x, y: here.y, scale: here.scale ?? 1, rot: here.rot ?? 0, vx, vy, speed: Math.hypot(vx, vy) };
    };
    const now = build(t);
    now.at = (dt) => build(t + dt);
    return now;
  }

  /**
   * Where a tracked transition is aimed, at this moment.
   *
   * A fixed anchor is used as given. A track is read at the source time of
   * whichever clip it belongs to — the outgoing one by default, since the
   * spot people track is in the shot they are leaving — and the nearest
   * point wins. A track that has been deleted means no anchor, so the
   * transition quietly falls back to the centre rather than the cut breaking.
   */
  _transitionAnchor(project, tin, clip, prev, t) {
    if (tin.anchor && Number.isFinite(tin.anchor.x)) return tin.anchor;
    if (!tin.trackId) return null;
    const rec = (project.motionTracks || []).find((r) => r.id === tin.trackId);
    if (!rec?.points?.length) return null;
    const owner = tin.anchorFrom === 'in' ? clip : (prev || clip);
    // A track is measured in its clip's source seconds. Outside the
    // transition's own clip the hold time is the cut, so the anchor stays
    // where the subject was when the shot ended.
    const when = owner === prev ? Math.min(t, prev.start + prev.dur - 0.001) : t;
    const src = sourceTime(owner, when);
    let best = rec.points[0], d = Math.abs(best.t - src);
    for (const pt of rec.points) { const dd = Math.abs(pt.t - src); if (dd < d) { d = dd; best = pt; } }
    return { x: best.x, y: best.y };
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

  /**
   * Come back when this element can actually be drawn.
   *
   * A clip dropped on the timeline is asked for a frame immediately, and for
   * the first fraction of a second the decoder has nothing: `videoWidth` is 0
   * and there is no picture to copy. Returning null there is right. Returning
   * null and then never being asked again is what left the viewer black after
   * adding a clip — the next draw only happened if something else happened to
   * trigger one, so on a quick machine you saw the frame and on a slow one or
   * a phone you saw black until you touched a control.
   *
   * So the bail schedules its own retry. One listener per element, removed
   * the moment it fires, and `onNeedsRedraw` is the same repaint a landing
   * seek already uses.
   */
  _whenReady(node) {
    if (!node || this.pendingReady.has(node)) return;
    this.pendingReady.add(node);
    const done = () => {
      this.pendingReady.delete(node);
      for (const ev of ['loadeddata', 'canplay', 'load', 'error']) {
        node.removeEventListener(ev, done);
      }
      this.onNeedsRedraw?.();
    };
    // `loadeddata` is the one that means "there is a frame"; `canplay` covers
    // the browsers that get there without firing it, and `error` stops a file
    // that will never decode from holding a listener forever.
    for (const ev of ['loadeddata', 'canplay', 'load', 'error']) {
      node.addEventListener(ev, done);
    }
  }

  /* ---------------- the grade chain ---------------- */

  /**
   * Run correctors two and up, in order, over whatever is on `ctx`.
   *
   * Corrector one is the clip's own grade and has already happened by the time
   * this is called — it is welded into the draw that put the picture there,
   * which is what keeps it a single GPU pass for the overwhelmingly common
   * case of one corrector. Every corrector after it costs a pass of its own,
   * and that is the honest price of a serial chain: each one has to see the
   * finished output of the one before it, or it is not serial.
   *
   * Each corrector gets its own windows and its own qualifier. That is the
   * whole reason to have more than one: key the sky in node two, push it, then
   * key skin in node three out of the result — impossible with one set of
   * controls no matter how many of them there are.
   */
  _runGradeNodes(ctx, clip, t, w, h) {
    const chain = clip.grades;
    if (!chain?.length || this.bypassGrade) return;
    const local = t - clip.start;

    for (const node of chain) {
      if (node.on === false) continue;
      const grade = resolved(node.color);
      const wheels = wheelFilter(node.id, node.color?.wheels);
      const flat = isIdentity(grade) && !wheels
        && (!supportsUrlFilters() ? wheelsAreNeutral(node.color?.wheels) : true);
      // A corrector nobody has touched costs nothing. Worth checking: an
      // untouched node is the normal state of the one you just added.
      if (flat && !(node.masks || []).some((m) => m.on !== false)) continue;

      const target = this._gradeCtx(w, h);
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = 1;
      target.globalCompositeOperation = 'source-over';
      target.clearRect(0, 0, w, h);
      const css = cssFilter(grade);
      target.filter = wheels ? (css === 'none' ? wheels : `${css} ${wheels}`) : css;
      try { target.drawImage(ctx.canvas, 0, 0); }
      catch { target.filter = 'none'; continue; }
      target.filter = 'none';

      if (!isIdentity(grade)) applyPasses(target, w, h, grade);
      if (!supportsUrlFilters() && !wheelsAreNeutral(node.color?.wheels)) {
        applyWheelsFallback(target, w, h, node.color.wheels);
      }

      /*
       * The matte is built from a clip-shaped view of the corrector.
       *
       * `combinedMatte` reads `masks`, `color.qualifier` and any keyframes
       * hung off the host, and a corrector carries the first two itself. The
       * clip's keyframe table comes along so a window on node three can be
       * animated by exactly the same machinery that animates one on node one.
       */
      const view = { id: node.id, masks: node.masks || [], color: node.color, keyframes: clip.keyframes };
      const matte = combinedMatte(view, 'grade', target, w, h, local);
      if (matte) {
        target.globalCompositeOperation = 'destination-in';
        target.drawImage(matte, 0, 0);
        target.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(target.canvas, 0, 0);
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
