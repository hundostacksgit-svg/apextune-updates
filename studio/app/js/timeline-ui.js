/*
 * The timeline: drawing it, and every gesture on it.
 *
 * Positions are seconds everywhere in the model and pixels only here, through
 * one pair of functions (toPx / toSec). Every bug I have seen in a timeline
 * comes from those two units getting mixed up somewhere in the middle, so they
 * are converted at the edge and nowhere else.
 */

import { $, $$, el, esc, drag, clamp, toast, dur as fmtDur } from './ui.js';
import {
  clipsOn, clipById, mediaById, trackById, duration,
  splitClip, trimClip, moveClip, snapPoints, snapTo, addTrack, removeTrack,
  rollEdit, slipClip, slideClip, rippleTrim, handles, neighbourBefore, neighbourAfter,
} from './engine/project.js';
import * as kf from './keyframes-ui.js';
import * as licence from './licence.js';
import { attach as attachMenu } from './context-menu.js';
import { clipMenu, trackSpaceMenu, trackHeadMenu, rulerMenu } from './menus.js';

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
    this._wireKeyframes();
    this._wireMenus();
    this._wireTrimCursor();
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
    kf.prune(p);
    // Only wide enough for property names while there are property names.
    this.body ||= $('#tl-body');
    this.body?.classList.toggle('props', kf.anyExpanded());
    document.documentElement.classList.toggle('kf-graph-open', kf.isGraphOpen());
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
    const ctx = { time: this.state.time };
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

      /*
       * An unfolded clip puts its properties directly under its own track, in
       * both columns at once. The two columns are separate scrollers that are
       * kept in step by row height alone, so a row added on one side and not
       * the other does not misalign a little — it misaligns everything below
       * it, for the rest of the session.
       */
      for (const clip of clipsOn(this.project, track.id)) {
        if (!kf.isExpanded(clip.id)) continue;
        for (const row of kf.headRows(clip, ctx)) frag.appendChild(row);
        if (kf.isGraphOpen()) {
          frag.appendChild(el('div', {
            class: 'kf-head kf-graph-head', style: `height:${kf.GRAPH_H}px`,
          }, el('span', { class: 'kf-name' }, 'Graph')));
        }
      }
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

      const laneCtx = { toPx: (t) => this.toPx(t), time: this.state.time };
      for (const clip of clipsOn(this.project, track.id)) {
        if (!kf.isExpanded(clip.id)) continue;
        for (const lane of kf.laneRows(clip, laneCtx)) frag.appendChild(lane);
        if (kf.isGraphOpen()) frag.appendChild(kf.graphRow(clip, laneCtx));
      }
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
      : clip.kind === 'adjust' ? 'adjust'
      : clip.kind === 'compound' ? 'compound'
      : clip.kind === 'null' ? 'null'
      : clip.kind === 'shape' ? 'shape'
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
    /*
     * The disclosure triangle: the one control that turns a strip of film into
     * a layer with properties. Only drawn once the clip is wide enough to hold
     * it without covering the name, because a 12px clip with a caret on it is
     * just a caret.
     */
    if (width > 44) {
      const animated = Object.keys(clip.keyframes || {}).length;
      node.classList.add('folds');
      node.appendChild(el('button', {
        class: `cfold ${kf.isExpanded(clip.id) ? 'open' : ''} ${animated ? 'anim' : ''}`,
        'data-fold': clip.id,
        'data-tip': 'Opens this clip up into its properties — position, scale, '
          + 'opacity, colour, every effect on it. Anything with a stopwatch can '
          + 'be animated over time.',
        title: kf.isExpanded(clip.id)
          ? 'Hide this layer\u2019s properties'
          : `Show this layer\u2019s properties${animated ? ` \u2014 ${animated} animated` : ''}`,
      }, kf.isExpanded(clip.id) ? '\u25BE' : '\u25B8'));
    }

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
      if (e.button !== 0 && e.pointerType === 'mouse') return;   // right-click is the menu
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
      if (kf.handleHeadClick(e, this._kfCtx())) return;
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

    this.tracks.addEventListener('click', (e) => {
      const fold = e.target.closest('[data-fold]');
      if (!fold) return;
      e.stopPropagation();
      kf.toggleExpanded(fold.dataset.fold);
      this.render();
    });

    // Clips: select, move, trim, razor.
    this.tracks.addEventListener('pointerdown', (e) => this._onClipPointerDown(e));

    // Clicking empty track space clears the selection and parks the playhead.
    this.tracks.addEventListener('click', (e) => {
      if (e.button !== 0) return;                    // the menu handles the rest
      if (e.target.closest('.clip')) return;
      // A click inside a property lane is aimed at a keyframe, not the playhead.
      if (e.target.closest('.kf-lane, .kf-graph')) return;
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

  /*
   * The bridge the keyframe editor works through.
   *
   * It knows seconds and pixels and nothing else about this class — no zoom,
   * no undo stack, no project — so it can be tested on its own and cannot
   * drift out of step with the rest of the timeline.
   */
  _kfCtx() {
    return {
      toPx: (t) => this.toPx(t),
      toSec: (px) => this.toSec(px),
      time: () => this.state.time,
      clip: (id) => clipById(this.project, id),
      seek: (t) => this.actions.seek(t),
      repaint: () => this.render(),
      /*
       * Every write goes through the licence.
       *
       * Looking at the lanes is free — you can unfold a layer, read what is
       * animated and watch the values move at the playhead on any edition,
       * because seeing what the tool does is how anyone decides to buy it.
       * Putting a key down is the paid half.
       */
      change: (fn, clipId, label) => {
        const clip = clipById(this.project, clipId);
        if (!clip) return;
        licence.gate('keyframes', () => {
          fn(clip);
          this.actions.commit(label);
        }, { what: 'Keyframes' });
      },
    };
  }

  /*
   * Right-click, and long-press, everywhere on the timeline.
   *
   * Three surfaces, three menus: a clip, the empty space on a layer, and the
   * layer header. Built when the menu opens so every item knows what is
   * selected, where the playhead is and what is on the clipboard.
   */
  /*
   * The cursor names the trim before you start it.
   *
   * Four operations behind one gesture is only usable if the pointer tells you
   * which one you are about to get — the difference between rolling a cut and
   * rippling it is the difference between an edit that stays in sync and one
   * that does not.
   */
  _wireTrimCursor() {
    this.tracks.addEventListener('pointermove', (e) => {
      if (this.state.tool !== 'trim') return;
      const node = e.target.closest('.clip');
      if (!node) { this.tracks.dataset.trim = ''; return; }
      const clip = clipById(this.project, node.dataset.clip);
      if (!clip) return;
      const pick = this.trimKindAt(clip, e.clientX, e.altKey);
      this.tracks.dataset.trim = pick?.kind || '';
    });
    this.tracks.addEventListener('pointerleave', () => { this.tracks.dataset.trim = ''; });
  }

  _wireMenus() {
    attachMenu(this.tracks, (e) => {
      const node = e.target.closest('.clip');
      const rect = this.inner.getBoundingClientRect();
      const at = this.toSec(e.clientX - rect.left);

      if (node) {
        const clip = clipById(this.project, node.dataset.clip);
        if (!clip) return null;
        // Right-clicking outside the selection selects what you clicked, the
        // way it does in every file manager. Right-clicking inside it leaves
        // the selection alone, so a menu on six clips still acts on six.
        if (!this.state.sel.has(clip.id)) this.actions.select([clip.id]);
        return clipMenu(clip.id, at);
      }

      const row = e.target.closest('.tl-track');
      if (!row) return null;
      return trackSpaceMenu(row.dataset.track, Math.max(0, at));
    });

    attachMenu(this.heads, (e) => {
      const head = e.target.closest('[data-track]');
      return head ? trackHeadMenu(head.dataset.track) : null;
    });

    attachMenu(this.ruler, (e) => {
      const rect = this.ruler.getBoundingClientRect();
      const at = Math.max(0, this.toSec(e.clientX - rect.left));
      const marker = e.target.closest('[data-marker]');
      return rulerMenu(at, marker ? Number(marker.dataset.marker) : null);
    });
  }

  _wireKeyframes() {
    kf.wire(this.tracks, this._kfCtx());

    /*
     * Delete removes the selected keys rather than the clip they sit on.
     *
     * Captured, so it runs before the app-wide Delete handler — pressing
     * Delete with a keyframe picked and watching the whole clip disappear is
     * the kind of thing you only forgive an editor once.
     */
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!kf.pickedCount()) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      e.preventDefault();
      e.stopPropagation();
      const gone = kf.deletePicked(this.project);
      if (gone) this.actions.commit(`Delete ${gone} keyframe${gone === 1 ? '' : 's'}`);
    }, true);
  }

  _onClipPointerDown(e) {
    /*
     * The right button is for the menu, not for moving things.
     *
     * A contextmenu event is preceded by a pointerdown, so without this a
     * right-click ran the whole selection-and-drag path first: right-clicking
     * one of six selected clips collapsed the selection to that one, and the
     * menu that opened a moment later offered to delete a single clip instead
     * of the six that were selected when the user aimed at them.
     */
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // The fold caret is a button that happens to sit on a draggable thing.
    // Without this, opening a layer nudges the clip a few frames sideways.
    if (e.target.closest('[data-fold]')) return;
    const node = e.target.closest('.clip');
    if (!node) return;
    const clip = clipById(this.project, node.dataset.clip);
    if (!clip) return;
    const track = trackById(this.project, clip.trackId);
    if (track?.locked) return;

    /*
     * The trim tool: which of the four you get depends on where you grabbed.
     *
     * Resolve calls this smart trim and it is the right idea — one tool, and
     * the part of the clip under the cursor picks the operation, so the four
     * trims are one gesture with four meanings rather than four modes to
     * remember. The readout says which one is happening while you drag,
     * because a tool that silently picks between four behaviours has to tell
     * you which it picked.
     */
    if (this.state.tool === 'trim') { this._trimDrag(e, clip); return; }

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
        const targetTrack = this._trackAtY(dy, startState.trackId, { allowNew: true });
        moveClip(this.project, clip.id, { start: Math.max(0, start), trackId: targetTrack });
        moved = true;
        this._renderTracks();
      },
      end: () => {
        node.classList.remove('dragging');
        this._hideSnap();
        /*
         * A layer created during a drag that ended up unused is removed again.
         * Dragging up, changing your mind and dragging back down should leave
         * the project exactly as it was, not littered with an empty track.
         */
        if (this._madeTrack) {
          const used = this.project.clips.some((c) => c.trackId === this._madeTrack);
          if (!used) removeTrack(this.project, this._madeTrack);
          this._madeTrack = null;
        }
        if (moved) this.actions.commit('Move clip', `move:${clip.id}`);
        else this.render();
      },
    });
  }

  /**
   * Which track a vertical drag has landed on.
   *
   * Dragging above the top video track makes a new one, the way every layer-
   * based editor works: you do not go and add a track and then drag onto it,
   * you drag up and the layer appears. Overlays are the whole reason anybody
   * stacks video, and making somebody find a menu first is what stops them
   * discovering that the app can do it at all.
   *
   * Only one is ever created per drag. Without that guard, holding the pointer
   * above the top edge would spawn a track on every pointermove — dozens of
   * them in a second, and no obvious way back.
   *
   * Downward has no equivalent: the audio tracks are down there and dropping a
   * clip onto one is already meaningful (it becomes audio only), so the bottom
   * is a real destination rather than an edge to grow past.
   */
  /** Which trim a point on a clip means. Also used to paint the cursor. */
  trimKindAt(clip, clientX, altKey = false) {
    const node = this.tracks.querySelector(`[data-clip="${CSS.escape(clip.id)}"]`);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    const grab = Math.min(22, Math.max(8, r.width * 0.22));

    if (clientX - r.left < grab) {
      const touching = neighbourBefore(this.project, clip);
      const isCut = touching
        && Math.abs(touching.start + touching.dur - clip.start) < 0.002;
      return { kind: isCut && !altKey ? 'roll' : 'ripple', edge: 'l' };
    }
    if (r.right - clientX < grab) {
      const touching = neighbourAfter(this.project, clip);
      const isCut = touching && Math.abs(clip.start + clip.dur - touching.start) < 0.002;
      return { kind: isCut && !altKey ? 'roll' : 'ripple', edge: 'r' };
    }
    return { kind: altKey ? 'slide' : 'slip', edge: null };
  }

  _trimDrag(e, clip) {
    const pick = this.trimKindAt(clip, e.clientX, e.altKey);
    if (!pick) return;
    this.actions.select([clip.id]);

    const before = JSON.parse(JSON.stringify(
      this.project.clips.map((c) => ({ id: c.id, start: c.start, dur: c.dur, in: c.in }))));
    const restore = () => {
      for (const rec of before) {
        const c = clipById(this.project, rec.id);
        if (c) { c.start = rec.start; c.dur = rec.dur; c.in = rec.in; }
      }
    };

    const LABEL = { roll: 'Roll', ripple: 'Ripple', slip: 'Slip', slide: 'Slide' };
    let applied = 0;

    drag(e, {
      move: (dx) => {
        const want = this.toSec(dx);
        restore();
        if (pick.kind === 'roll') applied = rollEdit(this.project, clip.id, pick.edge, want, { minDur: MIN_CLIP });
        else if (pick.kind === 'ripple') applied = rippleTrim(this.project, clip.id, pick.edge, want, { minDur: MIN_CLIP });
        else if (pick.kind === 'slip') applied = slipClip(this.project, clip.id, want);
        else applied = slideClip(this.project, clip.id, want, { minDur: MIN_CLIP });

        this._renderTracks();
        /*
         * "Slip −1.20s" while you drag, and how much handle is left.
         *
         * Without it the four trims are indistinguishable from each other
         * until you let go, and the one that ran out of source looks the same
         * as the one that did what you asked.
         */
        const h = handles(this.project, clip);
        const room = Number.isFinite(h.head)
          ? ` · handles ${h.head.toFixed(1)}s / ${h.tail.toFixed(1)}s` : '';
        this._trimReadout(`${LABEL[pick.kind]} ${applied >= 0 ? '+' : ''}${applied.toFixed(2)}s${
          Math.abs(applied - want) > 0.01 ? ' (out of source)' : ''}${room}`);
      },
      end: () => {
        this._trimReadout(null);
        if (Math.abs(applied) > 0.0005) this.actions.commit(`${LABEL[pick.kind]} trim`);
        else { restore(); this.render(); }
      },
    });
  }

  _trimReadout(text) {
    let box = $('#tl-trim-readout');
    if (!text) { box?.remove(); return; }
    if (!box) {
      box = el('div', { class: 'tl-readout', id: 'tl-trim-readout' });
      document.body.appendChild(box);
    }
    box.textContent = text;
  }

  _trackAtY(dy, fromTrackId, { allowNew = false } = {}) {
    const tracks = this.project.tracks;
    const index = tracks.findIndex((t) => t.id === fromTrackId);
    if (index < 0) return fromTrackId;
    const rowHeight = tracks[index].height || 60;
    const shift = Math.round(dy / rowHeight);
    const wanted = index + shift;

    if (wanted < 0 && allowNew && !this._madeTrack) {
      const track = addTrack(this.project, 'video');
      this._madeTrack = track.id;
      toast('New overlay layer', 'ok', 1600);
      return track.id;
    }
    // Once a layer has been made this drag, the top of the stack is that layer
    // rather than the edge — so pulling further up does not keep adding more.
    const target = tracks[clamp(wanted, 0, tracks.length - 1)];
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
  if (clip.kind === 'compound') return clip.label || 'Compound';
  if (clip.kind === 'null') return clip.label || 'Null';
  if (clip.kind === 'shape') return clip.label || clip.shape?.name || 'Shape';
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
