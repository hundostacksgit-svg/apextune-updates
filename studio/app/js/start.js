/*
 * The project picker.
 *
 * Opening an editor straight into an empty "Untitled project" is a small
 * cruelty: it looks like the app forgot the six hours you spent in it
 * yesterday, and the only way to find out it did not is to go hunting through
 * a settings panel. Every editor that expects you to come back more than once
 * — Resolve, Premiere, Final Cut — opens on a list of what you have, and so
 * does this now.
 *
 * It is also the only honest place to make a new one. A project has a name, a
 * shape and a frame rate, and all three are annoying to change once there are
 * clips on the timeline; asking at the start costs one screen and saves that.
 */

import { $, $$, el, esc, dur as fmtDur } from './ui.js';
import * as store from './store.js';
import { RATIOS } from './engine/project.js';

/* The shapes worth offering at the start. The full list lives in the settings
   panel; four covers what people actually post to. */
const SHAPES = [
  { id: '9:16', name: 'Vertical', note: 'TikTok, Reels, Shorts' },
  { id: '16:9', name: 'Landscape', note: 'YouTube, everything else' },
  { id: '1:1', name: 'Square', note: 'Feed posts' },
  { id: '4:5', name: 'Portrait', note: 'Instagram feed' },
];

let host = null;
let resolveChoice = null;

export function isOpen() { return Boolean(host) && !host.hidden; }

/**
 * Show the picker and wait for a decision.
 *
 * Resolves with `{ action: 'open', id }` or `{ action: 'new', name, ratio, fps }`.
 * It never resolves with nothing: there is no way out of this screen except
 * choosing, because "no project" is not a state the editor can be in.
 */
export async function chooseProject({ canCancel = false } = {}) {
  const projects = await store.listProjects();
  build(projects, { canCancel });
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

function render(projects, { canCancel }) {
  const empty = projects.length === 0;

  host.innerHTML = `
    <div class="start-box" role="dialog" aria-modal="true" aria-label="Your projects">
      <div class="start-head">
        <img class="start-mark" src="../assets/mark.svg" alt="" width="34" height="34">
        <div>
          <h1>${empty ? 'Start your first project' : 'Your projects'}</h1>
          <p>${empty
            ? 'Everything stays on this device. Nothing is uploaded.'
            : `${projects.length} saved here on this device.`}</p>
        </div>
        ${canCancel ? '<button class="start-x" data-cancel aria-label="Back to the timeline">✕</button>' : ''}
      </div>

      <div class="start-body">
        <form class="start-new" id="start-new">
          <h2>${empty ? 'Name it' : 'New project'}</h2>
          <input class="input" id="start-name" maxlength="60" autocomplete="off"
                 placeholder="What are you making?" value="">
          <div class="start-shapes" role="radiogroup" aria-label="Shape">
            ${SHAPES.map((s, i) => `
              <label class="start-shape ${i === 0 ? 'on' : ''}">
                <input type="radio" name="start-ratio" value="${esc(s.id)}" ${i === 0 ? 'checked' : ''}>
                <span class="start-thumb r${s.id.replace(':', '-')}"></span>
                <b>${esc(s.name)}</b>
                <em>${esc(s.note)}</em>
              </label>`).join('')}
          </div>
          <label class="start-fps">
            <span>Frames a second</span>
            <select class="tp-select" id="start-fps">
              <option value="30" selected>30 — the usual</option>
              <option value="24">24 — film</option>
              <option value="25">25 — PAL</option>
              <option value="60">60 — smooth, twice the file</option>
            </select>
          </label>
          <button class="btn btn-primary btn-full" type="submit" id="start-create">
            ${empty ? 'Create it and start editing' : 'Create'}
          </button>
        </form>

        <div class="start-list">
          <h2>${empty ? 'Nothing saved yet' : 'Open one'}</h2>
          ${empty ? `
            <div class="start-none">
              <p>Projects you make show up here, newest first, with everything
                 you did to them. They are saved as you work — there is no save button
                 to forget.</p>
            </div>`
            : `<div class="start-rows">${projects.map(row).join('')}</div>`}
        </div>
      </div>
    </div>`;

  wire(projects);
}

function row(p) {
  const clips = p.clips?.length || 0;
  const secs = clips
    ? Math.max(...p.clips.map((c) => (c.start || 0) + (c.dur || 0)))
    : 0;
  return `
    <div class="start-row" data-open="${esc(p.id)}" role="button" tabindex="0">
      <span class="start-ratio r${(p.settings?.ratio || '9:16').replace(':', '-')}"></span>
      <span class="start-meta">
        <b>${esc(p.name || 'Untitled project')}</b>
        <em>${clips ? `${clips} clip${clips === 1 ? '' : 's'} · ${fmtDur(secs)}` : 'empty'}
          · ${esc(when(p.updatedAt))}</em>
      </span>
      <button class="start-del" data-del="${esc(p.id)}"
        title="Delete this project" aria-label="Delete ${esc(p.name || 'project')}">🗑</button>
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

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

function wire(projects) {
  const form = $('#start-new', host);

  // The shape cards are radio buttons wearing a costume; keep the costume in
  // step with what is actually checked.
  host.addEventListener('change', (e) => {
    if (e.target.name !== 'start-ratio') return;
    for (const label of $$('.start-shape', host)) {
      label.classList.toggle('on', label.querySelector('input')?.checked);
    }
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#start-name', host).value.trim();
    const ratio = $('input[name="start-ratio"]:checked', host)?.value || '9:16';
    const fps = Number($('#start-fps', host).value) || 30;
    finish({
      action: 'new',
      // An empty box is not an error — it just means they had not decided yet.
      name: name || 'Untitled project',
      ratio: RATIOS[ratio] ? ratio : '9:16',
      fps,
    });
  });

  host.addEventListener('click', async (e) => {
    if (e.target.closest('[data-cancel]')) { finish({ action: 'cancel' }); return; }

    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      const p = projects.find((x) => x.id === id);
      const { confirmDialog } = await import('./ui.js');
      const yes = await confirmDialog({
        title: `Delete "${p?.name || 'this project'}"?`,
        body: 'The edit goes for good. The video and music files on your device are untouched.',
        confirmText: 'Delete it',
      });
      if (!yes) return;
      await store.deleteProject(id);
      render(await store.listProjects(), { canCancel: Boolean($('[data-cancel]', host)) });
      return;
    }

    const open = e.target.closest('[data-open]');
    if (open) finish({ action: 'open', id: open.dataset.open });
  });

  // A row is a button, so it answers to the keyboard like one.
  host.addEventListener('keydown', (e) => {
    const open = e.target.closest?.('[data-open]');
    if (open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      finish({ action: 'open', id: open.dataset.open });
    }
  });

  /*
   * The name field takes focus when there is nothing to open, and not
   * otherwise. Somebody with fifteen projects came here to pick one, and a
   * cursor blinking in a text box tells them they came to type.
   */
  if (!projects.length) setTimeout(() => $('#start-name', host)?.focus(), 60);
}
