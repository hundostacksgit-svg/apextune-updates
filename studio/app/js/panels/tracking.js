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
import { clipById, mediaById, sourceTime, clipsOn } from '../engine/project.js';
import { elementFor } from '../engine/media.js';
import { trackBox, smoothTrack, applyTrack, describeTrack, findTarget, findFace } from '../engine/tracking.js';
import { makeEffect } from '../engine/effects.js';
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
      <button class="btn btn-ghost" data-pin="later">Just keep the track</button>
    </div>
    <p class="tiny muted" style="margin:8px 0 0">
      <b>Cut through it</b> puts a zoom-through on the cut after this clip, aimed at the tracked
      spot: the picture dives into whatever you tracked and comes out in the next shot.
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
  if (dataset?.pintrack) {
    const record = (S.project.motionTracks || []).find((t) => t.id === dataset.pintrack);
    if (record) pin(record, 'selected');
    return true;
  }
  return false;
}

export { engine };
