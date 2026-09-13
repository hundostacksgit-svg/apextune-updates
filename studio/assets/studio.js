/*
 * Landing-site behaviour: theme, the menu box, the section rail, scroll
 * reveals, pricing, platform detection on the download page, and the account
 * screens. No framework and no build step — the same rule the rest of OmniDx
 * follows.
 */

import { EDITIONS, priceOf, buyUrl, PAY, DEVICE_LIMIT, SEATS, DOWNLOADS, downloadUrl } from './config.js';
import * as auth from './auth.js';
import { mountRating } from './rate.js';

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ */
/* theme                                                               */
/* ------------------------------------------------------------------ */
const THEME_KEY = 'omnidx.theme';

export function applyTheme(t) {
  const theme = t || localStorage.getItem(THEME_KEY)
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f4f7fe' : '#04060d');
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  return theme;
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
}

/* ------------------------------------------------------------------ */
/* toast                                                               */
/* ------------------------------------------------------------------ */
export function toast(msg, kind = '') {
  let host = $('.toast-host');
  if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, 2800);
}

/* ------------------------------------------------------------------ */
/* scroll reveal                                                       */
/* ------------------------------------------------------------------ */
function initReveal() {
  const items = $$('.reveal');
  if (!items.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
  items.forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ */
/* support address                                                     */
/* ------------------------------------------------------------------ */
/*
 * One address, written into config.js, rendered anywhere a page marks a spot
 * with `data-support`. Nothing hard-codes it, so changing it is one line and
 * cannot leave a stale address behind on a page somebody forgot.
 *
 * If it is not set, the spots disappear rather than showing an empty mailto —
 * a "Contact us" link that opens a blank email is worse than no link.
 */
function initSupport() {
  const spots = $$('[data-support]');
  if (!spots.length) return;
  const addr = (PAY.supportEmail || '').trim();
  for (const el of spots) {
    if (!addr) { el.hidden = true; continue; }
    const subject = el.dataset.support || 'OmniDx Studio';
    el.innerHTML = `<a href="mailto:${esc(addr)}?subject=${encodeURIComponent(subject)}">${esc(addr)}</a>`;
    el.hidden = false;
  }
}

/* ------------------------------------------------------------------ */
/* the menu box                                                        */
/* ------------------------------------------------------------------ */
/*
 * Panels open on hover with a pointer and on click with a finger or a
 * keyboard. Both paths set the same `data-open` attribute, so there is one
 * state to reason about and CSS does the animating.
 */
function initMenuBox() {
  const groups = $$('[data-mb]');
  if (!groups.length) return;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

  const close = (g) => {
    g.removeAttribute('data-open');
    delete g.dataset.pinned;
    g.querySelector('.mb-btn')?.setAttribute('aria-expanded', 'false');
  };
  const closeAll = (except) => groups.forEach((g) => { if (g !== except) close(g); });
  const open = (g) => {
    closeAll(g);
    g.setAttribute('data-open', '');
    g.querySelector('.mb-btn')?.setAttribute('aria-expanded', 'true');
  };

  groups.forEach((g) => {
    const btn = g.querySelector('.mb-btn');
    let leaveTimer = 0;

    /*
     * Clicking a button the pointer is already hovering must not close the
     * panel that hovering just opened — that reads as the menu fighting you.
     * So a click pins an open panel instead of toggling it, and only a click
     * on an already-pinned panel closes it. With a finger there is no hover,
     * so the first click opens and pins in one go and the behaviour is the
     * plain toggle people expect.
     */
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (g.dataset.pinned) { close(g); return; }
      open(g);
      g.dataset.pinned = '1';
    });

    if (fine) {
      g.addEventListener('pointerenter', () => { clearTimeout(leaveTimer); open(g); });
      // A short grace period: crossing the gap between the button and the panel
      // should not slam it shut under the pointer. A pinned panel stays put
      // until something closes it deliberately.
      g.addEventListener('pointerleave', () => {
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => { if (!g.dataset.pinned) close(g); }, 140);
      });
    }

    // Escape closes and puts focus back where it started, and Tab out of the
    // last link closes too — otherwise a panel hangs open behind the page.
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(g); btn.focus(); }
    });
    g.addEventListener('focusout', (e) => {
      if (!g.contains(e.relatedTarget)) close(g);
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-mb]')) closeAll(null);
  });
}

/* ------------------------------------------------------------------ */
/* the phone drawer                                                    */
/* ------------------------------------------------------------------ */
function initDrawer() {
  const btn = $('[data-drawer]');
  const drawer = $('#drawer');
  if (!btn || !drawer) return;

  const set = (open) => {
    drawer.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    // Locking the body stops the page scrolling underneath the open drawer,
    // which on a phone reads as the menu having lost your place.
    document.body.classList.toggle('drawer-open', open);
  };

  btn.addEventListener('click', () => set(drawer.hidden));
  drawer.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) set(false); });
  // Rotating to landscape or opening a laptop lid can put the full menu box
  // back on screen; leaving the drawer open over it would be two menus at once.
  matchMedia('(min-width:1001px)').addEventListener('change', (m) => { if (m.matches) set(false); });
}

/* ------------------------------------------------------------------ */
/* section rail — the scroll indicator                                 */
/* ------------------------------------------------------------------ */
/*
 * Every section of the page becomes a dot on the right-hand edge, and the one
 * you are looking at lights up as you scroll either way. Labels are taken from
 * `data-rail`, falling back to the section's own heading, so a new section
 * joins the rail with nothing to register.
 *
 * The active section is whichever one covers the middle of the viewport. That
 * beats "first one intersecting", which flickers between two neighbours on a
 * fast scroll and picks the wrong one for a section shorter than the screen.
 */
function initRail() {
  const sections = $$('[data-rail], section[id], header[id]')
    .filter((el, i, all) => all.indexOf(el) === i)
    .filter((el) => el.id && el.dataset.rail !== 'off');
  if (sections.length < 3) return;
  if (!$('.rail')) {
    const rail = document.createElement('nav');
    rail.className = 'rail';
    rail.setAttribute('aria-label', 'Sections on this page');
    rail.innerHTML = sections.map((el) => {
      const label = el.dataset.rail || el.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 26)
        || el.id.replace(/-/g, ' ');
      return `<a href="#${esc(el.id)}" data-rail-to="${esc(el.id)}">
        <span class="lbl">${esc(label)}</span><span class="dot"></span></a>`;
    }).join('');
    document.body.appendChild(rail);
  }

  const links = new Map($$('[data-rail-to]').map((a) => [a.dataset.railTo, a]));
  const bar = $('[data-progress]');
  let current = '';
  let queued = false;

  function update() {
    queued = false;
    const mid = scrollY + innerHeight / 2;
    let pick = sections[0];
    for (const el of sections) {
      const top = el.offsetTop;
      if (top <= mid) pick = el; else break;
    }
    // Right at the bottom the last section may never reach the midpoint —
    // someone who has scrolled to the end is in the last section, full stop.
    if (scrollY + innerHeight >= document.body.scrollHeight - 4) pick = sections[sections.length - 1];

    if (pick.id !== current) {
      links.get(current)?.classList.remove('on');
      links.get(pick.id)?.classList.add('on');
      links.get(pick.id)?.setAttribute('aria-current', 'true');
      links.get(current)?.removeAttribute('aria-current');
      current = pick.id;
    }
    if (bar) {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = `${max > 0 ? Math.min(100, (scrollY / max) * 100) : 0}%`;
    }
  }

  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
}

/* ------------------------------------------------------------------ */
/* pricing                                                             */
/* ------------------------------------------------------------------ */
function initPricing() {
  const host = $('#tiers');
  if (!host) return;

  const FEATURES = {
    free: [
      ['Unlimited projects and exports', 1],
      ['Multitrack timeline, trim, split, ripple', 1],
      ['Transitions, titles, audio mixing', 1],
      ['20 colour filters and looks', 1],
      ['All 11 one-tap edit styles', 1],
      ['13 creative audio filters — underwater, radio…', 1],
      ['Stickers, callouts and shapes', 1],
      ['Automatic proxies for slow machines', 1],
      ['1080p export, no watermark', 1],
      ['Works offline, no account required', 1],
      ['AI editing', 0],
      ['Auto-captions', 0],
      ['4K export', 0],
    ],
    creator: [
      ['Everything in Starter', 1],
      ['AI editing — 200 actions a month', 1],
      ['Auto-captions with styled presets', 1],
      ['All 60+ filters, looks and LUT slots', 1],
      ['All 18 effects and motion tracking', 1],
      ['Three-way colour wheels', 1],
      ['Studio audio repair — noise, hum, clicks', 1],
      ['4K / 60fps and H.265 export', 1],
      ['Speed ramps and keyframe curves', 1],
      ['Beat-synced auto-cutting', 1],
      ['Silence removal', 1],
      ['Brand kit — fonts, colours, logo', 1],
    ],
    studio: [
      ['Everything in Creator', 1],
      ['Unlimited AI editing', 1],
      ['Apple ProRes and DNxHR on desktop', 1],
      ['Project sync across 10 devices', 1],
      ['Custom LUT slots, unlimited', 1],
      ['Scopes and the full colour panel', 1],
      ['Every future update included, free', 1],
      ['Background removal, no green screen', 1],
      ['Multicam — angles synced by their own audio', 1],
      ['Voice isolation — building', 2],
    ],
    team: [
      ['Everything in Studio, for three people', 1],
      ['Exactly 3 seats — enforced, not suggested', 1],
      ['Shared projects and a shared licence', 1],
      ['9 devices across the three of you', 1],
      ['Unlimited AI for all three', 1],
      ['One payment, no per-seat billing', 1],
      ['Every future update included, free', 1],
    ],
  };

  function card(id) {
    const e = EDITIONS[id];
    // The struck-through figure is what three individual Studio licences cost,
    // which is a real number anyone can check — not a price we invented and
    // never charged.
    const anchor = e.compareTo
      ? `<span class="anchor"><s>$${e.compareTo.toFixed(2)}</s> ${esc(e.compareLabel)}</span>`
      : '';
    const feat = FEATURES[id].map(([t, on]) => {
      // 1 = shipped, 0 = not in this edition, 2 = being built, included free
      const cls = on === 1 ? '' : on === 2 ? 'soon' : 'no';
      return `<li class="${cls}">${esc(t)}</li>`;
    }).join('');
    const featured = id === 'creator';
    const sub = id === 'free'
      ? 'Forever. No card, no trial clock.'
      : 'One payment. Yours permanently.';
    const cta = id === 'free'
      ? `<a class="btn btn-lg" href="../app/">Open the editor</a>`
      : `<a class="btn btn-primary btn-lg" href="${esc(buyUrl(id))}" data-buy="${id}" rel="noopener">Get ${esc(e.name)}</a>`;
    return `<div class="tier ${featured ? 'featured' : ''}">
      ${featured ? '<span class="badge-top">Most popular</span>' : ''}
      <div class="tname">${esc(e.name)}</div>
      <div class="amount">${esc(priceOf(id))}</div>
      ${anchor}
      <p class="sub">${esc(sub)}</p>
      <p class="small" style="margin:10px 0 0">${esc(e.blurb)}</p>
      <ul>${feat}</ul>
      ${cta}
      <p class="tiny muted" style="margin:12px 0 0;text-align:center">
        ${id === 'free' ? 'Nothing to cancel, because there is nothing to renew.'
          : SEATS[id] > 1 ? `${SEATS[id]} people · ${DEVICE_LIMIT[id]} devices · 14-day refund`
          : `Up to ${DEVICE_LIMIT[id]} devices · 14-day refund, no questions`}
      </p>
    </div>`;
  }

  host.innerHTML = ['free', 'creator', 'studio', 'team'].map(card).join('');
  $$('#tiers [data-buy]').forEach((a) => a.addEventListener('click', (ev) => {
    if (a.getAttribute('href') === PAY.cashAppUrl) {
      ev.preventDefault();
      location.href = `../account/?buy=${a.dataset.buy}`;
    }
  }));
}


/* ------------------------------------------------------------------ */
/* comparison table                                                    */
/* ------------------------------------------------------------------ */
/* Rows are [label, starter, creator, studio]. A string renders as text,
   true as a tick, false as a dash — so "1080p" and "yes" live in one table. */
const COMPARE = [
  ['— Editing', null, null, null],
  ['Video &amp; audio tracks', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Trim, ripple, roll, slip, razor', true, true, true],
  ['Transitions', '8', 'All 20', 'All 20'],
  ['Titles &amp; animated text', true, true, true],
  ['Keyframes with bezier easing', false, true, true],
  ['Speed ramps &amp; time remap', false, true, true],
  ['One-tap edit styles', 'All 11', 'All 11', 'All 11'],
  ['Motion tracking', false, true, true],
  ['Remove an object by tapping it', false, true, true],
  ['Multicam sync by audio', false, false, true],

  ['— Look', null, null, null],
  ['Colour sliders &amp; curves', 'Sliders', true, true],
  ['Filters and looks', '20', '60+', '60+'],
  ['Effects (motion blur, glow, speed lines…)', '78', 'All 340', 'All 340'],
  ['Three-way colour wheels', false, true, true],
  ['Stickers &amp; callouts', true, true, true],
  ['Custom LUT slots', false, '4', 'Unlimited'],
  ['Scopes (waveform, vectorscope)', false, true, true],
  ['Background removal, no green screen', false, false, true],
  ['Auto-reframe to any ratio', true, true, true],

  ['— Motion design', null, null, null],
  ['Expressions (wiggle, loop, beat, audio)', false, true, true],
  ['Shape layers with trim paths and a repeater', false, true, true],
  ['Text animators, per character', false, true, true],
  ['Parenting, null objects, anchor points', true, true, true],
  ['Particles, fractal noise, displacement, echo, posterize time', false, true, true],
  ['Audio spectrum &amp; waveform layers', false, true, true],
  ['Tracked lens flare, light sweep, gradient ramp, fill', false, true, true],

  ['— AI', null, null, null],
  ['AI edit assistant', false, '200 / month', 'Unlimited'],
  ['Captions, timed to the speech for you', false, true, true],
  ['Speech typed out for you (transcription)', false, 'Building', 'Building'],
  ['Beat-synced cutting', false, true, true],
  ['Silence removal', false, true, true],
  ['Voice isolation &amp; noise removal', false, false, 'Building'],

  ['— Audio', null, null, null],
  ['Mixing, fades, volume curves', true, true, true],
  ['Ducking under voice', true, true, true],
  ['Waveforms &amp; beat detection', true, true, true],
  ['Creative audio filters (underwater, radio…)', '13', 'All 17', 'All 17'],
  ['Noise reduction, hum and click repair', false, true, true],
  ['Automatic level matching', false, true, true],

  ['— Export', null, null, null],
  ['H.264 / MP4', true, true, true],
  ['H.265 / HEVC', false, true, true],
  ['Apple ProRes &amp; DNxHR (desktop)', false, false, true],
  ['Automatic proxies', true, true, true],
  ['Project bundles with footage', true, true, true],
  ['Watermark', 'None', 'None', 'None'],
  ['Maximum resolution', '1080p', '4K / 60', '4K / 60'],
  ['Platform presets with safe zones', true, true, true],
  ['Background rendering', true, true, true],

  ['— Everything else', null, null, null],
  ['Works offline', true, true, true],
  ['Autosave &amp; crash recovery', true, true, true],
  ['People on the licence', '1', '1', '1'],
  ['Devices per licence', '2', '3', '10'],
  ['Project sync across devices', false, false, true],
  ['Brand kit (fonts, colours, logo)', false, true, true],
  ['Future updates included', true, true, true],
  ['How you pay', 'Free', 'Once', 'Once'],
  ['Anything that renews', false, false, false],
];

function cell(v) {
  if (v === true) return '<span style="color:var(--ok);font-weight:800">✓</span>';
  if (v === false) return '<span style="color:var(--text-3)">—</span>';
  return `<span class="small">${v}</span>`;
}

function initCompare() {
  const body = $('#compare-body');
  if (!body) return;
  const note = $('#compare-note');
  if (note) {
    note.innerHTML = 'Rows marked <b>Building</b> are not in the app yet. They are '
      + 'listed because a Studio licence includes them the day they land, at no extra cost — '
      + 'but do not buy today for something on that list. Everything else in this table '
      + 'is in the build you can open right now, for free, without giving us anything.';
  }
  body.innerHTML = COMPARE.map(([label, a, b, c]) => {
    if (a === null) {
      return `<tr><td colspan="4" style="padding:20px 20px 8px;font-size:12px;font-weight:750;
        letter-spacing:.12em;text-transform:uppercase;color:var(--blue-2);border-top:1px solid var(--line)">
        ${label.replace('— ', '')}</td></tr>`;
    }
    return `<tr style="border-top:1px solid var(--line-soft)">
      <td style="padding:12px 20px;color:var(--text-2)">${label}</td>
      <td style="padding:12px;text-align:center">${cell(a)}</td>
      <td style="padding:12px;text-align:center;background:color-mix(in srgb,var(--blue) 7%,transparent)">${cell(b)}</td>
      <td style="padding:12px;text-align:center">${cell(c)}</td>
    </tr>`;
  }).join('');
}


/* ------------------------------------------------------------------ */
/* the AI demo on the landing page                                     */
/* ------------------------------------------------------------------ */
/* Imports the same planner the app runs, against a pretend media pool. What a
   visitor sees here is exactly what they would get in the editor — a demo that
   fakes its output is worse than no demo. */

const DEMO_MEDIA = [
  { kind: 'video', name: 'beach_a.mp4', duration: 22, hasAudio: true },
  { kind: 'video', name: 'drone_02.mov', duration: 31, hasAudio: false },
  { kind: 'video', name: 'sunset.mp4', duration: 17, hasAudio: true },
  { kind: 'image', name: 'poster.jpg', duration: 5, hasAudio: false },
  { kind: 'audio', name: 'track.mp3', duration: 148, hasAudio: true },
];

async function initAiDemo() {
  const box = $('#ai-demo');
  if (!box) return;
  let plan;
  try {
    ({ plan } = await import('../app/js/ai/planner.js'));
  } catch {
    box.remove();                 // planner unavailable — better absent than broken
    return;
  }

  const run = () => {
    const prompt = $('#ai-input').value.trim();
    if (!prompt) return;
    const result = plan(prompt, {
      media: DEMO_MEDIA,
      ratio: '16:9',
      beats: { bpm: 124, period: 60 / 124, beats: Array.from({ length: 300 }, (_, i) => i * (60 / 124)) },
      canTranscribe: false,
    });

    $('#ai-out').innerHTML = `
      <div class="note info" style="margin-top:0"><b>The plan</b> — ${esc(result.summary)}</div>
      ${(result.warnings || []).map((w) => `<div class="note tiny">${esc(w)}</div>`).join('')}
      ${result.steps.map((s, i) => `
        <div style="display:flex;gap:12px;padding:13px 0;border-bottom:1px solid var(--line-soft)">
          <span class="mono tiny" style="color:var(--blue-2);flex:none;padding-top:2px">${
            String(i + 1).padStart(2, '0')}</span>
          <span><b style="font-size:14.5px">${esc(s.label)}</b>
            ${s.detail ? `<br><span class="small muted">${esc(s.detail)}</span>` : ''}</span>
        </div>`).join('')}
      <p class="tiny muted" style="margin-top:16px">
        In the app each of these lands on the timeline as a normal edit you can drag, trim or undo.
        <a href="app/">Try it with your own clips →</a>
      </p>`;
  };

  $('#ai-run').addEventListener('click', run);
  $('#ai-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  $$('#ai-examples [data-p]').forEach((b) => b.addEventListener('click', () => {
    $('#ai-input').value = b.dataset.p;
    run();
  }));
  run();
}

/* ------------------------------------------------------------------ */
/* download page                                                       */
/* ------------------------------------------------------------------ */
export function detectPlatform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac OS X/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'web';
}

/**
 * Which browser, because the install route is the browser's, not the OS's:
 * Safari on a Mac is File → Add to Dock, Chrome and Edge have a prompt,
 * Firefox on a desktop cannot install at all. The page says the true thing
 * for each rather than one line that is wrong for most.
 */
export function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox\/|FxiOS/.test(ua)) return 'firefox';
  if (/CriOS|Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

/** The menu route for this browser on this platform: { steps[], note }. */
export function installSteps(os, br) {
  if (os === 'ios') {
    return { steps: [
      br === 'safari' ? 'Open this page in <b>Safari</b> — you are in it now.' : 'Open this page in <b>Safari</b> (Chrome on an iPhone can also do this from its Share menu on iOS 16.4 or newer).',
      'Press <b>Share</b> <span class="kbd">↑</span> at the bottom of the screen.',
      'Scroll down and choose <b>Add to Home Screen</b>.',
    ], note: '' };
  }
  if (os === 'android') {
    if (br === 'samsung') return { steps: ['Open the <b>≡</b> menu in Samsung Internet.', 'Choose <b>Add page to</b> → <b>Home screen</b>.', 'Confirm.'], note: '' };
    if (br === 'firefox') return { steps: ['Open the <b>⋮</b> menu in Firefox.', 'Choose <b>Install</b>.', 'Confirm.'], note: '' };
    return { steps: ['Open the <b>⋮</b> menu in Chrome.', 'Choose <b>Install app</b>.', 'Confirm. It lands in your app drawer.'], note: '' };
  }
  if (br === 'safari') return { steps: ['Open <a href="../app/">the editor</a> in Safari.', 'In the menu bar choose <b>File</b> → <b>Add to Dock…</b>', 'Press <b>Add</b>.'], note: 'Needs Safari 17 (macOS Sonoma) or newer. On an older Mac, Chrome or Edge do the same in one press.' };
  if (br === 'firefox') return { steps: ['<a href="../app/">Open the editor</a> — everything works in Firefox, offline included.', 'For a dock icon and its own window, open the same address once in <b>Chrome</b>, <b>Edge</b> or <b>Safari</b> and press Install there.'], note: 'Firefox removed app install from the desktop version; no site can turn it back on.' };
  if (br === 'edge') return { steps: ['Open <a href="../app/">the editor</a> in Edge.', 'Open the <b>⋯</b> menu → <b>Apps</b> → <b>Install OmniDx Studio</b>.', 'Press <b>Install</b>.'], note: 'Or press the install icon at the right end of the address bar.' };
  return { steps: ['Open <a href="../app/">the editor</a> in Chrome.', 'Press the <b>install icon</b> at the right end of the address bar, or <b>⋮</b> → <b>Cast, save and share</b> → <b>Install page as app…</b>', 'Press <b>Install</b>.'], note: 'Double-clicking a project or a video then opens it there.' };
}

function initDownloads() {
  const host = $('#downloads');
  if (!host) return;
  const me = detectPlatform();
  const br = detectBrowser();

  /*
   * The install prompt only exists in browsers that offer it, and it only fires
   * from a real click. So it is captured when the browser announces it and
   * replayed on a press — a button that would silently do nothing is worse than
   * one that is not there.
   */
  let deferred = null;
  let installed = matchMedia('(display-mode: standalone)').matches;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; paint(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; paint(); });

  /** The steps for a platform, in this browser. iOS has no prompt API at all. */
  const stepsFor = (os) => {
    const s = installSteps(os, os === me ? br : (os === 'ios' ? 'safari' : os === 'android' ? 'chrome' : 'chrome'));
    return `<ol class="steps">${s.steps.map((x) => `<li>${x}</li>`).join('')}</ol>${s.note ? `<p class="tiny muted" style="margin:8px 0 0">${s.note}</p>` : ''}`;
  };
  const iosSteps = stepsFor('ios');

  function action(os) {
    const url = downloadUrl(os);
    const d = DOWNLOADS[os] || {};

    // A real installer to hand: give them the file and nothing else.
    if (url) {
      return `<a class="btn btn-primary" href="${esc(url)}" download>
        Download${d.version ? ` ${esc(d.version)}` : ''}</a>
        ${d.size ? `<div class="tiny muted" style="margin-top:6px">${esc(d.size)}</div>` : ''}`;
    }

    if (installed && (os === me || os === 'web')) {
      return `<a class="btn btn-primary" href="../app/">Open the app</a>
        <div class="tiny muted" style="margin-top:6px">Already installed on this device.</div>`;
    }

    // No installer built yet. The web app is not a consolation prize — it is
    // the same editor, it installs in one press, and it works offline.
    if (d.install === 'safari' || (os === 'ios')) {
      return `<button class="btn btn-primary" data-ios>Add to Home Screen</button>`;
    }
    if (deferred && (os === me || os === 'web')) {
      return `<button class="btn btn-primary" data-install-now>Install the app</button>`;
    }
    // A desktop, in this browser: the real route, not "see your browser".
    if (os === me && br === 'firefox') {
      return `<a class="btn btn-primary" href="../app/">Open the editor</a>
        <button class="btn btn-sm btn-ghost" data-steps="${os}" style="margin-top:8px">Firefox and installing</button>`;
    }
    if (os === me && br === 'safari') {
      return `<button class="btn btn-primary" data-steps="${os}">Add to the Dock</button>`;
    }
    if (os === me) {
      return `<button class="btn btn-primary" data-steps="${os}">Install the app</button>`;
    }
    return `<a class="btn btn-primary" href="../app/">Open the editor</a>
      <div class="tiny muted" style="margin-top:6px">Then choose <b>Install</b> in your browser</div>`;
  }

  function card(os) {
    const d = DOWNLOADS[os];
    const icon = { mac: '🍎', windows: '🪟', linux: '🐧', ios: '📱', android: '🤖', web: '🌐' }[os];
    const mine = os === me;
    return `<div class="dl ${mine ? 'detected' : ''}" data-os="${os}">
      ${mine ? '<span class="you">Your device</span>' : ''}
      <div class="os">${icon}</div><h3>${esc(d.label)}</h3>
      <div class="meta">${esc(d.note)}</div>
      ${action(os)}
    </div>`;
  }

  function paint() {
    // The visitor's own platform first — nobody should have to hunt for it.
    const order = ['mac', 'windows', 'ios', 'android', 'linux', 'web']
      .sort((a, b) => (b === me ? 1 : 0) - (a === me ? 1 : 0));
    host.innerHTML = order.map(card).join('');

    $$('[data-install-now]', host).forEach((b) => b.addEventListener('click', async () => {
      if (!deferred) { toast('Use your browser menu → Install'); return; }
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') { installed = true; toast('Installing…', 'ok'); }
      paint();
    }));

    $$('[data-ios]', host).forEach((b) => b.addEventListener('click', () => {
      const box = b.closest('.dl');
      if (box.querySelector('.steps')) { box.querySelector('.ios-steps').remove(); return; }
      b.insertAdjacentHTML('afterend', `<div class="ios-steps">${iosSteps}</div>`);
    }));
    // The same unfold for a desktop: the steps for this browser, under the button.
    $$('[data-steps]', host).forEach((b) => b.addEventListener('click', () => {
      const box = b.closest('.dl');
      if (box.querySelector('.steps')) { box.querySelector('.ios-steps').remove(); return; }
      b.insertAdjacentHTML('afterend', `<div class="ios-steps">${stepsFor(b.dataset.steps)}</div>`);
    }));
  }

  paint();

  // The banner at the top of the page gets the same treatment.
  $$('[data-install]').forEach((b) => b.addEventListener('click', async () => {
    if (!deferred) { toast('Use your browser menu → Install, or Share → Add to Home Screen'); return; }
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
  }));
}

/* ------------------------------------------------------------------ */
/* the nav's account link                                              */
/* ------------------------------------------------------------------ */

/**
 * Show who is signed in, on every page.
 *
 * "Log in" sitting there permanently while you are already signed in is the
 * thing every site gets right and this one did not: the resume only ran on the
 * account page, so the rest of the site had no idea who you were and offered
 * to log you in again.
 *
 * Now the remembered session is picked up before anything paints, and the link
 * becomes your name. Clicking it goes to the account page — which, being
 * already signed in, shows the account rather than a form.
 */
async function initNavAccount() {
  const links = $$('.nav-login');
  if (!links.length) return;

  try { await auth.resumeRemembered(); } catch { /* no session to resume */ }
  const session = auth.session();
  if (!session?.email && !session?.name) return;

  // First name, or the part of the email before the @. Full email addresses in
  // a nav bar wrap, truncate badly, and tell everyone looking over a shoulder
  // more than they need to know.
  const shown = (session.name || '').trim().split(/\s+/)[0]
    || (session.email || '').split('@')[0]
    || 'Account';
  const edition = EDITIONS[auth.edition()]?.name;

  for (const link of links) {
    link.textContent = shown;
    link.classList.add('signed-in');
    link.title = edition
      ? `${session.email || shown} — ${edition}`
      : (session.email || shown);
  }
}

/* ------------------------------------------------------------------ */
/* account screens                                                     */
/* ------------------------------------------------------------------ */
async function initAccount() {
  const root = $('#account');
  if (!root) return;

  await auth.resumeRemembered();

  const params = new URLSearchParams(location.search);
  const wantsBuy = params.get('buy');

  function signedOutView() {
    root.innerHTML = `
      <div class="form-card">
        <div class="tabs" id="authtabs">
          <button class="on" data-t="in">Sign in</button>
          <button data-t="up">Create account</button>
        </div>
        <form id="authform" novalidate>
          <div class="field" data-only="up">
            <label for="name">Name</label>
            <input class="input" id="name" autocomplete="name" placeholder="What should we call you?">
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input class="input" id="email" type="email" autocomplete="email" required placeholder="you@example.com">
          </div>
          <div class="field">
            <label for="pw">Password</label>
            <input class="input" id="pw" type="password" autocomplete="current-password" required placeholder="••••••••••••">
            <div class="strength" data-only="up"><i id="sbar"></i></div>
            <p class="tiny muted" id="shint" data-only="up" style="margin:7px 0 0"></p>
          </div>
          <label class="tiny muted" data-only="in" style="display:flex;gap:8px;align-items:center;margin-bottom:18px">
            <!-- Ticked by default. Somebody signing into a video editor on
                 their own laptop expects it to remember them the way every
                 other site does; making them ask for that each time is a
                 papercut they feel on every single visit. -->
            <input type="checkbox" id="remember" checked> Stay signed in on this device
          </label>
          <button class="btn btn-primary btn-lg" style="width:100%" id="go">Sign in</button>
          <p class="tiny muted" id="err" style="margin:14px 0 0;color:var(--bad)"></p>
          <div id="err-fix" hidden style="margin-top:12px"></div>
        </form>
        <p class="tiny muted" style="margin:20px 0 0;text-align:center">
          ${auth.MODE.server
            ? 'Your password is hashed before it is stored. We never see it.'
            : 'This account lives on this device only — your password never leaves it, and nothing is uploaded.'}
        </p>
        <details style="margin-top:18px" id="forgot">
          <summary class="small">Forgot your password?</summary>
          <p class="tiny muted" style="margin:10px 0 8px">
            Your <b>recovery code</b> resets it — the code you were given when the account was made
            (it starts OMNIDX-RK). ${auth.MODE.server ? 'Or ask for a reset link by email below.' : 'It works on any device that holds the account; on a new device, restore from your recovery file first.'}
          </p>
          <input class="input mono" id="forgot-code" placeholder="OMNIDX-RK-XXXX-XXXX-…" autocomplete="off" spellcheck="false" style="text-transform:uppercase">
          <input class="input" type="password" id="forgot-pw" placeholder="New password" autocomplete="new-password" style="margin-top:8px">
          <button class="btn" type="button" id="forgot-go" style="width:100%;margin-top:10px">Set the new password</button>
          ${auth.MODE.server ? '<button class="btn btn-ghost" type="button" id="forgot-mail" style="width:100%;margin-top:8px">Email me a reset link instead</button>' : ''}
          <p class="tiny muted" id="forgot-err" style="margin:10px 0 0"></p>
        </details>
        <details style="margin-top:12px" id="restore">
          <summary class="small">Lost your device? Restore from your recovery file</summary>
          <p class="tiny muted" style="margin:10px 0 8px">
            The file you saved when the account was made (omnidx-recovery-….txt) brings the account — and
            anything you bought — onto this device. It opens with your <b>recovery code</b> or your <b>password</b>,
            whichever you remember.
          </p>
          <textarea class="input mono" id="restore-file" rows="3" placeholder="Paste the whole file here, or pick it below" style="font-size:11px"></textarea>
          <input type="file" id="restore-pick" accept=".txt,text/plain" style="margin-top:8px;font-size:12px">
          <input class="input mono" id="restore-code" placeholder="Recovery code (OMNIDX-RK-…)" autocomplete="off" spellcheck="false" style="margin-top:8px;text-transform:uppercase">
          <p class="tiny muted" style="margin:6px 0">— or —</p>
          <input class="input" type="password" id="restore-pw" placeholder="The account's password" autocomplete="off">
          <button class="btn" type="button" id="restore-go" style="width:100%;margin-top:10px">Bring my account back</button>
          <p class="tiny muted" id="restore-err" style="margin:10px 0 0"></p>
        </details>
        ${auth.MODE.server ? '' : `
        <details style="margin-top:12px" id="move-in">
          <summary class="small">Signing in from another device?</summary>
          <p class="tiny muted" style="margin:10px 0 8px">
            Until the sync server is on, an account lives on the device that made it. On that device, open
            <b>Account → Move to another device</b>, copy the code it gives you, and paste it here with the same
            password. Anything you bought comes with it.
          </p>
          <textarea class="input mono" id="move-code" rows="3" placeholder="OMNIDX-MOVE-1.…" style="font-size:11px"></textarea>
          <button class="btn" type="button" id="move-go" style="width:100%;margin-top:10px">Bring my account here</button>
          <p class="tiny muted" id="move-err" style="margin:10px 0 0"></p>
        </details>`}
      </div>
      <!--
        Keys are no longer how anybody buys this — paying unlocks the app
        directly. The box stays, collapsed, because keys still exist for the
        cases they are good for: a reviewer, a gift, a refund settled by handing
        somebody the app. Leading with it would send a paying customer looking
        for something they were never sent.
      -->
      <div class="form-card" style="margin-top:22px">
        <h3 style="margin-bottom:8px">Paid but still locked?</h3>
        <p class="small" style="margin-top:0">
          There is no key to wait for — paying unlocks it by itself. If that did not happen,
          unlock it here and you are in straight away.
        </p>
        <a class="btn" href="../activate/" style="width:100%;justify-content:center">Unlock my copy</a>
        <details style="margin-top:14px" id="ways-back">
          <summary class="small">Every way back into your account</summary>
          <ul class="tiny muted" style="margin:10px 0 0;padding-left:18px;line-height:1.7">
            <li><b>Forgot the password</b> — your recovery code sets a new one.</li>
            <li><b>Lost the device</b> — your recovery file restores the account and your purchase anywhere, with the code or the password.</li>
            <li><b>Lost the file as well</b> — your Square receipt number unlocks what you bought on the activate page, and a new account takes a moment.</li>
            <li><b>Too many devices</b> — the one you used longest ago makes room. You are never refused.</li>
            <li><b>None of those</b> — <a href="mailto:${esc(PAY.supportEmail)}?subject=${encodeURIComponent('OmniDx Studio — account help')}">${esc(PAY.supportEmail)}</a> sorts it by hand.</li>
          </ul>
        </details>
        <details style="margin-top:14px">
          <summary class="small">Been given a licence key?</summary>
          <form id="redeemform" style="margin-top:10px">
            <input class="input mono" id="key" placeholder="OMNIDX-STU-XXXX-XXXX-XXXX" style="text-transform:uppercase">
            <button class="btn" style="width:100%;margin-top:12px">Unlock</button>
          </form>
          <p class="tiny muted" id="rerr" style="margin:12px 0 0"></p>
        </details>
      </div>`;

    let mode = 'in';
    const setMode = (m) => {
      mode = m;
      $$('#authtabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === m));
      $$('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== m; });
      $('#go').textContent = m === 'in' ? 'Sign in' : 'Create account';
      $('#pw').setAttribute('autocomplete', m === 'in' ? 'current-password' : 'new-password');
    };
    $$('#authtabs button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.t)));
    setMode(wantsBuy ? 'up' : 'in');

    $('#pw').addEventListener('input', (e) => {
      const s = auth.strength(e.target.value);
      const bar = $('#sbar');
      const colors = ['var(--bad)', 'var(--bad)', 'var(--warn)', 'var(--ok)', 'var(--ok)', 'var(--ok)'];
      bar.style.width = `${(s.score / 5) * 100}%`;
      bar.style.background = colors[s.score];
      $('#shint').textContent = s.hint ? `${s.label} — ${s.hint}` : s.label;
    });

    $('#authform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#go'); const err = $('#err');
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Working…';
      try {
        const payload = { email: $('#email').value, password: $('#pw').value, name: $('#name')?.value };
        if (mode === 'up') {
          await auth.signUp(payload);
          // Signing up signs you in and remembers you. Being asked to log in
          // immediately after creating an account is the most pointless step
          // on the web.
          await auth.signIn({ ...payload, remember: true });
          // The kit is made now, while the password is in hand: a kit made
          // later is a kit most people never make, and it is the one thing
          // that makes a forgotten password or a lost phone survivable.
          const kit = await auth.createRecoveryKit(payload.password).catch(() => null);
          toast('Account created', 'ok');
          if (kit) { kitView(kit, () => signedInView()); return; }
        } else {
          const res = await auth.signIn({ ...payload, remember: $('#remember')?.checked !== false });
          if (res?.evicted) toast(`Signed in. ${res.evicted} was signed out to make room.`, '', 5000);
        }
        toast(mode === 'up' ? 'Account created' : 'Signed in', 'ok');
        signedInView();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = mode === 'in' ? 'Sign in' : 'Create account';
        /*
         * The one failure that is not the person's fault gets a way out, right
         * there: no account on this device yet means the same details make one
         * in a press, and a code from the other device brings the old one over.
         */
        const fix = $('#err-fix');
        if (fix) {
          fix.hidden = true;
          if (ex.code === 'no-local-account') {
            fix.hidden = false;
            fix.innerHTML = `
              <div class="btn-row" style="gap:8px;flex-wrap:wrap">
                <button class="btn btn-primary btn-sm" type="button" id="err-create">Create it here with these details</button>
                <button class="btn btn-sm" type="button" id="err-move">I have a move code</button>
              </div>`;
            $('#err-create').addEventListener('click', async () => {
              const payload = { email: $('#email').value, password: $('#pw').value, name: $('#name')?.value };
              try {
                await auth.signUp(payload);
                await auth.signIn({ ...payload, remember: true });
                toast('Account created', 'ok');
                const kit = await auth.createRecoveryKit(payload.password).catch(() => null);
                if (kit) kitView(kit, () => signedInView()); else signedInView();
              } catch (e2) {
                // A weak password is the one thing that can stop it; show the strength meter and say so.
                setMode('up');
                err.textContent = e2.message;
                $('#pw').dispatchEvent(new Event('input'));
              }
            });
            $('#err-move').addEventListener('click', () => { const d = $('#move-in'); if (d) { d.open = true; $('#move-code')?.focus(); d.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
          } else if (ex.code === 'other-account') {
            fix.hidden = false;
            fix.innerHTML = `<div class="btn-row" style="gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm" type="button" id="err-use">Use ${esc(ex.email)} instead</button></div>`;
            $('#err-use').addEventListener('click', () => { $('#email').value = ex.email; $('#pw').focus(); err.textContent = ''; fix.hidden = true; });
          }
        }
      }
    });

    $('#forgot-go')?.addEventListener('click', async () => {
      const out = $('#forgot-err');
      out.style.color = '';
      out.textContent = 'Working…';
      try {
        await auth.resetPasswordWithCode($('#forgot-code').value, $('#forgot-pw').value, { email: $('#email').value });
        toast('Password changed — you are signed in', 'ok');
        signedInView();
      } catch (ex) { out.style.color = 'var(--bad)'; out.textContent = ex.message; }
    });
    $('#forgot-mail')?.addEventListener('click', async () => {
      const out = $('#forgot-err');
      try {
        const res = await auth.requestResetEmail($('#email').value);
        out.style.color = '';
        out.textContent = res?.sent ? 'If that address has an account, a reset link is on its way. It works for an hour.' : 'Email is not set up on the server yet — use your recovery code.';
      } catch (ex) { out.style.color = 'var(--bad)'; out.textContent = ex.message; }
    });
    $('#restore-pick')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) $('#restore-file').value = await file.text();
    });
    $('#restore-go')?.addEventListener('click', async () => {
      const out = $('#restore-err');
      out.style.color = '';
      out.textContent = 'Opening…';
      try {
        const res = await auth.restoreFromFile($('#restore-file').value, { code: $('#restore-code').value, password: $('#restore-pw').value });
        toast(`Welcome back, ${res.email}`, 'ok');
        if (res.evicted) toast(`${res.evicted} was signed out to make room.`, '', 5000);
        signedInView();
      } catch (ex) { out.style.color = 'var(--bad)'; out.textContent = ex.message; }
    });

    $('#move-go')?.addEventListener('click', async () => {
      const out = $('#move-err');
      out.style.color = '';
      out.textContent = 'Opening…';
      try {
        const res = await auth.importAccount($('#move-code').value, $('#pw').value);
        toast(`Welcome back, ${res.email}`, 'ok');
        signedInView();
      } catch (ex) {
        out.style.color = 'var(--bad)';
        out.textContent = /password/i.test(ex.message) ? `${ex.message} Type the account's password in the box above, then press again.` : ex.message;
      }
    });

    $('#redeemform').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const out = await auth.redeem($('#key').value);
        toast(`${EDITIONS[out.edition].name} unlocked`, 'ok');
        signedInView();
      } catch (ex) { $('#rerr').textContent = ex.message; $('#rerr').style.color = 'var(--bad)'; }
    });
  }

  async function signedInView() {
    const s = auth.session();
    const ed = auth.edition();
    const e = EDITIONS[ed];
    const list = await auth.devices();
    const limit = DEVICE_LIMIT[ed];

    root.innerHTML = `
      <div class="form-card" style="max-width:560px">
        <div style="display:flex;align-items:center;gap:15px;margin-bottom:22px">
          <div class="card-icon" style="margin:0">${esc((s?.name || s?.email || 'O').slice(0, 1).toUpperCase())}</div>
          <div style="flex:1;min-width:0">
            <h3 style="margin:0">${esc(s?.name || s?.email || 'Your account')}</h3>
            <p class="tiny muted" style="margin:2px 0 0">${esc(s?.email || 'Licence unlocked on this device')}</p>
          </div>
          <span class="eyebrow" style="margin:0">${esc(e.name)}</span>
        </div>

        <div class="note ${ed === 'free' ? 'info' : 'ok'}">
          <b>${esc(e.name)} edition.</b> ${esc(e.blurb)}
          ${ed !== 'studio' ? ' <a href="../pricing/">Compare editions →</a>' : ''}
        </div>

        <h4 style="margin:26px 0 6px">Linked devices</h4>
        <p class="tiny muted" style="margin:0 0 10px">${list.length} of ${limit} used. Removing a device signs it out.</p>
        <ul class="devs">${list.map((d) => `
          <li>
            <span class="di">${d.os === 'iOS' || d.os === 'Android' ? '📱' : '💻'}</span>
            <span class="dn"><b>${esc(d.label || d.os)}</b>
              <span>${esc(d.screen || '')} · last seen ${new Date(d.lastSeen || Date.now()).toLocaleDateString()}
              ${d.id === auth.deviceId() ? ' · this device' : ''}</span></span>
            ${d.id === auth.deviceId() ? '' : `<button class="btn btn-sm" data-rm="${esc(d.id)}">Remove</button>`}
          </li>`).join('') || '<li><span class="dn muted">No devices linked yet.</span></li>'}
        </ul>

        ${!s?.email ? '' : `
        <h4 style="margin:26px 0 6px" id="recovery">Recovery kit</h4>
        ${(() => {
          const rk = auth.recoveryState();
          return `<p class="tiny muted" style="margin:0 0 10px" id="rk-status">${rk.has
            ? (rk.stale ? 'You have a kit, but you bought something since it was made — download a fresh file so the purchase is in it.'
              : `You have a kit${rk.at ? ` from ${new Date(rk.at).toLocaleDateString()}` : ''}. Forgot your password, lost the device: either gets you back in.${rk.saved ? '' : ' Make sure the code and the file are saved somewhere.'}`)
            : 'No kit yet. Make one now — it is the only thing that gets you back in if you forget the password or lose this device.'}</p>`;
        })()}
        <div id="rk-box">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input class="input" type="password" id="rk-pw2" placeholder="Your password" autocomplete="current-password" style="flex:1;min-width:160px">
            <button class="btn" id="rk-refresh" type="button" ${auth.recoveryState().has ? '' : 'hidden'}>Fresh file</button>
            <button class="btn ${auth.recoveryState().has ? 'btn-ghost' : 'btn-primary'}" id="rk-make" type="button">${auth.recoveryState().has ? 'New code and file' : 'Make my kit'}</button>
          </div>
          <p class="tiny muted" id="rk-err" style="margin:8px 0 0"></p>
        </div>

        <details style="margin-top:14px">
          <summary class="small">Change password</summary>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <input class="input" type="password" id="cp-old" placeholder="Current password" autocomplete="current-password" style="flex:1;min-width:140px">
            <input class="input" type="password" id="cp-new" placeholder="New password" autocomplete="new-password" style="flex:1;min-width:140px">
            <button class="btn" id="cp-go" type="button">Change</button>
          </div>
          <p class="tiny muted" id="cp-err" style="margin:8px 0 0"></p>
        </details>`}

        ${auth.MODE.server || !s?.email ? '' : `
        <h4 style="margin:26px 0 6px">Move to another device</h4>
        <p class="tiny muted" style="margin:0 0 10px">
          Until the sync server is on, this account lives here. A move code carries it — and anything you
          bought — to another device: paste it there under <b>Signing in from another device?</b> with this password.
        </p>
        <div id="move-out">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input class="input" type="password" id="move-pw" placeholder="Your password" autocomplete="current-password" style="flex:1;min-width:160px">
            <button class="btn" id="move-make" type="button">Make a code</button>
          </div>
          <p class="tiny muted" id="move-out-err" style="margin:8px 0 0"></p>
        </div>`}

        <div class="btn-row" style="margin-top:26px">
          <a class="btn btn-primary" href="../app/">Open the editor</a>
          ${ed !== 'studio' ? '<a class="btn" href="../pricing/">Upgrade</a>' : ''}
          <button class="btn btn-ghost" id="out">Sign out</button>
        </div>
      </div>`;

    $('#move-make')?.addEventListener('click', async () => {
      const box = $('#move-out'); const err = $('#move-out-err');
      err.textContent = '';
      try {
        const code = await auth.exportAccount($('#move-pw').value);
        box.innerHTML = `
          <textarea class="input mono" id="move-text" rows="4" readonly style="font-size:11px">${esc(code)}</textarea>
          <div class="btn-row" style="margin-top:8px;gap:8px">
            <button class="btn btn-sm" id="move-copy" type="button">Copy the code</button>
            <span class="tiny muted">It only opens with your password. Paste it on the other device and it is gone from the clipboard when you next copy anything.</span>
          </div>`;
        $('#move-copy').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(code); toast('Copied', 'ok'); }
          catch { $('#move-text').select(); toast('Select all and copy'); }
        });
      } catch (ex) { err.style.color = 'var(--bad)'; err.textContent = ex.message; }
    });

    $('#rk-make')?.addEventListener('click', async () => {
      const err = $('#rk-err'); err.textContent = '';
      try {
        const kit = await auth.createRecoveryKit($('#rk-pw2').value);
        kitView(kit, () => signedInView());
      } catch (ex) { err.style.color = 'var(--bad)'; err.textContent = ex.message; }
    });
    $('#rk-refresh')?.addEventListener('click', async () => {
      const err = $('#rk-err'); err.textContent = '';
      try {
        const out = await auth.recoveryFile({ password: $('#rk-pw2').value });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([out.file], { type: 'text/plain' }));
        a.download = out.fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 20000);
        auth.markRecoverySaved();
        toast('Fresh recovery file saved', 'ok');
        signedInView();
      } catch (ex) { err.style.color = 'var(--bad)'; err.textContent = ex.message; }
    });
    $('#cp-go')?.addEventListener('click', async () => {
      const err = $('#cp-err'); err.textContent = '';
      try {
        await auth.changePassword($('#cp-old').value, $('#cp-new').value);
        err.style.color = ''; err.textContent = 'Changed. Your recovery code and file still work.';
        $('#cp-old').value = ''; $('#cp-new').value = '';
      } catch (ex) { err.style.color = 'var(--bad)'; err.textContent = ex.message; }
    });

    $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      await auth.removeDevice(b.dataset.rm);
      toast('Device removed', 'ok');
      signedInView();
    }));
    $('#out').addEventListener('click', async () => { await auth.signOut(); toast('Signed out'); signedOutView(); });
  }

  /*
   * The kit, shown once: the code big enough to write down, the file to
   * save, and no way past it that has not at least been offered. `after`
   * runs when they say they have it.
   */
  function kitView(kit, after) {
    root.innerHTML = `
      <div class="form-card" id="rk-card" style="max-width:560px">
        <h3 style="margin:0 0 6px">Save your recovery kit</h3>
        <p class="small" style="margin:0 0 14px">This is the one thing that gets you back in if you forget your password or lose this device.
          It is shown once. Two minutes now, never locked out later.</p>
        <p class="tiny muted" style="margin:0 0 4px"><b>Your recovery code</b> — write it down or put it in your password manager.</p>
        <code class="mono" id="rk-code" style="display:block;font-size:15px;letter-spacing:.04em;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);user-select:all;word-break:break-all">${esc(kit.code)}</code>
        <div class="btn-row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" type="button" id="rk-copy">Copy the code</button>
          <button class="btn btn-sm" type="button" id="rk-download">Download the recovery file</button>
          <a class="btn btn-sm btn-ghost" id="rk-mail" href="mailto:?subject=${encodeURIComponent('My OmniDx Studio recovery kit')}&body=${encodeURIComponent(`Recovery code: ${kit.code}\n\n${kit.file}`)}">Email it to myself</a>
        </div>
        <textarea class="input mono" id="rk-file" rows="4" readonly style="font-size:10.5px;margin-top:10px">${esc(kit.file)}</textarea>
        <p class="tiny muted" style="margin:8px 0 0">The file restores the account on any device, with anything you bought; it opens with the code or your password, whichever you remember. Nothing in it can be read without one of those.</p>
        <label class="tiny" style="display:flex;gap:8px;align-items:center;margin:16px 0 10px"><input type="checkbox" id="rk-saved"> I have saved the code and the file</label>
        <button class="btn btn-primary" type="button" id="rk-done" disabled style="width:100%">Continue</button>
      </div>`;
    $('#rk-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(kit.code); toast('Code copied', 'ok'); } catch { toast('Select the code and copy it'); }
    });
    $('#rk-download').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([kit.file], { type: 'text/plain' }));
      a.download = kit.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000);
      toast('Saved — keep it somewhere you will find it', 'ok', 3600);
    });
    $('#rk-saved').addEventListener('change', (e) => { $('#rk-done').disabled = !e.target.checked; });
    $('#rk-done').addEventListener('click', () => { auth.markRecoverySaved(); after(); });
  }

  const resetToken = params.get('reset');
  if (resetToken && auth.MODE.server) {
    root.innerHTML = `
      <div class="form-card">
        <h3 style="margin:0 0 8px">Choose a new password</h3>
        <input class="input" type="password" id="rs-pw" placeholder="New password" autocomplete="new-password">
        <button class="btn btn-primary" id="rs-go" style="width:100%;margin-top:10px">Set it and sign in</button>
        <p class="tiny muted" id="rs-err" style="margin:10px 0 0"></p>
      </div>`;
    $('#rs-go').addEventListener('click', async () => {
      try { await auth.confirmResetEmail(resetToken, $('#rs-pw').value); history.replaceState(null, '', location.pathname); toast('Password changed', 'ok'); signedInView(); }
      catch (ex) { $('#rs-err').style.color = 'var(--bad)'; $('#rs-err').textContent = ex.message; }
    });
    return;
  }

  if (auth.isSignedIn() || auth.edition() !== 'free') await signedInView();
  else signedOutView();
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
applyTheme();

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  $$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', toggleTheme));
  initMenuBox();
  initDrawer();
  initSupport();
  initRail();
  initReveal();
  initPricing();
  initCompare();
  initAiDemo();
  initDownloads();
  initNavAccount();
  initAccount();
  mountRating($('#rate-us'));
  // The front page's showcase; the module is only fetched where it is used.
  if ($('#showcase')) import('./showcase.js').then((m) => { window.__showcase = m; m.initShowcase(); }).catch(() => {});

  // Mark the current page in the nav without hard-coding it per page.
  const here = location.pathname.replace(/index\.html$/, '');
  $$('.menubox a, .nav-login, .mb-pop a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('http') || href.startsWith('#')) return;
    const target = new URL(href, location.href).pathname.replace(/index\.html$/, '');
    if (target === here) a.classList.add('here');
  });
});
