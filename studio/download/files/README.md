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

## Where they come from

The **Desktop installers** workflow (Actions tab → Run workflow) builds all
three on the operating systems they need and hands them back as artifacts.
Put *every* file from those artifacts here — the installers and the
`latest.yml` / `latest-mac.yml` / `latest-linux.yml` next to them. Those
small files are how an installed copy learns a new version exists; the app
checks this folder once a week and updates itself in the background. See
`docs/STUDIO-BUILD.md`.

## Size

GitHub refuses single files over 100 MB, and this folder is published through
GitHub Pages. An Electron build lands near that line. If one goes over, host it
on Cloudflare R2 or similar and put the full `https://` URL in `file` instead of
a filename — the page uses it either way.
