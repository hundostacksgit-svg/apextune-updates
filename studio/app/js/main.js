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
import { EDITIONS, SITE } from '../../assets/config.js';
import * as auth from '../../assets/auth.js';
import { History } from './engine/history.js';
import {
  newProject, deserialize, serialize, duration, clipById, mediaById,
  splitClip, removeClips, duplicateClips, addClip, addTrack, RATIOS, nextFreeStart,
  trackById, removeTrack, closeGaps, clipsOn, moveClip, makeCompound, breakCompound,
} from './engine/project.js';
import { Renderer } from './engine/render.js';
import { Transport } from './engine/playback.js';
import { AudioEngine } from './engine/audio.js';
import * as clock from './engine/media-clock.js';
import * as preview from './engine/preview.js';
import { CHECK_RATIOS, drawCheck, lossFor } from './engine/multiframe.js';
import { tagVideo } from './engine/tags.js';
import { initMenubar } from './menubar.js';
import { initHistoryUi, showDid, openHistory, paintUndoButtons } from './history-ui.js';
import { initTips, applyTipsForLevel, setTips, tipsOn } from './tips.js';
import { initMoreSheet } from './more-sheet.js';
import { initMaskUi, paintMaskUi } from './mask-ui.js';
import { chooseProject } from './start.js';
import {
  freezeFrame, matchFrame, insertAt, overwriteAt, shuttleNext, shuttleLabel,
} from './engine/edits.js';
import {
  syncAngles, makeMulticam, cutTo, angleView, flattenMulticam,
} from './engine/multicam.js';
import { presetFromClip, applyPreset } from './engine/presets.js';
import * as ws from './workspace.js';
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

/* The other clipboard: what was *done* to a clip, with none of the clip. Kept
   separate on purpose — copying a shot and copying its grade are two different
   intentions, and one clipboard for both means each quietly destroys the
   other's contents. */
let attributes = null;

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
    ws.refresh();
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
    ws.refresh();
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
    if (!files.length) return [];
    let added = 0;
    const records = [];   // returned so a caller that made the file can find it
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
        records.push(rec);
        added++;
      } catch (err) {
        toast(err.message, 'bad', 5000);
      }
    }
    if (!added) return records;
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
    return records;
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

  /**
   * Hold the frame under the playhead.
   *
   * Cuts either side and makes the middle a zero-speed clip, which is how
   * every editor does it and the only version that stays editable: the frozen
   * part can be trimmed, graded and moved like anything else.
   */
  freezeFrame(at = S.time, hold = 2) {
    const under = S.project.clips
      .filter((c) => {
        const track = S.project.tracks.find((t) => t.id === c.trackId);
        return track?.kind === 'video' && at > c.start && at < c.start + c.dur;
      });
    // Prefer a selected clip, but do not insist on one: pressing E while
    // watching a shot means freeze *that*, and demanding a selection first is
    // a step nobody performs in any other editor.
    const selected = under.filter((c) => S.sel.has(c.id));
    const target = (selected[0] || under[under.length - 1]);
    if (!target) { toast('Park the playhead over a clip to freeze it', 'bad'); return null; }
    const frozen = freezeFrame(S.project, target.id, at, { hold });
    if (!frozen) { toast('Too close to the edge of the clip to freeze there', 'bad'); return null; }
    S.sel = new Set([frozen.id]);
    actions.commit('Freeze frame');
    return frozen;
  },

  /**
   * Find the frame you are looking at, in the file it came from.
   *
   * Selects the clip and says where in the source it is. Speed ramps and
   * reversal sit between the timeline and the file, so the answer comes from
   * sourceTime rather than from subtracting the clip's start.
   */
  matchFrame() {
    const hit = matchFrame(S.project, S.time);
    if (!hit) { toast('Nothing under the playhead to match', 'bad'); return; }
    const rec = mediaById(S.project, hit.mediaId);
    actions.select([hit.clip.id]);
    openPanel('media');
    toast(`${rec?.name || 'Clip'} at ${tc(hit.at, S.project.settings.fps)} in the file`, 'ok', 4200);
    return hit;
  },

  /**
   * Three-point editing: put the media in at the playhead.
   *
   * `mode` is 'insert' (make room, push everything later) or 'overwrite' (land
   * on top of whatever is there). They are not a preference — overwriting when
   * you meant to insert loses work, and inserting when you meant to overwrite
   * pushes the whole cut out of sync with the music.
   */
  placeMedia(mediaId, mode = 'overwrite') {
    const rec = mediaById(S.project, mediaId);
    if (!rec) return;
    const kind = rec.kind === 'audio' ? 'audio' : 'video';
    let track = S.project.tracks.find((t) => t.kind === kind);
    if (!track) track = addTrack(S.project, kind);
    const spec = { mediaId, trackId: track.id, start: S.time, dur: rec.duration, in: 0 };
    const made = mode === 'insert' ? insertAt(S.project, spec) : overwriteAt(S.project, spec);
    if (!made) { toast('That could not be placed here', 'bad'); return; }
    S.sel = new Set([made.id]);
    actions.commit(`${mode === 'insert' ? 'Insert' : 'Overwrite'} ${rec.name}`);
  },

  /* ---------------- multicam ---------------- */

  /**
   * Line several files up by sound and put them on the timeline as one clip.
   *
   * The sync is the part worth having: two cameras recording the same room
   * heard the same door close, and correlating when things happened is exact
   * where lining up a clap by eye is not.
   */
  async makeMulticam(mediaIds) {
    const ids = (mediaIds && mediaIds.length ? mediaIds : S.project.media
      .filter((m) => m.kind === 'video').map((m) => m.id));
    if (ids.length < 2) {
      toast('Multicam needs at least two angles — import them first', 'bad', 4000);
      return null;
    }

    toast('Listening to the angles…', '', 2400);
    let synced;
    try {
      synced = await syncAngles(S.project, ids);
    } catch {
      toast('Those angles could not be lined up by sound', 'bad', 4000);
      return null;
    }

    const angles = synced.map((a) => ({
      ...a,
      label: mediaById(S.project, a.mediaId)?.name || null,
    }));
    let track = S.project.tracks.find((t) => t.kind === 'video');
    if (!track) track = addTrack(S.project, 'video');
    const clip = makeMulticam(S.project, {
      angles, trackId: track.id, start: nextFreeStart(S.project, track.id, 0, 1),
    });
    if (!clip) { toast('Those angles do not overlap in time', 'bad', 4000); return null; }

    S.sel = new Set([clip.id]);
    actions.commit(`Multicam — ${angles.length} angles`);

    /*
     * Say which ones it was not sure about.
     *
     * A confidence figure nobody sees is a figure that does no work. An angle
     * the correlation could not place is stacked at zero, and finding that out
     * during an export is far worse than being told now.
     */
    const shaky = angles.filter((a) => !a.reference && (a.confidence ?? 0) < 0.25);
    if (shaky.length) {
      toast(`${shaky.length} angle${shaky.length === 1 ? '' : 's'} could not be lined up by sound — check ${shaky.map((a) => a.label).join(', ')}`,
        'warn', 6000);
    } else {
      toast(`${angles.length} angles lined up. Press 1–9 while it plays to cut.`, 'ok', 5000);
    }
    return clip;
  },

  /** Cut the live multicam clip to an angle at the playhead. */
  cutToAngle(index) {
    const clip = S.project.clips.find((c) => c.kind === 'multicam'
      && S.time >= c.start && S.time < c.start + c.dur);
    if (!clip) return false;
    if (!clip.angles?.[index]) return false;
    cutTo(clip, S.time - clip.start, index, { fps: S.project.settings.fps });
    /*
     * Coalesced, because live switching is one gesture.
     *
     * Somebody watching a take and tapping angles as it plays is making one
     * edit, not forty. Forty undo steps to get back to the start of a pass is
     * not an undo stack anybody uses.
     */
    actions.commit(`Cut to angle ${index + 1}`, `multicam:${clip.id}`);
    return true;
  },

  /** Turn a multicam clip into ordinary clips, one per cut. */
  flattenMulticam(clipId) {
    const id = clipId || [...S.sel].find((x) => clipById(S.project, x)?.kind === 'multicam');
    if (!id) { toast('Select a multicam clip first', 'bad'); return; }
    const made = flattenMulticam(S.project, id);
    if (!made.length) { toast('Nothing to flatten', 'bad'); return; }
    S.sel = new Set(made.map((c) => c.id));
    actions.commit(`Flatten multicam into ${made.length} clips`);
  },

  /** The multicam clip under the playhead, for the angle viewer. */
  liveMulticam() {
    return S.project.clips.find((c) => c.kind === 'multicam'
      && S.time >= c.start && S.time < c.start + c.dur) || null;
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

  /* ---------------- attributes ---------------- */

  /*
   * Copy attributes, paste attributes.
   *
   * The thing an editor does forty times an hour: grade one shot, then put
   * that grade on the other eleven from the same camera. Copying the clip and
   * re-trimming it is not the same operation — it throws away the edit to
   * carry the look.
   *
   * Built on the preset system rather than beside it, so "what counts as an
   * attribute" has one definition in this app instead of two that drift: the
   * grade, the effects with their exact settings, the reframe, the audio
   * strip. Never where a clip sits, how long it is, its in point or its speed.
   */
  copyAttributes(id = null) {
    const clip = clipById(S.project, id || [...S.sel][0]);
    if (!clip) return false;
    attributes = presetFromClip(clip, 'Attributes');
    if (!attributes) return false;
    toast(attributes.blurb ? `Copied: ${attributes.blurb}` : 'Attributes copied');
    return true;
  },

  hasAttributes() { return Boolean(attributes); },

  /**
   * Put them on every selected clip, as one undoable change.
   *
   * `presetId` is cleared rather than carried: these attributes came off a
   * clip, not out of the library, so leaving the source clip's preset id on
   * them would light up a library chip that does not describe what is now
   * running.
   */
  pasteAttributes(ids = null) {
    if (!attributes) return 0;
    const targets = ids ? [].concat(ids) : [...S.sel];
    let n = 0;
    for (const id of targets) {
      const clip = clipById(S.project, id);
      if (!clip) continue;
      applyPreset(clip, attributes);
      clip.presetId = null;
      n++;
    }
    if (!n) return 0;
    actions.commit(`Paste attributes to ${n} clip${n === 1 ? '' : 's'}`);
    return n;
  },

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

  /**
   * Gather the selection into one clip.
   *
   * A sequence you have finished with should behave like one thing: dragged,
   * graded, sped up and reused as a unit. Doing any of that to ten clips is
   * ten chances to get one of them wrong.
   */
  groupSelected() {
    const ids = [...S.sel];
    if (ids.length < 2) { toast('Select at least two clips to group', 'bad'); return null; }
    const host = makeCompound(S.project, ids, { name: `Compound ${S.project.clips.length}` });
    if (!host) { toast('Those clips cannot be grouped', 'bad'); return null; }
    S.sel = new Set([host.id]);
    actions.commit(`Group ${ids.length} clips`);
    toast('Grouped. Everything inside is still there — ungroup puts it straight back.', 'ok', 4200);
    return host;
  },

  /** Put a compound's clips back on the timeline. */
  ungroupSelected(clipId = null) {
    const ids = clipId ? [clipId] : [...S.sel];
    const hosts = ids.map((id) => clipById(S.project, id)).filter((c) => c?.kind === 'compound');
    if (!hosts.length) { toast('Select a grouped clip first', 'bad'); return 0; }
    let made = [];
    for (const host of hosts) made = made.concat(breakCompound(S.project, host.id));
    S.sel = new Set(made.map((c) => c.id));
    actions.commit(`Ungroup ${hosts.length} clip${hosts.length === 1 ? '' : 's'}`);
    return made.length;
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

  /** Nudge the selection by seconds — arrow keys and the menu both use this. */
  nudge(by) {
    if (!S.sel.size) return;
    for (const id of S.sel) {
      const clip = clipById(S.project, id);
      if (clip) moveClip(S.project, id, { start: Math.max(0, clip.start + by) });
    }
    actions.commit(by > 0 ? 'Nudge later' : 'Nudge earlier', 'nudge');
  },

  /**
   * Change the corrector the colour tools are pointed at.
   *
   * Corrector one *is* the clip — its grade lives in `clip.color` and always
   * has — so the callback is handed either a clip or a corrector, and both
   * have a `.color` on them. That is why the colour panel needed no rewriting
   * to gain a node graph: every control in it already said `x.color.contrast`
   * and never cared what `x` was.
   */
  patchGrade(fn, label, coalesceKey) {
    const host = ws.activeGradeTarget();
    /*
     * A corrector overrides the selection. Nothing else does.
     *
     * Picking corrector three and dragging a wheel has to write to corrector
     * three, obviously. But the first version of this diverted *every* colour
     * edit through the grade target, which quietly broke the oldest behaviour
     * in the panel: select six clips, drag saturation, and all six move. They
     * stopped moving — only the one under the playhead did — and nothing on
     * screen said why.
     *
     * So the test is what kind of thing came back. A corrector is not one of
     * the project's clips; a clip is. When it is a clip, this is an ordinary
     * colour edit and means what it has always meant.
     */
    if (host && !S.project.clips.includes(host)) {
      fn(host);
      actions.commit(label, coalesceKey);
      return;
    }
    if (S.sel.size) { actions.patchSelected(fn, label, coalesceKey); return; }
    // Nothing selected, but a shot is under the playhead — the Colour page's
    // normal state. Grade that one rather than nothing at all.
    if (host) { fn(host); actions.commit(label, coalesceKey); }
  },

  /** What the colour controls should read their current values from. */
  gradeHost() {
    return ws.activeGradeTarget();
  },

  /** Change one named clip. The workspace docks edit by id, not by selection. */
  patchClip(id, fn, label, coalesceKey) {
    const clip = clipById(S.project, id);
    if (!clip) return;
    fn(clip);
    actions.commit(label, coalesceKey);
  },

  /** Change something on the project itself — the gallery of stills, say. */
  patch(fn, label, coalesceKey) {
    fn(S.project);
    actions.commit(label, coalesceKey);
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

  /**
   * New, or open another one — the same screen either way.
   *
   * They were two different things: a confirm dialog that made an Untitled
   * project, and a settings panel listing what you had. One screen does both,
   * and it is the screen the app already opens on, so there is one place to
   * learn instead of two.
   */
  async openStart({ canCancel = true } = {}) {
    const { chooseProject } = await import('./start.js');
    const choice = await chooseProject({ canCancel });
    if (!choice || choice.action === 'cancel') return;

    await saveNow();
    if (choice.action === 'open') {
      if (choice.id === S.project.id) return;      // already in it
      await actions.openProject(choice.id);
      return;
    }
    media.releaseAll();
    S.project = newProject({ name: choice.name, ratio: choice.ratio, fps: choice.fps });
    S.sel.clear();
    S.beats = null;
    S.history.reset(S.project, 'New project');
    sizeCanvas();
    await store.saveProject(S.project);
    await store.pref('lastProject', S.project.id);
    actions.seek(0);
    actions.refresh();
    paintName();
  },

  newProject() { return actions.openStart({ canCancel: true }); },

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
    /*
     * One unreadable file must not cost the whole project.
     *
     * Restoring media touches the database, the decoder and the beat finder,
     * and any of the three can fail on one record — a file that has gone, a
     * codec this browser dropped, an entry written wrong. Letting that throw
     * left the editor on whatever was already open with nothing said, which
     * looks exactly like clicking the project did nothing. The clip is marked
     * missing instead, which the app already knows how to explain.
     */
    try {
      // eslint-disable-next-line no-await-in-loop -- IndexedDB reads are sequential anyway
      await media.rehydrate(m);
      if (m.hasAudio || m.kind === 'audio') {
        // eslint-disable-next-line no-await-in-loop
        const buffer = await media.decode(m);
        if (buffer) m.peaks = media.peaks(buffer, 900);
        if (m.kind === 'audio' && buffer && !S.beats) S.beats = media.detectBeats(buffer);
      }
    } catch {
      m.missing = true;
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
  // Bypass is a viewer state held on the document while a key or button is
  // down; the renderer is told, rather than asking, once per frame.
  renderer.bypassGrade = document.documentElement.classList.contains('grade-off');
  /*
   * `scrub` is its own flag now.
   *
   * It used to be passed as `playing`, back when `playing` only meant "leave
   * the video elements alone". It means "start them rolling" now, so folding
   * a scrub into it would set the footage playing under the finger dragging
   * the playhead.
   */
  renderer.draw(S.project, S.time, { playing: S.playing, scrub });
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
  paintUpgrade();
}

/**
 * The next edition up, or nothing.
 *
 * Studio is the top of the ladder for one person and Team is a different
 * shape rather than a step above it, so both are "nothing left to buy" here.
 */
export function nextEdition() {
  const ed = licence.edition();
  if (ed === 'free') return EDITIONS.creator;
  if (ed === 'creator') return EDITIONS.studio;
  return null;
}

function paintUpgrade() {
  const a = $('#btn-upgrade');
  if (!a) return;
  const next = nextEdition();
  a.hidden = !next;
  if (!next) return;
  /*
   * An absolute address, always. In the browser a relative one works; in the
   * desktop build the page is a file:// URL and "../pricing/" resolves to a
   * folder that does not exist. The shell intercepts anything that is not
   * file:// and hands it to the system browser, which is the right place for
   * a checkout anyway.
   */
  a.href = `https://${SITE.domain}/studio/pricing/`;
  a.title = `${next.name} — $${next.once.toFixed(2)} once, no subscription`;
}

/* ------------------------------------------------------------------ */
/* keyboard                                                            */
/* ------------------------------------------------------------------ */

const PANEL_KEYS = ['media', 'ai', 'templates', 'filters', 'effects', 'transitions', 'overlays', 'color', 'text'];

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

    /*
     * Cut, copy, paste and group.
     *
     * These live here, in the one block that handles modifier keys, and not in
     * a second block further down — which is where they were, behind this
     * block's unconditional return, doing nothing at all. The context menus
     * called the same actions directly, so every test passed and the keys were
     * simply dead.
     */
    if (k === 'x' && S.sel.size) { e.preventDefault(); actions.cutSelected(); return; }
    /*
     * Attributes first: Ctrl+Alt+C has to be caught before the plain Ctrl+C
     * line below, which returns for any selection and would eat it.
     *
     * Matched on e.code, not e.key. Option+C on a Mac is not "c" — the OS
     * hands the page "ç", and Option+V hands it "√", so a key comparison here
     * works everywhere except the platform these two shortcuts came from.
     */
    if (e.altKey && e.code === 'KeyC' && S.sel.size) { e.preventDefault(); actions.copyAttributes(); return; }
    if (e.altKey && e.code === 'KeyV' && actions.hasAttributes()) { e.preventDefault(); actions.pasteAttributes(); return; }
    if (k === 'c' && S.sel.size) { e.preventDefault(); actions.copySelected(); return; }
    if (k === 'v' && actions.hasClipboard()) { e.preventDefault(); actions.pasteAt(S.time); return; }
    if (k === 'g') {
      e.preventDefault();
      if (e.shiftKey) actions.ungroupSelected(); else actions.groupSelected();
      return;
    }
    return;
  }

  const fps = S.project.settings.fps;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      // Space is the plain transport, so it takes the shuttle out of whatever
      // rate it was in rather than playing at 8x with no way to tell.
      if (shuttleRate) { stopShuttle(); break; }
      togglePlay();
      break;
    case 'ArrowLeft': e.preventDefault(); transport.step(e.shiftKey ? -fps : -1, fps); syncAfterStep(); break;
    case 'ArrowRight': e.preventDefault(); transport.step(e.shiftKey ? fps : 1, fps); syncAfterStep(); break;
    case 'Home': e.preventDefault(); actions.seek(0); break;
    case 'End': e.preventDefault(); actions.seek(duration(S.project)); break;
    case 'Delete': case 'Backspace': e.preventDefault(); actions.deleteSelected(); break;
    case 's': case 'S': actions.splitAtPlayhead(); break;
    /*
     * J, K, L and the three commands that live beside them.
     *
     * Upper case is not a different command: Shift is how you reach some of
     * these on some layouts, and a key that works unshifted and not shifted is
     * the kind of thing that reads as the app being broken.
     */
    case 'l': case 'L': e.preventDefault(); shuttle(1); break;
    case 'j': case 'J': e.preventDefault(); shuttle(-1); break;
    case 'k': case 'K': e.preventDefault(); stopShuttle(); break;
    case 'e': case 'E': e.preventDefault(); actions.freezeFrame(); break;
    case 'y': case 'Y': e.preventDefault(); actions.matchFrame(); break;
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
      if (/^[1-9]$/.test(e.key)) {
        /*
         * Numbers cut angles when there is a multicam clip under the playhead,
         * and open panels otherwise.
         *
         * Not a mode and not a modifier: while a multicam clip is live, the
         * numbers are the only thing anybody wants them to be, and reaching
         * for a modifier mid-take is how you miss the cut. Away from one they
         * go back to being panel shortcuts, which is what they have always
         * been.
         */
        if (actions.cutToAngle(Number(e.key) - 1)) { e.preventDefault(); break; }
        openPanel(PANEL_KEYS[Number(e.key) - 1]);
      }
  }
}

function syncAfterStep() {
  S.time = transport.time;
  timeline.renderPlayhead();
  drawFrame();
  paintTransport();
}

/*
 * J, K and L: the shuttle.
 *
 * The oldest transport controls there are — anybody trained on tape has them
 * in their hands, and their absence is one of the first things such a person
 * notices. L plays forward and doubles the rate each press, J does the same
 * backwards, K stops. Pressing J while running forward slows down rather than
 * reversing, which is what makes it a shuttle instead of two play buttons.
 */
let shuttleRate = 0;

function shuttle(direction) {
  audio.ensure();
  audio.resume();
  unlockPlayback();
  shuttleRate = shuttleNext(shuttleRate, direction);
  transport.setRate(Math.abs(shuttleRate));
  clock.setRate(Math.abs(shuttleRate));

  if (shuttleRate < 0) {
    /*
     * Backwards, honestly.
     *
     * No browser plays a media element at a negative rate, so reverse is the
     * playhead stepping rather than the decoder running — picture moves, sound
     * does not. That is the same limitation the app already states for
     * reversed clips, and pretending otherwise would mean silent playback that
     * looks like a bug instead of a stated one.
     */
    transport.pause();
    stopReverse();
    const fps = S.project.settings.fps || 30;
    const step = Math.abs(shuttleRate);
    reverseTimer = setInterval(() => {
      const next = S.time - step / fps;
      if (next <= 0) { actions.seek(0); stopShuttle(); return; }
      actions.seek(next);
    }, 1000 / fps);
  } else {
    stopReverse();
    if (!transport.playing) transport.play();
  }
  paintTransport();
  toast(shuttleLabel(shuttleRate) || 'Playing', '', 900);
}

let reverseTimer = null;
function stopReverse() {
  if (reverseTimer) { clearInterval(reverseTimer); reverseTimer = null; }
}

function stopShuttle() {
  stopReverse();
  shuttleRate = 0;
  transport.setRate(1);
  clock.setRate(1);
  transport.pause();
  paintTransport();
}

/** The rate the transport is shuttling at, for the UI and the tests. */
export function shuttleState() { return shuttleRate; }

function togglePlay() {
  audio.ensure();
  audio.resume();
  // This is a real gesture. Spend it before starting, not after: the transport
  // starts its elements from an animation frame, which is too late to count.
  unlockPlayback();
  transport.toggle();
}

/*
 * Everything a phone needs before it will play an unmuted element.
 *
 * Safe to call as often as you like — the audio context is created once, the
 * resume is a no-op when it is already running, and the element unlock only
 * touches decoders that are sitting paused.
 */
function unlockPlayback() {
  audio.ensure();
  audio.resume();
  media.unlock();
  clock.retry();
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
  $('#viewer').addEventListener('pointerdown', () => {
    if (panelIsOverlay()) closePanel();
    // And it is the gesture the browser was holding out for, if the sound was
    // refused. The toast tells people to tap the picture; this is what makes
    // that true rather than just encouraging.
    if (clock.isBlocked()) unlockPlayback();
  });

  /*
   * The first touch anywhere, spent on the decoders.
   *
   * A phone will not start an unmuted media element without a gesture, and
   * will not accept one that arrived a few hundred milliseconds late from a
   * timer. Whatever somebody touches first — a menu, a clip, the play button —
   * is the one chance to get every element already in the pool into a state
   * where the transport can start it. It costs a play() and an immediate
   * pause() on a handful of elements and is never repeated.
   */
  let unlocked = false;
  const firstGesture = () => {
    if (unlocked) return;
    unlocked = true;
    unlockPlayback();
  };
  document.addEventListener('pointerdown', firstGesture, { capture: true });
  document.addEventListener('keydown', firstGesture, { capture: true });

  /*
   * Say something when the browser refuses to play.
   *
   * It refuses silently, and the app keeps the picture moving by seeking
   * instead — so without this the only symptom is a video with no sound and
   * no explanation, which reads as a broken app rather than a policy.
   */
  clock.onBlockedChange((on) => {
    if (on) toast('Tap the picture to turn the sound on', 'warn', 5200);
  });

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
  /*
   * The workspace follows the level, from here rather than from each switch.
   *
   * There are four places that change the level — the top bar, the phone
   * sheet, the command palette and the desktop menus — and every one of them
   * already calls this. Hooking the pages in at each of the four is how three
   * of them end up correct and the fourth does not.
   */
  ws.onLevelChange();
}

/* ------------------------------------------------------------------ */
/**
 * What happens between the splash and the timeline.
 *
 * Straight into an empty "Untitled project" is a small cruelty: it looks like
 * the app forgot the six hours you spent in it yesterday, and the only way to
 * find out it did not is to go hunting through a settings panel. So the editor
 * opens on what you have, the way Resolve, Premiere and Final Cut all do.
 *
 * Two ways past it, both deliberate. `?project=<id>` opens one directly, which
 * is what a link from the site or a desktop shortcut needs; `?new=1` skips to
 * a fresh timeline for anyone who genuinely wants that every time.
 */
async function openingScreen() {
  const params = new URLSearchParams(location.search);

  const wanted = params.get('project');
  if (wanted) {
    const doc = await store.loadProject(wanted);
    if (doc) { await loadDocument(doc); return; }
    toast('That project is not on this device', 'bad', 4600);
  }
  if (params.get('new') === '1') return;

  const choice = await chooseProject();
  if (choice?.action === 'open') {
    const doc = await store.loadProject(choice.id);
    if (doc) { await loadDocument(doc); return; }
    toast('That project could not be opened', 'bad');
    return;
  }
  if (choice?.action === 'new') {
    S.project = newProject({ name: choice.name, ratio: choice.ratio, fps: choice.fps });
    S.sel.clear();
    S.beats = null;
    S.history.reset(S.project, 'New project');
    sizeCanvas();
    // Saved immediately, so it is in the list the moment it exists rather than
    // only after the first edit — somebody who names a project and then closes
    // the tab should find it again.
    await store.saveProject(S.project);
    await store.pref('lastProject', S.project.id);
  }
}

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
      /*
       * Last, and once.
       *
       * Both of the two lines above register the elements they need rolling;
       * this is the single place that actually starts, stops and nudges them.
       * Doing it here rather than inside either one is what stops the two of
       * them contradicting each other — which is what used to leave a clip
       * showing one frozen frame while the playhead swept past it.
       */
      clock.commit(playing);
      timeline.renderPlayhead();
      ws.onFrame();
      $('#tc').textContent = tc(t, S.project.settings.fps);
    },
    onStateChange: (tp) => {
      S.playing = tp.playing;
      if (!tp.playing) audio.stopAll();
      paintTransport();
      // Parking every element on the frame it stopped at, so the picture on
      // screen is the frame the playhead is actually sitting on.
      if (!tp.playing) drawFrame();
    },
  });

  timeline = new TimelineUI({ state: S, actions });
  // A seek that lands after its frame decodes should repaint, not sit stale.
  renderer.onNeedsRedraw = () => { if (!S.playing) drawFrame(); };
  // A rating given while offline goes out now, quietly.
  import('./rate.js').then((m) => m.flush()).catch(() => {});

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
   * Pages and docks, at Intermediate and Professional.
   *
   * Handed the same actions table everything else uses rather than the state
   * object, so a dock cannot reach past undo — every change the gallery or the
   * node graph makes goes through commit() and lands in the history like any
   * other edit. `state` is the one read-only exception, because a dock has to
   * know what is selected and where the playhead is to draw itself at all.
   */
  ws.initWorkspace({
    state: () => S,
    openPanel,
    refreshPanel,
    sizeCanvas,
    patch: (fn, label, key) => actions.patch(fn, label, key),
    patchClip: (id, fn, label, key) => actions.patchClip(id, fn, label, key),
    // What the primaries band and the node graph write through: the same
    // corrector-aware path the Colour panel uses, so a wheel dragged in the
    // band and the same wheel dragged in the panel land in the same place.
    patchGrade: (fn, label, key) => actions.patchGrade(fn, label, key),
    liveMulticam: () => actions.liveMulticam(),
    cutToAngle: (i) => actions.cutToAngle(i),
    makeMulticam: () => actions.makeMulticam(),
    flattenMulticam: () => actions.flattenMulticam(),
    select: (ids) => actions.select(ids),
    seek: (t) => actions.seek(t),
    openStart: (opts) => actions.openStart(opts),
    redraw: () => drawFrame(),
    setCompare: (x) => { if (renderer) renderer.compareAt = x; },
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
    openProject: () => actions.openStart({ canCancel: true }),
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
    copyAttributes: () => actions.copyAttributes(),
    pasteAttributes: () => actions.pasteAttributes(),
    canPasteAttributes: () => actions.hasAttributes() && S.sel.size > 0,
    duplicate: () => actions.duplicateSelected(),
    addLayer: (kind) => actions.addLayer(kind),
    addAdjustment: () => actions.addAdjustment(),
    group: () => actions.groupSelected(),
    ungroup: () => actions.ungroupSelected(),
    canUngroup: () => [...S.sel].some((id) => clipById(S.project, id)?.kind === 'compound'),
    canGroup: () => S.sel.size >= 2,
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
    freezeFrame: () => actions.freezeFrame(),
    makeMulticam: () => actions.makeMulticam(),
    flattenMulticam: () => actions.flattenMulticam(),
    hasMulticam: () => S.project.clips.some((c) => c.kind === 'multicam'),
    matchFrame: () => actions.matchFrame(),
    shuttleForward: () => shuttle(1),
    shuttleBack: () => shuttle(-1),
    shuttleStop: () => stopShuttle(),
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
    rate: () => import('./rate.js').then((m) => m.openRating({ trigger: 'menu' })),

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
    upgradeLine: () => {
      const next = nextEdition();
      return next ? `${next.name} — $${next.once.toFixed(2)} once` : '';
    },
    upgrade: () => { const next = nextEdition(); if (next) window.open(`https://${SITE.domain}/studio/pricing/`, '_blank', 'noopener'); },
    rate: () => import('./rate.js').then((m) => m.openRating({ trigger: 'menu' })),
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
    await openingScreen();
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
