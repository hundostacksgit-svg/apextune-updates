/*
 * Audio playback and mixing.
 *
 * Every media element that carries sound is routed through Web Audio: element
 * → per-clip gain → master → speakers, with a second tap for the exporter.
 * Doing it this way rather than setting element.volume is what makes fades,
 * ducking and a single master level possible, and what lets the exporter
 * record the mix rather than whatever the speakers happened to be doing.
 *
 * The one thing this cannot do is play a clip backwards — media elements have
 * no negative playback rate anywhere. Reversed clips play silent, and the UI
 * says so rather than pretending.
 */

import { activeAt, mediaById, sourceTime, speedAt } from './project.js';
import { elementFor } from './media.js';
import { buildAudioChain, fxSignature } from './audio-fx.js';
import { buildStrip, stripSignature, warmStrip, makeupMeasured } from './audio-strip.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.recordDest = null;
    this.wired = new Map();          // element -> { source, gain }
    this.playingNodes = new Set();
    this.masterVolume = 1;
  }

  /** Created on the first user gesture — browsers refuse before that. */
  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  resume() {
    if (this.ctx?.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(2, v));
    if (this.master) this.master.gain.value = this.masterVolume;
  }

  /** A stream carrying the finished mix, for MediaRecorder. */
  exportStream() {
    this.ensure();
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  _wire(node) {
    if (this.wired.has(node)) return this.wired.get(node);
    this.ensure();
    let source;
    try {
      source = this.ctx.createMediaElementSource(node);
    } catch {
      // Already wired by a previous engine instance, or a codec the graph
      // refuses. Fall back to element volume so there is still sound.
      return null;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.master);
    node.muted = false;
    node.dataset.wired = '1';
    const rec = { source, gain, fxSig: '', chain: null };
    this.wired.set(node, rec);
    return rec;
  }

  /**
   * Put the clip's creative audio filter between its source and its gain.
   *
   * The graph is rebuilt only when the settings actually change — signature
   * compared, not deep-equalled — because tearing down a convolver on every
   * animation frame clicks audibly, and never tearing it down would ignore
   * the slider someone is dragging. Dragging a slider therefore costs one
   * rebuild per distinct value, which is the cheapest correct answer.
   */
  _applyFx(rec, clip) {
    /*
     * One signature for both halves of the chain.
     *
     * The creative filter and the channel strip sit in series, so a change to
     * either one means the same rebuild — and comparing them separately would
     * rebuild twice for a change that touched both.
     */
    const sig = `${fxSignature(clip.audioFx)}~${stripSignature(clip.strip)}`;
    if (sig === rec.fxSig) return;

    /*
     * The compressor's built-in gain has to be measured before it can be
     * cancelled, and measuring is asynchronous. Kick it off here and rebuild
     * once it lands: the alternative is a graph built with no correction,
     * which is fifteen decibels loud for as long as it takes to notice.
     */
    if (!makeupMeasured(clip.strip?.comp)) {
      warmStrip(clip.strip).then(() => {
        // Only if nothing else has changed in the meantime.
        if (rec.fxSig === sig) { rec.fxSig = ''; this._applyFx(rec, clip); }
      });
    }

    try { rec.source.disconnect(); } catch { /* not connected yet */ }
    if (rec.chain) {
      try { rec.chain.stop(); } catch { /* nothing running */ }
      try { rec.chain.output.disconnect(); } catch { /* already gone */ }
      rec.chain = null;
    }

    let chain = null;
    if (sig) {
      try {
        chain = buildAudioChain(this.ctx, clip.audioFx);
      } catch {
        // A filter that cannot be built must not silence the clip: fall
        // through to the dry path and let the person hear their audio.
        chain = null;
      }
    }

    if (rec.strip) {
      try { rec.strip.output.disconnect(); } catch { /* already gone */ }
      rec.strip = null;
    }
    let strip = null;
    try {
      strip = buildStrip(this.ctx, clip.strip);
    } catch {
      // Same rule as the creative filter: a strip that cannot be built must
      // not silence the clip.
      strip = null;
    }

    /*
     * Creative filter first, then the strip.
     *
     * The strip is the technical pass — EQ, compression, the limiter — and it
     * belongs last, over whatever the creative filter did, for the same reason
     * a limiter goes on the master and not in front of the reverb.
     */
    let tail = rec.source;
    if (chain) {
      tail.connect(chain.input);
      chain.start(this.ctx.currentTime);
      tail = chain.output;
      rec.chain = chain;
    }
    if (strip) {
      tail.connect(strip.input);
      tail = strip.output;
      rec.strip = strip;
    }
    tail.connect(rec.gain);
    rec.fxSig = sig;
  }

  /**
   * Bring the audio graph in line with the timeline at time t.
   *
   * Called every frame while playing and once after every seek. Cheap enough
   * to run at 60fps: it touches only the clips that are actually alive.
   */
  sync(project, t, playing) {
    if (!this.ctx && !playing) return;
    this.ensure();

    const now = this.ctx.currentTime;
    const active = activeAt(project, t);
    const wanted = new Set();

    // Work out ducking first: how loud is the loudest un-ducked voice right now.
    const voiceLevel = active.reduce((max, clip) => {
      const track = project.tracks.find((tr) => tr.id === clip.trackId);
      if (!track || track.kind !== 'audio' || track.duck || track.muted) return max;
      return Math.max(max, clip.volume ?? 1);
    }, 0);

    for (const clip of active) {
      const track = project.tracks.find((tr) => tr.id === clip.trackId);
      if (!track) continue;
      const media = mediaById(project, clip.mediaId);
      if (!media || media.missing || !media.hasAudio) continue;
      if (media.kind === 'image') continue;
      if (clip.reversed) continue;                 // no backwards playback

      const node = elementFor(media, clip.id);
      if (!node || node.tagName === 'IMG') continue;
      const rec = this._wire(node);
      if (rec) this._applyFx(rec, clip);
      wanted.add(node);

      /* ---- level ---- */
      const local = t - clip.start;
      let gain = (clip.volume ?? 1) * (track.muted ? 0 : 1);
      if (clip.fadeIn > 0 && local < clip.fadeIn) gain *= local / clip.fadeIn;
      const toEnd = clip.dur - local;
      if (clip.fadeOut > 0 && toEnd < clip.fadeOut) gain *= toEnd / clip.fadeOut;
      if (track.duck && voiceLevel > 0.02) gain *= 0.22;    // music under voice
      gain = Math.max(0, Math.min(2, gain));

      if (rec) {
        // A short ramp instead of a jump: instant gain changes click audibly.
        rec.gain.gain.setTargetAtTime(gain, now, 0.012);
      } else {
        node.volume = Math.min(1, gain);
      }

      /* ---- position ---- */
      const src = sourceTime(clip, t);
      // Follows a ramp, so audio stays with the picture through a speed change.
      node.playbackRate = Math.max(0.25, Math.min(4, speedAt(clip, local)));
      if (playing) {
        if (node.paused) { node.play().catch(() => { /* autoplay policy; the gesture will fix it */ }); }
        // Correct drift, but only when it's audible. Nudging every frame is
        // itself a source of stutter.
        if (Math.abs(node.currentTime - src) > 0.28) node.currentTime = Math.max(0, src);
        this.playingNodes.add(node);
      } else if (!node.paused) {
        node.pause();
      }
    }

    // Silence and stop everything that shouldn't be heard.
    for (const node of [...this.playingNodes]) {
      if (wanted.has(node)) continue;
      const rec = this.wired.get(node);
      if (rec) rec.gain.gain.setTargetAtTime(0, now, 0.02);
      if (!node.paused) node.pause();
      this.playingNodes.delete(node);
    }
  }

  /** Hard stop — used on pause, on project close and when export finishes. */
  stopAll() {
    for (const node of [...this.playingNodes]) {
      try { node.pause(); } catch { /* already stopped */ }
      const rec = this.wired.get(node);
      if (rec) rec.gain.gain.value = 0;
    }
    this.playingNodes.clear();
  }

  /**
   * Peak level of the mix, 0..1, for the meter. Built lazily because an
   * analyser running when nothing is looking at it is wasted work.
   */
  level() {
    if (!this.ctx) return 0;
    if (!this._analyser) {
      this._analyser = this.ctx.createAnalyser();
      this._analyser.fftSize = 1024;
      this._buf = new Uint8Array(this._analyser.fftSize);
      this.master.connect(this._analyser);
    }
    this._analyser.getByteTimeDomainData(this._buf);
    let peak = 0;
    for (let i = 0; i < this._buf.length; i++) {
      const v = Math.abs(this._buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }
}
