/*
 * Boot and glue.
 *
 * Holds the one piece of mutable state everything else reads (`S`), and the
 * one set of functions everything else calls to change it (`actions`). Panels
 * never touch the project directly and never repaint each other; they mutate
 * through actions and actions decides what needs redrawing. That is the whole
 * architecture, and it is why adding a panel is a file rather than a surgery.
 */

import { $, $$, toast, tc, confirmDialog, clamp } from './ui.js';
import * as store from './store.js';
import * as levels from './levels.js';
import * as licence from './licence.js';
import { History } from './engine/history.js';
import {
  newProject, deserialize, serialize, duration, clipById, mediaById,
  splitClip, removeClips, duplicateClips, addClip, addTrack, RATIOS, nextFreeStart,
} from './engine/project.js';
import { Renderer } from './engine/render.js';
import { Transport } from './engine/playback.js';
import { AudioEngine } from './engine/audio.js';
import * as preview from './engine/preview.js';
import { CHECK_RATIOS, drawCheck, lossFor } from './engine/multiframe.js';
import { tagVideo } from './engine/tags.js';
import * as media from './engine/media.js';
import { TimelineUI } from './timeline-ui.js';
import { openPanel, refreshPanel, closePanel, panelIsOverlay, PANELS } from './panels/index.js';
import { initMobile } from './mobile.js';
import { openPalette } from './palette.js';
import { maybeOfferTour, startTour } from './tutorial.js';
import { openExport } from './panels/export.js';
import { wireDesktop, isDesktop } from './desktop.js';
import { startUpdateChecks, BUILD } from './updates.js';

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

export const S = {
  project: newProject(),
  history: null,
  sel: new Set(),
  time: 0,
  zoom: 60,             // pixels per second
  snap: true,
  ripple: true,
  tool: 'select',
  playing: false,
  panel: 'media',
  saving: false,
  previewScale: 1,
  beats: null,          // cached beat detection for the current music track
};

let renderer = null;
let transport = null;
let audio = null;
let timeline = null;
let saveTimer = null;

export const engine = {
  get renderer() { return renderer; },
  get transport() { return transport; },
  get audio() { return audio; },
  get timeline() { return timeline; },
};

/* ------------------------------------------------------------------ */
/* actions — the only way the project changes                          */
/* ------------------------------------------------------------------ */

export const actions = {

  /** Record a change, repaint, and start the autosave clock. */
  commit(label = 'Edit', coalesceKey = null) {
    S.history.push(S.project, label, coalesceKey);
    S.project.updatedAt = Date.now();
    store.markDirty(S.project);
    actions.refresh();
    scheduleSave();
  },

  /** Repaint everything that reads from the project. */
  refresh() {
    transport.setDuration(duration(S.project));
    timeline.render();
    drawFrame();
    refreshPanel();
    paintTransport();
    paintUndo();
  },

  seek(t, opts = {}) {
    transport.seek(t, opts);
    S.time = transport.time;
    timeline.renderPlayhead();
    drawFrame(opts.scrub);
    paintTransport();
  },

  select(ids) {
    S.sel = new Set(ids.filter(Boolean));
    timeline.render();
    refreshPanel();
  },

  setTool(tool) {
    S.tool = tool;
    $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    document.body.style.cursor = tool === 'razor' ? 'crosshair' : '';
  },

  /* ---------------- media ---------------- */

  async importFiles(fileList, { silent = false } = {}) {
    const files = [...fileList];
    if (!files.length) return;
    let added = 0;
    for (const file of files) {
      try {
        // eslint-disable-next-line no-await-in-loop -- one at a time keeps the UI alive
        const rec = await media.importFile(file, {
          onProgress: (phase) => { if (!silent) toast(`${file.name} — ${phase}…`, '', 900); },
        });
        if (rec.kind === 'audio' || rec.hasAudio) {
          // eslint-disable-next-line no-await-in-loop
          const buffer = await media.decode(rec);
          if (buffer) rec.peaks = media.peaks(buffer, 900);
          if (rec.kind === 'audio' && buffer) S.beats = media.detectBeats(buffer);
        }
        S.project.media.push(rec);
        added++;
      } catch (err) {
        toast(err.message, 'bad', 5000);
      }
    }
    if (!added) return;
    actions.commit(`Import ${added} file${added === 1 ? '' : 's'}`);
    /*
     * Point the effect and look previews at the footage that was just added.
     *
     * A preview of a stock frame tells you what a grade does in general. A
     * preview of your own shot tells you whether it suits *this* footage,
     * which is the question anyone is actually asking when they open the
     * colour panel. Costs nothing — the frame already exists as the poster.
     */
    /*
     * Work out what each clip contains, after the import has already
     * finished. Deliberately not awaited: tagging seeks through the file a
     * few times, and making somebody wait for that before they can start
     * cutting would trade a real second of their time for a convenience.
     */
    tagNewMedia(files.length);

    const firstPoster = S.project.media.find((m) => m.poster)?.poster;
    if (firstPoster) {
      const img = new Image();
      img.onload = () => preview.useProjectFrame(img);
      img.src = firstPoster;
    }
    $('#drop-hint')?.classList.add('hide');
    if (!silent) {
      if (S.panel !== 'media') openPanel('media');
      toast(`${added} file${added === 1 ? '' : 's'} added`, 'ok');
    }
  },

  /** Drop a media item onto a track at a given time. */
  dropMedia(mediaId, trackId, at) {
    const rec = mediaById(S.project, mediaId);
    const track = S.project.tracks.find((t) => t.id === trackId);
    if (!rec || !track) return;
    const wantsAudio = rec.kind === 'audio';
    if (wantsAudio !== (track.kind === 'audio')) {
      toast(wantsAudio ? 'Audio goes on an audio track' : 'Video goes on a video track', 'bad');
      return;
    }
    const start = nextFreeStart(S.project, trackId, Math.max(0, at), rec.duration);
    addClip(S.project, { mediaId, trackId, start, dur: rec.duration, in: 0 });
    actions.commit(`Add ${rec.name}`);
  },

  /** Append to the end of the first suitable track — the double-click path. */
  appendMedia(mediaId) {
    const rec = mediaById(S.project, mediaId);
    if (!rec) return;
    const kind = rec.kind === 'audio' ? 'audio' : 'video';
    let track = S.project.tracks.find((t) => t.kind === kind);
    if (!track) track = addTrack(S.project, kind);
    const start = nextFreeStart(S.project, track.id, 0, rec.duration);
    addClip(S.project, { mediaId, trackId: track.id, start, dur: rec.duration, in: 0 });
    actions.commit(`Add ${rec.name}`);
  },

  removeMedia(mediaId) {
    const used = S.project.clips.filter((c) => c.mediaId === mediaId);
    if (used.length) removeClips(S.project, used.map((c) => c.id));
    S.project.media = S.project.media.filter((m) => m.id !== mediaId);
    media.releaseFor(mediaId);
    actions.commit('Remove media');
  },

  /* ---------------- editing ---------------- */

  splitAtPlayhead() {
    const under = S.project.clips
      .filter((c) => S.time > c.start && S.time < c.start + c.dur)
      .map((c) => c.id);
    // Prefer the selection, but only the part of it the playhead is actually
    // over. Selecting a clip elsewhere should not stop S from cutting the one
    // you are looking at.
    const selectedUnder = [...S.sel].filter((id) => under.includes(id));
    const targets = selectedUnder.length ? selectedUnder : under;
    let count = 0;
    for (const id of targets) {
      if (splitClip(S.project, id, S.time)) count++;
    }
    if (!count) { toast('Park the playhead over a clip to split it'); return; }
    actions.commit(`Split ${count} clip${count === 1 ? '' : 's'}`);
  },

  deleteSelected() {
    if (!S.sel.size) return;
    removeClips(S.project, [...S.sel], { ripple: S.ripple });
    S.sel.clear();
    actions.commit('Delete clips');
  },

  duplicateSelected() {
    if (!S.sel.size) return;
    const made = duplicateClips(S.project, [...S.sel]);
    S.sel = new Set(made.map((c) => c.id));
    actions.commit('Duplicate clips');
  },

  addMarker() {
    S.project.markers.push({ t: S.time, label: `Marker ${S.project.markers.length + 1}`, color: '#ffc247' });
    actions.commit('Add marker');
  },

  /** Change one field on every selected clip. Used by every inspector control. */
  patchSelected(fn, label, coalesceKey) {
    if (!S.sel.size) return;
    for (const id of S.sel) {
      const clip = clipById(S.project, id);
      if (clip) fn(clip);
    }
    actions.commit(label, coalesceKey);
  },

  undo() {
    const doc = S.history.undo();
    if (!doc) return;
    adoptDocument(doc);
    toast(`Undid: ${S.history.redoLabel || 'change'}`);
  },

  redo() {
    const doc = S.history.redo();
    if (!doc) return;
    adoptDocument(doc);
  },

  historyGoTo(i) {
    const doc = S.history.goTo(i);
    if (doc) adoptDocument(doc);
  },

  /* ---------------- project ---------------- */

  setRatio(ratio) {
    const r = RATIOS[ratio];
    if (!r) return;
    S.project.settings.ratio = ratio;
    S.project.settings.width = r.w;
    S.project.settings.height = r.h;
    sizeCanvas();
    actions.commit(`Canvas ${ratio}`);
  },

  async newProject() {
    if (!await confirmDialog({
      title: 'Start a new project?',
      body: 'This one is saved and stays in your project list.',
      confirmText: 'New project',
    })) return;
    await saveNow();
    media.releaseAll();
    S.project = newProject();
    S.sel.clear();
    S.beats = null;
    S.history.reset(S.project, 'New project');
    sizeCanvas();
    actions.seek(0);
    actions.refresh();
    paintName();
  },

  async openProject(id) {
    const doc = await store.loadProject(id);
    if (!doc) { toast('That project could not be found', 'bad'); return; }
    await loadDocument(doc);
    toast(`Opened ${doc.name}`, 'ok');
  },

  saveNow,
  loadDocument,
  exportProjectFile() {
    const json = serialize(S.project);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${S.project.name.replace(/[^\w-]+/g, '-')}.omnidx.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Project file saved — it opens on any machine', 'ok');
  },
};

/* ------------------------------------------------------------------ */
/* document lifecycle                                                  */
/* ------------------------------------------------------------------ */

/**
 * Swap in a document from the history stack.
 *
 * Nothing has to be carried across: blobs, object URLs and decoded audio live
 * in media.js keyed by media id, not on the document, so an undo cannot strand
 * a clip's footage.
 */
function adoptDocument(doc) {
  S.project = doc;
  S.sel = new Set([...S.sel].filter((id) => clipById(doc, id)));
  sizeCanvas();
  actions.refresh();
  store.markDirty(S.project);
  scheduleSave();
}

async function loadDocument(doc) {
  media.releaseAll();
  const project = deserialize(doc);
  for (const m of project.media) {
    // eslint-disable-next-line no-await-in-loop -- IndexedDB reads are sequential anyway
    await media.rehydrate(m);
    if (m.hasAudio || m.kind === 'audio') {
      // eslint-disable-next-line no-await-in-loop
      const buffer = await media.decode(m);
      if (buffer) m.peaks = media.peaks(buffer, 900);
      if (m.kind === 'audio' && buffer && !S.beats) S.beats = media.detectBeats(buffer);
    }
  }
  const missing = project.media.filter((m) => m.missing);
  S.project = project;
  S.sel.clear();
  S.history.reset(project, 'Opened project');
  sizeCanvas();
  actions.seek(0);
  actions.refresh();
  paintName();
  $('#drop-hint')?.classList.toggle('hide', project.media.length > 0);
  if (missing.length) {
    toast(`${missing.length} file${missing.length === 1 ? '' : 's'} could not be found — re-import to relink`, 'bad', 6000);
  }
}

/* ------------------------------------------------------------------ */
/* saving                                                              */
/* ------------------------------------------------------------------ */
/* Five seconds. Every other editor's default is minutes and every one of them
   has a forum thread full of people who lost work to it. */

const AUTOSAVE_MS = 5000;

function scheduleSave() {
  paintSaved('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, AUTOSAVE_MS);
}

async function saveNow() {
  clearTimeout(saveTimer);
  if (S.saving) return;
  S.saving = true;
  try {
    await store.saveProject(S.project);
    store.clearDirty();
    paintSaved('ok');
    await store.pref('lastProject', S.project.id);
  } catch (err) {
    paintSaved('bad');
    toast(`Could not save: ${err.message}`, 'bad', 6000);
  } finally {
    S.saving = false;
  }
}

function paintSaved(state) {
  const dot = $('#saved-dot');
  if (!dot) return;
  dot.className = `saved ${state === 'ok' ? 'ok' : state === 'saving' ? 'saving' : ''}`;
  dot.textContent = state === 'saving' ? 'Saving…' : state === 'bad' ? 'Not saved' : 'Saved';
}

/* ------------------------------------------------------------------ */
/* preview                                                             */
/* ------------------------------------------------------------------ */

function sizeCanvas() {
  const { width, height } = S.project.settings;
  // A 4K preview on a 500px viewer is wasted work; cap the long edge and let
  // the export use full resolution.
  const quality = $('#quality')?.value || 'auto';
  const cap = quality === 'full' ? Infinity : quality === 'half' ? 640 : 1080;
  const scale = Math.min(1, cap / Math.max(width, height));
  S.previewScale = scale;
  renderer.resize(Math.round(width * scale), Math.round(height * scale));

  const canvas = $('#preview');
  canvas.style.aspectRatio = `${width} / ${height}`;
  const wrap = $('#canvas-wrap');
  wrap.style.aspectRatio = `${width} / ${height}`;
  const ratio = S.project.settings.ratio;
  $('#ratio').value = ratio;
  drawFrame();
}

function drawFrame(scrub = false) {
  if (!renderer) return;
  // Beat-reactive effects need the grid; the renderer reads it rather than
  // being handed it on every one of sixty frames a second.
  renderer.beats = S.beats;
  renderer.fps = S.project.settings.fps;
  renderer.draw(S.project, S.time, { playing: S.playing || scrub });
  if (!$('#ratio-check')?.hidden) paintRatioCheck();
}

/* ------------------------------------------------------------------ *
 * The all-platforms strip
 * ------------------------------------------------------------------ */

/**
 * Build the boxes once.
 *
 * Each is a canvas at a fixed small size with the target ratio's own shape, so
 * a 9:16 check is tall and a 16:9 one is wide — seeing the actual shape is half
 * of what makes the comparison land.
 */
function buildRatioCheck() {
  const row = $('#rc-row');
  if (!row || row.childElementCount) return;
  for (const ratio of CHECK_RATIOS) {
    const [rw, rh] = ratio.split(':').map(Number);
    const box = document.createElement('div');
    box.className = 'rc-box';
    const cv = document.createElement('canvas');
    // A fixed area rather than a fixed width, so a tall 9:16 and a wide 16:9
    // take comparable room instead of the vertical one towering over the rest.
    const area = 128 * 128;
    const scale = Math.sqrt(area / (rw * rh));
    cv.width = Math.round(rw * scale) * 2;
    cv.height = Math.round(rh * scale) * 2;
    cv.dataset.ratio = ratio;
    box.append(cv);
    const cap = document.createElement('span');
    cap.className = 'rc-cap';
    box.append(cap);
    row.append(box);
  }
}

/**
 * Repaint them from the frame that is already on screen.
 *
 * The viewer's canvas is the source, so this costs three small draws rather
 * than three more renders of the timeline — which is what makes it cheap
 * enough to leave on during playback.
 */
function paintRatioCheck() {
  const src = renderer?.canvas || $('#preview');
  if (!src || !src.width) return;
  for (const cv of $$('#rc-row canvas')) {
    const ratio = cv.dataset.ratio;
    drawCheck(cv, src, ratio);
    const cap = cv.parentElement.querySelector('.rc-cap');
    if (!cap) continue;
    const loss = lossFor(src.width, src.height, ratio);
    // Only mention the loss when it is worth acting on. "0% cut" on the ratio
    // you are already working in is noise on every single frame.
    cap.textContent = loss > 0.02
      ? `${ratio} — ${Math.round(loss * 100)}% cut off`
      : `${ratio} — fits`;
    cap.classList.toggle('rc-warn', loss > 0.25);
  }
}

/**
 * Tag the most recently imported clips in the background.
 *
 * Failures are silent on purpose. A tag is a convenience for finding things
 * later; a clip that could not be analysed still imports, still plays and
 * still cuts, and interrupting somebody with an error about a label would be
 * out of all proportion to what was lost.
 */
async function tagNewMedia(count) {
  const recent = S.project.media.slice(-count).filter((m) => m.kind === 'video' && !m.tags);
  for (const rec of recent) {
    try {
      const node = media.elementFor(rec, `tag_${rec.id}`);
      // eslint-disable-next-line no-await-in-loop -- one file at a time
      const { tags, stats } = await tagVideo(node);
      rec.tags = tags;
      rec.stats = stats;
      refreshPanel();
    } catch { /* a clip without tags is still a clip */ }
  }
}

function paintTransport() {
  const fps = S.project.settings.fps;
  $('#tc').textContent = tc(S.time, fps);
  $('#tc-total').textContent = tc(duration(S.project), fps);
  $('#tp-play').textContent = S.playing ? '❚❚' : '▶';
}

function paintUndo() {
  const u = $('#btn-undo'), r = $('#btn-redo');
  u.disabled = !S.history.canUndo;
  r.disabled = !S.history.canRedo;
  u.title = S.history.canUndo ? `Undo ${S.history.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
  r.title = S.history.canRedo ? `Redo ${S.history.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo';
}

function paintName() {
  $('#proj-name').value = S.project.name;
}

export function paintAccount() {
  $('#acct-lbl').textContent = licence.editionName();
}

/* ------------------------------------------------------------------ */
/* keyboard                                                            */
/* ------------------------------------------------------------------ */

const PANEL_KEYS = ['media', 'ai', 'templates', 'effects', 'color', 'text', 'audio', 'captions', 'settings'];

function onKey(e) {
  const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (typing) return;

  if (mod) {
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); e.shiftKey ? actions.redo() : actions.undo(); return; }
    if (k === 'y') { e.preventDefault(); actions.redo(); return; }
    if (k === 'd') { e.preventDefault(); actions.duplicateSelected(); return; }
    if (k === 's') { e.preventDefault(); saveNow().then(() => toast('Saved', 'ok')); return; }
    if (k === 'e') { e.preventDefault(); openExport(); return; }
    if (k === 'o') { e.preventDefault(); openPanel('settings'); return; }
    if (k === 'a') { e.preventDefault(); actions.select(S.project.clips.map((c) => c.id)); return; }
    return;
  }

  const fps = S.project.settings.fps;
  switch (e.key) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': e.preventDefault(); transport.step(e.shiftKey ? -fps : -1, fps); syncAfterStep(); break;
    case 'ArrowRight': e.preventDefault(); transport.step(e.shiftKey ? fps : 1, fps); syncAfterStep(); break;
    case 'Home': e.preventDefault(); actions.seek(0); break;
    case 'End': e.preventDefault(); actions.seek(duration(S.project)); break;
    case 'Delete': case 'Backspace': e.preventDefault(); actions.deleteSelected(); break;
    case 's': case 'S': actions.splitAtPlayhead(); break;
    case 'c': case 'C': actions.setTool(S.tool === 'razor' ? 'select' : 'razor'); break;
    case 'v': case 'V': actions.setTool('select'); break;
    case 'm': case 'M': actions.addMarker(); break;
    case '+': case '=': setZoom(S.zoom * 1.4); break;
    case '-': case '_': setZoom(S.zoom / 1.4); break;
    case 'Escape': actions.select([]); break;
    default:
      if (/^[1-9]$/.test(e.key)) openPanel(PANEL_KEYS[Number(e.key) - 1]);
  }
}

function syncAfterStep() {
  S.time = transport.time;
  timeline.renderPlayhead();
  drawFrame();
  paintTransport();
}

function togglePlay() {
  audio.ensure();
  audio.resume();
  transport.toggle();
}

function setZoom(v) {
  S.zoom = clamp(v, 8, 400);
  $('#zoom').value = String(Math.round(S.zoom));
  timeline.render();
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

function wireChrome() {
  // panels
  $('#rail').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-panel]');
    if (btn) openPanel(btn.dataset.panel);
  });

  // On a phone, touching the picture puts the panel away.
  $('#viewer').addEventListener('pointerdown', () => { if (panelIsOverlay()) closePanel(); });

  // transport
  $('#tp-play').addEventListener('click', togglePlay);
  $('#tp-start').addEventListener('click', () => actions.seek(0));
  $('#tp-end').addEventListener('click', () => actions.seek(duration(S.project)));
  $('#tp-back').addEventListener('click', () => { transport.step(-1, S.project.settings.fps); syncAfterStep(); });
  $('#tp-fwd').addEventListener('click', () => { transport.step(1, S.project.settings.fps); syncAfterStep(); });
  $('#tg-safe').addEventListener('change', (e) => { $('#safe').hidden = !e.target.checked; });

  /*
   * The all-platforms strip.
   *
   * Built once when it is first switched on and then only repainted, because
   * rebuilding three canvases and their labels on every frame of playback is
   * work the browser does not need to do to show the same three boxes.
   */
  $('#tg-ratios')?.addEventListener('change', (e) => {
    const panel = $('#ratio-check');
    panel.hidden = !e.target.checked;
    if (e.target.checked) { buildRatioCheck(); paintRatioCheck(); }
  });
  $('#rc-close')?.addEventListener('click', () => {
    $('#ratio-check').hidden = true;
    const box = $('#tg-ratios');
    if (box) box.checked = false;
  });
  $('#ratio').addEventListener('change', (e) => actions.setRatio(e.target.value));
  $('#quality').addEventListener('change', sizeCanvas);

  // timeline toolbar
  $('#tl-split').addEventListener('click', () => actions.splitAtPlayhead());
  $('#tl-delete').addEventListener('click', () => actions.deleteSelected());
  $('#tl-dup').addEventListener('click', () => actions.duplicateSelected());
  $('#tl-marker').addEventListener('click', () => actions.addMarker());
  $('#tg-snap').addEventListener('change', (e) => { S.snap = e.target.checked; });
  $('#tg-ripple').addEventListener('change', (e) => { S.ripple = e.target.checked; });
  $$('[data-tool]').forEach((b) => b.addEventListener('click', () => actions.setTool(b.dataset.tool)));
  $('#zoom').addEventListener('input', (e) => setZoom(Number(e.target.value)));
  $('#zoom-in').addEventListener('click', () => setZoom(S.zoom * 1.4));
  $('#zoom-out').addEventListener('click', () => setZoom(S.zoom / 1.4));
  $('#zoom-fit').addEventListener('click', () => {
    const total = Math.max(1, duration(S.project));
    setZoom(($('#tl-scroll').clientWidth - 30) / total);
  });

  // top bar
  $('#btn-undo').addEventListener('click', () => actions.undo());
  $('#btn-redo').addEventListener('click', () => actions.redo());
  $('#btn-palette').addEventListener('click', openPalette);
  $('#btn-export').addEventListener('click', openExport);
  $('#btn-projects').addEventListener('click', () => openPanel('settings'));
  $('#btn-account').addEventListener('click', () => openPanel('settings'));
  $('#btn-theme').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('omnidx.theme', next); } catch { /* private mode */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#eef2fa' : '#04060d');
    drawFrame();
  });

  $('#proj-name').addEventListener('change', (e) => {
    S.project.name = e.target.value.trim() || 'Untitled project';
    e.target.value = S.project.name;
    actions.commit('Rename project');
  });

  // level switch
  $$('#level-switch button').forEach((b) => b.addEventListener('click', () => {
    levels.set(b.dataset.level);
    paintLevel();
    refreshPanel();
    toast(`${levels.DESCRIPTIONS[b.dataset.level].name} — ${levels.DESCRIPTIONS[b.dataset.level].line}`, '', 3400);
  }));

  // importing
  $('#file-input').addEventListener('change', (e) => {
    actions.importFiles(e.target.files);
    e.target.value = '';
  });
  $('#btn-import-hero').addEventListener('click', () => $('#file-input').click());
  $('#tl-import')?.addEventListener('click', () => $('#file-input').click());

  const wrap = $('#canvas-wrap');
  ['dragenter', 'dragover'].forEach((type) => wrap.addEventListener(type, (e) => {
    e.preventDefault(); wrap.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((type) => wrap.addEventListener(type, (e) => {
    e.preventDefault(); wrap.classList.remove('dragover');
  }));
  wrap.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) actions.importFiles(e.dataTransfer.files);
  });
  // Dropping anywhere else in the window should work too, but must not hijack
  // a drag that started inside the app.
  document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    if (e.target.closest('.tl-track')) return;
    e.preventDefault();
    actions.importFiles(e.dataTransfer.files);
  });

  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => timeline.render());

  // Never lose work to a closed tab — and never mistake a reload for a crash.
  // pagehide runs when the tab closes or navigates away; it does not run when
  // the tab is killed, which is exactly the distinction we want.
  window.addEventListener('pagehide', () => { saveNow(); store.markClean(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
}

function paintLevel() {
  const level = levels.current();
  $$('#level-switch button').forEach((b) => b.classList.toggle('on', b.dataset.level === level));
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

(async function boot() {
  levels.apply();
  paintLevel();
  paintAccount();

  renderer = new Renderer($('#preview'));
  audio = new AudioEngine();
  S.history = new History(S.project, 'New project');

  transport = new Transport({
    onFrame: (t, playing) => {
      S.time = t;
      S.playing = playing;
      renderer.beats = S.beats;
      renderer.draw(S.project, t, { playing });
      audio.sync(S.project, t, playing);
      timeline.renderPlayhead();
      $('#tc').textContent = tc(t, S.project.settings.fps);
    },
    onStateChange: (tp) => {
      S.playing = tp.playing;
      if (!tp.playing) audio.stopAll();
      paintTransport();
    },
  });

  timeline = new TimelineUI({ state: S, actions });
  // A seek that lands after its frame decodes should repaint, not sit stale.
  renderer.onNeedsRedraw = () => { if (!S.playing) drawFrame(); };

  wireChrome();
  sizeCanvas();

  /*
   * On a desktop the media panel is a column beside the video, so opening it is
   * free. On a phone it is a sheet over the video, so opening it at launch
   * greets someone with their own footage hidden behind a file list — and the
   * way out is to press the same tab again, which nobody thinks to try.
   * The panel is still mounted and one tap away; it just is not in the way.
   */
  openPanel('media');
  if (panelIsOverlay()) closePanel();

  // No-op in a browser; hooks up the native menus in the desktop build.
  wireDesktop({
    actions, openPanel, startTour, openExport, openPalette,
    setLevel: (level) => {
      levels.set(level);
      paintLevel();
      refreshPanel();
    },
  });

  await store.persist();

  // The splash goes now, not after the restore prompt: a dialog on top of a
  // loading screen with no app behind it looks like something has hung.
  actions.refresh();
  paintName();
  paintSaved('ok');
  $('#splash')?.classList.add('gone');

  /* ---- crash recovery ---- */
  const crashed = store.recoverable();
  if (crashed && crashed.doc?.clips?.length) {
    const restore = await confirmDialog({
      title: 'Pick up where you left off?',
      body: `"${crashed.name}" was open when this tab closed, ${
        Math.round((Date.now() - crashed.at) / 60000)} minutes ago. Nothing was lost.`,
      confirmText: 'Restore it',
      cancelText: 'Start fresh',
    });
    if (restore) {
      await loadDocument(crashed.doc);
    } else {
      store.clearDirty();
    }
  } else {
    const lastId = await store.pref('lastProject');
    if (lastId) {
      const doc = await store.loadProject(lastId);
      if (doc) await loadDocument(doc);
    }
  }

  actions.refresh();
  paintName();
  paintSaved('ok');

  // Touch gestures and bottom-sheet behaviour. Only does anything on a phone,
  // and is handed the zoom controls so a pinch can drive the same state the
  // toolbar slider does rather than keeping a second copy of it.
  initMobile({ setZoom, getZoom: () => S.zoom });

  maybeOfferTour();
  startUpdateChecks();

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('An update is ready — it applies next time you open the app');
          }
        });
      });
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }
})();

/* Panels and the palette import these rather than reaching into the DOM. */
export { openPanel, refreshPanel, closePanel, PANELS, startTour, isDesktop, BUILD, sizeCanvas, drawFrame, setZoom, togglePlay };
