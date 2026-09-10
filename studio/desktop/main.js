/*
 * OmniDx Studio — desktop shell.
 *
 * A native window around the same editor the browser runs. Everything the app
 * does still happens in the renderer; what this adds is the handful of things
 * a web page is not allowed to do: real file dialogs, opening a .omnidx
 * project by double-clicking it, a proper menu bar with the app's own
 * shortcuts, and a window that does not disappear when someone tidies their
 * tabs.
 *
 * Security posture: context isolation on, node integration off, and a
 * navigation guard so the renderer can only ever load our own files. The
 * editor needs no Node APIs at all, so it gets none.
 */

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged;

/** Where the editor's files live: next door in dev, in resources when packaged. */
function appRoot() {
  return isDev
    ? path.join(__dirname, '..')
    : path.join(process.resourcesPath, 'studio');
}

let mainWindow = null;
let pendingOpen = null;      // a file passed before the window was ready

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#04060d' : '#eef2fa',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,          // the preload needs require(); the page still doesn't
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(appRoot(), 'app', 'index.html'));

  // Show only once there is something to look at, rather than a white rectangle.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (pendingOpen) { sendOpen(pendingOpen); pendingOpen = null; }
  });

  // Anything that isn't our own file opens in the real browser. A window that
  // can be navigated to an arbitrary page is a window that can be phished.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) { event.preventDefault(); shell.openExternal(url); }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ------------------------------------------------------------------ */
/* opening project files                                               */
/* ------------------------------------------------------------------ */

function sendOpen(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    mainWindow?.webContents.send('omnidx:open-project', { path: filePath, json: text });
  } catch (err) {
    dialog.showErrorBox('Could not open that project', err.message);
  }
}

function openDialog() {
  const picked = dialog.showOpenDialogSync(mainWindow, {
    title: 'Open an OmniDx project',
    filters: [{ name: 'OmniDx project', extensions: ['json', 'omnidx'] }],
    properties: ['openFile'],
  });
  if (picked?.[0]) sendOpen(picked[0]);
}

ipcMain.handle('omnidx:save-file', async (_event, { name, data, mime }) => {
  const target = dialog.showSaveDialogSync(mainWindow, {
    title: 'Save',
    defaultPath: name,
    filters: mime?.includes('json')
      ? [{ name: 'OmniDx project', extensions: ['json'] }]
      : [{ name: 'Video', extensions: ['mp4', 'webm'] }],
  });
  if (!target) return { cancelled: true };
  fs.writeFileSync(target, Buffer.from(data));
  return { path: target };
});

ipcMain.handle('omnidx:reveal', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

/* ------------------------------------------------------------------ */
/* menu                                                                */
/* ------------------------------------------------------------------ */

function buildMenu() {
  const send = (channel) => () => mainWindow?.webContents.send(channel);
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New project', accelerator: 'CmdOrCtrl+N', click: send('omnidx:new-project') },
        { label: 'Open project…', accelerator: 'CmdOrCtrl+O', click: openDialog },
        { type: 'separator' },
        { label: 'Import media…', accelerator: 'CmdOrCtrl+I', click: send('omnidx:import') },
        { type: 'separator' },
        { label: 'Save project file', accelerator: 'CmdOrCtrl+S', click: send('omnidx:save') },
        { label: 'Export video…', accelerator: 'CmdOrCtrl+E', click: send('omnidx:export') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('omnidx:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: send('omnidx:redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find anything…', accelerator: 'CmdOrCtrl+K', click: send('omnidx:palette') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Beginner', click: () => mainWindow?.webContents.send('omnidx:level', 'beginner') },
        { label: 'Intermediate', click: () => mainWindow?.webContents.send('omnidx:level', 'intermediate') },
        { label: 'Expert', click: () => mainWindow?.webContents.send('omnidx:level', 'expert') },
        { type: 'separator' },
        { label: 'Dark / light', click: send('omnidx:theme') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Walkthrough', click: send('omnidx:tour') },
        { label: 'Keyboard shortcuts', click: send('omnidx:shortcuts') },
        { type: 'separator' },
        { label: 'omnidx.net', click: () => shell.openExternal('https://omnidx.net/studio/') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* lifecycle                                                           */
/* ------------------------------------------------------------------ */

// One instance only: a second launch focuses the window we already have, and
// hands it whatever file was double-clicked.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = argv.find((a) => a.endsWith('.json') || a.endsWith('.omnidx'));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (file) sendOpen(file);
    }
  });

  app.on('open-file', (event, filePath) => {      // macOS
    event.preventDefault();
    if (mainWindow) sendOpen(filePath); else pendingOpen = filePath;
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    const file = process.argv.find((a) => a.endsWith('.omnidx') || a.endsWith('.omnidx.json'));
    if (file) pendingOpen = file;

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
