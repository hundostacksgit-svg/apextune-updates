/*
 * The project picker.
 *
 * Opening an editor straight into an empty "Untitled project" is a small
 * cruelty: it looks like the app forgot the six hours you spent in it
 * yesterday, and the only way to find out it did not is to go hunting through
 * a settings panel. Every editor that expects you to come back more than once
 * — Resolve, Premiere, Final Cut — opens on a list of what you have, and so
 * does this.
 *
 * It is also the only honest place to make a new one. A project has a name, a
 * shape, a size and a frame rate, and all of them are annoying to change once
 * there are clips on the timeline; asking at the start costs one screen and
 * saves that. The screen does the other things a first screen is for as
 * well: find the project you mean among many, rename or copy one, start from
 * something other than a blank timeline, bring a project file or a bundle in,
 * pack one up with its footage to take elsewhere, and see how much of the
 * device the whole lot is using.
 *
 * Two things here save the most time for people who do this daily. A clip
 * dropped on the screen sets the shape, size and frame rate from the clip
 * itself — the settings a project should have are the settings the footage
 * already has, and reading them beats guessing them. And the last setup used
 * is the setup offered next time, because the person who made three vertical
 * 60fps projects this week is about to make a fourth.
 */

import { $, $$, esc, dur as fmtDur, bytes as fmtBytes, confirmDialog, toast } from './ui.js';
import * as store from './store.js';
import { RATIOS } from './engine/project.js';
import { kindOf, blobOf, forget } from './engine/media.js';
import { inspectFrameRate } from './engine/proxy.js';

/* Every shape the engine knows, with the sizes worth offering for each. The
   first size is the platform's own; the rest are the honest alternatives — a
   lighter file, or full resolution for source that deserves it. */
const SHAPES = [
  { id: '9:16', name: 'Vertical', note: 'TikTok, Reels, Shorts',
    sizes: [[1080, 1920, 'Standard'], [720, 1280, 'Light'], [2160, 3840, '4K']] },
  { id: '16:9', name: 'Landscape', note: 'YouTube, everything wide',
    sizes: [[1920, 1080, 'Full HD'], [1280, 720, 'HD, light'], [2560, 1440, 'QHD'], [3840, 2160, '4K']] },
  { id: '1:1', name: 'Square', note: 'Feed posts, ads',
    sizes: [[1080, 1080, 'Standard'], [720, 720, 'Light'], [2160, 2160, '4K']] },
  { id: '4:5', name: 'Portrait', note: 'Instagram feed',
    sizes: [[1080, 1350, 'Standard'], [864, 1080, 'Light'], [2160, 2700, '4K']] },
  { id: '2.39:1', name: 'Cinemascope', note: 'Trailers, film',
    sizes: [[1920, 803, 'Full HD'], [2560, 1070, 'QHD'], [3840, 1606, '4K']] },
];

const FPS = [
  [30, '30 — the usual'], [24, '24 — film'], [25, '25 — PAL and most of the world'],
  [50, '50 — smooth PAL'], [60, '60 — smooth, twice the frames'],
];

/*
 * One press for the setups people make over and over. Each is a shape, a
 * size and a frame rate together — the three answers that go with a
 * destination — and pressing one fills the form rather than hiding it, so
 * what it chose is visible and any of it can still be changed.
 */
const SETUPS = [
  { id: 'tiktok', name: 'TikTok / Reels', ratio: '9:16', size: '1080x1920', fps: 30 },
  { id: 'yt4k', name: 'YouTube 4K', ratio: '16:9', size: '3840x2160', fps: 30 },
  { id: 'yt60', name: 'YouTube 1080p60', ratio: '16:9', size: '1920x1080', fps: 60 },
  { id: 'film', name: 'Cinema 24', ratio: '2.39:1', size: '3840x1606', fps: 24 },
  { id: 'feed', name: 'Instagram feed', ratio: '4:5', size: '1080x1350', fps: 30 },
  { id: 'square', name: 'Square ad', ratio: '1:1', size: '1080x1080', fps: 30 },
  { id: 'pal', name: 'Broadcast PAL', ratio: '16:9', size: '1920x1080', fps: 25 },
];

/*
 * Ways to begin that are not a blank timeline. Each is a door into something
 * the editor already does — the montage builder, copying an edit, a photo
 * dump, lining up multicam angles, cutting the pauses out of a talking head
 * — reached from the first screen rather than found later.
 */
const STARTS = [
  { id: 'blank', ico: '▭', name: 'Blank timeline', note: 'Bring clips in and cut.' },
  { id: 'montage', ico: '⚡', name: 'Montage from my clips', note: 'Pick a kind; it builds the whole cut to the beat.' },
  { id: 'copy', ico: '🎞', name: 'Copy an edit I like', note: 'Drop in a video; it rebuilds that edit’s shape with your clips.' },
  { id: 'photos', ico: '📸', name: 'Photo dump', note: 'Stills with a slow push on each, cut to music.' },
  { id: 'multicam', ico: '🎥', name: 'Multicam', note: 'Import every angle; they line up by their sound and you cut live.' },
  { id: 'talk', ico: '🎙', name: 'Talking head', note: 'One long take; the pauses come out, then captions go on.' },
];

const OFFERED_FPS = FPS.map(([v]) => v);

let host = null;
let resolveChoice = null;
let query = '';
let sort = 'recent';
let current = [];        // the projects on screen; the handlers below read it
let undoable = null;     // the last deleted project, while it can still come back
let pending = [];        // media dropped on the screen, imported once the project exists
let matched = '';        // what the last match-a-clip read, for the note under the form

/* The form's answers, kept between renders and between visits. */
const draft = { ratio: '9:16', size: '1080x1920', fps: 30, background: '#000000' };

export function isOpen() { return Boolean(host) && !host.hidden; }

/**
 * Show the picker and wait for a decision.
 *
 * Resolves with `{ action: 'open', id }`, `{ action: 'new', ... }` (with
 * `files` when footage was dropped on the screen), `{ action: 'import', file }`
 * or `{ action: 'cancel' }` when cancelling is allowed. It never resolves
 * with nothing: there is no way out of this screen except choosing, because
 * "no project" is not a state the editor can be in.
 */
export async function chooseProject({ canCancel = false, files = null } = {}) {
  const [projects, remembered] = await Promise.all([
    store.listProjects(),
    store.pref('startDefaults').catch(() => null),
  ]);
  if (remembered && RATIOS[remembered.ratio]) Object.assign(draft, remembered);
  pending = [];
  matched = '';
  build(projects, { canCancel });
  store.usage().then((u) => paintUsage(u)).catch(() => {});
  const waiting = new Promise((resolve) => { resolveChoice = resolve; });
  // Files the app was opened with land here the way a drop does: a project
  // file opens, footage sets the shape and comes in with the new project.
  if (files?.length) takeDrop(files);
  return waiting;
}

export function close() {
  if (host) { host.hidden = true; host.classList.remove('on'); }
}

function finish(choice) {
  close();
  const go = resolveChoice;
  resolveChoice = null;
  go?.(choice);
}

/* ------------------------------------------------------------------ */
/* drawing it                                                          */
/* ------------------------------------------------------------------ */

function build(projects, { canCancel }) {
  if (!host) {
    host = document.createElement('div');
    host.className = 'start';
    host.id = 'start';
    document.body.appendChild(host);
  }
  host.hidden = false;
  render(projects, { canCancel });
  requestAnimationFrame(() => host.classList.add('on'));
}

function visible(projects) {
  const q = query.trim().toLowerCase();
  const list = q ? projects.filter((p) => (p.name || '').toLowerCase().includes(q)) : projects.slice();
  if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  else if (sort === 'longest') list.sort((a, b) => length(b) - length(a));
  else if (sort === 'biggest') list.sort((a, b) => footage(b) - footage(a));
  else list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return list;
}

function length(p) {
  const clips = p.clips || [];
  return clips.length ? Math.max(...clips.map((c) => (c.start || 0) + (c.dur || 0))) : 0;
}

/* Bytes of footage a project refers to. Two projects that share a file both
   count it: the question a person asks is "how big is this one", not "what
   would deleting it free", and the honest answer to the second is in Settings. */
function footage(p) {
  return (p.media || []).reduce((a, m) => a + (m.size || 0), 0);
}

function render(projects, { canCancel }) {
  current = projects;
  const empty = projects.length === 0;
  const list = visible(projects);
  const canCancelNow = Boolean(canCancel);

  host.innerHTML = `
    <div class="start-box" role="dialog" aria-modal="true" aria-label="Your projects">
      <div class="start-head">
        <img class="start-mark" src="../assets/mark.svg" alt="" width="34" height="34">
        <div>
          <h1>${empty ? 'Start your first project' : 'Your projects'}</h1>
          <p>${empty
            ? 'Everything stays on this device. Nothing is uploaded.'
            : `${projects.length} saved on this device<span id="start-usage"></span>.`}</p>
        </div>
        ${canCancelNow ? '<button class="start-x" data-cancel aria-label="Back to the timeline">✕</button>' : ''}
      </div>

      <div class="start-body">
        <form class="start-new" id="start-new">
          <h2>${empty ? 'Name it' : 'New project'}</h2>
          <input class="input" id="start-name" maxlength="60" autocomplete="off"
                 placeholder="What are you making?" value="">

          <div class="start-setups" role="group" aria-label="Quick setups">
            ${SETUPS.map((s) => `
              <button type="button" class="start-chip" data-setup="${esc(s.id)}" title="${esc(sizeLabel(s.size))} · ${s.fps}fps">
                ${esc(s.name)}<em>${esc(sizeLabel(s.size))} · ${s.fps}</em>
              </button>`).join('')}
          </div>

          <h3 class="start-h3">Shape</h3>
          <div class="start-shapes" role="radiogroup" aria-label="Shape">
            ${SHAPES.map((s) => `
              <label class="start-shape ${s.id === draft.ratio ? 'on' : ''}">
                <input type="radio" name="start-ratio" value="${esc(s.id)}" ${s.id === draft.ratio ? 'checked' : ''}>
                <span class="start-thumb r${s.id.replace(/[:.]/g, '-')}"></span>
                <b>${esc(s.name)}</b>
                <em>${esc(s.note)}</em>
              </label>`).join('')}
          </div>

          <div class="start-grid">
            <label class="start-field">
              <span>Size</span>
              <select class="tp-select" id="start-size">${sizeOptions(draft.ratio, draft.size)}</select>
            </label>
            <label class="start-field">
              <span>Frames a second</span>
              <select class="tp-select" id="start-fps">
                ${FPS.map(([v, l]) => `<option value="${v}" ${v === draft.fps ? 'selected' : ''}>${esc(l)}</option>`).join('')}
              </select>
            </label>
            <label class="start-field">
              <span>Behind the picture</span>
              <span class="start-colour">
                <input type="color" id="start-bg" value="${esc(draft.background)}" aria-label="Background colour">
                <em id="start-bg-name">${esc(colourName(draft.background))}</em>
              </span>
            </label>
            <div class="start-field">
              <span>Or read it off a clip</span>
              <button class="btn btn-sm btn-ghost" type="button" id="start-match">Match a clip…</button>
              <input type="file" id="start-match-file" accept="video/*,image/*" hidden>
            </div>
          </div>
          <div class="start-custom" id="start-custom" ${isListed(draft.ratio, draft.size) ? 'hidden' : ''}>
            <input class="input" type="number" id="start-w" min="64" max="8192" step="2" placeholder="Width" value="${isListed(draft.ratio, draft.size) ? '' : draft.size.split('x')[0]}">
            <span>×</span>
            <input class="input" type="number" id="start-h" min="64" max="8192" step="2" placeholder="Height" value="${isListed(draft.ratio, draft.size) ? '' : draft.size.split('x')[1]}">
            <em class="tiny muted" id="start-custom-note">Keeps the shape you picked.</em>
          </div>
          <p class="start-sum" id="start-sum" aria-live="polite"></p>
          <p class="start-matched tiny" id="start-match-note" ${matched ? '' : 'hidden'}>${esc(matched)}</p>

          <h3 class="start-h3">Start with</h3>
          <div class="start-starts" role="radiogroup" aria-label="Start with">
            ${STARTS.map((s, i) => `
              <label class="start-start ${i === 0 ? 'on' : ''}">
                <input type="radio" name="start-intent" value="${esc(s.id)}" ${i === 0 ? 'checked' : ''}>
                <span class="ico">${s.ico}</span>
                <span><b>${esc(s.name)}</b><em>${esc(s.note)}</em></span>
              </label>`).join('')}
          </div>

          <button class="btn btn-primary btn-full" type="submit" id="start-create">
            ${empty ? 'Create it and start editing' : 'Create'}
          </button>
          <p class="start-drop-hint tiny muted">Or drop clips anywhere on this screen — the project takes their shape and frame rate, and they come in with it.</p>
        </form>

        <div class="start-list">
          <div class="start-list-head">
            <h2>${empty ? 'Nothing saved yet' : 'Open one'}</h2>
            ${projects.length > 1 ? `
              <input class="input start-search" id="start-search" placeholder="Find a project…  /" value="${esc(query)}" aria-label="Find a project">
              <select class="tp-select start-sort" id="start-sort" aria-label="Sort">
                <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Recent</option>
                <option value="name" ${sort === 'name' ? 'selected' : ''}>Name</option>
                <option value="longest" ${sort === 'longest' ? 'selected' : ''}>Longest</option>
                <option value="biggest" ${sort === 'biggest' ? 'selected' : ''}>Most footage</option>
              </select>` : ''}
          </div>
          ${undoable ? `
            <div class="start-undo" id="start-undo" role="status">
              <span>Deleted “${esc(undoable.doc.name || 'Untitled project')}”.</span>
              <button class="btn btn-sm" type="button" id="start-undo-btn">Undo</button>
            </div>` : ''}
          ${empty ? `
            <div class="start-none">
              <p>Projects you make show up here, newest first, with everything
                 you did to them. They are saved as you work — there is no save button
                 to forget.</p>
            </div>`
            : list.length ? `<div class="start-rows">${list.map(row).join('')}</div>`
              : `<div class="start-none"><p>Nothing called "${esc(query)}".</p></div>`}
          <div class="start-foot">
            <button class="btn btn-sm btn-ghost" type="button" id="start-import">Open a project file…</button>
            <input type="file" id="start-file" accept=".json,.omnidxpkg,.zip,application/json,application/zip" hidden>
            <span class="tiny muted">A <span class="mono">.omnidx.json</span> edit, or a <span class="mono">.omnidxpkg</span> bundle with its footage, from another device.</span>
          </div>
        </div>
      </div>
    </div>`;

  wire();
  paintSummary();
  paintChips();
  /*
   * The name field takes focus when there is nothing to open, and not
   * otherwise. Somebody with fifteen projects came here to pick one, and a
   * cursor blinking in a text box tells them they came to type.
   */
  if (!projects.length) setTimeout(() => $('#start-name', host)?.focus(), 60);
}

function sizeOptions(ratio, chosen = null) {
  const shape = SHAPES.find((s) => s.id === ratio) || SHAPES[0];
  const listed = shape.sizes.some(([w, h]) => `${w}x${h}` === chosen);
  const pick = listed ? chosen : (chosen && /^\d+x\d+$/.test(chosen) ? 'custom' : `${shape.sizes[0][0]}x${shape.sizes[0][1]}`);
  return shape.sizes.map(([w, h, label]) => `<option value="${w}x${h}" ${`${w}x${h}` === pick ? 'selected' : ''}>${w}×${h} — ${esc(label)}</option>`).join('')
    + `<option value="custom" ${pick === 'custom' ? 'selected' : ''}>Custom…</option>`;
}

function isListed(ratio, size) {
  const shape = SHAPES.find((s) => s.id === ratio) || SHAPES[0];
  return shape.sizes.some(([w, h]) => `${w}x${h}` === size);
}

function sizeLabel(size) { return String(size).replace('x', '×'); }

const COLOUR_NAMES = { '#000000': 'Black', '#ffffff': 'White', '#0f0f14': 'Near black', '#1e1e1e': 'Charcoal', '#00ff00': 'Green screen' };
function colourName(v) { return COLOUR_NAMES[String(v).toLowerCase()] || v; }

/*
 * A row: the poster of the first clip when there is one (a project is
 * recognised by its footage far faster than by its name), the shape, the
 * facts that answer "is this the one", and the four things people do to a
 * project from a list — rename, copy, pack up to take elsewhere, delete.
 */
function row(p) {
  const clips = p.clips?.length || 0;
  const secs = length(p);
  const size = footage(p);
  const poster = (p.media || []).find((m) => m.poster)?.poster;
  const ratio = p.settings?.ratio || '9:16';
  const px = p.settings?.width && p.settings?.height ? `${p.settings.width}×${p.settings.height}` : ratio;
  return `
    <div class="start-row" data-open="${esc(p.id)}" role="button" tabindex="0" title="${esc(px)} · ${p.settings?.fps || 30}fps">
      <span class="start-poster r${ratio.replace(/[:.]/g, '-')}">${poster ? `<img src="${esc(poster)}" alt="">` : ''}</span>
      <span class="start-meta">
        <b data-name="${esc(p.id)}">${esc(p.name || 'Untitled project')}</b>
        <em>${clips ? `${clips} clip${clips === 1 ? '' : 's'} · ${fmtDur(secs)}` : 'empty'}
          · ${esc(ratio)} · ${p.settings?.fps || 30}fps${size ? ` · ${esc(fmtBytes(size))}` : ''} · ${esc(when(p.updatedAt))}</em>
      </span>
      <span class="start-acts">
        <button data-rename="${esc(p.id)}" title="Rename" aria-label="Rename ${esc(p.name || 'project')}">✎</button>
        <button data-dup="${esc(p.id)}" title="Duplicate" aria-label="Duplicate ${esc(p.name || 'project')}">⧉</button>
        <button data-pack="${esc(p.id)}" title="Pack with footage — one file to take elsewhere" aria-label="Pack ${esc(p.name || 'project')} with its footage" ${size ? '' : 'disabled'}>⇩</button>
        <button data-del="${esc(p.id)}" title="Delete" aria-label="Delete ${esc(p.name || 'project')}">🗑</button>
      </span>
    </div>`;
}

/* "3 minutes ago" beats a timestamp for the only question being asked here,
   which is "is this the one I was in". */
function when(at) {
  if (!at) return 'never opened';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString();
}

function paintUsage(u) {
  const el = host && $('#start-usage', host);
  if (!el || !u?.used) return;
  const mb = u.used / 1048576;
  const size = mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
  el.textContent = ` · ${size} used`;
}

/* One line that says exactly what will be made, so nobody has to read four
   controls to find out. It is what a render dialog shows, brought forward. */
function paintSummary() {
  const el = $('#start-sum', host);
  if (!el) return;
  const f = readForm();
  const size = f.width && f.height ? `${f.width} × ${f.height}` : 'size to come';
  const shape = SHAPES.find((s) => s.id === f.ratio)?.name || f.ratio;
  el.textContent = `${shape} · ${size} · ${f.fps} fps · ${colourName(f.background)}`;
}

/* A chip lights when the form says what it would set — pressed or not. */
function paintChips() {
  const f = readForm();
  const size = f.width && f.height ? `${f.width}x${f.height}` : '';
  for (const chip of $$('.start-chip', host)) {
    const s = SETUPS.find((x) => x.id === chip.dataset.setup);
    chip.classList.toggle('on', Boolean(s) && s.ratio === f.ratio && s.size === size && s.fps === f.fps);
  }
}

function readForm() {
  const ratio = $('input[name="start-ratio"]:checked', host)?.value || '9:16';
  const fps = Number($('#start-fps', host)?.value) || 30;
  const sizeValue = $('#start-size', host)?.value || '';
  let width = null, height = null;
  if (sizeValue === 'custom') {
    width = Number($('#start-w', host)?.value) || null;
    height = Number($('#start-h', host)?.value) || null;
  } else if (sizeValue) {
    [width, height] = sizeValue.split('x').map(Number);
  }
  return { ratio, fps, width, height, sizeValue, background: $('#start-bg', host)?.value || '#000000' };
}

/* Put a shape, size and rate into the form — a chip, or a clip that was read. */
function setForm({ ratio, width, height, fps }) {
  if (ratio && RATIOS[ratio]) {
    for (const input of $$('input[name="start-ratio"]', host)) input.checked = input.value === ratio;
    for (const label of $$('.start-shape', host)) label.classList.toggle('on', label.querySelector('input')?.checked);
    $('#start-size', host).innerHTML = sizeOptions(ratio, width && height ? `${width}x${height}` : null);
  } else if (width && height) {
    const r = readForm().ratio;
    $('#start-size', host).innerHTML = sizeOptions(r, `${width}x${height}`);
  }
  const sizeSel = $('#start-size', host);
  const custom = sizeSel.value === 'custom';
  $('#start-custom', host).hidden = !custom;
  if (custom) { $('#start-w', host).value = width; $('#start-h', host).value = height; }
  if (fps && OFFERED_FPS.includes(fps)) $('#start-fps', host).value = String(fps);
  paintSummary();
  paintChips();
}

/* ------------------------------------------------------------------ */
/* reading a clip                                                      */
/* ------------------------------------------------------------------ */

/*
 * The settings a project should have are the settings the footage already
 * has. A clip is read for its frame size and, for video, its frame rate —
 * measured from presentation times, so 29.97 and 23.976 come out as what
 * they are — and the nearest shape, size and rate the app offers are put in
 * the form. What was read and what was chosen are both said, so a 4:3 clip
 * landing in a square project is a decision the person can see, not a
 * surprise after the first import.
 */
async function matchFile(file) {
  const kind = kindOf(file);
  if (kind !== 'video' && kind !== 'image') throw new Error(`${file.name} is not a video or a photo.`);
  const url = URL.createObjectURL(file);
  try {
    let w = 0, h = 0, rate = null;
    if (kind === 'image') {
      const bmp = await createImageBitmap(file);
      w = bmp.width; h = bmp.height; bmp.close?.();
    } else {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await new Promise((res, rej) => {
        const bail = setTimeout(() => rej(new Error(`${file.name} took too long to read.`)), 8000);
        v.onloadedmetadata = () => { clearTimeout(bail); res(); };
        v.onerror = () => { clearTimeout(bail); rej(new Error(`${file.name} could not be read as video.`)); };
      });
      w = v.videoWidth; h = v.videoHeight;
      rate = await inspectFrameRate(v, { samples: 24 }).catch(() => null);
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* released either way */ }
    }
    if (!w || !h) throw new Error(`${file.name} has no picture size to read.`);
    return { name: file.name, w, h, fps: rate?.fps || null, variable: Boolean(rate?.variable) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* The shape, size and frame rate the app offers that sit closest to a clip. */
function nearestSetup({ w, h, fps }) {
  const aspect = w / h;
  let best = SHAPES[0], gap = Infinity;
  for (const s of SHAPES) {
    const r = RATIOS[s.id];
    const d = Math.abs(aspect - r.w / r.h) / (r.w / r.h);
    if (d < gap) { gap = d; best = s; }
  }
  const exact = gap < 0.02;                       // the rule newProject applies to a custom size
  const even = (n) => Math.round(n / 2) * 2;
  const width = exact ? even(w) : best.sizes[0][0];
  const height = exact ? even(h) : best.sizes[0][1];
  let rate = null;
  if (fps) rate = OFFERED_FPS.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a), OFFERED_FPS[0]);
  return { ratio: best.id, width, height, fps: rate, exact };
}

async function useClip(file) {
  const note = $('#start-match-note', host);
  try {
    note.hidden = false;
    note.textContent = `Reading ${file.name}…`;
    const read = await matchFile(file);
    const pick = nearestSetup(read);
    setForm({ ratio: pick.ratio, width: pick.width, height: pick.height, fps: pick.fps });
    const nameBox = $('#start-name', host);
    if (nameBox && !nameBox.value.trim()) nameBox.value = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
    const shape = SHAPES.find((s) => s.id === pick.ratio)?.name || pick.ratio;
    const readRate = read.fps ? `${read.fps} fps${read.variable ? ', variable' : ''}` : 'frame rate not measured';
    const fit = pick.exact ? '' : ` — the clip is ${(read.w / read.h).toFixed(2)}:1, so it will be cropped to fit`;
    matched = `${read.name}: ${read.w}×${read.h}, ${readRate} → ${shape} ${pick.width}×${pick.height}, ${pick.fps || readForm().fps} fps${fit}.`;
    note.textContent = matched;
  } catch (err) {
    matched = '';
    note.textContent = err.message;
  }
}

/* Footage dropped on the screen: the first video or photo sets the form; all of it comes in with the project. */
export async function takeDrop(files) {
  const list = [...files];
  if (!list.length) return;
  const one = list[0];
  // A project file or a bundle opens; it is not footage.
  if (list.length === 1 && (/\.json$/i.test(one.name) || /\.(omnidxpkg|zip)$/i.test(one.name) || one.type === 'application/json' || one.type === 'application/zip')) {
    finish({ action: 'import', file: one });
    return;
  }
  const media = list.filter((f) => kindOf(f));
  if (!media.length) { toast('Those are not files the editor can read', 'bad'); return; }
  pending = media;
  const lead = media.find((f) => kindOf(f) === 'video') || media.find((f) => kindOf(f) === 'image');
  if (lead) await useClip(lead);
  const n = media.length;
  const note = $('#start-match-note', host);
  if (note) {
    note.hidden = false;
    matched = `${matched ? `${matched} ` : ''}${n} file${n === 1 ? '' : 's'} will come in with the project.`;
    note.textContent = matched;
  }
  $('#start-create', host)?.focus();
}

/* ------------------------------------------------------------------ */
/* packing one up                                                      */
/* ------------------------------------------------------------------ */

/*
 * A project and its footage in one file, from the list — so taking an edit
 * to another machine does not start with opening it. The bundle reads the
 * footage from this device's store; media that was only ever attached this
 * session and never stored is not a case that exists, because import stores
 * as it goes. Anything loaded to build the bundle that was not already in
 * memory is let go afterwards, so packing a big project does not leave it
 * resident behind the one being edited.
 */
async function packProject(id, btn) {
  const doc = current.find((p) => p.id === id);
  if (!doc) return;
  const had = new Set((doc.media || []).filter((m) => blobOf(m)).map((m) => m.id));
  const was = btn.textContent;
  btn.disabled = true;
  try {
    const { pack, bundleName } = await import('./engine/bundle.js');
    const blob = await pack(doc, {
      onProgress: ({ name, done, total }) => { btn.textContent = name ? `${done + 1}/${total}` : '…'; },
    });
    const name = bundleName(doc);
    const { saveBytes } = await import('./desktop.js');
    if (!await saveBytes(blob, name)) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    }
    toast(`${name} — ${fmtBytes(blob.size)}, footage included`, 'ok', 5000);
  } catch (err) {
    toast(`Could not pack it: ${err.message}`, 'bad', 6000);
  } finally {
    for (const m of doc.media || []) if (!had.has(m.id)) forget(m.id);
    btn.disabled = false;
    btn.textContent = was;
  }
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

/*
 * The form is rebuilt on every render, so its submit listener goes on each
 * time. Everything else listens on the host, which lives for the whole
 * session — and is therefore wired exactly once, or every re-render after a
 * rename or a copy would stack another listener and one press would copy a
 * project three times.
 */
function wire() {
  const form = $('#start-new', host);
  form?.addEventListener('submit', onSubmit);
  if (host.dataset.wired) return;
  host.dataset.wired = '1';

  host.addEventListener('change', (e) => {
    // The shape cards are radio buttons wearing a costume; keep the costume in
    // step with what is actually checked, and offer that shape's sizes.
    if (e.target.name === 'start-ratio') {
      for (const label of $$('.start-shape', host)) label.classList.toggle('on', label.querySelector('input')?.checked);
      $('#start-size', host).innerHTML = sizeOptions(e.target.value);
      $('#start-custom', host).hidden = true;
      paintSummary(); paintChips();
      return;
    }
    if (e.target.name === 'start-intent') {
      for (const label of $$('.start-start', host)) label.classList.toggle('on', label.querySelector('input')?.checked);
      return;
    }
    if (e.target.id === 'start-size') {
      const custom = e.target.value === 'custom';
      $('#start-custom', host).hidden = !custom;
      if (custom) $('#start-w', host).focus();
      paintSummary(); paintChips();
      return;
    }
    if (e.target.id === 'start-fps') { paintSummary(); paintChips(); return; }
    if (e.target.id === 'start-sort') { sort = e.target.value; render(current, { canCancel: Boolean($('[data-cancel]', host)) }); return; }
    if (e.target.id === 'start-file') {
      const file = e.target.files?.[0];
      if (file) finish({ action: 'import', file });
      return;
    }
    if (e.target.id === 'start-match-file') {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) useClip(file);
    }
  });

  host.addEventListener('input', (e) => {
    if (e.target.id === 'start-bg') {
      $('#start-bg-name', host).textContent = colourName(e.target.value);
      paintSummary();
      return;
    }
    if (e.target.id === 'start-search') {
      query = e.target.value;
      const rows = $('.start-rows', host);
      if (!rows) return;
      const list = visible(current);
      rows.innerHTML = list.map(row).join('') || `<div class="start-none"><p>Nothing called "${esc(query)}".</p></div>`;
      return;
    }
    // A custom size is typed as two numbers; the second follows the first so the shape holds.
    if (e.target.id === 'start-w' || e.target.id === 'start-h') {
      const ratio = $('input[name="start-ratio"]:checked', host)?.value || '9:16';
      const r = RATIOS[ratio];
      const w = Number($('#start-w', host).value), h = Number($('#start-h', host).value);
      if (e.target.id === 'start-w' && w > 0) $('#start-h', host).value = Math.round((w * r.h) / r.w / 2) * 2;
      if (e.target.id === 'start-h' && h > 0) $('#start-w', host).value = Math.round((h * r.w) / r.h / 2) * 2;
      paintSummary(); paintChips();
    }
  });

  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  // "/" reaches the search box from anywhere on the screen, not only from
  // inside it: a key pressed with nothing focused lands on the body.
  document.addEventListener('keydown', (e) => {
    if (!isOpen() || e.key !== '/' || host.contains(e.target)) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    const search = $('#start-search', host);
    if (search) { e.preventDefault(); search.focus(); search.select(); }
  });

  // Footage dropped anywhere on the screen. The document's own drop handler
  // would import it into whatever project is open behind this screen, which
  // is never what dropping on a "new project" form means; it is stopped here.
  const box = () => $('.start-box', host);
  host.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault(); e.stopPropagation();
    box()?.classList.add('drop');
  });
  host.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && host.contains(e.relatedTarget)) return;
    box()?.classList.remove('drop');
  });
  host.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); e.stopPropagation();
    box()?.classList.remove('drop');
    takeDrop(e.dataTransfer.files);
  });
}

function onSubmit(e) {
  e.preventDefault();
  const name = $('#start-name', host).value.trim();
  const f = readForm();
  const ratio = RATIOS[f.ratio] ? f.ratio : '9:16';
  const size = f.width && f.height ? `${f.width}x${f.height}` : draft.size;
  // Remembered for next time: the person who made three of these this week is about to make a fourth.
  Object.assign(draft, { ratio, size, fps: f.fps, background: f.background });
  store.pref('startDefaults', { ...draft }).catch(() => {});
  const files = pending;
  pending = [];
  finish({
    action: 'new',
    // An empty box is not an error — it just means they had not decided yet.
    name: name || 'Untitled project',
    ratio,
    fps: f.fps,
    width: f.width, height: f.height,
    background: f.background,
    intent: $('input[name="start-intent"]:checked', host)?.value || 'blank',
    files,
  });
}

async function onClick(e) {
  const projects = current;
  if (e.target.closest('[data-cancel]')) { pending = []; finish({ action: 'cancel' }); return; }
  if (e.target.closest('#start-import')) { $('#start-file', host).click(); return; }
  if (e.target.closest('#start-match')) { $('#start-match-file', host).click(); return; }

  const chip = e.target.closest('[data-setup]');
  if (chip) {
    const s = SETUPS.find((x) => x.id === chip.dataset.setup);
    if (!s) return;
    const [w, h] = s.size.split('x').map(Number);
    setForm({ ratio: s.ratio, width: w, height: h, fps: s.fps });
    return;
  }

  if (e.target.closest('#start-undo-btn')) {
    const back = undoable;
    undoable = null;
    if (back) {
      clearTimeout(back.timer);
      await store.saveProject(back.doc);
      toast(`${back.doc.name || 'Untitled project'} is back`, 'ok');
    }
    render(await store.listProjects(), { canCancel: Boolean($('[data-cancel]', host)) });
    return;
  }

  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    const id = del.dataset.del;
    const p = projects.find((x) => x.id === id);
    const yes = await confirmDialog({
      title: `Delete "${p?.name || 'this project'}"?`,
      body: 'The edit goes for good. The video and music files on your device are untouched.',
      confirmText: 'Delete it',
      danger: true,
    });
    if (!yes) return;
    await store.deleteProject(id);
    // It can come back for a while: a list of similar names is where wrong deletes happen.
    if (undoable) clearTimeout(undoable.timer);
    undoable = p ? { doc: p, timer: setTimeout(() => {
      undoable = null;
      if (isOpen() && $('#start-undo', host)) render(current, { canCancel: Boolean($('[data-cancel]', host)) });
    }, 12000) } : null;
    render(await store.listProjects(), { canCancel: Boolean($('[data-cancel]', host)) });
    return;
  }

  const dup = e.target.closest('[data-dup]');
  if (dup) {
    e.stopPropagation();
    await store.duplicateProject(dup.dataset.dup);
    render(await store.listProjects(), { canCancel: Boolean($('[data-cancel]', host)) });
    return;
  }

  const pk = e.target.closest('[data-pack]');
  if (pk) {
    e.stopPropagation();
    packProject(pk.dataset.pack, pk);
    return;
  }

  const ren = e.target.closest('[data-rename]');
  if (ren) {
    e.stopPropagation();
    beginRename(ren.dataset.rename, projects);
    return;
  }
  if (e.target.closest('.start-rename')) { e.stopPropagation(); return; }

  const open = e.target.closest('[data-open]');
  if (open) { pending = []; finish({ action: 'open', id: open.dataset.open }); }
}

/*
 * A row is a button, so it answers to the keyboard like one; the arrows walk
 * the list, and "/" goes to the search box from anywhere that is not typing.
 */
function onKey(e) {
  if (e.target.closest?.('.start-rename')) return;
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (e.key === '/' && !typing) {
    const search = $('#start-search', host);
    if (search) { e.preventDefault(); search.focus(); search.select(); }
    return;
  }
  const open = e.target.closest?.('[data-open]');
  if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const rows = $$('.start-row', host);
    const i = rows.indexOf(open);
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    return;
  }
  if (open && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    pending = [];
    finish({ action: 'open', id: open.dataset.open });
  }
}

/* Rename in place: the name becomes a box, Enter keeps it, Escape does not. */
function beginRename(id, projects) {
  const label = $(`[data-name="${CSS.escape(id)}"]`, host);
  if (!label) return;
  const before = label.textContent;
  const input = document.createElement('input');
  input.className = 'input start-rename';
  input.value = before;
  input.maxLength = 60;
  input.setAttribute('aria-label', 'Project name');
  label.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const keep = async () => {
    if (done) return; done = true;
    const name = input.value.trim() || before;
    if (name !== before) await store.renameProject(id, name);
    render(await store.listProjects(), { canCancel: Boolean($('[data-cancel]', host)) });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); keep(); }
    if (e.key === 'Escape') { done = true; render(projects, { canCancel: Boolean($('[data-cancel]', host)) }); }
  });
  input.addEventListener('blur', keep);
}
