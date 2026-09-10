/*
 * Landing-site behaviour: theme, scroll reveals, the pricing toggle, platform
 * detection on the download page, and the account screens. No framework and no
 * build step — the same rule the rest of OmniDx follows.
 */

import { EDITIONS, priceOf, buyUrl, PAY, DEVICE_LIMIT, SEATS } from './config.js';
import * as auth from './auth.js';

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
/* pricing                                                             */
/* ------------------------------------------------------------------ */
function initPricing() {
  const host = $('#tiers');
  if (!host) return;
  let period = 'once';

  const FEATURES = {
    free: [
      ['Unlimited projects and exports', 1],
      ['Multitrack timeline, trim, split, ripple', 1],
      ['Transitions, titles, audio mixing', 1],
      ['20 colour filters and looks', 1],
      ['All 11 one-tap edit styles', 1],
      ['Stickers, callouts and shapes', 1],
      ['1080p export, no watermark', 1],
      ['Works offline, no account required', 1],
      ['AI editing — 5 actions a month', 1],
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
      ['4K / 60fps export', 1],
      ['Speed ramps and keyframe curves', 1],
      ['Beat-synced auto-cutting', 1],
      ['Silence removal', 1],
      ['Brand kit — fonts, colours, logo', 1],
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
    studio: [
      ['Everything in Creator', 1],
      ['Unlimited AI editing', 1],
      ['Project sync across 10 devices', 1],
      ['Custom LUT slots, unlimited', 1],
      ['Scopes and the full colour panel', 1],
      ['Every future update included, free', 1],
      ['Background removal — building', 2],
      ['Voice isolation — building', 2],
      ['Multicam sync — building', 2],
    ],
  };

  function card(id) {
    const e = EDITIONS[id];
    // The struck-through figure is what three individual Studio licences cost,
    // which is a real number anyone can check — not a price we invented and
    // never charged.
    const anchor = e.compareTo && period === 'once'
      ? `<span class="anchor"><s>$${e.compareTo.toFixed(2)}</s> ${esc(e.compareLabel)}</span>`
      : '';
    const feat = FEATURES[id].map(([t, on]) => {
      // 1 = shipped, 0 = not in this edition, 2 = being built, included free
      const cls = on === 1 ? '' : on === 2 ? 'soon' : 'no';
      return `<li class="${cls}">${esc(t)}</li>`;
    }).join('');
    const featured = id === 'creator';
    const price = priceOf(id, period);
    const sub = id === 'free' ? 'Forever. No card, no trial clock.'
      : period === 'monthly' ? 'Cancel any time, in the app.'
      : 'One payment. Yours permanently.';
    const cta = id === 'free'
      ? `<a class="btn btn-lg" href="../app/">Open the editor</a>`
      : `<a class="btn btn-primary btn-lg" href="${esc(buyUrl(id, period))}" data-buy="${id}" rel="noopener">Get ${esc(e.name)}</a>`;
    return `<div class="tier ${featured ? 'featured' : ''}">
      ${featured ? '<span class="badge-top">Most popular</span>' : ''}
      <div class="tname">${esc(e.name)}</div>
      <div class="amount">${esc(price)}</div>
      ${anchor}
      <p class="sub">${esc(sub)}</p>
      <p class="small" style="margin:10px 0 0">${esc(e.blurb)}</p>
      <ul>${feat}</ul>
      ${cta}
      <p class="tiny muted" style="margin:12px 0 0;text-align:center">
        ${id === 'free' ? 'Nothing to cancel.'
          : SEATS[id] > 1 ? `${SEATS[id]} people · ${DEVICE_LIMIT[id]} devices · 14-day refund`
          : `Up to ${DEVICE_LIMIT[id]} devices · 14-day refund, no questions`}
      </p>
    </div>`;
  }

  function paint() {
    host.innerHTML = ['free', 'creator', 'studio', 'team'].map(card).join('');
    $$('#tiers [data-buy]').forEach((a) => a.addEventListener('click', (ev) => {
      if (a.getAttribute('href') === PAY.cashAppUrl) {
        ev.preventDefault();
        location.href = `../account/?buy=${a.dataset.buy}&period=${period}`;
      }
    }));
  }

  $$('#billing button').forEach((b) => b.addEventListener('click', () => {
    $$('#billing button').forEach((x) => x.classList.toggle('on', x === b));
    period = b.dataset.period;
    paint();
  }));
  paint();
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
  ['Multicam sync', false, false, 'Building'],

  ['— Look', null, null, null],
  ['Colour sliders &amp; curves', 'Sliders', true, true],
  ['Filters and looks', '20', '60+', '60+'],
  ['Effects (motion blur, glow, speed lines…)', '10', 'All 18', 'All 18'],
  ['Three-way colour wheels', false, true, true],
  ['Stickers &amp; callouts', true, true, true],
  ['Custom LUT slots', false, '4', 'Unlimited'],
  ['Scopes (waveform, vectorscope)', false, true, true],
  ['Background removal, no green screen', false, false, 'Building'],
  ['Auto-reframe to any ratio', false, false, 'Building'],

  ['— AI', null, null, null],
  ['AI edit assistant', '5 / month', '200 / month', 'Unlimited'],
  ['Auto-captions', false, true, true],
  ['Beat-synced cutting', false, true, true],
  ['Silence removal', false, true, true],
  ['Voice isolation &amp; noise removal', false, false, 'Building'],

  ['— Audio', null, null, null],
  ['Mixing, fades, volume curves', true, true, true],
  ['Ducking under voice', true, true, true],
  ['Waveforms &amp; beat detection', true, true, true],

  ['— Audio', null, null, null],
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
      + 'but do not buy today for something on that list. '
      + '<a href="https://github.com/hundostacksgit-svg/apextune-updates/blob/main/docs/STUDIO-COMPLAINTS.md">'
      + 'The full built / not-built list is here.</a>';
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

function initDownloads() {
  const host = $('#downloads');
  if (!host) return;
  const me = detectPlatform();
  const card = $(`[data-os="${me}"]`) || $('[data-os="web"]');
  if (card) {
    card.classList.add('detected');
    card.insertAdjacentHTML('afterbegin', '<span class="you">Your device</span>');
    host.prepend(card);
  }

  // The install prompt only exists in browsers that offer it; everywhere else
  // we tell people the actual menu path instead of a button that does nothing.
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e;
    $$('[data-install]').forEach((b) => { b.hidden = false; });
  });
  $$('[data-install]').forEach((b) => b.addEventListener('click', async () => {
    if (!deferred) { toast('Use your browser menu → Add to Home Screen'); return; }
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
  }));
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
            <input type="checkbox" id="remember"> Stay signed in on this device
          </label>
          <button class="btn btn-primary btn-lg" style="width:100%" id="go">Sign in</button>
          <p class="tiny muted" id="err" style="margin:14px 0 0;color:var(--bad)"></p>
        </form>
        <p class="tiny muted" style="margin:20px 0 0;text-align:center">
          ${auth.MODE.server
            ? 'Your password is hashed before it is stored. We never see it.'
            : 'This account lives on this device only — your password never leaves it, and nothing is uploaded.'}
        </p>
      </div>
      <div class="form-card" style="margin-top:22px">
        <h3 style="margin-bottom:8px">Have a licence key?</h3>
        <p class="small" style="margin-top:0">Paste it here to unlock without signing in.</p>
        <form id="redeemform">
          <input class="input mono" id="key" placeholder="OMNIDX-STU-XXXX-XXXX-XXXX" style="text-transform:uppercase">
          <button class="btn" style="width:100%;margin-top:12px">Unlock</button>
        </form>
        <p class="tiny muted" id="rerr" style="margin:12px 0 0"></p>
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
        if (mode === 'up') await auth.signUp(payload);
        else await auth.signIn({ ...payload, remember: $('#remember')?.checked });
        toast(mode === 'up' ? 'Account created' : 'Signed in', 'ok');
        signedInView();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = mode === 'in' ? 'Sign in' : 'Create account';
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

        <div class="btn-row" style="margin-top:26px">
          <a class="btn btn-primary" href="../app/">Open the editor</a>
          ${ed !== 'studio' ? '<a class="btn" href="../pricing/">Upgrade</a>' : ''}
          <button class="btn btn-ghost" id="out">Sign out</button>
        </div>
      </div>`;

    $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      await auth.removeDevice(b.dataset.rm);
      toast('Device removed', 'ok');
      signedInView();
    }));
    $('#out').addEventListener('click', async () => { await auth.signOut(); toast('Signed out'); signedOutView(); });
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
  initReveal();
  initPricing();
  initCompare();
  initAiDemo();
  initDownloads();
  initAccount();

  // Mark the current page in the nav without hard-coding it per page.
  const here = location.pathname.replace(/index\.html$/, '');
  $$('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('http') || href.startsWith('#')) return;
    const target = new URL(href, location.href).pathname.replace(/index\.html$/, '');
    if (target === here) a.classList.add('here');
  });
});
