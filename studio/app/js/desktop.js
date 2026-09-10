/*
 * Desktop integration.
 *
 * Loaded unconditionally and does nothing at all in a browser — window.
 * omnidxDesktop only exists when the Electron preload put it there. That keeps
 * the check in one place instead of scattering `if (isDesktop)` through the
 * panels.
 *
 * The menu items deliberately drive the same actions the buttons do, rather
 * than a parallel set of handlers. A menu that can do something the UI cannot
 * is a menu that will drift out of step with it.
 */

import { $, toast } from './ui.js';

export function isDesktop() {
  return typeof window !== 'undefined' && Boolean(window.omnidxDesktop);
}

export function wireDesktop({ actions, openPanel, startTour, openExport, openPalette, setLevel }) {
  const bridge = window.omnidxDesktop;
  if (!bridge) return;

  document.documentElement.setAttribute('data-desktop', bridge.platform || 'yes');

  bridge.on('omnidx:new-project', () => actions.newProject());
  bridge.on('omnidx:import', () => $('#file-input').click());
  bridge.on('omnidx:save', () => actions.exportProjectFile());
  bridge.on('omnidx:export', () => openExport());
  bridge.on('omnidx:undo', () => actions.undo());
  bridge.on('omnidx:redo', () => actions.redo());
  bridge.on('omnidx:palette', () => openPalette());
  bridge.on('omnidx:theme', () => $('#btn-theme').click());
  bridge.on('omnidx:tour', () => startTour());
  bridge.on('omnidx:shortcuts', () => openPanel('help'));
  bridge.on('omnidx:level', (level) => setLevel(level));

  bridge.on('omnidx:open-project', async ({ path, json }) => {
    try {
      await actions.loadDocument(JSON.parse(json));
      toast(`Opened ${path.split(/[\\/]/).pop()}`, 'ok');
    } catch (err) {
      toast(`That file could not be opened: ${err.message}`, 'bad', 5000);
    }
  });
}

/**
 * Save bytes through a real file dialog when we have one, and fall back to a
 * browser download when we don't. Export and project-save both go through
 * here so neither has to know which one it got.
 */
export async function saveBytes(blob, filename) {
  if (!isDesktop()) return false;
  try {
    const out = await window.omnidxDesktop.saveFile(filename, await blob.arrayBuffer(), blob.type);
    if (out?.cancelled) return true;                 // handled: the user said no
    if (out?.path) {
      toast(`Saved to ${out.path}`, 'ok', 4200);
      window.omnidxDesktop.reveal(out.path);
    }
    return true;
  } catch {
    return false;                                    // fall back to the download
  }
}
