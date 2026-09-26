/*
 * "Watch it work": the tutorial video in a dialog, opened by any link with
 * data-watch. Without JavaScript the same link opens the MP4 itself.
 *
 * WebM first (smaller, and what every current browser plays), MP4 after it
 * for Safari and older devices. Nothing loads until someone asks: the video
 * is preload="none" and the dialog is only built on the first click.
 * Closing it (the button, Esc or a click outside) pauses it; focus goes back
 * to the button that opened it.
 */
const BASE = new URL('./video/omnidx-tune-how-it-works', import.meta.url).href;

// What the video shows, in words: for anyone who cannot or would rather not watch.
const STEPS = [
  'Open Windows PowerShell: Start, type powershell, open it.',
  'Type or paste <code>irm omnidx.net/go.ps1 | iex</code> and press Enter. Windows asks for administrator rights; click Yes.',
  'The download is checked against its published fingerprint before it runs, then the OmniDx Tune window opens and reads your PC. Nothing changes yet.',
  'Untick anything that starts with Windows you want left on (Discord, in the video).',
  'Paste your key and click Run the tune. A restore point comes first, and the log shows every change as it happens (the video plays this part eight times faster).',
  'The run ends with the process count before and after. Restart for the real number.',
  "It also writes V-Sync off, motion blur off and lower shadows into your games' own settings files, each backed up first.",
  'The report it leaves has a BIOS checklist written for your exact board.',
  'Undo every run is one button.',
];

let dlg = null;

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'watch';
  dlg.setAttribute('aria-labelledby', 'watch-title');
  dlg.innerHTML = `<div class="watch-in">
    <div class="watch-head"><h2 id="watch-title">OmniDx Tune, start to finish</h2><button class="btn btn-sm watch-x" type="button" aria-label="Close the video">Close</button></div>
    <video controls playsinline preload="none" poster="${BASE}.jpg" width="1920" height="1080">
      <source src="${BASE}.webm" type="video/webm">
      <source src="${BASE}.mp4" type="video/mp4">
      <a href="${BASE}.mp4">Download the video (MP4)</a>
    </video>
    <p class="watch-note">An example run on the site's example PC. Your PC, your numbers. Music and sound, no voice; every step is on screen in words.</p>
    <details class="watch-tx"><summary>What the video shows, as text</summary><ol>${STEPS.map((s) => `<li>${s}</li>`).join('')}</ol></details>
  </div>`;
  document.body.appendChild(dlg);
  const video = dlg.querySelector('video');
  // Stop the sound the moment it is asked to close: the close event itself only arrives a moment later.
  const shut = () => { video.pause(); if (dlg.open) dlg.close(); };
  dlg.querySelector('.watch-x').addEventListener('click', shut);
  // A click on the dim backdrop lands on the dialog itself, never on its inner box.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) shut(); });
  dlg.addEventListener('cancel', () => video.pause());
  dlg.addEventListener('close', () => video.pause());
}

function open() {
  if (!dlg) build();
  if (!dlg.open) dlg.showModal();
  const video = dlg.querySelector('video');
  const p = video.play();
  if (p && p.catch) p.catch(() => {});
}

export function initWatch() {
  document.querySelectorAll('[data-watch]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // a new tab gets the file itself
      e.preventDefault();
      open();
    });
  });
  if (location.hash === '#watch') { if (!dlg) build(); dlg.showModal(); }
}
