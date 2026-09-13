# OmniDx Studio for the desktop

An Electron window around the same editor the browser runs. See
[`docs/STUDIO-BUILD.md`](../../docs/STUDIO-BUILD.md) for signing and release
automation; this is the short version.

```bash
npm install
npm start          # run it
npm run dist       # installers into out/
```

## How it finds the editor

In development it loads `../app/index.html` directly. When packaged,
electron-builder copies `studio/app`, `studio/assets` and `icons` into the app's
resources and it loads them from there. Nothing is bundled or transpiled — the
same files run in both.

## Security

- `contextIsolation: true`, `nodeIntegration: false`. The editor needs no Node
  APIs, so it gets none.
- `preload.js` exposes exactly three functions: subscribe to a menu event, save
  bytes through a file dialog, reveal a file. Unknown IPC channels are ignored
  rather than forwarded.
- Any navigation away from our own files is cancelled and opened in the user's
  real browser. A window that can be navigated anywhere is a window that can be
  phished.
