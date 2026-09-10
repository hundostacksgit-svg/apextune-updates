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
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

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
/* ffmpeg: ProRes and DNxHR                                            */
/* ------------------------------------------------------------------ */

/*
 * Neither format can be produced by a browser at all, which is the whole
 * reason the desktop build exists for editors who need to hand a file to
 * someone else. ffmpeg is looked for once at startup: bundled next to the app
 * first, then on PATH, so a user who already has it does not need ours.
 */
let ffmpegPath = null;

function findFfmpeg() {
  const names = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
  const bundled = names.map((n) => path.join(process.resourcesPath || __dirname, 'ffmpeg', n));
  const local = names.map((n) => path.join(__dirname, 'ffmpeg', n));
  for (const candidate of [...bundled, ...local]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const probe = spawnSync(names[0], ['-version'], { encoding: 'utf8' });
  return probe.status === 0 ? names[0] : null;
}

ipcMain.on('omnidx:has-ffmpeg', (event) => {
  if (ffmpegPath === null) ffmpegPath = findFfmpeg();
  event.returnValue = Boolean(ffmpegPath);
});

const PROFILES = {
  // ProRes 422 (profile 2) is the interchange format everyone accepts. HQ and
  // 4444 exist but the file sizes stop being reasonable.
  prores: { ext: 'mov', args: ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le'] },
  dnxhr: { ext: 'mxf', args: ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_hq', '-pix_fmt', 'yuv422p', '-c:a', 'pcm_s16le'] },
};

ipcMain.handle('omnidx:transcode', async (_event, { data, format }) => {
  if (ffmpegPath === null) ffmpegPath = findFfmpeg();
  if (!ffmpegPath) return { error: 'ffmpeg was not found next to the app or on your PATH' };
  const profile = PROFILES[format];
  if (!profile) return { error: `unknown format "${format}"` };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnidx-'));
  const input = path.join(dir, 'in.mp4');
  const output = path.join(dir, `out.${profile.ext}`);
  fs.writeFileSync(input, Buffer.from(data));

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-y', '-i', input, ...profile.args, output]);
      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString().slice(-2000); });
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0
        ? resolve()
        : reject(new Error(stderr.split('\n').filter(Boolean).pop() || `ffmpeg exited ${code}`))));
    });
    return { data: fs.readFileSync(output) };
  } catch (err) {
    return { error: err.message };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
