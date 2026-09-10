/*
 * The only bridge between the editor and the operating system.
 *
 * Everything exposed here is a named, single-purpose function. The renderer
 * never gets `require`, `ipcRenderer` or anything it could use to reach further
 * than these five calls — which is the whole point of context isolation.
 */

const { contextBridge, ipcRenderer } = require('electron');

const MENU_EVENTS = [
  'omnidx:new-project', 'omnidx:import', 'omnidx:save', 'omnidx:export',
  'omnidx:undo', 'omnidx:redo', 'omnidx:palette', 'omnidx:theme',
  'omnidx:tour', 'omnidx:shortcuts', 'omnidx:level', 'omnidx:open-project',
];

contextBridge.exposeInMainWorld('omnidxDesktop', {
  version: process.versions.electron,
  platform: process.platform,

  /** Subscribe to a menu action. Unknown channels are ignored, not forwarded. */
  on(channel, handler) {
    if (!MENU_EVENTS.includes(channel)) return () => {};
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  /** Save bytes somewhere the user chooses. Used by export and project files. */
  saveFile(name, arrayBuffer, mime) {
    return ipcRenderer.invoke('omnidx:save-file', { name, data: new Uint8Array(arrayBuffer), mime });
  },

  reveal(path) {
    return ipcRenderer.invoke('omnidx:reveal', path);
  },
});
