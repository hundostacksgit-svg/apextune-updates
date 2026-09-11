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
import * as auth from '../../assets/auth.js';
import { History } from './engine/history.js';
import {
  newProject, deserialize, serialize, duration, clipById, mediaById,
  splitClip, removeClips, duplicateClips, addClip, addTrack, RATIOS, nextFreeStart,
  trackById, removeTrack, closeGaps, clipsOn, moveClip,
} from './engine/project.js';
import { Renderer } from './engine/render.js';
import { Transport } from './engine/playback.js';
import { AudioEngine } from './engine/audio.js';
import * as preview from './engine/preview.js';
import { CHECK_RATIOS, drawCheck, lossFor } from './engine/multiframe.js';
import { tagVideo } from './engine/tags.js';
import { initMenubar } from './menubar.js';
import { initHistoryUi, showDid, openHistory, paintUndoButtons } from './history-ui.js';
import { initTips, applyTipsForLevel, setTips, tipsOn } from './tips.js';
import { initMoreSheet } from './more-sheet.js';
import { initMaskUi, paintMaskUi } from './mask-ui.js';
import { mattePreview } from './panels/masks.js';
import { initContextMenus, attach as attachMenu } from './context-menu.js';
import { mediaMenu, viewerMenu } from './menus.js';
import * as media from './engine/media.js';
import { TimelineUI } from './timeline-ui.js';
import * as kf from './keyframes-ui.js';
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

/* Clips cut or copied, as plain data. Lives for the session only — a clipboard
   that survived a reload would paste clips whose media is no longer loaded. */
let clipboard = [];

export const actions = {

  /** Record a change, repaint, and start the autosave clock. */
  commit(label = 'Edit', coalesceKey = null) {
    S.history.push(S.project, label, coalesceKey);
    S.project.updatedAt = Date.now();
    store.markDirty(S.project);
    actions.refresh();
    scheduleSave();
    /*
     * Tell the person what just happened, with a way back.
     *
     * Not for the continuous things. A coalesce key means this is one frame of
     * a drag, and a bar that reappears sixty times a second is a flicker, not
     * reassurance — those land as one history entry anyway, so the bar shows
     * once when the drag is over.
     */
    if (!coalesceKey) showDid(label);
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
    // The timeline carries the class so the cursor can change per region —
    // one cursor for the whole document cannot say "roll here, slip there".
    $('#timeline')?.classList.toggle('trimming', tool === 'trim');
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

  /* ---------------- clipboard ---------------- */

  /*
   * Clips are copied as plain data, not as references.
   *
   * A reference would paste a clip that shares its effects object with the
   * original, so grading the copy would silently grade the thing it came from
   * — the kind of bug that looks like the app forgetting your work. The media
   * itself is not copied, only the id: pasting is cheap and nothing is
   * duplicated on disk.
   */
  copySelected() {
    if (!S.sel.size) return 0;
    const picked = [...S.sel].map((id) => clipById(S.project, id)).filter(Boolean);
    if (!picked.length) return 0;
    const base = Math.min(...picked.map((c) => c.start));
    clipboard = picked.map((c) => ({
      ...structuredClone({ ...c, id: undefined }),
      offset: c.start - base,
    }));
    toast(`${clipboard.length} clip${clipboard.length === 1 ? '' : 's'} copied`);
    return clipboard.length;
  },

  cutSelected() {
    const n = actions.copySelected();
    if (!n) return 0;
    removeClips(S.project, [...S.sel], { ripple: S.ripple });
    S.sel.clear();
    actions.commit(`Cut ${n} clip${n === 1 ? '' : 's'}`);
    return n;
  },

  hasClipboard() { return clipboard.length > 0; },

  /**
   * Paste at a time, on a track — defaulting to the playhead and the track the
   * clips came from. Lands somewhere free rather than on top of what is there.
   */
  pasteAt(at = S.time, trackId = null) {
    if (!clipboard.length) return 0;
    const made = [];
    for (const rec of clipboard) {
      const { offset, ...rest } = rec;
      const target = trackId || rec.trackId;
      const track = trackById(S.project, target) || S.project.tracks[0];
      const want = Math.max(0, at + offset);
      const clip = addClip(S.project, {
        mediaId: rest.mediaId, trackId: track.id,
        start: nextFreeStart(S.project, track.id, want, rest.dur),
        dur: rest.dur, in: rest.in, kind: rest.kind,
        text: rest.text, sticker: rest.sticker,
      });
      // Everything the clip carried, over the fresh identity.
      Object.assign(clip, structuredClone({
        ...rest, id: clip.id, trackId: clip.trackId, start: clip.start,
      }));
      made.push(clip);
    }
    S.sel = new Set(made.map((c) => c.id));
    actions.commit(`Paste ${made.length} clip${made.length === 1 ? '' : 's'}`);
    return made.length;
  },

  /**
   * An adjustment layer over whatever is selected, or over the whole edit.
   *
   * Goes on its own layer above the clips it treats, because that is what
   * decides what it reaches — anything on a higher layer is drawn afterwards
   * and stays untouched.
   */
  addAdjustment() {
    const spans = [...S.sel].map((id) => clipById(S.project, id)).filter(Boolean);
    const from = spans.length ? Math.min(...spans.map((c) => c.start)) : 0;
    const to = spans.length
      ? Math.max(...spans.map((c) => c.start + c.dur))
      : Math.max(1, duration(S.project));

    // Straight to the top: an adjustment layer treats everything below it, so
    // "below it" should mean the whole edit unless somebody moves it.
    const track = actions.addLayer('video');
    track.name = 'Adjustment';

    const clip = addClip(S.project, {
      mediaId: null, trackId: track.id, start: from, dur: Math.max(0.2, to - from),
      in: 0, kind: 'adjust',
    });
    clip.label = 'Adjustment';
    S.sel = new Set([clip.id]);
    actions.commit('Add an adjustment layer');
    openPanel('color');
    return clip;
  },

  /**
   * Find the cuts inside a clip and split it at them.
   *
   * For footage that was already edited once: an export, a download, anything
   * flat that used to be a sequence. Scans it, shows what it found, and only
   * then cuts — a tool that silently puts forty splits into a timeline is one
   * you have to undo before you can judge it.
   */
  async detectScenes(clipId = null) {
    const clip = clipId ? clipById(S.project, clipId)
      : [...S.sel].map((id) => clipById(S.project, id)).find(Boolean);
    if (!clip) { toast('Select a clip first', 'bad'); return 0; }
    const rec = mediaById(S.project, clip.mediaId);
    if (rec?.kind !== 'video') { toast('Scene detection needs a video clip', 'bad'); return 0; }

    const node = media.elementFor(rec, clip.id);
    if (!node?.videoWidth) { toast('That clip is still loading', 'bad'); return 0; }

    toast('Looking for cuts…');
    try {
      const { findCuts, splitAtCuts } = await import('./engine/scenes.js');
      const cuts = await findCuts(node, {
        from: clip.in,
        to: clip.in + clip.dur * (clip.speed || 1),
      });
      if (!cuts.length) {
        toast('No hard cuts found in that clip. Dissolves and fades are not detected.', '', 5200);
        return 0;
      }
      const made = splitAtCuts(S.project, clip.id, cuts, splitClip);
      if (made) {
        actions.commit(`Split at ${made} cut${made === 1 ? '' : 's'}`);
        toast(`Found ${made} cut${made === 1 ? '' : 's'} and split there. Undo takes it all back.`, 'ok', 4600);
      } else {
        toast('The cuts it found are all outside this clip\u2019s trimmed range.', '', 4600);
      }
      return made;
    } catch (err) {
      if (!/stopped/i.test(err.message || '')) toast(err.message || 'Could not scan that clip', 'bad', 5000);
      return 0;
    }
  },

  /* ---------------- tracks ---------------- */

  addLayer(kind = 'video', { above = null } = {}) {
    const track = addTrack(S.project, kind);
    if (above) {
      /*
       * Pull it out first, then find the target, then put it back.
       *
       * The index of the target is not the same before and after the removal —
       * taking the new track out of the list shifts everything after it down
       * by one, so an index read beforehand lands the layer one place too low.
       * The symptom was an "above" that put the layer below.
       */
      const now = S.project.tracks.indexOf(track);
      if (now >= 0) S.project.tracks.splice(now, 1);
      const at = S.project.tracks.findIndex((t) => t.id === above);
      // Lower index is higher on screen, so "above" means at the target's index.
      if (at >= 0) S.project.tracks.splice(at, 0, track);
      else S.project.tracks.unshift(track);
    }
    actions.commit(`Add ${kind} layer`);
    return track;
  },

  removeLayer(trackId) {
    const track = trackById(S.project, trackId);
    if (!track) return;
    const kindLeft = S.project.tracks.filter((t) => t.kind === track.kind).length;
    if (kindLeft <= 1) { toast(`That is the last ${track.kind} layer`, 'bad'); return; }
    removeTrack(S.project, trackId);
    actions.commit(`Delete ${track.name}`);
  },

  renameTrack(trackId, name) {
    const track = trackById(S.project, trackId);
    if (!track || !name?.trim()) return;
    track.name = name.trim().slice(0, 40);
    actions.commit('Rename layer');
  },

  toggleTrack(trackId, what) {
    const track = trackById(S.project, trackId);
    if (!track) return;
    track[what] = !track[what];
    actions.commit(`${track[what] ? '' : 'Un'}${what} ${track.name}`);
  },

  selectTrack(trackId) {
    actions.select(clipsOn(S.project, trackId).map((c) => c.id));
  },

  closeGapsOn(trackId) {
    closeGaps(S.project, trackId);
    actions.commit('Close gaps');
  },

  /* ---------------- clip operations ---------------- */

  /**
   * Split every selected clip wherever the playhead crosses it — or, given a
   * time, there instead. Right-clicking a clip splits where you clicked, which
   * is what every editor does and what the hand expects.
   */
  splitAt(t = S.time, ids = null) {
    const targets = ids || [...S.sel];
    let count = 0;
    for (const id of targets) if (splitClip(S.project, id, t)) count++;
    if (count) actions.commit(`Split ${count} clip${count === 1 ? '' : 's'}`);
    else toast('The playhead is not over a selected clip', 'bad');
    return count;
  },

  /**
   * Take the sound off a clip and put it on its own audio layer.
   *
   * The picture keeps playing silently and the sound becomes a clip you can
   * slide, fade or replace — which is the whole reason anybody does this: to
   * hold a line of dialogue over the shot that comes after it.
   */
  detachAudio(ids = null) {
    const targets = (ids || [...S.sel]).map((id) => clipById(S.project, id)).filter(Boolean);
    const usable = targets.filter((c) => {
      const m = mediaById(S.project, c.mediaId);
      return m && m.kind === 'video' && trackById(S.project, c.trackId)?.kind === 'video';
    });
    if (!usable.length) { toast('Select a video clip with sound in it', 'bad'); return 0; }

    let audioTrack = S.project.tracks.find((t) => t.kind === 'audio'
      && !clipsOn(S.project, t.id).some((c) => usable.some((u) =>
        u.start < c.start + c.dur - 0.001 && u.start + u.dur > c.start + 0.001)));
    if (!audioTrack) audioTrack = addTrack(S.project, 'audio');

    for (const c of usable) {
      const made = addClip(S.project, {
        mediaId: c.mediaId, trackId: audioTrack.id,
        start: c.start, dur: c.dur, in: c.in, kind: 'audio',
      });
      made.speed = c.speed;
      made.volume = c.volume;
      made.fadeIn = c.fadeIn;
      made.fadeOut = c.fadeOut;
      made.label = 'Detached audio';
      c.volume = 0;               // the picture keeps playing, silently
    }
    actions.commit(`Detach audio from ${usable.length} clip${usable.length === 1 ? '' : 's'}`);
    return usable.length;
  },

  /**
   * Hold the frame under the playhead.
   *
   * Built as a split either side plus a speed of nearly zero on the middle,
   * rather than as a new kind of clip — so it trims, grades and exports like
   * anything else, and undo takes it back in one step.
   */
  freezeFrame(at = S.time, hold = 2) {
    const clip = [...S.sel].map((id) => clipById(S.project, id)).find((c) =>
      c && at > c.start + 0.02 && at < c.start + c.dur - 0.02);
    if (!clip) { toast('Put the playhead over a selected clip first', 'bad'); return null; }

    const right = splitClip(S.project, clip.id, at);
    if (!right) return null;
    const tail = splitClip(S.project, right.id, at + Math.min(hold, right.dur - 0.05));
    const frozen = tail ? right : right;
    frozen.speed = 0.0001;
    frozen.dur = hold;
    frozen.label = 'Freeze';
    if (tail) {
      // Everything after the hold slides along, or it would play over itself.
      for (const c of clipsOn(S.project, frozen.trackId)) {
        if (c.start >= tail.start - 0.0001 && c.id !== frozen.id) c.start += hold - (tail.start - frozen.start);
      }
    }
    S.sel = new Set([frozen.id]);
    actions.commit('Freeze frame');
    return frozen;
  },

  /** Nudge the selection by seconds — arrow keys and the menu both use this. */
  nudge(by) {
    if (!S.sel.size) return;
    for (const id of S.sel) {
      const clip = clipById(S.project, id);
      if (clip) moveClip(S.project, id, { start: Math.max(0, clip.start + by) });
    }
    actions.commit(by > 0 ? 'Nudge later' : 'Nudge earlier', 'nudge');
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
  renderer.showMatte = mattePreview();
  renderer.draw(S.project, S.time, { playing: S.playing || scrub });
  // The handles follow the picture: a window drawn on one frame has to sit in
  // the same place on the next, and the canvas can be resized underneath it.
  paintMaskUi();
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
  // The button carries the name of what it will undo — see history-ui.js.
  paintUndoButtons();
}

function paintName() {
  $('#proj-name').value = S.project.name;
}

export function paintAccount() {
  /*
   * The editor's account button shows who you are, then what you have.
   *
   * It showed only the edition, so a signed-in person and a stranger on the
   * same machine saw the identical button — which is exactly when you want to
   * know whose account is about to be charged, or whose licence you are using.
   */
  const who = auth.session();
  const name = (who?.name || '').trim().split(/\s+/)[0]
    || (who?.email || '').split('@')[0];
  const el = $('#acct-lbl');
  el.textContent = name || licence.editionName();
  el.closest('button')?.setAttribute('title',
    who?.email
      ? `${who.email} — ${licence.editionName()}`
      : `Not signed in — ${licence.editionName()}`);
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
  /*
   * Cut, copy and paste on the timeline.
   *
   * Handled before the switch because they carry a modifier, and because the
   * browser's own copy would otherwise take a clip selection to mean "copy the
   * page text", which is nothing anybody wanted.
   */
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'x' && S.sel.size) { e.preventDefault(); actions.cutSelected(); return; }
    if (k === 'c' && S.sel.size) { e.preventDefault(); actions.copySelected(); return; }
    if (k === 'v' && actions.hasClipboard()) { e.preventDefault(); actions.pasteAt(S.time); return; }
  }

  switch (e.key) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': e.preventDefault(); transport.step(e.shiftKey ? -fps : -1, fps); syncAfterStep(); break;
    case 'ArrowRight': e.preventDefault(); transport.step(e.shiftKey ? fps : 1, fps); syncAfterStep(); break;
    case 'Home': e.preventDefault(); actions.seek(0); break;
    case 'End': e.preventDefault(); actions.seek(duration(S.project)); break;
    case 'Delete': case 'Backspace': e.preventDefault(); actions.deleteSelected(); break;
    case 's': case 'S': actions.splitAtPlayhead(); break;
    case 'c': case 'C': actions.setTool(S.tool === 'razor' ? 'select' : 'razor'); break;
    case 't': case 'T': actions.setTool(S.tool === 'trim' ? 'select' : 'trim'); break;
    case 'v': case 'V': actions.setTool('select'); break;
    case 'm': case 'M': actions.addMarker(); break;
    case '+': case '=': setZoom(S.zoom * 1.4); break;
    case '-': case '_': setZoom(S.zoom / 1.4); break;
    case 'f': case 'F':
      // Shift+F only, so pressing f while reaching for something else does not
      // rearrange the window.
      if (e.shiftKey) { e.preventDefault(); toggleTimelineFull(); }
      break;
    case 'Escape':
      if (isTimelineFull()) { toggleTimelineFull(false); break; }
      actions.select([]);
      break;
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

/*
 * The timeline over the whole window.
 *
 * Not the browser's fullscreen API — that takes the whole screen and hides the
 * top bar with it, and the top bar is where undo, export and the menus live.
 * This grows the timeline row to fill the app instead, which is what an editor
 * means by "maximise the timeline": the same window, all of it given to the
 * thing being worked on. Escape and the same button both bring it back.
 */
let timelineFull = false;
/* Filled in at boot; the right-click menus read it, so it cannot be a const
   inside the boot function. */
let menubarApi = {};

export function toggleTimelineFull(on = !timelineFull) {
  timelineFull = Boolean(on);
  document.documentElement.classList.toggle('tl-full', timelineFull);
  $('#tl-full')?.setAttribute('aria-pressed', timelineFull ? 'true' : 'false');
  const btn = $('#tl-full');
  if (btn) btn.title = timelineFull ? 'Back to the editor (Shift+F)' : 'Timeline full screen (Shift+F)';
  // The canvas and the tracks both measure themselves against the space they
  // have, and both just changed.
  sizeCanvas();
  timeline.render();
  if (timelineFull) toast('Timeline full screen — Shift+F or Escape to come back', '', 3200);
}

export function isTimelineFull() { return timelineFull; }

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
  $('#tl-add-video')?.addEventListener('click', () => actions.addLayer('video'));
  $('#tl-add-audio')?.addEventListener('click', () => actions.addLayer('audio'));
  $('#tl-full')?.addEventListener('click', () => toggleTimelineFull());
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
  // Projects moved into the File menu. Optional-chained rather than deleted:
  // the desktop shell and older cached shells may still carry the button, and
  // one missing element must not take the whole boot down with it.
  $('#btn-projects')?.addEventListener('click', () => openPanel('settings'));
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
    applyTipsForLevel(b.dataset.level);
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

  /*
   * The menu bar, wired to the same actions the buttons and shortcuts use.
   *
   * One set of verbs behind three ways of reaching them. A menu item that ran
   * its own slightly different code is how a menu ends up doing something
   * subtly unlike the button next to it.
   */
  initHistoryUi({
    history: () => S.history,
    undo: () => actions.undo(),
    goTo: (i) => actions.historyGoTo(i),
  });

  /*
   * One table of things the chrome can do, shared by the menu bar, the phone
   * sheet and the right-click menus. A second copy would drift — and the first
   * symptom of drift is a menu item that works in one place and not another,
   * which reads as the app being flaky rather than as a duplicated table.
   */
  menubarApi = {
    /* file */
    newProject: () => actions.newProject(),
    openProject: () => openPanel('settings'),
    importMedia: () => $('#file-input').click(),
    importProjectFile: () => $('#file-input').click(),
    exportProjectFile: () => actions.exportProjectFile(),
    exportVideo: () => openExport(),

    /* edit */
    undo: () => actions.undo(),
    redo: () => actions.redo(),
    canUndo: () => S.history.canUndo,
    canRedo: () => S.history.canRedo,
    undoLabel: () => S.history.undoLabel,
    redoLabel: () => S.history.redoLabel,
    openHistory,
    cut: () => actions.cutSelected(),
    copy: () => actions.copySelected(),
    paste: () => actions.pasteAt(S.time),
    canPaste: () => actions.hasClipboard(),
    duplicate: () => actions.duplicateSelected(),
    addLayer: (kind) => actions.addLayer(kind),
    addAdjustment: () => actions.addAdjustment(),
    detectScenes: () => actions.detectScenes(),
    remove: () => actions.deleteSelected(),
    hasSelection: () => S.sel.size > 0,
    selectAll: () => actions.select(S.project.clips.map((c) => c.id)),
    deselect: () => actions.select([]),

    /* clip */
    split: () => actions.splitAtPlayhead(),
    track: () => openPanel('effects'),
    /*
     * Unfolding a layer from the menu, not only from the caret on the clip.
     * The caret is 15px square and only exists on clips wide enough to hold
     * it — a menu item is how somebody finds the feature in the first place.
     */
    layerProps: () => {
      const ids = [...S.sel];
      if (!ids.length) { toast('Select a clip first'); return; }
      for (const id of ids) if (!kf.isExpanded(id)) kf.toggleExpanded(id);
      timeline.render();
    },
    hideLayerProps: () => {
      for (const id of [...S.sel]) if (kf.isExpanded(id)) kf.toggleExpanded(id);
      timeline.render();
    },
    layerPropsOpen: () => [...S.sel].some((id) => kf.isExpanded(id)),
    graphOpen: () => kf.isGraphOpen(),
    toggleGraph: () => {
      const ids = [...S.sel];
      if (!ids.length) { toast('Select a clip first'); return; }
      for (const id of ids) if (!kf.isExpanded(id)) kf.toggleExpanded(id);
      kf.setGraph(!kf.isGraphOpen());
      timeline.render();
    },

    /* timeline */
    togglePlay: () => togglePlay(),
    goStart: () => actions.seek(0),
    goEnd: () => actions.seek(duration(S.project)),
    marker: () => actions.addMarker(),
    zoomIn: () => setZoom(S.zoom * 1.4),
    zoomOut: () => setZoom(S.zoom / 1.4),
    zoomFit: () => $('#zoom-fit')?.click(),
    tool: (t) => actions.setTool(t),

    /* view and settings */
    openPanel,
    isOn: (what) => {
      if (what === 'safe') return Boolean($('#tg-safe')?.checked);
      if (what === 'ratios') return Boolean($('#tg-ratios')?.checked);
      if (what === 'scopes') return Boolean($('#scope'));
      if (what === 'tips') return tipsOn();
      return false;
    },
    toggle: (what) => {
      if (what === 'tips') { setTips(!tipsOn()); return; }
      if (what === 'scopes') { openPanel('color'); return; }
      const box = what === 'safe' ? $('#tg-safe') : $('#tg-ratios');
      if (!box) return;
      box.checked = !box.checked;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    },
    theme: () => $('#btn-theme')?.click(),
    fullscreen: () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.();
    },
    level: () => levels.current(),
    setLevel: (level) => {
      levels.set(level);
      applyTipsForLevel(level);
      paintLevel();
      refreshPanel();
    },
    account: () => openPanel('settings'),
    palette: () => openPalette(),
    support: () => openPanel('help'),
    openUrl: (href) => window.open(href, '_blank', 'noopener'),

    /* the timeline over the whole window, and a way straight to export */
    timelineFull: () => toggleTimelineFull(),
    isTimelineFull,
    exportNow: () => openExport(),
  };
  initMenubar(document, menubarApi);

  initContextMenus();
  initMaskUi({ refreshPanel });

  /*
   * The picture and the media pool get menus too. The pool is delegated from
   * the panel rather than from each tile, because the tiles are rebuilt on
   * every import and a listener per tile would pile up.
   */
  attachMenu($('#stage') || $('.stage'), () => viewerMenu(menubarApi));
  attachMenu($('#panel'), (e) => {
    const tile = e.target.closest('[data-media]');
    return tile ? mediaMenu(tile.dataset.media) : null;
  });

  initTips();
  applyTipsForLevel(levels.current());

  // The phone's overflow sheet. Everything in it is a second route to a
  // control that exists elsewhere — never the only one — so a desktop loses
  // nothing and nothing has to be maintained twice.
  initMoreSheet({
    openPanel,
    palette: () => openPalette(),
    openHistory,
    theme: () => $('#btn-theme')?.click(),
    levelName: () => levels.DESCRIPTIONS[levels.current()]?.name || 'Beginner',
    accountLine: () => {
      const who = auth.session();
      return who?.email ? `${who.email} — ${licence.editionName()}` : `Not signed in — ${licence.editionName()}`;
    },
    cycleLevel: () => {
      const order = levels.LEVELS;
      const next = order[(order.indexOf(levels.current()) + 1) % order.length];
      levels.set(next);
      applyTipsForLevel(next);
      paintLevel();
      refreshPanel();
      toast(`${levels.DESCRIPTIONS[next].name} — ${levels.DESCRIPTIONS[next].line}`, '', 3200);
    },
  });

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
