/*
 * The workspace: pages, docks, and the node graph.
 *
 * What this is for
 * ----------------
 * Beginner is one screen and stays one screen — panel on the left, picture in
 * the middle, timeline underneath. That layout is right for somebody making
 * their first cut and it is not right for anybody else, because the work of
 * editing and the work of grading want opposite arrangements of the same
 * screen. An editor wants a long timeline and a small viewer. A colourist
 * wants a big viewer, a node graph, scopes, and a strip of thumbnails instead
 * of a timeline. Audio wants a mixer. Delivery wants a render queue.
 *
 * Every serious finishing application solves this the same way, and the
 * solution is pages: one set of tools per job, switched from a bar along the
 * bottom, sharing one project. That is what this builds, at Intermediate and
 * Professional. Beginner never sees any of it.
 *
 * How it works
 * ------------
 * `html[data-page]` is the whole mechanism. Every dock declares which pages it
 * belongs to and the CSS does the rest, so switching pages is one attribute
 * write and no relayout code. Docks can also be turned off by hand from the
 * workspace toggles in the top bar — a colourist who wants the gallery closed
 * gets to close it, and the choice is remembered per page.
 *
 * Nothing here owns any state that belongs to the project. The node graph
 * reads and writes the clip's real grade chain, the gallery stores real grades
 * on the project, and the scopes read the real output canvas. There is no
 * second copy of anything and nothing is a picture of a feature.
 */

import { $, $$, el, toast } from './ui.js';
import * as levels from './levels.js';
import { gradeNodes, addGradeNode, removeGradeNode, liveGradeNode, mediaById, clipById } from './engine/project.js';
import { SCOPES, drawScope } from './engine/scopes.js';
import { CONTROLS } from './engine/filters.js';
import { wheelsMarkup, wireWheels, refreshWheels } from './wheels-ui.js';

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */

/*
 * Seven pages, named for the job and not for the vendor.
 *
 * The order is the order the work happens in, which is why every application
 * that has pages uses roughly this one: you bring footage in, you cut it, you
 * refine the cut, you do the shot work, you grade, you mix, you deliver.
 *
 * `panel` is what gets mounted in the left dock when the page opens, and
 * `min` keeps a page out of Intermediate when it is genuinely a finishing
 * tool rather than an editing one.
 */
export const PAGES = [
  { id: 'media',   name: 'Media',     icon: '🗂', panel: 'media',
    hint: 'Bring footage in, look at it, tag it' },
  { id: 'cut',     name: 'Cut',       icon: '✂',  panel: 'templates',
    hint: 'Fast assembly — the whole timeline at once' },
  { id: 'edit',    name: 'Edit',      icon: '🎬', panel: 'effects',
    hint: 'The full timeline, inspector and effects' },
  { id: 'fusion',  name: 'Motion',    icon: '⬡',  panel: 'text', min: 'expert',
    hint: 'Titles, tracking, masks and compositing' },
  { id: 'colour',  name: 'Colour',    icon: '◐',  panel: 'color', min: 'intermediate',
    hint: 'Nodes, wheels, curves and scopes' },
  { id: 'audio',   name: 'Fairlight', icon: '🔊', panel: 'audio',
    hint: 'Mixer, channel strips and loudness' },
  { id: 'deliver', name: 'Deliver',   icon: '⇪',  panel: 'settings',
    hint: 'Render settings and the export queue' },
];

export const PAGE_BY_ID = Object.fromEntries(PAGES.map((p) => [p.id, p]));

/*
 * Docks, and which pages each one belongs to.
 *
 * A dock is a region of the screen with one job. Listing the pages here rather
 * than in the CSS keeps the two in step: adding a page to a dock is one word.
 */
const DOCKS = [
  { id: 'gallery', name: 'Gallery',  pages: ['colour'],                  side: 'left' },
  { id: 'nodes',   name: 'Nodes',    pages: ['colour', 'fusion'],        side: 'right' },
  { id: 'scopes',  name: 'Scopes',   pages: ['colour'],                  side: 'right' },
  { id: 'strip',   name: 'Strip',    pages: ['colour', 'cut', 'fusion'], side: 'bottom' },
  { id: 'lightbox',name: 'Lightbox', pages: ['colour', 'cut', 'media'],  side: 'over', off: true },
  { id: 'primaries', name: 'Primaries', pages: ['colour', 'fusion'],   side: 'bottom' },
];

const PAGE_KEY = 'omnidx.studio.page';
const DOCK_KEY = 'omnidx.studio.docks';

let api = null;              // the actions table main.js hands over
let currentPage = 'edit';
let dockState = {};          // `${page}:${dock}` -> boolean
let selectedNode = null;     // which corrector the colour panel is editing

/* ------------------------------------------------------------------ */
/* remembering what was open                                           */
/* ------------------------------------------------------------------ */

function loadPrefs() {
  try {
    const p = localStorage.getItem(PAGE_KEY);
    if (p && PAGE_BY_ID[p]) currentPage = p;
    dockState = JSON.parse(localStorage.getItem(DOCK_KEY) || '{}') || {};
  } catch { /* private mode: this session only, which is fine */ }
}

function savePrefs() {
  try {
    localStorage.setItem(PAGE_KEY, currentPage);
    localStorage.setItem(DOCK_KEY, JSON.stringify(dockState));
  } catch { /* nothing to do about it and nothing worth saying */ }
}

function dockOn(dockId, page = currentPage) {
  const dock = DOCKS.find((d) => d.id === dockId);
  if (!dock) return false;
  if (!dock.pages.includes(page)) return false;
  const key = `${page}:${dockId}`;
  if (key in dockState) return dockState[key];
  return !dock.off;
}

function setDock(dockId, on) {
  dockState[`${currentPage}:${dockId}`] = Boolean(on);
  savePrefs();
  paintDocks();
}

/* ------------------------------------------------------------------ */
/* the page bar                                                        */
/* ------------------------------------------------------------------ */

function buildPageBar() {
  const bar = el('nav', { class: 'pagebar', id: 'pagebar', 'aria-label': 'Pages' });

  const pages = el('div', { class: 'pb-pages', role: 'tablist' });
  for (const p of PAGES) {
    const btn = el('button', {
      class: 'pb-page', 'data-page': p.id, role: 'tab', type: 'button',
      title: `${p.name} — ${p.hint}`,
    });
    if (p.min) btn.dataset.min = p.min;
    btn.append(el('span', { class: 'pb-ico' }, p.icon), el('i', {}, p.name));
    pages.append(btn);
  }
  pages.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn) setPage(btn.dataset.page);
  });

  const right = el('div', { class: 'pb-right' });
  const projects = el('button', { class: 'pb-tool', id: 'pb-projects', type: 'button',
    title: 'Project manager' }, '🗀');
  projects.addEventListener('click', () => api?.openStart?.({ canCancel: true }));
  const prefs = el('button', { class: 'pb-tool', id: 'pb-prefs', type: 'button',
    title: 'Project settings' }, '⚙');
  prefs.addEventListener('click', () => api?.openPanel?.('settings'));
  right.append(projects, prefs);

  bar.append(el('span', { class: 'pb-name' }, 'OmniDx Studio'), pages, right);
  return bar;
}

/** Switch pages. The attribute is the whole implementation. */
export function setPage(id) {
  const page = PAGE_BY_ID[id];
  if (!page) return;
  if (page.min && !levels.allows(page.min)) return;
  currentPage = id;
  document.documentElement.setAttribute('data-page', id);
  $$('#pagebar .pb-page').forEach((b) => {
    const on = b.dataset.page === id;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (page.panel) api?.openPanel?.(page.panel);

  /*
   * A grading page always has a shot in hand.
   *
   * On the edit page "nothing selected" is a real state — you are between
   * things. On a colour page it is not: you are looking at a frame, and the
   * frame belongs to a shot, and that shot is the one you are grading. Every
   * grading application works this way, and the alternative is a screen full
   * of colour tools all saying "select a clip" about the clip you are staring
   * at.
   */
  if ((id === 'colour' || id === 'fusion') && !api?.state?.()?.sel?.size) {
    const clip = gradeClip();
    if (clip) api?.select?.([clip.id]);
  }

  paintDocks();
  savePrefs();
  // The viewer changes size when docks come and go, and a canvas that is not
  // resized to match is a blurry picture at best and a stretched one at worst.
  api?.sizeCanvas?.();
  refresh();
  // Resizing the canvas clears it, and the repaint lands on the next frame.
  requestAnimationFrame(() => { refresh(); });
}

export function page() { return currentPage; }

/* ------------------------------------------------------------------ */
/* the workspace toggles                                               */
/* ------------------------------------------------------------------ */

function buildToggles() {
  const wrap = el('div', { class: 'wsbar', id: 'wsbar', 'aria-label': 'Workspace' });
  for (const d of DOCKS) {
    const btn = el('button', { class: 'ws-btn', type: 'button', 'data-dock': d.id,
      title: `${d.name} panel`, 'aria-pressed': 'false' }, d.name);
    btn.addEventListener('click', () => setDock(d.id, !dockOn(d.id)));
    wrap.append(btn);
  }
  return wrap;
}

function paintDocks() {
  const root = document.documentElement;
  for (const d of DOCKS) {
    const on = dockOn(d.id);
    root.classList.toggle(`ws-${d.id}`, on);
    const btn = $(`#wsbar [data-dock="${d.id}"]`);
    if (btn) {
      const usable = d.pages.includes(currentPage);
      btn.hidden = !usable;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
}

/* ------------------------------------------------------------------ */
/* the node graph                                                      */
/* ------------------------------------------------------------------ */

/*
 * Drawn as real DOM, not as a canvas.
 *
 * A canvas graph means reimplementing focus, hit testing, keyboard navigation
 * and screen-reader labels — all of which a button already has. The wires are
 * the only thing a canvas would do better, and they are two SVG lines.
 */
function buildNodes() {
  const dock = el('section', { class: 'dock dock-nodes', id: 'nodes', 'aria-label': 'Node graph' });
  dock.append(
    el('div', { class: 'dock-h' },
      el('b', {}, 'Nodes'),
      el('span', { class: 'dock-sp' }),
      button('+ Serial', 'nd-add', 'Add a corrector after the selected one (Alt+S)'),
      button('✕', 'nd-del', 'Delete the selected corrector'),
    ),
    el('div', { class: 'nd-canvas', id: 'nd-canvas' }),
  );
  dock.addEventListener('click', (e) => {
    if (e.target.closest('#nd-add')) { addNode(); return; }
    if (e.target.closest('#nd-del')) { deleteNode(); return; }
    const power = e.target.closest('[data-node-power]');
    if (power) { toggleNode(power.dataset.nodePower); e.stopPropagation(); return; }
    const node = e.target.closest('[data-node]');
    if (node) selectNode(node.dataset.node);
  });
  return dock;
}

function button(label, id, title) {
  return el('button', { class: 'dock-btn', id, type: 'button', title }, label);
}

/** The clip the grade tools are pointed at: the selection, else the playhead. */
function gradeClip() {
  const S = api?.state?.();
  if (!S) return null;
  const sel = [...(S.sel || [])];
  if (sel.length === 1) return clipById(S.project, sel[0]) || null;
  // Nothing selected is the normal state while you are looking at a shot, and
  // "no clip" would be a useless answer — the shot on screen is the one being
  // graded, and that is what every grading application assumes.
  const under = S.project.clips.filter((c) => {
    const track = S.project.tracks.find((tr) => tr.id === c.trackId);
    return track?.kind === 'video' && !track.hidden
      && S.time >= c.start && S.time < c.start + c.dur;
  });
  return under[under.length - 1] || null;
}

export function activeNodeId() { return selectedNode; }

/** The corrector the colour controls should be writing to right now. */
export function activeGradeTarget() {
  const clip = gradeClip();
  if (!clip) return null;
  const live = liveGradeNode(clip, selectedNode);
  return live || clip;
}

function selectNode(id) {
  selectedNode = id;
  paintNodes();
  paintPrimaries();
  api?.refreshPanel?.();
}

function addNode() {
  const clip = gradeClip();
  if (!clip) { toast('Select a clip to grade first', 'bad'); return; }
  api?.patchClip?.(clip.id, (c) => { const n = addGradeNode(c); selectedNode = n.id; },
    'Add a corrector');
  paintNodes();
  api?.refreshPanel?.();
}

function deleteNode() {
  const clip = gradeClip();
  if (!clip || !selectedNode) return;
  if (selectedNode === `${clip.id}:base`) {
    toast('Corrector 1 is the clip’s own grade — reset it instead of deleting it', 'bad', 3800);
    return;
  }
  api?.patchClip?.(clip.id, (c) => removeGradeNode(c, selectedNode), 'Delete a corrector');
  selectedNode = `${clip.id}:base`;
  paintNodes();
  api?.refreshPanel?.();
}

function toggleNode(id) {
  const clip = gradeClip();
  if (!clip) return;
  api?.patchClip?.(clip.id, (c) => {
    if (id === `${c.id}:base`) { c.gradeOn = c.gradeOn === false; return; }
    const n = (c.grades || []).find((g) => g.id === id);
    if (n) n.on = n.on === false;
  }, 'Turn a corrector on or off');
  paintNodes();
}

/** A one-line summary of what a corrector is doing, for the node's label. */
function describeNode(node) {
  const c = node.color || {};
  const bits = [];
  if (c.look && c.look !== 'none') bits.push(c.look);
  for (const [k, sign] of [['exposure','EXP'], ['contrast','CON'], ['saturation','SAT'],
    ['temperature','TEMP'], ['tint','TINT'], ['highlights','HL'], ['shadows','SH']]) {
    if (Math.abs(c[k] || 0) > 0.001) bits.push(sign);
  }
  const w = c.wheels;
  if (w) {
    for (const k of ['lift', 'gamma', 'gain']) {
      const v = w[k];
      if (v && (Math.abs(v.r) > 0.002 || Math.abs(v.g) > 0.002 || Math.abs(v.b) > 0.002)) {
        bits.push(k.toUpperCase());
      }
    }
    if (Math.abs(w.offset || 0) > 0.002) bits.push('OFS');
  }
  if ((node.masks || []).some((m) => m.on !== false)) bits.push('WIN');
  if (c.qualifier?.on) bits.push('KEY');
  return bits.slice(0, 4).join(' · ');
}

function paintNodes() {
  const host = $('#nd-canvas');
  if (!host) return;
  const clip = gradeClip();
  host.innerHTML = '';
  if (!clip) {
    host.append(el('p', { class: 'dock-empty' },
      'Put the playhead over a clip, or select one, to see its grade.'));
    return;
  }

  const chain = gradeNodes(clip);
  if (!selectedNode || !chain.some((n) => n.id === selectedNode)) selectedNode = chain[0].id;

  const row = el('div', { class: 'nd-row' });
  row.append(el('div', { class: 'nd-io', title: 'The clip as shot' },
    el('span', { class: 'nd-io-dot' }), el('i', {}, 'Source')));

  chain.forEach((node, i) => {
    row.append(el('div', { class: 'nd-wire', 'aria-hidden': 'true' }));
    const box = el('button', {
      class: `nd-node${node.id === selectedNode ? ' on' : ''}${node.on === false ? ' off' : ''}`,
      type: 'button', 'data-node': node.id,
      title: `${node.label} — click to edit it here`,
    });
    box.append(
      el('span', { class: 'nd-num' }, String(i + 1)),
      el('span', { class: 'nd-thumb' }),
      el('span', { class: 'nd-label' }, node.label),
      el('span', { class: 'nd-sum' }, describeNode(node) || 'neutral'),
      el('span', { class: 'nd-power', 'data-node-power': node.id, role: 'switch',
        'aria-checked': node.on === false ? 'false' : 'true',
        title: node.on === false ? 'Turn this corrector on' : 'Turn this corrector off' }, '⏻'),
    );
    row.append(box);
  });

  row.append(el('div', { class: 'nd-wire', 'aria-hidden': 'true' }));
  row.append(el('div', { class: 'nd-io out', title: 'What comes out' },
    el('span', { class: 'nd-io-dot' }), el('i', {}, 'Output')));
  host.append(row);

  // Thumbnails come from the clip's own poster, so the graph shows the shot
  // rather than a grey box with a number on it.
  const S = api?.state?.();
  const poster = S ? mediaById(S.project, clip.mediaId)?.poster : null;
  if (poster) {
    for (const t of $$('.nd-thumb', host)) t.style.backgroundImage = `url(${poster})`;
  }
}

/* ------------------------------------------------------------------ */
/* the gallery                                                         */
/* ------------------------------------------------------------------ */

/*
 * Stills, the way a colourist uses them.
 *
 * A still is a grade plus a picture of what it did. You grab one from a shot
 * you are happy with and apply it to the next shot, which is how a sequence
 * gets matched — not by writing the numbers down. Stored on the project, so
 * they travel with it, and small: a grade is a few dozen numbers and the
 * thumbnail is the clip's own poster, which is already there.
 */
function buildGallery() {
  const dock = el('aside', { class: 'dock dock-gallery', id: 'gallery', 'aria-label': 'Gallery' });
  dock.append(
    el('div', { class: 'dock-h' },
      el('b', {}, 'Gallery'),
      el('span', { class: 'dock-sp' }),
      button('Grab', 'gl-grab', 'Save this shot’s grade as a still'),
    ),
    el('div', { class: 'gl-grid', id: 'gl-grid' }),
  );
  dock.addEventListener('click', (e) => {
    if (e.target.closest('#gl-grab')) { grabStill(); return; }
    const del = e.target.closest('[data-still-del]');
    if (del) { removeStill(del.dataset.stillDel); e.stopPropagation(); return; }
    const still = e.target.closest('[data-still]');
    if (still) applyStill(still.dataset.still);
  });
  return dock;
}

function stills() {
  const S = api?.state?.();
  return S?.project?.stills || [];
}

function grabStill() {
  const clip = gradeClip();
  const S = api?.state?.();
  if (!clip || !S) { toast('Nothing under the playhead to grab', 'bad'); return; }
  const shot = structuredClone({
    color: clip.color,
    grades: clip.grades || [],
    masks: (clip.masks || []).filter((m) => m.target === 'grade'),
  });
  api?.patch?.((p) => {
    p.stills ||= [];
    p.stills.push({
      id: `st${Date.now().toString(36)}`,
      name: `${p.stills.length + 1}.1`,
      poster: mediaById(p, clip.mediaId)?.poster || null,
      grade: shot,
      at: Date.now(),
    });
  }, 'Grab a still');
  paintGallery();
}

function applyStill(id) {
  const still = stills().find((s) => s.id === id);
  if (!still) return;
  const clip = gradeClip();
  if (!clip) { toast('Nothing to apply it to', 'bad'); return; }
  api?.patchClip?.(clip.id, (c) => {
    const g = structuredClone(still.grade);
    c.color = g.color;
    c.grades = g.grades;
    // Windows come with the grade: a vignette that is part of a look is part
    // of that look, and leaving it behind is how a matched shot stops matching.
    c.masks = [...(c.masks || []).filter((m) => m.target !== 'grade'), ...(g.masks || [])];
  }, `Apply still ${still.name}`);
  paintNodes();
  api?.refreshPanel?.();
}

function removeStill(id) {
  api?.patch?.((p) => { p.stills = (p.stills || []).filter((s) => s.id !== id); }, 'Delete a still');
  paintGallery();
}

function paintGallery() {
  const host = $('#gl-grid');
  if (!host) return;
  host.innerHTML = '';
  const list = stills();
  if (!list.length) {
    host.append(el('p', { class: 'dock-empty' },
      'Grab a grade you like and it lands here, ready to drop on the next shot.'));
    return;
  }
  for (const s of list) {
    const cell = el('button', { class: 'gl-still', type: 'button', 'data-still': s.id,
      title: `Apply ${s.name}` });
    const pic = el('span', { class: 'gl-pic' });
    if (s.poster) pic.style.backgroundImage = `url(${s.poster})`;
    cell.append(pic, el('i', {}, s.name),
      el('span', { class: 'gl-del', 'data-still-del': s.id, title: 'Delete this still' }, '✕'));
    host.append(cell);
  }
}

/* ------------------------------------------------------------------ */
/* scopes                                                              */
/* ------------------------------------------------------------------ */

function buildScopes() {
  const dock = el('section', { class: 'dock dock-scopes', id: 'scopes-dock', 'aria-label': 'Scopes' });
  const pick = el('select', { class: 'dock-select', id: 'sc-kind', title: 'Which scope' });
  for (const s of SCOPES) pick.append(el('option', { value: s.id }, s.name));
  pick.value = 'parade';
  pick.addEventListener('change', () => { paintScope(); savePrefs(); });
  dock.append(
    el('div', { class: 'dock-h' }, el('b', {}, 'Scopes'), el('span', { class: 'dock-sp' }), pick),
    el('canvas', { class: 'sc-canvas', id: 'sc-canvas', width: '512', height: '300' }),
  );
  return dock;
}

let scopeBusy = false;
export function paintScope() {
  const cv = $('#sc-canvas');
  if (!cv || !document.documentElement.classList.contains('ws-scopes')) return;
  // A scope is a read-back of the frame, which is the most expensive thing the
  // app does per frame. One at a time, and never queued behind itself.
  if (scopeBusy) return;
  scopeBusy = true;
  try {
    const src = $('#preview');
    if (src?.width) drawScope(cv, src, $('#sc-kind')?.value || 'parade');
  } catch { /* a scope that cannot draw must not stop the frame */ }
  scopeBusy = false;
}

/* ------------------------------------------------------------------ */
/* the clip strip                                                      */
/* ------------------------------------------------------------------ */

/*
 * Every shot in the timeline as a thumbnail, in order.
 *
 * This is what a colourist navigates with, not a timeline: you are working
 * shot by shot, and what you want is the next shot, not the next second. Click
 * moves the playhead to the middle of that shot and selects it, which is the
 * one gesture the whole page is built around.
 */
function buildStrip() {
  const dock = el('section', { class: 'dock dock-strip', id: 'strip', 'aria-label': 'Clips' });
  dock.append(el('div', { class: 'st-row', id: 'st-row' }));
  dock.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-clip]');
    if (!cell) return;
    const S = api?.state?.();
    const clip = S && clipById(S.project, cell.dataset.clip);
    if (!clip) return;
    api?.select?.([clip.id]);
    api?.seek?.(clip.start + clip.dur / 2);
  });
  return dock;
}

function paintStrip() {
  const host = $('#st-row');
  if (!host) return;
  const S = api?.state?.();
  if (!S) return;
  const clips = S.project.clips
    .filter((c) => S.project.tracks.find((t) => t.id === c.trackId)?.kind === 'video')
    .sort((a, b) => a.start - b.start);
  host.innerHTML = '';
  if (!clips.length) {
    host.append(el('p', { class: 'dock-empty' }, 'No shots yet.'));
    return;
  }
  clips.forEach((clip, i) => {
    const live = S.time >= clip.start && S.time < clip.start + clip.dur;
    const cell = el('button', {
      class: `st-cell${S.sel?.has(clip.id) ? ' sel' : ''}${live ? ' live' : ''}`,
      type: 'button', 'data-clip': clip.id,
      title: `${mediaById(S.project, clip.mediaId)?.name || 'Clip'} — ${clip.dur.toFixed(2)}s`,
    });
    const pic = el('span', { class: 'st-pic' });
    const poster = mediaById(S.project, clip.mediaId)?.poster;
    if (poster) pic.style.backgroundImage = `url(${poster})`;
    const graded = (clip.grades?.length || 0) > 0
      || (clip.color && clip.color.look && clip.color.look !== 'none');
    cell.append(
      el('span', { class: 'st-num' }, String(i + 1)),
      pic,
      el('i', {}, `${clip.start.toFixed(1)}s`),
      graded ? el('span', { class: 'st-dot', title: 'Graded' }) : el('span', { class: 'st-dot off' }),
    );
    host.append(cell);
  });
}

/* ------------------------------------------------------------------ */
/* the primaries band                                                  */
/* ------------------------------------------------------------------ */

/*
 * The wheels, along the bottom, where a colourist's hands already are.
 *
 * They are in the Colour panel too, and that is not a duplicate: it is the
 * same widget from wheels-ui.js, wired to the same corrector, in the place the
 * work actually happens. A grading page puts the primaries under the picture
 * for the same reason a mixing desk puts the faders under the meters — you are
 * looking at one thing and touching another, and they should not be at
 * opposite ends of the screen.
 *
 * Six numbers sit beside them, the ones reached for between wheel moves. Not
 * all ten controls: the band is for the pass you make on every shot, and the
 * long tail belongs in the panel where there is room to read the labels.
 */
const BAND_KEYS = ['exposure', 'contrast', 'saturation', 'temperature', 'tint', 'shadows'];

function buildPrimaries() {
  const dock = el('section', { class: 'dock dock-primaries', id: 'primaries',
    'aria-label': 'Primaries' });
  dock.append(
    el('div', { class: 'dock-h' },
      el('b', {}, 'Primaries'),
      el('span', { class: 'pm-on', id: 'pm-on' }, 'Corrector 1'),
      el('span', { class: 'dock-sp' }),
      button('Reset', 'pm-reset', 'Put this corrector back to neutral'),
    ),
    el('div', { class: 'pm-body' },
      el('div', { class: 'wheels pm-wheels', id: 'pm-wheels', html: wheelsMarkup({ size: 112 }) }),
      el('div', { class: 'pm-nums', id: 'pm-nums' }),
    ),
  );

  dock.addEventListener('click', (e) => {
    if (!e.target.closest('#pm-reset')) return;
    api?.patchGrade?.((g) => {
      for (const c of CONTROLS) g.color[c.key] = 0;
      g.color.look = 'none';
      g.color.strength = 1;
      g.color.wheels = null;
    }, 'Reset this corrector');
    paintPrimaries();
    api?.refreshPanel?.();
  });

  dock.addEventListener('input', (e) => {
    const key = e.target.dataset.pm;
    if (!key) return;
    const v = Number(e.target.value);
    api?.patchGrade?.((g) => { g.color[key] = v; }, `Change ${key}`, `colour:${key}`);
    const out = dock.querySelector(`[data-pmv="${key}"]`);
    if (out) out.textContent = String(Math.round(v));
  });

  wireWheels(dock, {
    grade: () => activeGradeTarget(),
    patch: (fn, label, key) => api?.patchGrade?.(fn, label, key),
  });
  return dock;
}

function paintPrimaries() {
  const dock = $('#primaries');
  if (!dock || !document.documentElement.classList.contains('ws-primaries')) return;
  const grade = activeGradeTarget();
  const clip = gradeClip();

  const label = $('#pm-on');
  if (label) {
    if (!clip) label.textContent = 'no shot';
    else if (grade === clip) label.textContent = 'Corrector 1';
    else {
      const i = (clip.grades || []).findIndex((n) => n === grade);
      label.textContent = i < 0 ? 'Corrector 1' : (clip.grades[i].label || `Corrector ${i + 2}`);
    }
  }

  const nums = $('#pm-nums');
  if (nums) {
    /*
     * Rebuilt only when the fields would actually differ.
     *
     * These are the controls under a finger during a drag, and replacing the
     * input you are dragging is how a slider jumps out from under you.
     */
    const want = BAND_KEYS.join(',');
    if (nums.dataset.built !== want) {
      nums.dataset.built = want;
      nums.innerHTML = BAND_KEYS.map((key) => {
        const ctl = CONTROLS.find((c) => c.key === key);
        if (!ctl) return '';
        return `<label class="pm-num">
          <span class="pm-k">${ctl.label}</span>
          <input type="range" data-pm="${ctl.key}" min="${ctl.min}" max="${ctl.max}"
            step="${ctl.step || 1}" value="0" aria-label="${ctl.label}">
          <b data-pmv="${ctl.key}">0</b>
        </label>`;
      }).join('');
    }
    for (const key of BAND_KEYS) {
      const input = nums.querySelector(`[data-pm="${key}"]`);
      const out = nums.querySelector(`[data-pmv="${key}"]`);
      const v = grade?.color?.[key] ?? 0;
      // Never while it is being dragged: that is the jump described above.
      if (input && document.activeElement !== input) input.value = String(v);
      if (out) out.textContent = String(Math.round(v));
    }
  }

  refreshWheels(dock, grade);
}

/* ------------------------------------------------------------------ */
/* the viewer bar                                                      */
/* ------------------------------------------------------------------ */

/*
 * A strip above the picture saying what you are looking at.
 *
 * Obvious once there is more than one shot on screen at a time, and the
 * reason every finishing application has one: the viewer is the only part of
 * the screen with no label, and "which shot is this" is the question being
 * asked constantly while grading. It also carries the compare control, which
 * has nowhere else sensible to live.
 */
function buildViewerBar() {
  const bar = el('div', { class: 'vbar', id: 'vbar' });
  bar.append(
    el('span', { class: 'vb-name', id: 'vb-name' }, 'No shot'),
    el('span', { class: 'dock-sp' }),
    el('span', { class: 'vb-tc mono', id: 'vb-tc' }, '00:00:00:00'),
  );

  /*
   * Before and after, on one key.
   *
   * `showMatte` next to it is the other thing you look at while keying, and
   * both are viewer states rather than project state, so they live here and
   * not in the inspector.
   */
  const bypass = el('button', { class: 'vb-btn', id: 'vb-bypass', type: 'button',
    'aria-pressed': 'false', title: 'Hold to see the shot ungraded (\\)' }, 'Bypass');
  bypass.addEventListener('pointerdown', () => setBypass(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
    bypass.addEventListener(ev, () => setBypass(false));
  }
  bar.append(bypass);

  /*
   * Split screen, and a handle to move the line with.
   *
   * A fixed line down the middle is almost useless — whatever you want to
   * compare is never exactly there. Dragging it is the whole control, so the
   * button turns it on at the middle and the line itself is what you move.
   */
  const split = el('button', { class: 'vb-btn', id: 'vb-split', type: 'button',
    'aria-pressed': 'false',
    title: 'Split screen: graded on the left, the shot as it was on the right. Drag the line.' },
  'Split');
  split.addEventListener('click', () => {
    splitAt = splitAt > 0 ? 0 : 0.5;
    paintSplit();
    api?.redraw?.();
  });
  bar.append(split);
  return bar;
}

let splitAt = 0;

/**
 * Before and after, from the button or from the key.
 *
 * One function because the two used to differ: the button turned the split
 * screen off first and the key did not, so holding a key gave you a frame
 * carrying three different states with nothing saying which half was which.
 */
function setBypass(on) {
  if (on && splitAt > 0) { splitAt = 0; paintSplit(); }
  document.documentElement.classList.toggle('grade-off', on);
  const btn = $('#vb-bypass');
  if (btn) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  api?.redraw?.();
}

function paintSplit() {
  const btn = $('#vb-split');
  if (btn) {
    btn.classList.toggle('on', splitAt > 0);
    btn.setAttribute('aria-pressed', splitAt > 0 ? 'true' : 'false');
  }
  const handle = $('#split-handle');
  if (handle) {
    handle.hidden = !(splitAt > 0);
    handle.style.left = `${(splitAt * 100).toFixed(2)}%`;
  }
  api?.setCompare?.(splitAt);
}

/**
 * The line over the picture, in the picture's own space.
 *
 * It lives in the canvas wrapper rather than the viewer, so it tracks the
 * letterboxed picture rather than the grey around it — a split at 40% has to
 * be 40% of the shot, not 40% of the window.
 */
function buildSplitHandle() {
  const handle = el('div', { class: 'split-handle', id: 'split-handle', hidden: true,
    role: 'separator', 'aria-label': 'Split screen position', tabindex: '0' });
  handle.append(el('span', { class: 'sh-grip' }, '⇹'));

  const from = (ev, box) => {
    const x = (ev.clientX - box.left) / box.width;
    splitAt = Math.max(0.02, Math.min(0.98, x));
    paintSplit();
    api?.redraw?.();
  };
  handle.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const wrap = $('#canvas-wrap');
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    handle.setPointerCapture(ev.pointerId);
    const move = (e2) => from(e2, box);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  // Arrow keys, because a line you can only drag is a line somebody on a
  // trackpad cannot place accurately.
  handle.addEventListener('keydown', (ev) => {
    const step = ev.shiftKey ? 0.05 : 0.01;
    if (ev.key === 'ArrowLeft') splitAt = Math.max(0.02, splitAt - step);
    else if (ev.key === 'ArrowRight') splitAt = Math.min(0.98, splitAt + step);
    else return;
    ev.preventDefault();
    paintSplit();
    api?.redraw?.();
  });
  return handle;
}

function paintViewerBar() {
  const nameEl = $('#vb-name');
  if (!nameEl) return;
  const S = api?.state?.();
  const clip = gradeClip();
  if (!clip || !S) { nameEl.textContent = 'No shot'; return; }
  const name = mediaById(S.project, clip.mediaId)?.name || clip.kind || 'Clip';
  const index = S.project.clips
    .filter((c) => S.project.tracks.find((t) => t.id === c.trackId)?.kind === 'video')
    .sort((a, b) => a.start - b.start)
    .findIndex((c) => c.id === clip.id);
  nameEl.textContent = index >= 0 ? `${index + 1} · ${name}` : name;
  const tcEl = $('#vb-tc');
  if (tcEl) tcEl.textContent = $('#tc')?.textContent || '';
}

/* ------------------------------------------------------------------ */
/* the lightbox                                                        */
/* ------------------------------------------------------------------ */

function buildLightbox() {
  const box = el('section', { class: 'dock dock-lightbox', id: 'lightbox', 'aria-label': 'Lightbox' });
  box.append(
    el('div', { class: 'dock-h' }, el('b', {}, 'Lightbox'),
      el('span', { class: 'dock-sp' }),
      el('span', { class: 'tiny muted' }, 'Every shot at once — for spotting the one that does not match'),
      button('✕', 'lb-close', 'Close the lightbox')),
    el('div', { class: 'lb-grid', id: 'lb-grid' }),
  );
  box.addEventListener('click', (e) => {
    if (e.target.closest('#lb-close')) { setDock('lightbox', false); return; }
    const cell = e.target.closest('[data-clip]');
    if (!cell) return;
    const S = api?.state?.();
    const clip = S && clipById(S.project, cell.dataset.clip);
    if (!clip) return;
    api?.select?.([clip.id]);
    api?.seek?.(clip.start + clip.dur / 2);
    setDock('lightbox', false);
  });
  return box;
}

function paintLightbox() {
  const host = $('#lb-grid');
  if (!host || !document.documentElement.classList.contains('ws-lightbox')) return;
  const S = api?.state?.();
  if (!S) return;
  host.innerHTML = '';
  const clips = S.project.clips
    .filter((c) => S.project.tracks.find((t) => t.id === c.trackId)?.kind === 'video')
    .sort((a, b) => a.start - b.start);
  clips.forEach((clip, i) => {
    const cell = el('button', { class: 'lb-cell', type: 'button', 'data-clip': clip.id });
    const pic = el('span', { class: 'lb-pic' });
    const poster = mediaById(S.project, clip.mediaId)?.poster;
    if (poster) pic.style.backgroundImage = `url(${poster})`;
    cell.append(pic, el('i', {}, `${i + 1}`));
    host.append(cell);
  });
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

/**
 * Build the workspace and hand it the actions it is allowed to call.
 *
 * Everything it does to the project goes through `api`, which is main.js's own
 * actions table — the same one the menus and the keyboard use. A dock that
 * mutated the project directly would be a second way of doing the same thing,
 * with its own undo behaviour and its own bugs.
 */
export function initWorkspace(actions) {
  api = actions;
  loadPrefs();

  const ws = $('.workspace');
  if (!ws) return;
  /*
   * Gallery on the far left, nodes and scopes stacked on the far right.
   *
   * They go inside the workspace grid rather than around it, because the
   * workspace is what owns the horizontal division of the screen — a dock
   * added outside it would be a row, and a full-width row where a column
   * belongs is how a layout ends up with a viewer eighty pixels tall.
   */
  ws.prepend(buildGallery());
  const right = el('div', { class: 'dock-right', id: 'dock-right' });
  right.append(buildNodes(), buildScopes());
  ws.append(right);
  const viewer = $('#viewer');
  viewer?.parentNode.insertBefore(buildViewerBar(), viewer);
  $('#canvas-wrap')?.append(buildSplitHandle());
  const tl = $('#timeline');
  tl?.parentNode.insertBefore(buildStrip(), tl);
  tl?.parentNode.insertBefore(buildPrimaries(), tl);
  document.body.append(buildLightbox(), buildPageBar());

  /*
   * The dock toggles go on the page bar, not the top bar.
   *
   * They were in the top bar first, which is where a finishing application
   * usually puts them, and measuring it settled the argument: five more
   * buttons pushed the header's minimum width past 1600px, the body grid grew
   * to match, and every row in the app — timeline included — was 172px wider
   * than the window. Nothing looked broken until you noticed the horizontal
   * scrollbar and the viewer sitting off-centre.
   *
   * The page bar is the better home anyway. It is already the row that says
   * "this is the shape of the workspace", it has room, and it is next to the
   * pages the toggles are scoped to.
   */
  $('#pagebar .pb-right')?.prepend(buildToggles());

  /*
   * Alt+S for a serial node, and the page numbers.
   *
   * These are the two shortcuts the work actually leans on — a colourist adds
   * nodes constantly, and reaching for the mouse to change page breaks the
   * rhythm of comparing two shots.
   */
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    /*
     * None of these exist at Beginner, so none of them fire there.
     *
     * The listener is on the document because the controls it drives are in
     * four different places, and a shortcut that works when its button is not
     * on screen is a key that does something invisible.
     */
    if (!levels.allows('intermediate')) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); addNode(); return;
    }
    if (e.key === '\\' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setBypass(!document.documentElement.classList.contains('grade-off'));
      return;
    }
    if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && /^[1-7]$/.test(e.key)) {
      const p = PAGES[Number(e.key) - 1];
      if (p) { e.preventDefault(); setPage(p.id); }
    }
  });

  /*
   * Beginner gets no page at all, not a default one.
   *
   * Switching to a page opens that page's panel, and "the page bar is hidden
   * so the page cannot matter" is wrong: setting one at Beginner reached past
   * the hidden bar and swapped the Media panel the app had just opened for
   * the Effects panel. Beginner opens on Media, as it always has.
   */
  onLevelChange();
}

/**
 * Re-apply after the skill level changes.
 *
 * Levels are switched live from the top bar, so stepping up to Intermediate
 * has to bring the pages with it rather than waiting for a reload — and
 * stepping back down to Beginner has to put the single-screen layout back.
 */
export function onLevelChange() {
  if (!api) return;
  if (levels.allows('intermediate')) {
    setPage(PAGE_BY_ID[currentPage] ? currentPage : 'edit');
  } else {
    /*
     * Clear the dock classes as well as the page.
     *
     * They are only *displayed* at Intermediate and above, so leaving them on
     * looks harmless — until somebody remembers the Colour page, drops to
     * Beginner, and the html element is carrying four ws-* classes that mean
     * nothing there and would surprise the next thing to read them.
     */
    document.documentElement.removeAttribute('data-page');
    for (const d of DOCKS) document.documentElement.classList.remove(`ws-${d.id}`);
    /*
     * Put the viewer states back too.
     *
     * The split screen and the bypass live on the viewer bar, and the viewer
     * bar is not there at Beginner. Leaving either switched on strands it:
     * half a picture graded and half not, with the only control that turns it
     * off no longer on screen.
     */
    splitAt = 0;
    paintSplit();
    document.documentElement.classList.remove('grade-off');
    api.sizeCanvas?.();
    api.redraw?.();
  }
}

/** Repaint everything the docks show. Cheap; safe to call on any change. */
export function refresh() {
  if (!api) return;
  // The scope is a picture of the current frame, so it is stale the moment
  // anything changes — not only while the transport is running.
  paintScope();
  paintViewerBar();
  paintPrimaries();
  if (document.documentElement.classList.contains('ws-nodes')) paintNodes();
  if (document.documentElement.classList.contains('ws-gallery')) paintGallery();
  if (document.documentElement.classList.contains('ws-strip')) paintStrip();
  if (document.documentElement.classList.contains('ws-lightbox')) paintLightbox();
}

/** Called every frame while playing: only the cheap, always-changing parts. */
export function onFrame() {
  paintScope();
  paintViewerBar();
  if (document.documentElement.classList.contains('ws-strip')) {
    // Only the highlight moves during playback; rebuilding the strip sixty
    // times a second would be absurd for a row of static thumbnails.
    const S = api?.state?.();
    if (!S) return;
    for (const cell of $$('#st-row [data-clip]')) {
      const clip = clipById(S.project, cell.dataset.clip);
      if (!clip) continue;
      cell.classList.toggle('live', S.time >= clip.start && S.time < clip.start + clip.dur);
    }
  }
}
