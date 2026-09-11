# Built installers go here

Drop a built installer in this folder and name it in `studio/assets/config.js`
under `DOWNLOADS`, and the download page turns that platform's button into a
direct download from omnidx.net. Nobody is sent anywhere else.

```js
  mac:     { file: 'OmniDx-Studio-1.3.0.dmg', version: '1.3.0', size: '96 MB', ... },
  windows: { file: 'OmniDx-Studio-Setup-1.3.0.exe', version: '1.3.0', size: '78 MB', ... },
```

Leave `file` empty and that platform falls back to installing the web app,
which is one press and works on every platform today.

## Why these are not already here

Each installer has to be built on the operating system it targets — a `.dmg`
needs a Mac, an `.exe` needs Windows — and code signing needs certificates that
belong to you, not to a repository. See `docs/STUDIO-BUILD.md`.

## Size

GitHub refuses single files over 100 MB, and this folder is published through
GitHub Pages. An Electron build lands near that line. If one goes over, host it
on Cloudflare R2 or similar and put the full `https://` URL in `file` instead of
a filename — the page uses it either way.
