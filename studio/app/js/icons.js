/*
 * The icon set.
 *
 * One family of line icons, drawn on a 24-unit grid with a 1.75 stroke, in
 * the current text colour — so every button in the rail, the transport, the
 * timeline bar and the top bar is from the same hand. Emoji were the
 * alternative and they are the single thing that makes an interface look
 * like a chat app: each platform draws them differently, they sit on their
 * own baseline, they carry their own colour, and none of them line up.
 *
 * applyIcons() replaces the placeholder glyphs the markup ships with, keyed
 * by what the button is for (its panel, its tool, its id). The markup stays
 * readable and the tests keep their selectors; only the picture changes.
 */

const wrap = (body, extra = '') => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  /* ---- panels ---- */
  media: wrap('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M8 5v14M16 5v14"/>'),
  ai: wrap('<path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
  templates: wrap('<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>'),
  filters: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4M12 12L5.6 18.4M12 12l8.8-2.4M12 12L3.2 9.6"/>'),
  effects: wrap('<path d="M5 19L19 5"/><path d="M5 5l3 3M16 16l3 3M12 4v3M4 12h3M17 12h3M12 17v3"/>'),
  transitions: wrap('<path d="M4 8h10l-3-3M20 16H10l3 3"/><path d="M4 16v-2M20 8v2"/>'),
  overlays: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
  color: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" opacity=".55"/>'),
  text: wrap('<path d="M5 6h14M12 6v13M9 19h6"/>'),
  stickers: wrap('<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01"/><path d="M8 14.5c1 1.5 2.4 2.3 4 2.3s3-.8 4-2.3"/>'),
  shapes: wrap('<path d="M12 3l9 9-9 9-9-9z"/><path d="M12 8v8M8 12h8"/>'),
  audio: wrap('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  sound: wrap('<path d="M3 12h2l2-6 3 12 3-9 2 6 2-3h4"/>'),
  captions: wrap('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12h3M12 12h5M7 15.5h5M14 15.5h3"/>'),
  settings: wrap('<path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h13M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="19" cy="17" r="2"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.3"/><path d="M12 17h.01"/>'),

  /* ---- transport ---- */
  first: wrap('<path d="M6 5v14"/><path d="M18 6l-9 6 9 6z" fill="currentColor"/>'),
  back: wrap('<path d="M8 5v14"/><path d="M18 7l-7 5 7 5z" fill="currentColor"/>'),
  play: wrap('<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>'),
  pause: wrap('<path d="M8 5v14M16 5v14" stroke-width="2.6"/>'),
  fwd: wrap('<path d="M16 5v14"/><path d="M6 7l7 5-7 5z" fill="currentColor"/>'),
  last: wrap('<path d="M18 5v14"/><path d="M6 6l9 6-9 6z" fill="currentColor"/>'),

  /* ---- tools ---- */
  select: wrap('<path d="M5 3l14 9-6 1.5L16 20l-3 1.2-3-6.5L5 19z"/>'),
  trim: wrap('<path d="M12 4v16"/><path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
  razor: wrap('<circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M9 15.5L19 4M15 15.5L5 4"/>'),
  split: wrap('<path d="M12 3v18"/><rect x="4" y="8" width="5" height="8" rx="1"/><rect x="15" y="8" width="5" height="8" rx="1"/>'),
  trash: wrap('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'),
  dup: wrap('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>'),
  marker: wrap('<path d="M6 21V4h11l-3 4 3 4H6"/>'),
  videoLayer: wrap('<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M12 4v3M8 4h8"/>'),
  audioLayer: wrap('<path d="M4 15h3l3-4 3 8 3-6 2 2h2"/><path d="M12 4v3M8 4h8"/>'),
  fit: wrap('<path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5"/>'),
  zoomIn: wrap('<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4-4"/>'),
  zoomOut: wrap('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/>'),
  full: wrap('<path d="M4 4h6M4 4v6M20 20h-6M20 20v-6M20 4h-6M20 4v6M4 20h6M4 20v-6"/>'),
  hand: wrap('<path d="M8 11V6a1.5 1.5 0 0 1 3 0v5M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7"/><path d="M8 11.5V9a1.5 1.5 0 0 0-3 0v6a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6v-2"/>'),
  mask: wrap('<path d="M4 6c3-3 6 2 8 0s5-3 8 0v12c-3 3-6-2-8 0s-5 3-8 0z"/>'),
  title: wrap('<path d="M4 7V5h16v2M12 5v14M9 19h6"/>'),
  shape: wrap('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="4"/>'),
  sticker: wrap('<path d="M20 12a8 8 0 1 1-8-8h1v7h7z"/><path d="M13 4a8 8 0 0 1 7 7"/>'),
  adjust: wrap('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 12v5M12 12v5M16 12v5"/>'),
  nullObj: wrap('<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),

  /* ---- top bar ---- */
  undo: wrap('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: wrap('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  search: wrap('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  theme: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" opacity=".5"/>'),
  account: wrap('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  export: wrap('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  more: wrap('<circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  install: wrap('<path d="M12 3v11M7.5 9.5 12 14l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  folder: wrap('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  clock: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  gear: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  import: wrap('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  eye: wrap('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: wrap('<path d="M3 3l18 18"/><path d="M10.6 6.3A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.4 3.9M6.6 8.4A16.5 16.5 0 0 0 2 12s3.5 6 10 6a9.4 9.4 0 0 0 3-.5"/>'),
  mute: wrap('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9l5 6M21 9l-5 6"/>'),
  unmute: wrap('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  unlock: wrap('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
  solo: wrap('<path d="M15 8.5a3.5 3.5 0 0 0-3.5-3c-2 0-3.5 1.2-3.5 2.8 0 4 7 1.6 7 5.7 0 1.8-1.6 3-3.6 3A3.6 3.6 0 0 1 8 14.4"/>'),
  duck: wrap('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>'),
  parent: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  /* an eraser, tilted, with the sweep it leaves */
  erase: wrap('<path d="M13.5 4.5l6 6-8.5 8.5H7l-3.5-3.5 10-11z"/><path d="M9 9l6 6M4 21h16"/>'),
};

/* Where each icon goes: the button, found by what it is for. */
const PLACES = [
  ['.rail button[data-panel] > span', (b) => b.parentElement.dataset.panel],
  ['#tp-start', 'first'], ['#tp-back', 'back'], ['#tp-play', 'play'], ['#tp-fwd', 'fwd'], ['#tp-end', 'last'],
  ['.tl-btn[data-tool="select"]', 'select'], ['.tl-btn[data-tool="trim"]', 'trim'], ['.tl-btn[data-tool="razor"]', 'razor'],
  ['#tl-split', 'split', 'Split'], ['#tl-delete', 'trash'], ['#tl-dup', 'dup'], ['#tl-marker', 'marker'],
  ['#tl-add-video', 'videoLayer', 'Video layer'], ['#tl-add-audio', 'audioLayer', 'Audio layer'],
  ['#tl-import', 'import', 'Import'], ['#zoom-fit', 'fit'], ['#zoom-in', 'zoomIn'], ['#zoom-out', 'zoomOut'], ['#tl-full', 'full'],
  ['#btn-undo .ico', 'undo'], ['#btn-redo .ico', 'redo'], ['#btn-palette .ico', 'search'], ['#btn-theme .ico', 'theme'],
  ['#btn-account .ico', 'account'], ['#btn-install .ico', 'install'], ['#btn-export .ico', 'export'], ['#btn-more .ico', 'more'], ['#btn-proj .ico', 'gear'],
  ['#toolstrip [data-tool="select"]', 'select'], ['#toolstrip [data-tool="trim"]', 'trim'], ['#toolstrip [data-tool="razor"]', 'razor'],
  ['#toolstrip [data-tool="erase"]', 'erase'],
  ['#toolstrip [data-add="title"]', 'title'], ['#toolstrip [data-add="shape"]', 'shape'], ['#toolstrip [data-add="sticker"]', 'sticker'],
  ['#toolstrip [data-add="adjust"]', 'adjust'], ['#toolstrip [data-add="null"]', 'nullObj'],
];

/**
 * Put the icons in. Safe to call more than once; a button already carrying
 * an svg is left alone. `label` keeps a word next to the icon where the
 * button had one ("Split", "Import").
 */
export function applyIcons(root = document) {
  for (const [selector, which, label] of PLACES) {
    for (const node of root.querySelectorAll(selector)) {
      if (node.querySelector('svg')) continue;
      const id = typeof which === 'function' ? which(node) : which;
      const svg = ICONS[id];
      if (!svg) continue;
      node.innerHTML = label ? `${svg}<span class="lbl">${label}</span>` : svg;
      node.classList.add('has-ico');
    }
  }
}

/** An icon by name, for markup built at run time. */
export function icon(id, size = 16) {
  const svg = ICONS[id];
  return svg ? svg.replace('width="20" height="20"', `width="${size}" height="${size}"`) : '';
}
