/*
 * One owner for play, pause, rate and position on every media element.
 *
 * Why this exists
 * ---------------
 * Two different parts of the app want video elements to be rolling: the
 * compositor, because `drawImage(video)` only gives a new picture when the
 * element has decoded one, and the audio engine, because sound comes out of
 * the same element. When both of them called `play()` and `pause()` on the
 * same node they fought — and worse, each assumed the other was handling the
 * cases it skipped.
 *
 * That assumption is what broke playback. The compositor's own comment said
 * "while the transport is running the video elements are playing themselves",
 * but nothing made them play except the audio engine, and the audio engine
 * skipped any clip it had decided carried no sound:
 *
 *     if (!media || media.missing || !media.hasAudio) continue;
 *
 * So a clip whose audio track was not detected was never started by anybody.
 * The wall clock kept advancing, the playhead swept across the timeline, and
 * the picture sat on whatever frame the decoder happened to be parked on. On
 * a phone that is the normal case rather than an edge case: `hasAudio` is
 * probed at `loadedmetadata` with `preload="metadata"`, and at that moment
 * `webkitAudioDecodedByteCount` is still 0 and `audioTracks` is often still
 * empty, so a perfectly ordinary video imports as silent and then refuses to
 * move.
 *
 * Hence one clock. Each frame, whoever needs a node rolling says so; `commit`
 * then does the actual starting, stopping, rate-setting and drift correction,
 * and pauses everything nobody asked for. Nothing else in the app is allowed
 * to call play() or pause() on a pooled element.
 */

/*
 * How far the element may drift from the timeline before we haul it back.
 *
 * Not zero, and not small. Correcting drift means assigning currentTime, which
 * on every browser costs a decode flush and on a phone can cost a visible
 * stall — so a correction every frame is far worse than the drift it is
 * fixing. A third of a second is under the threshold where sound and picture
 * read as separate events, and wide enough that a healthy decoder never
 * touches it.
 */
const DRIFT = 0.34;

/*
 * How far off we tolerate when the element is being driven by seeking rather
 * than by playing — the autoplay-blocked path below. Tighter, because there is
 * no decode to interrupt: a seek is all that path ever does.
 */
const SEEK_DRIFT = 0.04;

const wanted = new Map();      // node -> { at, rate, seekOnly }
const rolling = new Set();     // what we actually started
const starting = new WeakSet();// play() promises still in flight
const seeking = new WeakSet(); // currentTime assignments still in flight

let blocked = false;
let listeners = new Set();

/*
 * The transport's own rate, on top of each clip's.
 *
 * A clip at half speed inside a timeline shuttling at 4x has to run at 2x, and
 * neither the compositor nor the audio engine knows about the shuttle — they
 * ask for the clip's own speed, which is the only thing either of them should
 * have an opinion about. Multiplying here is what keeps that true, and without
 * it a shuttle leaves every decoder at 1x while the playhead runs away, so
 * drift correction fires on every single frame.
 */
let transportRate = 1;

export function setRate(rate) {
  transportRate = Math.max(0.0625, Math.min(16, Math.abs(rate) || 1));
}

/** True once the browser has refused a play() — see `commit`. */
export function isBlocked() { return blocked; }

/** Called with `true` the first time playback is refused, `false` on recovery. */
export function onBlockedChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setBlocked(v) {
  if (blocked === v) return;
  blocked = v;
  for (const fn of listeners) { try { fn(v); } catch { /* a listener must not break playback */ } }
}

/**
 * Ask for a node to be at `at` seconds, running at `rate`.
 *
 * Idempotent within a frame: the compositor and the audio engine both register
 * the same video node and the last one wins, which is fine because they agree
 * on the numbers — both read them from sourceTime().
 *
 * `seekOnly` is for clips that cannot be played through: a reversed clip has
 * to be walked backwards a frame at a time, because no browser has ever
 * supported a negative playbackRate.
 */
export function want(node, at, rate = 1, { seekOnly = false } = {}) {
  if (!node || typeof node.play !== 'function') return;
  wanted.set(node, { at, rate, seekOnly });
}

/**
 * Make the world match what was asked for this frame.
 *
 * Call once per frame, after everything that draws or mixes has had its say.
 */
export function commit(playing) {
  if (!playing) {
    for (const node of rolling) safePause(node);
    rolling.clear();
    wanted.clear();
    return;
  }

  for (const [node, req] of wanted) {
    const rate = Math.max(0.0625, Math.min(16, (req.rate || 1) * transportRate));
    if (node.playbackRate !== rate) {
      // Some browsers throw rather than clamp on a rate they will not do.
      try { node.playbackRate = rate; } catch { /* the default rate still plays */ }
    }

    if (req.seekOnly || blocked) {
      park(node, req.at);
      rolling.add(node);
      continue;
    }

    if (node.paused && !starting.has(node)) start(node);
    else if (!node.paused && Math.abs(node.currentTime - req.at) > DRIFT) {
      /*
       * Haul it back, without stopping it.
       *
       * A decoder that has fallen a little behind catches up on its own if the
       * machine has any headroom, and a seek throws away the buffer it was
       * about to use — so this only happens past DRIFT. It must not pause on
       * the way, either: pausing to seek means the next frame finds a paused
       * element and starts it again, and a play/pause cycle on every
       * correction is a far bigger stutter than the drift being corrected.
       */
      park(node, req.at, { stop: false });
    }
    rolling.add(node);
  }

  for (const node of [...rolling]) {
    if (wanted.has(node)) continue;
    safePause(node);
    rolling.delete(node);
  }
  wanted.clear();
}

function start(node) {
  starting.add(node);
  let p;
  try { p = node.play(); } catch { starting.delete(node); setBlocked(true); return; }
  if (!p || typeof p.then !== 'function') { starting.delete(node); return; }
  p.then(() => {
    starting.delete(node);
    setBlocked(false);
  }).catch((err) => {
    starting.delete(node);
    /*
     * AbortError is not a refusal.
     *
     * It is what a pending play() rejects with when something paused or
     * re-sourced the element before it got going — which happens constantly
     * and legitimately while scrubbing. Treating it as an autoplay block
     * would drop the whole app into the seek-driven fallback for no reason.
     */
    if (err && err.name === 'AbortError') return;
    /*
     * Anything else is the browser saying no, and the usual reason is the
     * autoplay policy: the element was unmuted by the audio graph and this
     * tab has no user activation the browser is willing to count. Rather
     * than freeze — which is precisely the bug this module exists to fix —
     * fall back to driving the picture by seeking, and let the app tell
     * somebody that a tap will bring the sound back.
     */
    setBlocked(true);
  });
}

/**
 * Put an element on a frame, without queueing a second seek behind the first.
 *
 * `stop` says whether the element should be parked there or carry on playing
 * through the seek. Both are needed: a clip being walked backwards a frame at
 * a time has to stop on each one, and a clip that has merely drifted must not.
 */
function park(node, at, { stop = true } = {}) {
  const dur = node.duration;
  const target = Math.max(0, Number.isFinite(dur) && dur > 0 ? Math.min(at, dur - 0.02) : at);
  if (Math.abs(node.currentTime - target) < SEEK_DRIFT) {
    if (stop && !node.paused) safePause(node);
    return;
  }
  if (seeking.has(node)) return;
  seeking.add(node);
  const done = () => {
    seeking.delete(node);
    node.removeEventListener('seeked', done);
    node.removeEventListener('error', done);
  };
  node.addEventListener('seeked', done);
  // A seek that never lands would wedge this node forever; the error event is
  // the only other thing that ends one.
  node.addEventListener('error', done);
  try { node.currentTime = target; } catch { done(); }
  if (stop && !node.paused) safePause(node);
}

function safePause(node) {
  try { if (!node.paused) node.pause(); } catch { /* torn down under us */ }
}

/** Hard stop. Used on pause, on project close, and when an export finishes. */
export function stopAll() {
  for (const node of rolling) safePause(node);
  rolling.clear();
  wanted.clear();
}

/**
 * Try playback again after a gesture.
 *
 * Clearing the flag is all it takes: the next commit sees `blocked` false and
 * calls play() again, which now has the activation it was missing.
 */
export function retry() { setBlocked(false); }

/** Everything currently rolling, for anyone that needs to know. */
export function rollingCount() { return rolling.size; }
