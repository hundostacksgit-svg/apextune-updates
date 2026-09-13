/*
 * Motion tracking, from the user's side.
 *
 * Draw a box on the picture, press Track, watch it walk through the clip. What
 * comes back is stored on the project as a named path, so one track of a face
 * can be reused by a blur, a sticker and a title without tracking three times.
 *
 * The interaction is deliberately the one everyone already knows from every
 * other editor: a box with corner handles over the viewer, and a button.
 */

import { $, esc, toast, drag, modal, closeModal } from '../ui.js';
import { S, actions, engine } from '../main.js';
import { clipById, mediaById, sourceTime, clipsOn, addClip, addTrack } from '../engine/project.js';
import { defaultSticker, defaultReact } from '../engine/stickers.js';
const projectApi = { addClip, addTrack };
import { elementFor } from '../engine/media.js';
import { trackBox, smoothTrack, applyTrack, describeTrack, findTarget, findFace } from '../engine/tracking.js';
import { makeEffect } from '../engine/effects.js';
import { pickRegion, packShape, dilate } from '../engine/erase.js';
import { buildPlate } from '../engine/matte.js';
import { keepPlate } from '../engine/erase.js';
import * as licence from '../licence.js';

let abort = null;
/* Whether the box currently on screen was put there by the face finder. It
   only changes which options the "what should follow it" sheet offers, so a
   stale value costs a wrong menu and never a wrong edit. */
let faceBox = false;

/* ------------------------------------------------------------------ */
/* the box overlay                                                     */
/* ------------------------------------------------------------------ */

export function openTracker(clip) {
  const layer = $('#track-layer');
  const box = $('#track-box');
  const hint = $('#track-hint');
  if (!layer) return;

  layer.hidden = false;
  layer.classList.remove('working');
  hint.innerHTML = 'Drag a box around what you want to follow, then press <b>Track</b>';

  // Start with a sensible box rather than nothing to grab.
  Object.assign(box.style, { left: '38%', top: '38%', width: '24%', height: '24%' });

  const onDown = (e) => {
    if (e.target.closest('.track-hint')) return;
    const rect = layer.getBoundingClientRect();
    const x0 = ((e.clientX - rect.left) / rect.width) * 100;
    const y0 = ((e.clientY - rect.top) / rect.height) * 100;
    faceBox = false;
    drag(e, {
      move: (dx, dy) => {
        const w = Math.abs(dx / rect.width) * 100;
        const h = Math.abs(dy / rect.height) * 100;
        box.style.left = `${Math.max(0, dx < 0 ? x0 - w : x0)}%`;
        box.style.top = `${Math.max(0, dy < 0 ? y0 - h : y0)}%`;
        box.style.width = `${Math.max(3, w)}%`;
        box.style.height = `${Math.max(3, h)}%`;
      },
    });
  };
  layer.addEventListener('pointerdown', onDown);
  // A box you drew yourself is not a face until something says it is.
  faceBox = false;

  hint.innerHTML = `
    <button class="btn btn-sm btn-primary" id="tk-go">Track it</button>
    <button class="btn btn-sm" id="tk-face" title="Put the box on the face in this shot">🙂 Follow the face</button>
    <button class="btn btn-sm" id="tk-auto" title="Find something worth following and put the box on it">✨ Find it for me</button>
    <button class="btn btn-sm btn-ghost" id="tk-cancel">Cancel</button>
    <span class="tiny muted" style="margin-left:8px">Drag anywhere to redraw the box</span>`;

  const putBox = (b) => Object.assign(box.style, {
    left: `${Math.max(0, (b.x - b.w / 2) * 100)}%`,
    top: `${Math.max(0, (b.y - b.h / 2) * 100)}%`,
    width: `${b.w * 100}%`,
    height: `${b.h * 100}%`,
  });

  /*
   * The face button, separate from "find it for me".
   *
   * They do overlap — the general finder checks for a face first — but when
   * somebody presses a button that says face and gets a doorframe, the right
   * answer is "there is no face in this shot", not a silent fallback onto the
   * nearest hard edge. Two buttons, two honest answers.
   */
  $('#tk-face')?.addEventListener('click', async () => {
    const btn = $('#tk-face');
    btn.disabled = true;
    btn.textContent = 'Looking…';
    try {
      const node = elementFor(mediaById(S.project, clip.mediaId), clip.id);
      const at = sourceTime(clip, S.time >= clip.start && S.time < clip.start + clip.dur
        ? S.time : clip.start);
      const face = await findFace(node, { at });
      if (!face || face.confidence < 0.3) {
        toast('No face found at this moment. Move the playhead to a frame where '
          + 'somebody is facing the camera and try again, or draw the box yourself.',
          'bad', 6000);
        return;
      }
      faceBox = true;
      putBox(face.box);
      toast(face.confidence > 0.6
        ? 'Found the face. Press Track it and pick what should follow it.'
        : 'Found something face-shaped — check the box before tracking.',
        face.confidence > 0.6 ? 'ok' : '', 5200);
    } catch (err) {
      toast(err.message, 'bad', 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = '🙂 Follow the face';
    }
  });

  /*
   * Put the box on something automatically.
   *
   * It moves the box rather than tracking straight away, on purpose: you see
   * what it chose and can accept or redraw before spending the time. A tracker
   * that silently picks the wrong thing and then grinds through the clip is
   * worse than one that asks.
   */
  $('#tk-auto')?.addEventListener('click', async () => {
    const btn = $('#tk-auto');
    btn.disabled = true;
    btn.textContent = 'Looking…';
    try {
      const node = elementFor(mediaById(S.project, clip.mediaId), clip.id);
      const at = sourceTime(clip, S.time >= clip.start && S.time < clip.start + clip.dur
        ? S.time : clip.start);
      const found = await findTarget(node, { at });
      if (!found) {
        toast('Nothing in this shot is distinct enough to lock onto — draw a box '
          + 'around something with a hard edge instead.', 'bad', 6000);
        return;
      }
      faceBox = found.kind === 'face';
      putBox(found.box);
      // Say what it picked and why. A box that appears with no explanation
      // gives you nothing to judge it against.
      toast(`Locked onto ${found.why}. Press Track it, or drag to move the box.`, 'ok', 5000);
    } catch (err) {
      toast(err.message, 'bad', 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Find it for me';
    }
  });
  hint.style.pointerEvents = 'auto';

  const close = () => {
    layer.hidden = true;
    layer.removeEventListener('pointerdown', onDown);
    hint.style.pointerEvents = 'none';
    abort?.abort();
    abort = null;
  };

  $('#tk-cancel').addEventListener('click', close);
  $('#tk-go').addEventListener('click', () => run(clip, box, layer, hint, close));
}

/* ------------------------------------------------------------------ */
/* running it                                                          */
/* ------------------------------------------------------------------ */

async function run(clip, box, layer, hint, close) {
  const media = mediaById(S.project, clip.mediaId);
  if (!media || media.kind !== 'video') {
    toast('Tracking needs a video clip', 'bad');
    return;
  }
  const node = elementFor(media, clip.id);
  if (!node?.videoWidth) { toast('That clip is still loading', 'bad'); return; }

  // The box is a percentage of the viewer; the tracker wants a fraction of the
  // frame, with x/y at the centre.
  const style = box.style;
  const pct = (v) => parseFloat(v) / 100;
  const request = {
    x: pct(style.left) + pct(style.width) / 2,
    y: pct(style.top) + pct(style.height) / 2,
    w: pct(style.width),
    h: pct(style.height),
  };

  layer.classList.add('working');
  abort = new AbortController();

  // Track across the clip's own source range, not the whole file.
  const from = sourceTime(clip, S.time >= clip.start && S.time < clip.start + clip.dur ? S.time : clip.start);
  const to = sourceTime(clip, clip.start + clip.dur - 0.01);

  hint.innerHTML = '<span class="tiny">Tracking… <b id="tk-pct">0%</b></span> '
    + '<button class="btn btn-sm btn-ghost" id="tk-stop">Stop</button>';
  $('#tk-stop').addEventListener('click', () => abort?.abort());

  try {
    const result = await trackBox(node, {
      box: request,
      from,
      to: Math.max(from + 0.2, to),
      fps: 15,
      signal: abort.signal,
      onProgress: ({ done, total }) => {
        const pctEl = $('#tk-pct');
        if (pctEl) pctEl.textContent = `${Math.round((done / total) * 100)}%`;
      },
    });

    const verdict = describeTrack(result);
    if (!result.points.length) { toast(verdict.text, 'bad', 6000); close(); return; }

    // Store it on the project so other clips can borrow it.
    S.project.motionTracks ||= [];
    const record = {
      id: `mt${Date.now().toString(36)}`,
      name: `${media.name.slice(0, 18)} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      sourceClipId: clip.id,
      clipStart: clip.start,
      points: smoothTrack(result.points, 0.4),
      mean: result.mean,
      lostAt: result.lostAt ?? null,
    };
    S.project.motionTracks.push(record);
    actions.commit('Motion track');

    close();
    offerToPin(record, verdict);
  } catch (err) {
    close();
    // These messages are written to tell someone what to do differently.
    modal(`<h3>Could not track that</h3>
      <p>${esc(err.message)}</p>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-primary" data-x="ok">OK</button></div>`);
    $('[data-x="ok"]')?.addEventListener('click', closeModal);
  }
}

/* ------------------------------------------------------------------ */
/* what to do with a finished track                                    */
/* ------------------------------------------------------------------ */

function offerToPin(record, verdict) {
  /*
   * A face track gets the flattering options as well as the hiding ones.
   *
   * Blur and pixelate are what you do to a face you want gone. Everything in
   * the second row is what you do to a face you want kept — and that is what
   * most people are tracking a face for. Offered only on a face track, because
   * "soften the skin" on a number plate is nonsense.
   */
  const body = modal(`
    <h3>Tracked</h3>
    <p>${esc(verdict.text)}</p>
    <p class="small">What should follow it?</p>
    ${faceBox ? `
    <div class="btn-row" style="margin-top:6px">
      <button class="btn" data-pin="portrait">📸 Blur the background</button>
      <button class="btn" data-pin="spotlight">🔦 Darken everything else</button>
      <button class="btn" data-pin="soften">✨ Soften the skin</button>
      <button class="btn" data-pin="glow">💡 Light the face</button>
    </div>
    <p class="tiny muted" style="margin:10px 0 4px">Or hide it instead:</p>` : ''}
    <div class="btn-row" style="margin-top:6px">
      <button class="btn" data-pin="blur">Blur this spot</button>
      <button class="btn" data-pin="pixel">Pixelate this spot</button>
      <button class="btn" data-pin="selected">Pin the selected clip to it</button>
      <button class="btn" data-pin="transition">Cut through it</button>
      <button class="btn" data-pin="sticker">Give it a sticker</button>
      <button class="btn btn-ghost" data-pin="later">Just keep the track</button>
    </div>
    <p class="tiny muted" style="margin:8px 0 0">
      <b>Cut through it</b> puts a zoom-through on the cut after this clip, aimed at the tracked
      spot: the picture dives into whatever you tracked and comes out in the next shot.
      <b>Give it a sticker</b> drops one that hovers over the subject — then change what it does
      (orbit, lean, trail, point at it, pop when it stops) in the Text panel.
    </p>
    <p class="tiny muted" style="margin-top:14px">
      Whatever you pick becomes ordinary keyframes you can edit by hand. The track stays in
      the Inspector so you can pin something else to it later.
    </p>`);

  body.addEventListener('click', (e) => {
    const what = e.target.closest('[data-pin]')?.dataset.pin;
    if (!what) return;
    closeModal();
    if (what === 'later') { toast('Track saved — find it in the Inspector', 'ok'); return; }
    pin(record, what);
  });
}

export function pin(record, what) {
  const source = clipById(S.project, record.sourceClipId);

  /*
   * A transition that follows the track.
   *
   * It goes on the clip *after* the tracked one and is aimed from the
   * outgoing side: the anchor is read off this track at the moment of the
   * cut, so the zoom dives into the tracked spot wherever it has got to by
   * then. Any anchor-aware transition can be swapped in afterwards from the
   * picker; the track stays attached to the cut.
   */
  /*
   * A sticker that reacts to the subject, spanning the tracked clip.
   *
   * Hover by default — it is the one that reads instantly as "attached to
   * that person" — and the Text panel is where the other eleven live. The
   * sticker holds a reference to the track, not a copy of its points, so
   * re-tracking moves it.
   */
  if (what === 'sticker') {
    if (!source) { toast('The clip this was tracked on has gone', 'bad'); return; }
    const { addClip, addTrack } = projectApi;
    let track = S.project.tracks.find((tr) => tr.kind === 'video' && tr.name === 'Stickers');
    if (!track) track = addTrack(S.project, 'video', 'Stickers');
    const first = record.points[0], last = record.points.at(-1);
    const start = Math.max(source.start, source.start + (first.t - source.in) / (source.speed || 1));
    const end = Math.min(source.start + source.dur, source.start + (last.t - source.in) / (source.speed || 1));
    const clip = addClip(S.project, {
      trackId: track.id, start, dur: Math.max(0.5, end - start), kind: 'sticker',
      sticker: { ...defaultSticker('emoji', '🔥'), size: 0.12, anim: 'pop', react: defaultReact(record.id, 'hover') },
    });
    S.sel = new Set([clip.id]);
    actions.commit('Sticker reacts to track');
    toast('A 🔥 now hovers over it — change the emoji and what it does in the Text panel', 'ok', 4200);
    return;
  }

  if (what === 'transition') {
    if (!source) { toast('The clip this was tracked on has gone', 'bad'); return; }
    const list = clipsOn(S.project, source.trackId);
    const idx = list.findIndex((c) => c.id === source.id);
    const next = idx >= 0 ? list[idx + 1] : null;
    if (!next) { toast('There is no clip after this one to cut into — put one on the timeline first', 'bad', 4200); return; }
    const room = Math.min(next.dur, source.dur) / 3;
    next.transitionIn = { type: 'zoomThrough', dur: Math.min(0.55, room), trackId: record.id, anchorFrom: 'out' };
    actions.commit('Tracked transition');
    S.sel = new Set([next.id]);
    toast('Zoom-through set on the cut, aimed at the tracked spot. Change the type in the Inspector.', 'ok', 4200);
    return;
  }

  if (what === 'selected') {
    const target = [...S.sel].map((id) => clipById(S.project, id)).find(Boolean);
    if (!target) { toast('Select the clip you want to follow the track first', 'bad'); return; }
    applyTrack(target, record, {
      mode: 'transform',
      clipStart: sourceOffsetFor(target, record),
      followScale: false,
    });
    actions.commit('Pin to motion track');
    toast(`${target.kind === 'sticker' ? 'Sticker' : target.kind === 'title' ? 'Title' : 'Clip'} now follows the track`, 'ok');
    return;
  }

  if (!source) { toast('The clip this was tracked on has gone', 'bad'); return; }

  const FACE_MODES = {
    portrait: { label: 'Background blurred', size: 34, strength: 70, feather: 46 },
    spotlight: { label: 'Spotlight on the face', size: 40, strength: 66, feather: 62 },
    soften: { label: 'Skin softened', size: 26, strength: 48, feather: 54 },
    glow: { label: 'Face lit', size: 30, strength: 55, feather: 66 },
  };
  if (FACE_MODES[what]) {
    const preset = FACE_MODES[what];
    const fx = makeEffect('focusRegion');
    fx.params.mode = what;
    fx.params.size = preset.size;
    fx.params.strength = preset.strength;
    fx.params.feather = preset.feather;
    source.effects ||= [];
    source.effects = source.effects.filter((f) => f.id !== 'focusRegion');
    source.effects.push(fx);
    applyTrack(source, record, {
      mode: 'effect', effectId: 'focusRegion', clipStart: sourceOffsetFor(source, record),
    });
    actions.commit(preset.label);
    toast(`${preset.label} — it follows the face through the shot. `
      + 'Size and strength are in the Effects panel.', 'ok', 4600);
    return;
  }

  const fx = makeEffect('blurRegion');
  fx.params.shape = what === 'pixel' ? 'pixel' : 'ellipse';
  fx.params.size = 22;
  fx.params.strength = what === 'pixel' ? 30 : 24;
  source.effects ||= [];
  source.effects = source.effects.filter((f) => f.id !== 'blurRegion');
  source.effects.push(fx);

  applyTrack(source, record, { mode: 'effect', effectId: 'blurRegion', clipStart: sourceOffsetFor(source, record) });
  actions.commit(what === 'pixel' ? 'Pixelate and track' : 'Blur and track');
  toast('It will follow that through the shot. Adjust the size in the Effects panel.', 'ok', 4200);
}

/**
 * Track points are in source time; keyframes are in clip-local time. For the
 * clip it was tracked on those differ by the in point — for anything else,
 * line the track up with where that clip starts.
 */
function sourceOffsetFor(clip, record) {
  if (clip.id === record.sourceClipId) return clip.in;
  return record.points[0]?.t ?? 0;
}

/* ------------------------------------------------------------------ */
/* removing a thing: tap it                                            */
/* ------------------------------------------------------------------ */

/*
 * The whole interaction is one tap. Tap the can and the can lights up; if
 * the light spills onto the table, drag the tolerance down; if it misses the
 * lid, tap the lid too. Then one button. Everything after that — the shape,
 * the track through the rest of the shot in both directions, the background
 * plate, the fill every frame — happens without another decision.
 */

/** The eraser on the selected video clip, or the one under the playhead. */
export function openEraserForSelected() {
  const isVideo = (c) => c && mediaById(S.project, c.mediaId)?.kind === 'video';
  let clip = [...S.sel].map((id) => clipById(S.project, id)).find(isVideo);
  if (!clip) {
    const under = S.project.clips.filter((c) => isVideo(c) && S.time >= c.start && S.time < c.start + c.dur);
    clip = under[under.length - 1] || null;
  }
  if (!clip) { toast('Put the playhead on a video clip first — that is the shot the thing gets removed from', 'bad', 4200); return; }
  licence.gate('keyframes', () => openEraser(clip), { what: 'Removing an object' });
}

/* What the test harness and the AI panel can read back: the picked region so far. */
let eraseState = null;
export function eraserState() { return eraseState; }

export function openEraser(clip) {
  const layer = $('#track-layer');
  const hint = $('#track-hint');
  const cv = $('#preview');
  if (!layer || !cv) return;
  const media = mediaById(S.project, clip.mediaId);
  if (!media || media.kind !== 'video') { toast('Removing something needs a video clip', 'bad'); return; }
  if (S.time < clip.start || S.time >= clip.start + clip.dur) actions.seek(clip.start + Math.min(0.5, clip.dur / 2));
  S.sel = new Set([clip.id]);
  actions.refresh();

  layer.hidden = false;
  layer.classList.remove('working');
  layer.classList.add('erasing');
  let overlay = $('#erase-overlay');
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.id = 'erase-overlay';
    overlay.className = 'erase-overlay';
    layer.insertBefore(overlay, hint);
  }
  const state = { mask: null, w: 0, h: 0, bbox: null, area: 0, tolerance: 30, add: false, taps: 0 };
  eraseState = state;

  const paint = () => {
    overlay.width = state.w || cv.width;
    overlay.height = state.h || cv.height;
    const g = overlay.getContext('2d');
    g.clearRect(0, 0, overlay.width, overlay.height);
    if (!state.mask) return;
    /* The region as a mint tint with a bright rim, so it reads as "this, exactly this". */
    const img = g.createImageData(state.w, state.h);
    const d = img.data, m = state.mask, w = state.w, h = state.h;
    for (let i = 0; i < m.length; i++) {
      if (!m[i]) continue;
      const x = i % w, y = (i - x) / w;
      const rim = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w];
      d[i * 4] = 49; d[i * 4 + 1] = 217; d[i * 4 + 2] = 167; d[i * 4 + 3] = rim ? 255 : 120;
    }
    g.putImageData(img, 0, 0);
  };

  const pickAt = (fx, fy) => {
    const w = cv.width, h = cv.height;
    if (!w || !h) return;
    const rgba = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const r = pickRegion(rgba, w, h, fx * w, fy * h, { tolerance: state.tolerance });
    if (!r.bbox) { toast('Nothing to pick there — tap on the thing itself', '', 3000); return; }
    if (state.add && state.mask && state.w === w && state.h === h) {
      for (let i = 0; i < r.mask.length; i++) if (r.mask[i]) state.mask[i] = 1;
      state.bbox = {
        x0: Math.min(state.bbox.x0, r.bbox.x0), y0: Math.min(state.bbox.y0, r.bbox.y0),
        x1: Math.max(state.bbox.x1, r.bbox.x1), y1: Math.max(state.bbox.y1, r.bbox.y1),
      };
      state.area += r.area;
    } else {
      state.mask = r.mask; state.w = w; state.h = h; state.bbox = r.bbox; state.area = r.area;
    }
    state.taps++;
    paint();
    const area = $('#er-area');
    if (area) area.textContent = `${((state.area / (w * h)) * 100).toFixed(1)}% of the frame`;
    const go = $('#er-go');
    if (go) go.disabled = false;
  };

  const onDown = (e) => {
    if (e.target.closest('button, input, label, select')) return;
    const rect = layer.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
    if (e.shiftKey) state.add = true;
    pickAt(fx, fy);
    e.preventDefault();
  };
  layer.addEventListener('pointerdown', onDown);

  hint.innerHTML = `
    <span class="tiny" id="er-msg">Tap the thing you want gone</span>
    <span class="er-ctl" title="How far the pick spreads from where you tapped: lower if it takes the table too, higher if it misses part of the thing">
      Reach <input type="range" id="er-tol" min="8" max="80" value="30"></span>
    <label class="er-ctl" title="Each tap adds to the region instead of starting over"><input type="checkbox" id="er-add"> Add taps</label>
    <button class="btn btn-sm btn-ghost" id="er-clear" title="Start again">Clear</button>
    <button class="btn btn-sm btn-primary" id="er-go" disabled>Remove it</button>
    <button class="btn btn-sm btn-ghost" id="er-cancel">Cancel</button>
    <span class="er-area" id="er-area"></span>`;
  hint.style.pointerEvents = 'auto';
  $('#er-tol').addEventListener('input', (e) => { state.tolerance = Number(e.target.value); });
  $('#er-add').addEventListener('change', (e) => { state.add = e.target.checked; });
  $('#er-clear').addEventListener('click', () => { state.mask = null; state.area = 0; state.bbox = null; paint(); $('#er-go').disabled = true; $('#er-area').textContent = ''; });

  const close = () => {
    layer.hidden = true;
    layer.classList.remove('erasing', 'working');
    layer.removeEventListener('pointerdown', onDown);
    hint.style.pointerEvents = 'none';
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    abort?.abort();
    abort = null;
    eraseState = null;
  };
  $('#er-cancel').addEventListener('click', close);
  $('#er-go').addEventListener('click', () => removeIt(clip, media, state, layer, hint, close));
}

async function removeIt(clip, media, state, layer, hint, close) {
  if (!state.mask || !state.bbox) return;
  const { w, h, bbox } = state;
  /* A little margin round the pick: the rim of a thing is where its colour
     blends into the background, and that is the part a tight pick misses. */
  const grown = state.mask.slice();
  dilate(grown, w, h, Math.max(1, Math.round(Math.max(w, h) / 320)));
  const shape = packShape(grown, w, h, {
    x0: Math.max(0, bbox.x0 - 2), y0: Math.max(0, bbox.y0 - 2), x1: Math.min(w - 1, bbox.x1 + 2), y1: Math.min(h - 1, bbox.y1 + 2),
  });
  const cx = (bbox.x0 + bbox.x1 + 1) / 2 / w;
  const cy = (bbox.y0 + bbox.y1 + 1) / 2 / h;

  const fx = makeEffect('eraseObject');
  fx.params.x = cx * 100;
  fx.params.y = cy * 100;
  fx.params.shape = shape;
  clip.effects ||= [];
  clip.effects = clip.effects.filter((f) => f.id !== 'eraseObject');
  clip.effects.push(fx);
  for (const k of ['x', 'y', 'scale']) delete clip.keyframes?.[`effects.eraseObject.${k}`];
  actions.commit('Remove object');

  const node = elementFor(media, clip.id);
  if (!node?.videoWidth) { toast('It is gone where you tapped. The clip is still loading, so it could not be followed yet.', '', 5000); close(); return; }

  layer.classList.add('working');
  abort = new AbortController();
  hint.innerHTML = '<span class="tiny">Following it through the shot… <b id="er-pct">0%</b></span> '
    + '<button class="btn btn-sm btn-ghost" id="er-stop">Stop</button>';
  $('#er-stop').addEventListener('click', () => abort?.abort());

  const at = sourceTime(clip, S.time >= clip.start && S.time < clip.start + clip.dur ? S.time : clip.start);
  const begin = sourceTime(clip, clip.start);
  const end = sourceTime(clip, clip.start + clip.dur - 0.01);
  const box = { x: cx, y: cy, w: (bbox.x1 - bbox.x0 + 1) / w, h: (bbox.y1 - bbox.y0 + 1) / h };
  const progress = (base) => ({ done, total }) => { const el = $('#er-pct'); if (el) el.textContent = `${Math.round(base + (done / total) * 45)}%`; };

  /*
   * The background plate first: the median of frames across the clip. On a
   * still camera the thing, having moved, is not in it, and that plate is
   * what the hole is filled from. It is built here, once, rather than every
   * frame, and kept in memory for the effect.
   */
  try {
    const plate = await buildPlate(node, { from: begin, to: end, samples: 9, signal: abort.signal });
    if (plate) keepPlate(clip.id, plate);
  } catch { /* no plate: the fill comes from the surroundings, which still works */ }

  try {
    const fwd = end - at > 0.2
      ? await trackBox(node, { box, from: at, to: end, fps: 15, signal: abort.signal, onProgress: progress(5) })
      : { points: [], lostAt: null, mean: 1 };
    const back = at - begin > 0.2
      ? await trackBox(node, { box, from: at, to: begin, fps: 15, signal: abort.signal, onProgress: progress(50) })
      : { points: [], lostAt: null, mean: 1 };
    const points = [...back.points.slice(1).reverse(), ...fwd.points];
    if (points.length > 1) {
      const record = {
        id: `mt${Date.now().toString(36)}`,
        name: `${media.name.slice(0, 18)} · removed`,
        sourceClipId: clip.id,
        clipStart: clip.start,
        points: smoothTrack(points, 0.4),
        mean: ((fwd.mean || 0) + (back.mean || 0)) / 2,
        lostAt: fwd.lostAt ?? back.lostAt ?? null,
      };
      S.project.motionTracks ||= [];
      S.project.motionTracks.push(record);
      applyTrack(clip, record, { mode: 'effect', effectId: 'eraseObject', clipStart: clip.in, followScale: true });
      actions.commit('Remove object — followed through the shot');
      toast(record.lostAt !== null
        ? 'Removed, and followed until it was lost. Where it comes back, tap it again there.'
        : 'Removed, and followed through the whole shot. Margin, softness and the fill are in the Effects panel.', 'ok', 5200);
    } else {
      toast('Removed where you tapped. It could not be followed, so it stays put — fine for a still shot.', '', 5200);
    }
  } catch (err) {
    if (!abort?.signal.aborted) toast(`Removed where you tapped. Following it did not work: ${err.message}`, '', 6000);
  }
  close();
  actions.refresh();
}

/* ------------------------------------------------------------------ */
/* the inspector section                                               */
/* ------------------------------------------------------------------ */

export function trackSection(clip) {
  const tracks = S.project.motionTracks || [];
  const media = mediaById(S.project, clip.mediaId);
  const canTrack = media?.kind === 'video';

  return `<details class="group" data-min="intermediate">
    <summary>Motion tracking</summary>
    <div class="gbody">
      <p class="tiny muted" style="margin:0 0 10px">
        Follow something through the shot, then pin a blur, a sticker or a title to it.
      </p>
      ${canTrack
        ? '<button class="btn btn-sm btn-full" data-act="track">Track something in this clip</button>'
          + '<button class="btn btn-sm btn-full" data-act="erase" style="margin-top:7px" '
          + 'title="Tap a thing in the picture and it is taken out of the shot">⌫ Remove something from the shot</button>'
          + '<p class="tiny muted" style="margin:7px 0 0">'
          + 'Or press <b>✨ Find it for me</b> in the viewer and it picks the subject itself.</p>'
        : '<p class="tiny muted" style="margin:0">Tracking needs a video clip — this one is a '
          + `${clip.kind === 'title' ? 'title' : clip.kind === 'sticker' ? 'sticker' : 'still'}. `
          + 'Track the video underneath, then pin this to it.</p>'}
      ${tracks.length ? `
        <div style="margin-top:12px">
          <div class="mock-h" style="font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
            color:var(--text-3);font-weight:700;margin-bottom:7px">Saved tracks</div>
          ${tracks.map((t) => `
            <div style="display:flex;gap:7px;align-items:center;padding:6px 0;
              border-bottom:1px solid var(--line-soft)">
              <span class="tiny" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;
                white-space:nowrap">${esc(t.name)}
                <span class="muted">· ${t.points.length} pts${t.lostAt ? ' · partial' : ''}</span></span>
              <button class="btn btn-sm btn-ghost" data-pintrack="${esc(t.id)}"
                title="Make this clip follow that track">Pin</button>
            </div>`).join('')}
        </div>` : ''}
    </div>
  </details>`;
}

/** Called by the inspector's delegated click handler. */
export function handleInspectorClick(act, dataset) {
  if (act === 'track') {
    const clip = [...S.sel].map((id) => clipById(S.project, id)).find(Boolean);
    if (!clip) { toast('Select a clip first'); return true; }
    licence.gate('keyframes', () => openTracker(clip), { what: 'Motion tracking' });
    return true;
  }
  if (act === 'erase') { openEraserForSelected(); return true; }
  if (dataset?.pintrack) {
    const record = (S.project.motionTracks || []).find((t) => t.id === dataset.pintrack);
    if (record) pin(record, 'selected');
    return true;
  }
  return false;
}

export { engine };
