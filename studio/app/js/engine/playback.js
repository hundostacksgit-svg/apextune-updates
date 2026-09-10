/*
 * The transport.
 *
 * A wall-clock loop rather than a frame counter, because the browser will drop
 * frames when it feels like it and a counter drifts away from the audio within
 * seconds. performance.now() never drifts, so picture chases sound instead of
 * the other way round.
 */

export class Transport {
  constructor({ onFrame, onStateChange }) {
    this.time = 0;
    this.playing = false;
    this.loop = false;
    this.rate = 1;
    this.duration = 0;
    this.onFrame = onFrame;
    this.onStateChange = onStateChange;
    this._raf = null;
    this._startedAt = 0;
    this._startedFrom = 0;
    this._tick = this._tick.bind(this);
  }

  play() {
    if (this.playing) return;
    if (this.duration > 0 && this.time >= this.duration - 0.02) this.time = 0;
    this.playing = true;
    this._startedAt = performance.now();
    this._startedFrom = this.time;
    this.onStateChange?.(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this._raf = null;
    this.onStateChange?.(this);
    this.onFrame?.(this.time, false);
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  /** Move the playhead. `scrub` tells the renderer to favour speed over quality. */
  seek(t, { scrub = false } = {}) {
    this.time = Math.max(0, this.duration ? Math.min(t, this.duration) : t);
    if (this.playing) {
      this._startedAt = performance.now();
      this._startedFrom = this.time;
    } else {
      this.onFrame?.(this.time, false, { scrub });
    }
  }

  step(frames, fps) {
    this.pause();
    this.seek(this.time + frames / fps);
  }

  setDuration(d) {
    this.duration = Math.max(0, d);
    if (this.time > this.duration) this.seek(this.duration);
  }

  _tick() {
    if (!this.playing) return;
    const elapsed = ((performance.now() - this._startedAt) / 1000) * this.rate;
    this.time = this._startedFrom + elapsed;

    if (this.duration > 0 && this.time >= this.duration) {
      if (this.loop) {
        this.time = 0;
        this._startedAt = performance.now();
        this._startedFrom = 0;
      } else {
        this.time = this.duration;
        this.pause();
        return;
      }
    }
    this.onFrame?.(this.time, true);
    this._raf = requestAnimationFrame(this._tick);
  }
}
