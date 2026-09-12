/*
 * What is in every right-click menu.
 *
 * Split out from context-menu.js, which only knows how to draw a popup and
 * dismiss it. This knows the app: which items belong over a clip, over empty
 * track space, over a layer header, over the ruler, over a file in the pool,
 * and over the picture itself.
 *
 * Undo and redo lead every one of them. They are on Ctrl+Z and in the Edit
 * menu already, and they are still the first two items here, because the
 * moment somebody wants to undo is the moment straight after they right-
 * clicked the thing they regret — and the menu is already open.
 */

import { toast, confirmDialog } from './ui.js';
import { S, actions } from './main.js';
import {
  clipById, mediaById, trackById, clipsOn, duration, sourceSpan,
} from './engine/project.js';
import * as kf from './keyframes-ui.js';
import * as licence from './licence.js';
import { openPanel } from './panels/index.js';
import { openHistory } from './history-ui.js';
import { openMenu } from './context-menu.js';

const IS_MAC = navigator.platform?.toLowerCase().includes('mac');
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const ALT = IS_MAC ? '⌥' : 'Alt';

/* The two that lead every menu, labelled with what they will actually take
   back rather than with the bare word. */
function editTop() {
  return [
    {
      label: () => (S.history?.undoLabel ? `Undo ${S.history.undoLabel}` : 'Undo'),
      hint: `${MOD}+Z`,
      when: () => Boolean(S.history?.canUndo),
      run: () => actions.undo(),
    },
    {
      label: () => (S.history?.redoLabel ? `Redo ${S.history.redoLabel}` : 'Redo'),
      hint: `${MOD}+⇧+Z`,
      when: () => Boolean(S.history?.canRedo),
      run: () => actions.redo(),
    },
    { sep: true },
  ];
}

const selCount = () => S.sel.size;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ */
/* a clip                                                             */
/* ------------------------------------------------------------------ */

/**
 * `at` is the time the click landed on, not the playhead. Splitting where you
 * clicked is what every editor does, and reaching for the playhead instead is
 * the kind of nearly-right that makes a menu feel wrong without being able to
 * say why.
 */
export function clipMenu(clipId, at) {
  const clip = clipById(S.project, clipId);
  if (!clip) return null;
  const media = mediaById(S.project, clip.mediaId);
  const track = trackById(S.project, clip.trackId);
  const many = selCount() > 1;
  const inside = at > clip.start + 0.02 && at < clip.start + clip.dur - 0.02;
  const hasSound = media?.kind === 'video' && track?.kind === 'video';

  return [
    ...editTop(),

    { label: `Split here`, hint: 'S', when: () => inside, run: () => actions.splitAt(at, [clip.id]) },
    { label: 'Split at the playhead', when: () => S.time > clip.start && S.time < clip.start + clip.dur,
      run: () => actions.splitAt(S.time, [clip.id]) },
    { label: 'Freeze this frame', hint: 'E',
      when: () => S.time > clip.start && S.time < clip.start + clip.dur,
      run: () => actions.freezeFrame() },
    { label: 'Find this frame in its file', hint: 'Y',
      when: () => Boolean(clip.mediaId) && S.time >= clip.start && S.time < clip.start + clip.dur,
      run: () => actions.matchFrame() },
    { sep: true },

    { label: () => (many ? `Cut ${plural(selCount(), 'clip')}` : 'Cut'), hint: `${MOD}+X`,
      run: () => actions.cutSelected() },
    { label: () => (many ? `Copy ${plural(selCount(), 'clip')}` : 'Copy'), hint: `${MOD}+C`,
      run: () => actions.copySelected() },
    { label: 'Paste here', hint: `${MOD}+V`, when: () => actions.hasClipboard(),
      run: () => actions.pasteAt(at, clip.trackId) },
    /* The look without the shot: grade one, then put it on the rest of the
       camera's shots without touching where any of them sit. */
    { label: 'Copy attributes', hint: `${MOD}+${ALT}+C`,
      run: () => actions.copyAttributes(clip.id) },
    { label: () => (many ? `Paste attributes to ${plural(selCount(), 'clip')}` : 'Paste attributes'),
      hint: `${MOD}+${ALT}+V`, when: () => actions.hasAttributes(),
      run: () => actions.pasteAttributes(many ? null : [clip.id]) },
    { label: 'Duplicate', hint: `${MOD}+D`, run: () => actions.duplicateSelected() },
    { label: () => `Group ${plural(selCount(), 'clip')} into one`, hint: `${MOD}+G`,
      when: () => selCount() > 1, run: () => actions.groupSelected() },
    { label: 'Ungroup', hint: `${MOD}+⇧+G`, when: () => clip.kind === 'compound',
      run: () => actions.ungroupSelected(clip.id) },
    { label: () => (many ? `Delete ${plural(selCount(), 'clip')}` : 'Delete'), hint: 'Del',
      danger: true, run: () => actions.deleteSelected() },
    { sep: true },

    { label: 'Take the sound off this clip', hint: 'Its own audio layer',
      when: () => hasSound, run: () => actions.detachAudio([clip.id]) },
    { label: () => (clip.volume === 0 ? 'Unmute' : 'Mute'),
      check: () => clip.volume === 0,
      run: () => actions.patchSelected((c) => { c.volume = c.volume === 0 ? 1 : 0; },
        clip.volume === 0 ? 'Unmute' : 'Mute') },
    { label: 'Hold this frame', hint: '2s freeze', when: () => inside && media?.kind === 'video',
      run: () => actions.freezeFrame(at) },
    { sep: true },

    { label: 'Speed and reverse', run: () => { actions.select([clip.id]); openInspector('speed'); } },
    { label: 'Colour and grade', run: () => { actions.select([clip.id]); openPanel('color'); } },
    { label: 'Effects', run: () => { actions.select([clip.id]); openPanel('effects'); } },
    { label: 'Audio', run: () => { actions.select([clip.id]); openPanel('audio'); } },
    { label: 'Find the cuts in this clip', when: () => media?.kind === 'video',
      hint: 'and split there',
      run: () => { actions.select([clip.id]); actions.detectScenes(clip.id); } },
    { label: 'Track something in this clip', when: () => media?.kind === 'video',
      run: () => { actions.select([clip.id]); openPanel('effects'); toast('Inspector → Motion tracking'); } },
    { sep: true },

    { label: () => (kf.isExpanded(clip.id) ? 'Hide layer properties' : 'Show layer properties'),
      run: () => { kf.toggleExpanded(clip.id); actions.refresh(); } },
    { label: () => `${kf.isGraphOpen() ? '✓ ' : ''}Graph editor`,
      when: () => licence.can('keyframes') || true,
      run: () => {
        if (!kf.isExpanded(clip.id)) kf.toggleExpanded(clip.id);
        kf.setGraph(!kf.isGraphOpen());
        actions.refresh();
      } },
    { sep: true },

    { label: 'Nudge one frame earlier', hint: '←', run: () => actions.nudge(-1 / fps()) },
    { label: 'Nudge one frame later', hint: '→', run: () => actions.nudge(1 / fps()) },
    { label: 'Rename…', run: () => renameClip(clip) },
    { label: 'Select everything on this layer',
      run: () => actions.selectTrack(clip.trackId) },
  ];
}

function fps() { return S.project.settings?.fps || 30; }

function openInspector() {
  openPanel('media');
  toast('Speed is in the Inspector, on the right');
}

async function renameClip(clip) {
  const name = window.prompt('Name this clip', clip.label || '');
  if (name === null) return;
  actions.patchSelected(() => { clip.label = name.trim().slice(0, 40) || null; }, 'Rename clip');
  if (!S.sel.has(clip.id)) { clip.label = name.trim().slice(0, 40) || null; actions.commit('Rename clip'); }
}

/* ------------------------------------------------------------------ */
/* empty track space                                                   */
/* ------------------------------------------------------------------ */

export function trackSpaceMenu(trackId, at) {
  const track = trackById(S.project, trackId);
  const n = clipsOn(S.project, trackId).length;
  return [
    ...editTop(),
    { label: 'Paste here', hint: `${MOD}+V`, when: () => actions.hasClipboard(),
      run: () => actions.pasteAt(at, trackId) },
    { label: 'Move the playhead here', run: () => actions.seek(Math.max(0, at)) },
    { label: 'Add a marker here', hint: 'M',
      run: () => { actions.seek(Math.max(0, at)); actions.addMarker(); } },
    { sep: true },
    { label: 'Import files…', hint: 'I', run: () => document.querySelector('#file-input')?.click() },
    { label: 'Add an adjustment layer', hint: 'grades everything below it',
      run: () => actions.addAdjustment() },
    { label: 'Add a video layer above', run: () => actions.addLayer('video', { above: trackId }) },
    { label: 'Add an audio layer', run: () => actions.addLayer('audio') },
    { sep: true },
    { label: `Select everything on ${track?.name || 'this layer'}`, when: () => n > 0,
      run: () => actions.selectTrack(trackId) },
    { label: 'Close the gaps on this layer', when: () => n > 1,
      run: () => actions.closeGapsOn(trackId) },
    { label: 'Select all clips', hint: `${MOD}+A`,
      run: () => actions.select(S.project.clips.map((c) => c.id)) },
    { sep: true },
    { label: 'Fit the whole timeline', hint: '⇧+Z',
      run: () => document.querySelector('#zoom-fit')?.click() },
    { label: 'History…', run: () => openHistory() },
  ];
}

/* ------------------------------------------------------------------ */
/* a layer header                                                      */
/* ------------------------------------------------------------------ */

export function trackHeadMenu(trackId) {
  const track = trackById(S.project, trackId);
  if (!track) return null;
  const n = clipsOn(S.project, trackId).length;
  const sameKind = S.project.tracks.filter((t) => t.kind === track.kind).length;

  return [
    ...editTop(),
    { label: () => (track.muted ? 'Unmute this layer' : 'Mute this layer'),
      check: () => track.muted, run: () => actions.toggleTrack(trackId, 'muted') },
    { label: () => (track.hidden ? 'Show this layer' : 'Hide this layer'),
      when: () => track.kind === 'video', check: () => track.hidden,
      run: () => actions.toggleTrack(trackId, 'hidden') },
    { label: () => (track.locked ? 'Unlock this layer' : 'Lock this layer'),
      check: () => track.locked, run: () => actions.toggleTrack(trackId, 'locked') },
    { label: () => (track.duck ? 'Stop ducking under voice' : 'Duck under voice'),
      when: () => track.kind === 'audio', check: () => track.duck,
      run: () => actions.toggleTrack(trackId, 'duck') },
    { sep: true },
    { label: 'Add a layer above this one',
      run: () => actions.addLayer(track.kind, { above: trackId }) },
    { label: `Add another ${track.kind} layer`, run: () => actions.addLayer(track.kind) },
    { sep: true },
    { label: 'Rename…', run: () => {
      const name = window.prompt('Name this layer', track.name);
      if (name !== null) actions.renameTrack(trackId, name);
    } },
    { label: 'Taller', when: () => track.height < 120,
      run: () => { track.height = Math.min(120, track.height + 14); actions.commit('Layer height'); } },
    { label: 'Shorter', when: () => track.height > 34,
      run: () => { track.height = Math.max(34, track.height - 14); actions.commit('Layer height'); } },
    { sep: true },
    { label: `Select everything on it`, when: () => n > 0, run: () => actions.selectTrack(trackId) },
    { label: 'Close the gaps', when: () => n > 1, run: () => actions.closeGapsOn(trackId) },
    { label: () => `Delete this layer${n ? ` and its ${plural(n, 'clip')}` : ''}`,
      danger: true, when: () => sameKind > 1,
      run: async () => {
        if (n && !await confirmDialog({
          title: `Delete ${track.name}?`,
          body: `It has ${plural(n, 'clip')} on it. Undo brings the whole layer back.`,
          confirm: 'Delete the layer',
        })) return;
        actions.removeLayer(trackId);
      } },
  ];
}

/* ------------------------------------------------------------------ */
/* the ruler                                                           */
/* ------------------------------------------------------------------ */

export function rulerMenu(at, markerAt = null) {
  return [
    ...editTop(),
    { label: 'Add a marker here', hint: 'M',
      run: () => { actions.seek(Math.max(0, at)); actions.addMarker(); } },
    { label: 'Delete this marker', danger: true, when: () => markerAt !== null,
      run: () => {
        S.project.markers = S.project.markers.filter((m) => Math.abs(m.t - markerAt) > 0.001);
        actions.commit('Delete marker');
      } },
    { label: 'Clear every marker', danger: true, when: () => S.project.markers.length > 0,
      run: () => { S.project.markers = []; actions.commit('Clear markers'); } },
    { sep: true },
    { label: 'Go to the start', hint: 'Home', run: () => actions.seek(0) },
    { label: 'Go to the end', hint: 'End', run: () => actions.seek(duration(S.project)) },
    { label: 'Fit the whole timeline', hint: '⇧+Z',
      run: () => document.querySelector('#zoom-fit')?.click() },
  ];
}

/* ------------------------------------------------------------------ */
/* a file in the pool                                                  */
/* ------------------------------------------------------------------ */

export function mediaMenu(mediaId) {
  const m = mediaById(S.project, mediaId);
  if (!m) return null;
  const used = S.project.clips.filter((c) => c.mediaId === mediaId).length;
  const span = m.duration ? `${m.duration.toFixed(1)}s` : 'unknown length';

  return [
    ...editTop(),
    { label: 'Add to the end of the timeline', run: () => actions.appendMedia(mediaId) },
    /*
     * Insert and overwrite, as two entries rather than one.
     *
     * There was one called "Insert at the playhead" and it did neither: it
     * found the next free gap, which is a third behaviour and the one nobody
     * asks for by name. Overwriting when you meant to insert loses work;
     * inserting when you meant to overwrite pushes the whole cut out of sync
     * with the music. Both are on the menu because the choice is the point.
     */
    { label: 'Insert here — push everything later', hint: 'Makes room',
      run: () => actions.placeMedia(mediaId, 'insert') },
    { label: 'Overwrite here', hint: 'Lands on top',
      run: () => actions.placeMedia(mediaId, 'overwrite') },
    { label: 'Lay it over the top as B-roll', when: () => m.kind !== 'audio',
      run: async () => {
        const { insertBroll } = await import('./engine/broll.js');
        const clip = insertBroll(S.project, mediaId, S.time, 1.6);
        if (clip) { actions.commit('Add B-roll'); actions.select([clip.id]); }
      } },
    { sep: true },
    { label: `Select its ${plural(used, 'clip')} on the timeline`, when: () => used > 0,
      run: () => actions.select(S.project.clips.filter((c) => c.mediaId === mediaId).map((c) => c.id)) },
    { label: () => `${m.width || '?'}×${m.height || '?'} · ${span}${
      m.tags?.length ? ` · ${m.tags.slice(0, 3).join(', ')}` : ''}`,
      when: () => false, run: () => {} },
    { sep: true },
    { label: 'Remove from the project', danger: true, run: async () => {
      if (used && !await confirmDialog({
        title: `Remove ${m.name}?`,
        body: `It is used by ${plural(used, 'clip')}. The file on your disk is untouched.`,
        confirm: 'Remove it',
      })) return;
      actions.removeMedia(mediaId);
    } },
  ];
}

/* ------------------------------------------------------------------ */
/* the picture                                                         */
/* ------------------------------------------------------------------ */

export function viewerMenu(api = {}) {
  return [
    ...editTop(),
    { label: 'Play / pause', hint: 'Space', run: () => api.togglePlay?.() },
    { label: 'Split at the playhead', hint: 'S', when: () => selCount() > 0,
      run: () => actions.splitAtPlayhead() },
    { sep: true },
    { label: () => `${api.isOn?.('safe') ? '✓ ' : ''}Safe zones`, check: () => api.isOn?.('safe'),
      run: () => api.toggle?.('safe') },
    { label: () => `${api.isOn?.('ratios') ? '✓ ' : ''}Every platform's crop`,
      check: () => api.isOn?.('ratios'), run: () => api.toggle?.('ratios') },
    { label: 'Scopes', run: () => openPanel('color') },
    { sep: true },
    { label: 'Copy this frame', run: () => copyFrame() },
    { label: 'Save this frame as a picture', run: () => saveFrame() },
    { sep: true },
    { label: 'Full screen', hint: 'F', run: () => api.fullscreen?.() },
    { label: 'Export…', hint: `${MOD}+E`, run: () => api.exportNow?.() },
  ];
}

function canvasNow() { return document.querySelector('#preview'); }

async function copyFrame() {
  const cv = canvasNow();
  if (!cv) { toast('No frame to copy', 'bad'); return; }
  try {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Frame copied', 'ok');
  } catch {
    // Clipboard images need a secure context and a permission; saying so beats
    // a button that silently does nothing.
    toast('This browser will not let a page copy an image. Save it instead.', 'bad', 5000);
  }
}

function saveFrame() {
  const cv = canvasNow();
  if (!cv) { toast('No frame to save', 'bad'); return; }
  cv.toBlob((blob) => {
    if (!blob) { toast('Could not read the frame', 'bad'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(S.project.name || 'frame').replace(/[^\w-]+/g, '-')}-${S.time.toFixed(2)}s.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Saved', 'ok');
  }, 'image/png');
}

export { openMenu, sourceSpan };
