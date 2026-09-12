/*
 * What the frame being drawn knows.
 *
 * An expression on a property can ask about things outside the property —
 * where the music is, where the beat is, what another layer is doing — and
 * valueAt() in project.js is the one place a property's value is read, so
 * it needs a way to reach those answers without importing the renderer,
 * the audio analysis and the project on top of each other. The renderer
 * sets this at the start of every draw and the readers look it up. It is a
 * single value because a frame is drawn synchronously, start to finish,
 * before anything else runs.
 *
 * Nothing here is stored. A project opened with no renderer running — a
 * test, a thumbnail — sees null and every expression falls back to its
 * keyframed value, which is the honest result when there is no music to
 * listen to.
 */

let frame = null;

/** Set by the renderer for the duration of a draw; null outside one. */
export function setFrame(f) { frame = f; }

export function currentFrame() { return frame; }
