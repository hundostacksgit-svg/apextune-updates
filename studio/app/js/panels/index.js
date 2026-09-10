/*
 * Panel routing.
 *
 * Each panel is a module with a mount(host) function. They are imported
 * eagerly rather than lazily because the whole editor is about 200 KB of
 * JavaScript — smaller than one frame of the video it edits — and a panel that
 * takes 300ms to appear the first time you click it feels broken.
 */

import { $, $$ } from '../ui.js';
import * as mediaPanel from './media.js';
import * as aiPanel from './ai.js';
import * as templatesPanel from './templates.js';
import * as effectsPanel from './effects.js';
import * as colorPanel from './color.js';
import * as textPanel from './text.js';
import * as audioPanel from './audio.js';
import * as captionsPanel from './captions.js';
import * as settingsPanel from './settings.js';
import * as helpPanel from './help.js';
import * as inspector from './inspector.js';

export const PANELS = {
  media: { title: 'Media', mod: mediaPanel },
  ai: { title: 'AI editor', mod: aiPanel },
  templates: { title: 'Styles', mod: templatesPanel },
  effects: { title: 'Effects', mod: effectsPanel },
  color: { title: 'Colour', mod: colorPanel },
  text: { title: 'Text', mod: textPanel },
  audio: { title: 'Audio', mod: audioPanel },
  captions: { title: 'Captions', mod: captionsPanel },
  settings: { title: 'Settings', mod: settingsPanel },
  help: { title: 'Learn', mod: helpPanel },
};

let currentName = null;

/** True when the panel is an overlay rather than a column. */
export function panelIsOverlay() {
  return window.matchMedia('(max-width: 760px)').matches;
}

export function closePanel() {
  $('#panel').classList.remove('open');
}

export function openPanel(name) {
  const entry = PANELS[name];
  if (!entry) return;
  // On a phone the panel covers the viewer, so tapping its own rail button
  // again has to put it away. Without this there is no way back to the video.
  if (panelIsOverlay() && name === currentName && $('#panel').classList.contains('open')) {
    closePanel();
    return;
  }
  currentName = name;
  $$('#rail [data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === name));
  const host = $('#panel');
  host.classList.add('open');           // matters only on phone-width layouts
  host.innerHTML = '';
  entry.mod.mount(host);
  host.classList.add('fade-in');
  setTimeout(() => host.classList.remove('fade-in'), 300);

  // Import the state lazily to avoid a circular import at module load.
  import('../main.js').then(({ S }) => { S.panel = name; });
}

/**
 * Re-render the open panel and the inspector after the project changes.
 *
 * Both are rebuilt from scratch, which is simple and fast enough — but it
 * throws away whatever the person was in the middle of using. Scroll position,
 * keyboard focus and the caret inside a text field are all restored around the
 * rebuild, because without that a single press of the left-arrow key on a
 * slider commits, re-renders, destroys the slider and drops focus: you nudge a
 * value once and the control is gone from under your finger.
 */
export function refreshPanel() {
  const panelHost = $('#panel');
  const entry = PANELS[currentName];
  if (entry) {
    const scrolled = panelHost.scrollTop;
    const keep = captureFocus(panelHost);
    panelHost.innerHTML = '';
    entry.mod.mount(panelHost);
    panelHost.scrollTop = scrolled;          // keep the reading position across edits
    restoreFocus(keep);
  }

  const inspectorHost = $('#inspector');
  const keep = captureFocus(inspectorHost);
  inspector.mount(inspectorHost);
  restoreFocus(keep);
}

/** What the person was using, if it was inside `host`. */
function captureFocus(host) {
  const el = document.activeElement;
  if (!host || !el || !host.contains(el) || !el.id) return null;
  const rec = { id: el.id };
  // Text fields also lose the caret, which is worse than losing focus: the
  // cursor jumps to the end mid-word.
  if (typeof el.selectionStart === 'number') {
    rec.start = el.selectionStart;
    rec.end = el.selectionEnd;
  }
  return rec;
}

function restoreFocus(rec) {
  if (!rec) return;
  const el = document.getElementById(rec.id);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (rec.start != null && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(rec.start, rec.end); } catch { /* not a text field any more */ }
  }
}

export function currentPanel() { return currentName; }
