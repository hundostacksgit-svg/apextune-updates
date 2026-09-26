/*
 * The edit commands every professional editor has and this one did not.
 *
 * Each of these is small. That is the point: they are small, they are used
 * constantly, and their absence is what makes an editor feel like a toy to
 * somebody who cuts for a living. A freeze frame is four lines of model
 * change; not having one means exporting a still, importing it, and placing
 * it by hand, which is ten minutes for something that should be a keystroke.
 *
 * They live here rather than in project.js because project.js owns the shape
 * of a document — what a clip *is* — and these are operations somebody
 * performs. Keeping the two apart is why project.js is still readable.
 */

import { clipById, addClip, splitClip, clipsOn, shiftAfter, sourceTime } from './project.js';

/* ------------------------------------------------------------------ */
/* freeze frame                                                         */
/* ------------------------------------------------------------------ */

/**
 * Hold the frame under the playhead.
 *
 * Implemented as a cut either side and a zero-speed middle, which is how every
 * editor does it and is the only version that stays editable: the frozen part
 * is a clip like any other, so it can be trimmed, graded, have effects put on
 * it and be dragged somewhere else. A rendered still would be none of those.
 *
 * `speed: 0` is what the renderer reads — `sourceTime` multiplies the local
 * time by it, so every frame of the frozen clip resolves to the same source
 * moment, which is exactly the definition of a freeze.
 */
export function freezeFrame(p, clipId, t, { hold = 2 } = {}) {
  const clip = clipById(p, clipId);
  if (!clip) return null;
  if (t <= clip.start + 0.02 || t >= clip.start + clip.dur - 0.02) return null;

  // The source moment being held has to be worked out before the cut, because
  // cutting changes what `local` means on the piece that follows.
  const frozenAt = sourceTime(clip, t);

  const right = splitClip(p, clipId, t);
  if (!right) return null;

  /*
   * Everything after the freeze slides later by the length of the hold.
   *
   * Through `shiftAfter` and not `moveClip`. `moveClip` refuses overlaps by
   * shoving neighbours out of the way, which is right for a clip somebody is
   * dragging and wrong for a bulk shift: moving five clips one at a time means
   * each move sees the previous ones half-shifted and pushes them again, and
   * what comes out the other end is not the timeline anybody asked for. It is
   * how the first version of this produced a 0.05-second sliver where the rest
   * of the shot should have been.
   *
   * Only clips on this track move: a freeze is a local decision, and pushing
   * every other layer would break sync with the music and the titles.
   */
  shiftAfter(p, clip.trackId, right.start, hold);

  const frozen = addClip(p, {
    mediaId: clip.mediaId,
    trackId: clip.trackId,
    start: t,
    dur: hold,
    in: frozenAt,
  });
  /*
   * `frozen`, and the speed left alone at 1.
   *
   * See sourceTime in project.js for why this is not `speed: 0`. The short
   * version: zero is falsy, and most of the app reads the speed with `|| 1`.
   */
  frozen.frozen = true;
  // The look comes with it, or the freeze is a differently-graded flash.
  frozen.color = structuredClone(clip.color);
  frozen.transform = structuredClone(clip.transform);
  frozen.effects = structuredClone(clip.effects || []);
  // Silence: a held frame with the sound still running is a sync error you can
  // hear, and there is no sensible audio for a moment that is not passing.
  frozen.volume = 0;
  return frozen;
}

/* ------------------------------------------------------------------ */
/* match frame                                                          */
/* ------------------------------------------------------------------ */

/**
 * Where in the source file is the frame I am looking at?
 *
 * Returns the media and the exact source time, which is what "match frame"
 * means everywhere: you are watching a cut, you want more of that shot, and
 * you need to find the moment in the original. Speed ramps, reversal and trims
 * all sit between the timeline and the file, so this asks `sourceTime` rather
 * than subtracting the clip's start and hoping.
 */
export function matchFrame(p, t) {
  const under = p.clips
    .filter((c) => {
      const track = p.tracks.find((tr) => tr.id === c.trackId);
      return track?.kind === 'video' && !track.hidden && t >= c.start && t < c.start + c.dur;
    })
    .sort((a, b) => p.tracks.findIndex((x) => x.id === a.trackId)
      - p.tracks.findIndex((x) => x.id === b.trackId));
  const clip = under[under.length - 1];       // the topmost one is what you see
  if (!clip || !clip.mediaId) return null;
  return { clip, mediaId: clip.mediaId, at: sourceTime(clip, t) };
}

/* ------------------------------------------------------------------ */
/* three-point editing                                                  */
/* ------------------------------------------------------------------ */

/*
 * Insert and overwrite: the two ways of putting a shot into a cut.
 *
 * **Overwrite** drops it on top and whatever was there is gone. Use it when
 * the cut is the right length and the shot is wrong.
 *
 * **Insert** makes room — everything after the playhead on that track slides
 * later by the new clip's length, and anything the playhead is in the middle
 * of gets cut in two so the insert lands on a clean edit.
 *
 * They are not a preference. Overwriting when you meant to insert loses work,
 * and inserting when you meant to overwrite pushes everything out of sync with
 * the music. Every editor has both, on two adjacent keys.
 */

export function overwriteAt(p, { mediaId, trackId, start, dur, in: inPoint = 0 }) {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const end = start + dur;

  for (const other of [...clipsOn(p, trackId)]) {
    const oEnd = other.start + other.dur;
    if (oEnd <= start || other.start >= end) continue;         // no overlap

    if (other.start < start && oEnd > end) {
      /*
       * The new clip lands inside an existing one: cut it either side and
       * drop the middle. Two splits and a delete, in that order, because the
       * second split's time is only valid on the piece the first one left.
       */
      const right = splitClip(p, other.id, start);
      if (right) {
        const tail = splitClip(p, right.id, end);
        if (tail) p.clips = p.clips.filter((c) => c.id !== right.id);
        else p.clips = p.clips.filter((c) => c.id !== right.id);
      }
      continue;
    }
    if (other.start < start) {                                  // trim its tail
      other.dur = start - other.start;
      continue;
    }
    if (oEnd > end) {                                           // trim its head
      const eaten = end - other.start;
      other.in += eaten * (other.speed || 1);
      other.dur -= eaten;
      other.start = end;
      continue;
    }
    p.clips = p.clips.filter((c) => c.id !== other.id);         // swallowed whole
  }

  return addClip(p, { mediaId, trackId, start, dur, in: inPoint });
}

export function insertAt(p, { mediaId, trackId, start, dur, in: inPoint = 0 }) {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) return null;

  // Anything the playhead is inside has to be cut, or the insert would land in
  // the middle of a shot and the second half would end up before the first.
  const straddling = clipsOn(p, trackId)
    .find((c) => start > c.start + 0.02 && start < c.start + c.dur - 0.02);
  if (straddling) splitClip(p, straddling.id, start);

  // Same reason as the freeze: a bulk shift, not a series of drags.
  shiftAfter(p, trackId, start, dur);
  return addClip(p, { mediaId, trackId, start, dur, in: inPoint });
}

/* ------------------------------------------------------------------ */
/* shuttle                                                              */
/* ------------------------------------------------------------------ */

/*
 * J, K and L.
 *
 * The oldest transport controls there are — they predate the mouse and every
 * editor trained on tape has them in their hands. L plays forward and speeds
 * up each time you press it; J does the same backwards; K stops. Pressing J
 * while going forward slows down rather than reversing, which is what makes it
 * a shuttle rather than two play buttons.
 *
 * Backwards is a real limitation and it is honest about it: no browser will
 * play a media element at a negative rate, so reverse shuttle steps the
 * playhead instead. Picture moves, sound does not, and that matches what the
 * app already says about reversed clips.
 */
export const SHUTTLE_RATES = [1, 2, 4, 8, 16];

export function shuttleNext(current, direction) {
  if (current === 0) return direction;               // from a stop: 1x, that way
  const i = SHUTTLE_RATES.indexOf(Math.abs(current));

  if (Math.sign(current) === direction) {            // same way: faster
    return SHUTTLE_RATES[Math.min(SHUTTLE_RATES.length - 1, i + 1)] * direction;
  }

  /*
   * The other way: slow down first, and only turn round at 1x.
   *
   * This is the half that makes it a shuttle rather than two play buttons.
   * Running forward at 8x and reaching for J means "too fast" far more often
   * than it means "go backwards", and an editor who taps J expecting 4x and
   * gets a reverse has lost their place. Four taps from 8x forward reach 1x
   * reverse, passing through every rate on the way, which is exactly how the
   * control has worked since it was a physical wheel.
   */
  if (i <= 0) return direction;                      // at 1x: turn round
  return SHUTTLE_RATES[i - 1] * Math.sign(current);
}

/** A label for the transport while shuttling: "▶▶ 4x", "◀◀ 2x", or null. */
export function shuttleLabel(rate) {
  if (!rate || rate === 1) return null;
  return `${rate < 0 ? '◀◀' : '▶▶'} ${Math.abs(rate)}x`;
}
