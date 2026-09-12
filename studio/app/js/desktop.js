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

  bridge.on('omnidx:open-project', async ({ path, json, bytes }) => {
    const name = path.split(/[\\/]/).pop();
    try {
      if (bytes) {
        // A bundle: the same importer the start screen's "Open a project file" uses.
        await actions.openProjectFile(new File([bytes], name, { type: 'application/zip' }));
      } else {
        await actions.loadDocument(JSON.parse(json));
      }
      toast(`Opened ${name}`, 'ok');
    } catch (err) {
      toast(`That file could not be opened: ${err.message}`, 'bad', 5000);
    }
  });
  bridge.on('omnidx:open-media', async ({ name, bytes }) => {
    try {
      await actions.importFiles([new File([bytes], name)]);
    } catch (err) {
      toast(`That file could not be opened: ${err.message}`, 'bad', 5000);
    }
  });
  bridge.on('omnidx:update-ready', () => {
    toast('An update has downloaded — it installs next time you quit', '', 5000);
  });
}

/**
 * Can this build produce ProRes or DNxHR?
 *
 * No browser can encode either. The desktop build ships ffmpeg, so the answer
 * is yes there and no everywhere else — and the export dialog only offers them
 * when it is yes, rather than showing an option that fails at the end.
 */
export function proResAvailable() {
  return Boolean(window.omnidxDesktop?.transcode && window.omnidxDesktop?.hasFfmpeg);
}

/**
 * Hand a finished render to ffmpeg for a professional intermediate format.
 * Returns { blob, ext } or null when this build cannot do it.
 */
export async function transcode(blob, format) {
  if (!proResAvailable()) {
    throw new Error(`${format === 'prores' ? 'ProRes' : 'DNxHR'} needs the desktop app — no browser can encode it`);
  }
  const out = await window.omnidxDesktop.transcode(await blob.arrayBuffer(), format);
  if (!out?.data) throw new Error(out?.error || 'the conversion failed');
  return {
    blob: new Blob([out.data], { type: 'video/quicktime' }),
    ext: format === 'prores' ? 'mov' : 'mxf',
  };
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
