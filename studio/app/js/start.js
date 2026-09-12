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
 * something other than a blank timeline, bring a project file in, and see
 * how much of the device the whole lot is using.
 */

import { $, $$, esc, dur as fmtDur, confirmDialog } from './ui.js';
import * as store from './store.js';
import { RATIOS } from './engine/project.js';

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
 * Ways to begin that are not a blank timeline. Each is a door into something
 * the editor already does — the montage builder, copying an edit, a photo
 * dump — reached from the first screen rather than found later.
 */
const STARTS = [
  { id: 'blank', ico: '▭', name: 'Blank timeline', note: 'Bring clips in and cut.' },
  { id: 'montage', ico: '⚡', name: 'Montage from my clips', note: 'Pick a kind; it builds the whole cut to the beat.' },
  { id: 'copy', ico: '🎞', name: 'Copy an edit I like', note: 'Drop in a video; it rebuilds that edit’s shape with your clips.' },
  { id: 'photos', ico: '📸', name: 'Photo dump', note: 'Stills with a slow push on each, cut to music.' },
];

let host = null;
let resolveChoice = null;
let query = '';
let sort = 'recent';
let current = [];        // the projects on screen; the handlers below read it

export function isOpen() { return Boolean(host) && !host.hidden; }

/**
 * Show the picker and wait for a decision.
 *
 * Resolves with `{ action: 'open', id }`, `{ action: 'new', ... }`,
 * `{ action: 'import', file }` or `{ action: 'cancel' }` when cancelling is
 * allowed. It never resolves with nothing: there is no way out of this screen
 * except choosing, because "no project" is not a state the editor can be in.
 */
export async function chooseProject({ canCancel = false } = {}) {
  const projects = await store.listProjects();
  build(projects, { canCancel });
  store.usage().then((u) => paintUsage(u)).catch(() => {});
  return new Promise((resolve) => { resolveChoice = resolve; });
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
  let list = q ? projects.filter((p) => (p.name || '').toLowerCase().includes(q)) : projects.slice();
  if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  else if (sort === 'longest') list.sort((a, b) => length(b) - length(a));
  else list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return list;
}

function length(p) {
  const clips = p.clips || [];
  return clips.length ? Math.max(...clips.map((c) => (c.start || 0) + (c.dur || 0))) : 0;
}

function render(projects, { canCancel }) {
  current = projects;
  const empty = projects.length === 0;
  const list = visible(projects);

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
        ${canCancel ? '<button class="start-x" data-cancel aria-label="Back to the timeline">✕</button>' : ''}
      </div>

      <div class="start-body">
        <form class="start-new" id="start-new">
          <h2>${empty ? 'Name it' : 'New project'}</h2>
          <input class="input" id="start-name" maxlength="60" autocomplete="off"
                 placeholder="What are you making?" value="">

          <h3 class="start-h3">Shape</h3>
          <div class="start-shapes" role="radiogroup" aria-label="Shape">
            ${SHAPES.map((s, i) => `
              <label class="start-shape ${i === 0 ? 'on' : ''}">
                <input type="radio" name="start-ratio" value="${esc(s.id)}" ${i === 0 ? 'checked' : ''}>
                <span class="start-thumb r${s.id.replace(/[:.]/g, '-')}"></span>
                <b>${esc(s.name)}</b>
                <em>${esc(s.note)}</em>
              </label>`).join('')}
          </div>

          <div class="start-grid">
            <label class="start-field">
              <span>Size</span>
              <select class="tp-select" id="start-size">${sizeOptions('9:16')}</select>
            </label>
            <label class="start-field">
              <span>Frames a second</span>
              <select class="tp-select" id="start-fps">
                ${FPS.map(([v, l]) => `<option value="${v}" ${v === 30 ? 'selected' : ''}>${esc(l)}</option>`).join('')}
              </select>
            </label>
            <label class="start-field">
              <span>Behind the picture</span>
              <span class="start-colour">
                <input type="color" id="start-bg" value="#000000" aria-label="Background colour">
                <em id="start-bg-name">Black</em>
              </span>
            </label>
          </div>
          <div class="start-custom" id="start-custom" hidden>
            <input class="input" type="number" id="start-w" min="240" max="7680" step="2" placeholder="Width">
            <span>×</span>
            <input class="input" type="number" id="start-h" min="240" max="7680" step="2" placeholder="Height">
            <em class="tiny muted" id="start-custom-note">Keeps the shape you picked.</em>
          </div>

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
        </form>

        <div class="start-list">
          <div class="start-list-head">
            <h2>${empty ? 'Nothing saved yet' : 'Open one'}</h2>
            ${projects.length > 1 ? `
              <input class="input start-search" id="start-search" placeholder="Find a project…" value="${esc(query)}" aria-label="Find a project">
              <select class="tp-select start-sort" id="start-sort" aria-label="Sort">
                <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Recent</option>
                <option value="name" ${sort === 'name' ? 'selected' : ''}>Name</option>
                <option value="longest" ${sort === 'longest' ? 'selected' : ''}>Longest</option>
              </select>` : ''}
          </div>
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
            <input type="file" id="start-file" accept=".json,application/json" hidden>
            <span class="tiny muted">A <span class="mono">.omnidx.json</span> saved from another device.</span>
          </div>
        </div>
      </div>
    </div>`;

  wire();
  /*
   * The name field takes focus when there is nothing to open, and not
   * otherwise. Somebody with fifteen projects came here to pick one, and a
   * cursor blinking in a text box tells them they came to type.
   */
  if (!projects.length) setTimeout(() => $('#start-name', host)?.focus(), 60);
}

function sizeOptions(ratio) {
  const shape = SHAPES.find((s) => s.id === ratio) || SHAPES[0];
  return shape.sizes.map(([w, h, label], i) => `<option value="${w}x${h}" ${i === 0 ? 'selected' : ''}>${w}×${h} — ${esc(label)}</option>`).join('')
    + '<option value="custom">Custom…</option>';
}

/*
 * A row: the poster of the first clip when there is one (a project is
 * recognised by its footage far faster than by its name), the shape, the
 * facts that answer "is this the one", and the three things people do to a
 * project from a list — rename, copy, delete.
 */
function row(p) {
  const clips = p.clips?.length || 0;
  const secs = length(p);
  const poster = (p.media || []).find((m) => m.poster)?.poster;
  const ratio = p.settings?.ratio || '9:16';
  return `
    <div class="start-row" data-open="${esc(p.id)}" role="button" tabindex="0">
      <span class="start-poster r${ratio.replace(/[:.]/g, '-')}">${poster ? `<img src="${esc(poster)}" alt="">` : ''}</span>
      <span class="start-meta">
        <b data-name="${esc(p.id)}">${esc(p.name || 'Untitled project')}</b>
        <em>${clips ? `${clips} clip${clips === 1 ? '' : 's'} · ${fmtDur(secs)}` : 'empty'}
          · ${esc(ratio)} · ${p.settings?.fps || 30}fps · ${esc(when(p.updatedAt))}</em>
      </span>
      <span class="start-acts">
        <button data-rename="${esc(p.id)}" title="Rename" aria-label="Rename ${esc(p.name || 'project')}">✎</button>
        <button data-dup="${esc(p.id)}" title="Duplicate" aria-label="Duplicate ${esc(p.name || 'project')}">⧉</button>
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

const COLOUR_NAMES = { '#000000': 'Black', '#ffffff': 'White', '#0f0f14': 'Near black', '#1e1e1e': 'Charcoal', '#00ff00': 'Green screen' };

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
      return;
    }
    if (e.target.id === 'start-sort') { sort = e.target.value; render(current, { canCancel: Boolean($('[data-cancel]', host)) }); return; }
    if (e.target.id === 'start-file') {
      const file = e.target.files?.[0];
      if (file) finish({ action: 'import', file });
    }
  });

  host.addEventListener('input', (e) => {
    if (e.target.id === 'start-bg') {
      const v = e.target.value.toLowerCase();
      $('#start-bg-name', host).textContent = COLOUR_NAMES[v] || v;
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
    }
  });

  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
}

function onSubmit(e) {
    e.preventDefault();
    const name = $('#start-name', host).value.trim();
    const ratio = $('input[name="start-ratio"]:checked', host)?.value || '9:16';
    const fps = Number($('#start-fps', host).value) || 30;
    const sizeValue = $('#start-size', host).value;
    let width = null, height = null;
    if (sizeValue === 'custom') {
      width = Number($('#start-w', host).value) || null;
      height = Number($('#start-h', host).value) || null;
    } else {
      [width, height] = sizeValue.split('x').map(Number);
    }
    finish({
      action: 'new',
      // An empty box is not an error — it just means they had not decided yet.
      name: name || 'Untitled project',
      ratio: RATIOS[ratio] ? ratio : '9:16',
      fps,
      width, height,
      background: $('#start-bg', host).value,
      intent: $('input[name="start-intent"]:checked', host)?.value || 'blank',
    });
}

async function onClick(e) {
    const projects = current;
    if (e.target.closest('[data-cancel]')) { finish({ action: 'cancel' }); return; }
    if (e.target.closest('#start-import')) { $('#start-file', host).click(); return; }

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

    const ren = e.target.closest('[data-rename]');
    if (ren) {
      e.stopPropagation();
      beginRename(ren.dataset.rename, projects);
      return;
    }
    if (e.target.closest('.start-rename')) { e.stopPropagation(); return; }

    const open = e.target.closest('[data-open]');
    if (open) finish({ action: 'open', id: open.dataset.open });
}

// A row is a button, so it answers to the keyboard like one.
function onKey(e) {
    if (e.target.closest?.('.start-rename')) return;
    const open = e.target.closest?.('[data-open]');
    if (open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      finish({ action: 'open', id: open.dataset.open });
    }
}

/* Rename in place: the name becomes a box, Enter keeps it, Escape does not. */
function beginRename(id, projects) {
  const label = $(`[data-name="${CSS.escape(id)}"]`, host);
  if (!label) return;
  const current = label.textContent;
  const input = document.createElement('input');
  input.className = 'input start-rename';
  input.value = current;
  input.maxLength = 60;
  input.setAttribute('aria-label', 'Project name');
  label.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const keep = async () => {
    if (done) return; done = true;
    const name = input.value.trim() || current;
    if (name !== current) await store.renameProject(id, name);
    render(await store.listProjects(), { canCancel: Boolean($('[data-cancel]', host)) });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); keep(); }
    if (e.key === 'Escape') { done = true; render(projects, { canCancel: Boolean($('[data-cancel]', host)) }); }
  });
  input.addEventListener('blur', keep);
}
