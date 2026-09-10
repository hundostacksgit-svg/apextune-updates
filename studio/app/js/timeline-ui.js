/*
 * The timeline: drawing it, and every gesture on it.
 *
 * Positions are seconds everywhere in the model and pixels only here, through
 * one pair of functions (toPx / toSec). Every bug I have seen in a timeline
 * comes from those two units getting mixed up somewhere in the middle, so they
 * are converted at the edge and nowhere else.
 */

import { $, $$, el, esc, drag, clamp, dur as fmtDur } from './ui.js';
import {
  clipsOn, clipById, mediaById, trackById, duration,
  splitClip, trimClip, moveClip, snapPoints, snapTo,
} from './engine/project.js';

const SNAP_PX = 8;          // how close a drag has to get before it sticks
const MIN_CLIP = 0.08;

export class TimelineUI {
  constructor({ state, actions }) {
    this.state = state;
    this.actions = actions;
    this.heads = $('#tl-heads');
    this.tracks = $('#tl-tracks');
    this.ruler = $('#tl-ruler');
    this.inner = $('#tl-inner');
    this.scroll = $('#tl-scroll');
    this.playhead = $('#playhead');
    this.snapLine = null;
    this._wireStatic();
  }

  get project() { return this.state.project; }
  get zoom() { return this.state.zoom; }

  toPx(seconds) { return seconds * this.zoom; }
  toSec(px) { return px / this.zoom; }

  /* ------------------------------------------------------------------ */
  /* painting                                                            */
  /* ------------------------------------------------------------------ */

  render() {
    const p = this.project;
    // Always leave a screen of empty space past the end so there's somewhere to
    // drag a clip to. A timeline you can't extend feels broken.
    const total = Math.max(duration(p) + 4, this.scroll.clientWidth / this.zoom);
    this.inner.style.width = `${this.toPx(total)}px`;

    this._renderRuler(total);
    this._renderHeads();
    this._renderTracks();
    this.renderPlayhead();
  }

  _renderRuler(total) {
    const step = niceStep(this.zoom);
    const frag = document.createDocumentFragment();
    for (let t = 0; t <= total; t += step) {
      const tick = el('div', { class: `tick ${t % (step * 5) < 0.001 ? 'major' : ''}` });
      tick.style.left = `${this.toPx(t)}px`;
      if (t % (step * 5) < 0.001 || step >= 1) {
        tick.appendChild(el('span', {}, formatTick(t)));
      }
      frag.appendChild(tick);
    }
    for (const m of this.project.markers) {
      const mk = el('div', { class: 'mk', title: m.label || 'Marker', 'data-marker': m.t });
      mk.style.left = `${this.toPx(m.t)}px`;
      if (m.color) mk.style.borderTopColor = m.color;
      frag.appendChild(mk);
    }
    this.ruler.innerHTML = '';
    this.ruler.appendChild(frag);
  }

  _renderHeads() {
    const frag = document.createDocumentFragment();
    for (const track of this.project.tracks) {
      const head = el('div', { class: 'tl-head', 'data-track': track.id });
      head.style.height = `${track.height}px`;
      head.append(
        el('span', { class: 'tn', title: track.name }, track.name),
        el('button', {
          class: track.muted ? 'off' : '', title: track.muted ? 'Unmute' : 'Mute',
          'data-act': 'mute', 'data-track': track.id,
        }, track.muted ? '🔇' : '🔊'),
        track.kind === 'video'
          ? el('button', {
            class: track.hidden ? 'off' : '', title: track.hidden ? 'Show' : 'Hide',
            'data-act': 'hide', 'data-track': track.id,
          }, track.hidden ? '🚫' : '👁')
          : el('button', {
            class: track.duck ? 'on' : '', title: 'Duck under voice',
            'data-act': 'duck', 'data-track': track.id,
          }, '⤓'),
      );
      frag.appendChild(head);
    }
    this.heads.innerHTML = '';
    this.heads.appendChild(frag);
  }

  _renderTracks() {
    const frag = document.createDocumentFragment();
    for (const track of this.project.tracks) {
      const row = el('div', { class: `tl-track ${track.kind}`, 'data-track': track.id });
      row.style.height = `${track.height}px`;
      for (const clip of clipsOn(this.project, track.id)) {
        row.appendChild(this._clipNode(clip, track));
      }
      frag.appendChild(row);
    }
    this.tracks.innerHTML = '';
    this.tracks.appendChild(frag);
  }

  _clipNode(clip, track) {
    const p = this.project;
    const media = mediaById(p, clip.mediaId);
    const selected = this.state.sel.has(clip.id);
    const kindClass = clip.kind === 'title' ? 'title'
      : clip.kind === 'sticker' ? 'sticker'
      : track.kind === 'audio' ? 'audio'
      : media?.kind === 'image' ? 'image' : '';

    const node = el('div', {
      class: `clip ${kindClass} ${selected ? 'sel' : ''}`,
      'data-clip': clip.id,
      title: `${clipLabel(clip, media)} · ${fmtDur(clip.dur)}`,
    });
    node.style.left = `${this.toPx(clip.start)}px`;
    node.style.width = `${Math.max(4, this.toPx(clip.dur))}px`;

    const width = this.toPx(clip.dur);

    // Filmstrip for video, waveform for audio. Both are cheap because the
    // frames and peaks were computed once at import.
    if (media?.filmstrip?.length && track.kind === 'video' && width > 26) {
      const strip = el('div', { class: 'thumbs' });
      const perThumb = 54;
      const count = Math.max(1, Math.min(media.filmstrip.length * 3, Math.ceil(width / perThumb)));
      for (let i = 0; i < count; i++) {
        const f = media.filmstrip[Math.floor((i / count) * media.filmstrip.length) % media.filmstrip.length];
        strip.appendChild(el('img', { src: f, alt: '', draggable: 'false' }));
      }
      node.appendChild(strip);
    } else if (media?.peaks && track.kind === 'audio' && width > 20) {
      node.appendChild(this._waveNode(clip, media, width, track.height - 6));
    }

    if (clip.fadeIn > 0) {
      const f = el('div', { class: 'fade' });
      f.style.left = '0'; f.style.width = `${this.toPx(clip.fadeIn)}px`;
      node.appendChild(f);
    }
    if (clip.fadeOut > 0) {
      const f = el('div', { class: 'fade out' });
      f.style.right = '0'; f.style.width = `${this.toPx(clip.fadeOut)}px`;
      node.appendChild(f);
    }
    if (clip.transitionIn) {
      node.appendChild(el('div', { class: 'trans l', title: clip.transitionIn.type }, '◐'));
    }

    const ramped = clip.speedKeys?.length;
    node.appendChild(el('span', { class: 'cname' },
      `${clipLabel(clip, media)}${ramped ? ' · ramp' : clip.speed !== 1 ? ` · ${clip.speed}×` : ''}`));
    node.appendChild(el('div', { class: 'handle l', 'data-handle': 'l' }));
    node.appendChild(el('div', { class: 'handle r', 'data-handle': 'r' }));
    return node;
  }

  _waveNode(clip, media, width, height) {
    const cv = el('canvas', { class: 'wave' });
    const w = Math.max(2, Math.round(width));
    const h = Math.max(6, Math.round(height));
    cv.width = w; cv.height = h;
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d');
    const peaks = media.peaks;
    const buckets = peaks.length / 2;
    // Only draw the slice of the file this clip actually uses.
    const from = (clip.in / media.duration) * buckets;
    const span = ((clip.dur * (clip.speed || 1)) / media.duration) * buckets;
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    for (let x = 0; x < w; x++) {
      const b = Math.floor(from + (x / w) * span);
      if (b < 0 || b >= buckets) continue;
      const lo = peaks[b * 2], hi = peaks[b * 2 + 1];
      const y1 = ((1 - hi) / 2) * h;
      const y2 = ((1 - lo) / 2) * h;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    return cv;
  }

  renderPlayhead() {
    const x = this.toPx(this.state.time);
    this.playhead.style.left = `${x}px`;
    // Keep the playhead on screen while playing, without fighting a user who
    // is scrolling somewhere else on purpose.
    if (this.state.playing && !this._userScrolling) {
      const view = this.scroll;
      if (x < view.scrollLeft + 40 || x > view.scrollLeft + view.clientWidth - 60) {
        view.scrollLeft = Math.max(0, x - view.clientWidth * 0.35);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* gestures                                                            */
  /* ------------------------------------------------------------------ */

  _wireStatic() {
    // Scrubbing on the ruler.
    this.ruler.addEventListener('pointerdown', (e) => {
      const marker = e.target.closest('[data-marker]');
      if (marker) { this.actions.seek(Number(marker.dataset.marker)); return; }
      const scrubTo = (clientX) => {
        const rect = this.ruler.getBoundingClientRect();
        this.actions.seek(Math.max(0, this.toSec(clientX - rect.left)), { scrub: true });
      };
      scrubTo(e.clientX);
      drag(e, { move: (_dx, _dy, ev) => scrubTo(ev.clientX), end: () => this.actions.seek(this.state.time) });
    });

    // Track header buttons.
    this.heads.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const track = trackById(this.project, btn.dataset.track);
      if (!track) return;
      if (btn.dataset.act === 'mute') track.muted = !track.muted;
      if (btn.dataset.act === 'hide') track.hidden = !track.hidden;
      if (btn.dataset.act === 'duck') track.duck = !track.duck;
      this.actions.commit(`${btn.dataset.act} ${track.name}`);
    });

    // Keep the track headers lined up with the timeline as it scrolls.
    this.scroll.addEventListener('scroll', () => {
      this.heads.scrollTop = this.scroll.scrollTop;
      this._userScrolling = true;
      clearTimeout(this._scrollIdle);
      this._scrollIdle = setTimeout(() => { this._userScrolling = false; }, 1200);
    });

    // Clips: select, move, trim, razor.
    this.tracks.addEventListener('pointerdown', (e) => this._onClipPointerDown(e));

    // Clicking empty track space clears the selection and parks the playhead.
    this.tracks.addEventListener('click', (e) => {
      if (e.target.closest('.clip')) return;
      const rect = this.inner.getBoundingClientRect();
      this.actions.select([]);
      this.actions.seek(Math.max(0, this.toSec(e.clientX - rect.left)));
    });

    // Dropping media straight onto a track.
    this.tracks.addEventListener('dragover', (e) => {
      const row = e.target.closest('.tl-track');
      if (!row) return;
      e.preventDefault();
      $$('.tl-track').forEach((r) => r.classList.toggle('drop', r === row));
    });
    this.tracks.addEventListener('dragleave', () => $$('.tl-track').forEach((r) => r.classList.remove('drop')));
    this.tracks.addEventListener('drop', (e) => {
      const row = e.target.closest('.tl-track');
      $$('.tl-track').forEach((r) => r.classList.remove('drop'));
      if (!row) return;
      e.preventDefault();
      const mediaId = e.dataTransfer.getData('text/omnidx-media');
      if (!mediaId) return;
      const rect = this.inner.getBoundingClientRect();
      this.actions.dropMedia(mediaId, row.dataset.track, Math.max(0, this.toSec(e.clientX - rect.left)));
    });
  }

  _onClipPointerDown(e) {
    const node = e.target.closest('.clip');
    if (!node) return;
    const clip = clipById(this.project, node.dataset.clip);
    if (!clip) return;
    const track = trackById(this.project, clip.trackId);
    if (track?.locked) return;

    // Razor cuts where you click instead of selecting.
    if (this.state.tool === 'razor') {
      const rect = this.inner.getBoundingClientRect();
      const at = this.toSec(e.clientX - rect.left);
      if (splitClip(this.project, clip.id, at)) this.actions.commit('Split clip');
      return;
    }

    const handle = e.target.closest('[data-handle]');
    if (!handle) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      this.actions.select(additive ? [...this.state.sel, clip.id] : [clip.id]);
    }

    const startState = {
      start: clip.start, dur: clip.dur, in: clip.in, trackId: clip.trackId,
    };
    let moved = false;

    if (handle) {
      const edge = handle.dataset.handle;
      drag(e, {
        move: (dx) => {
          let delta = this.toSec(dx);
          if (this.state.snap) {
            const edgeTime = edge === 'l' ? startState.start + delta : startState.start + startState.dur + delta;
            const snapped = snapTo(edgeTime, snapPoints(this.project, {
              exclude: [clip.id], playhead: this.state.time,
            }), this.toSec(SNAP_PX));
            if (snapped.snapped) {
              delta = edge === 'l' ? snapped.value - startState.start
                : snapped.value - (startState.start + startState.dur);
              this._showSnap(snapped.value);
            } else this._hideSnap();
          }
          Object.assign(clip, startState);
          trimClip(this.project, clip.id, edge, delta, { ripple: this.state.ripple, minDur: MIN_CLIP });
          moved = true;
          this._paintOne(clip);
        },
        end: () => {
          this._hideSnap();
          if (moved) this.actions.commit('Trim clip', `trim:${clip.id}`);
        },
      });
      return;
    }

    node.classList.add('dragging');
    drag(e, {
      move: (dx, dy) => {
        let start = startState.start + this.toSec(dx);
        if (this.state.snap) {
          const snapped = snapTo(start, snapPoints(this.project, {
            exclude: [clip.id], playhead: this.state.time,
          }), this.toSec(SNAP_PX));
          // Try the tail as well, so a clip clicks into place from either edge.
          const tail = snapTo(start + startState.dur, snapPoints(this.project, {
            exclude: [clip.id], playhead: this.state.time,
          }), this.toSec(SNAP_PX));
          if (snapped.snapped) { start = snapped.value; this._showSnap(snapped.value); }
          else if (tail.snapped) { start = tail.value - startState.dur; this._showSnap(tail.value); }
          else this._hideSnap();
        }
        const targetTrack = this._trackAtY(dy, startState.trackId);
        moveClip(this.project, clip.id, { start: Math.max(0, start), trackId: targetTrack });
        moved = true;
        this._renderTracks();
      },
      end: () => {
        node.classList.remove('dragging');
        this._hideSnap();
        if (moved) this.actions.commit('Move clip', `move:${clip.id}`);
        else this.render();
      },
    });
  }

  /** Which track a vertical drag has landed on. */
  _trackAtY(dy, fromTrackId) {
    const tracks = this.project.tracks;
    const index = tracks.findIndex((t) => t.id === fromTrackId);
    if (index < 0) return fromTrackId;
    const rowHeight = tracks[index].height || 60;
    const shift = Math.round(dy / rowHeight);
    const target = tracks[clamp(index + shift, 0, tracks.length - 1)];
    return target.id;
  }

  /** Repaint a single clip during a trim — repainting all of them drops frames. */
  _paintOne(clip) {
    const node = this.tracks.querySelector(`[data-clip="${CSS.escape(clip.id)}"]`);
    if (!node) { this._renderTracks(); return; }
    node.style.left = `${this.toPx(clip.start)}px`;
    node.style.width = `${Math.max(4, this.toPx(clip.dur))}px`;
  }

  _showSnap(t) {
    if (!this.snapLine) {
      this.snapLine = el('div', { class: 'snapline' });
      this.inner.appendChild(this.snapLine);
    }
    this.snapLine.style.left = `${this.toPx(t)}px`;
    this.snapLine.hidden = false;
  }

  _hideSnap() { if (this.snapLine) this.snapLine.hidden = true; }
}

/** What to call a clip on the timeline. A sticker is not a title. */
function clipLabel(clip, media) {
  if (clip.kind === 'sticker') {
    const st = clip.sticker;
    if (!st) return 'Sticker';
    return st.kind === 'emoji' ? st.value : (st.text || st.value || 'Shape');
  }
  if (clip.kind === 'title') return clip.text?.content?.slice(0, 24) || 'Title';
  return media?.name || 'Clip';
}

/* ------------------------------------------------------------------ */
/* ruler helpers                                                       */
/* ------------------------------------------------------------------ */

/** A tick spacing that stays readable at any zoom: 1/2/5/10/15/30/60… */
function niceStep(pxPerSec) {
  const candidates = [1 / 30, 1 / 10, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const step of candidates) {
    if (step * pxPerSec >= 58) return step;
  }
  return 600;
}

function formatTick(t) {
  if (t < 60) return t % 1 === 0 ? `${t}s` : `${t.toFixed(2)}`;
  const m = Math.floor(t / 60);
  return `${m}:${String(Math.round(t % 60)).padStart(2, '0')}`;
}

export { esc };
