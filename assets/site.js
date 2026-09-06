/*
 * Landing page interactions: a real in-page device scan, the locked-feature
 * reveal, and the rating widget. No framework, no build step.
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ */
/* Reveal on scroll                                                    */
/* ------------------------------------------------------------------ */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }
}, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });
$$('.reveal').forEach((el) => io.observe(el));

/* ------------------------------------------------------------------ */
/* Live device demo — the same measurements the app makes, cut short    */
/* so it finishes in a few seconds on a landing page.                   */
/* ------------------------------------------------------------------ */

function measureHz() {
  return new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - t0 < 420) requestAnimationFrame(tick);
      else resolve(Math.round((frames * 1000) / (performance.now() - t0)));
    };
    requestAnimationFrame(tick);
  });
}

function bytes(b) {
  if (!Number.isFinite(b) || b <= 0) return null;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

const STEPS = [
  {
    id: 'platform', label: 'Device',
    async run() {
      const ua = navigator.userAgentData;
      const mobile = ua?.mobile ?? /Mobi|Android|iP(hone|ad)/i.test(navigator.userAgent);
      const plat = ua?.platform || navigator.platform || 'Unknown';
      return { value: plat, detail: mobile ? 'Mobile device' : 'Desktop or laptop', tone: 'ok' };
    },
  },
  {
    id: 'cpu', label: 'Processor',
    async run() {
      const cores = navigator.hardwareConcurrency || 0;
      await sleep(10);
      const t0 = performance.now();
      let acc = 0;
      for (let i = 0; i < 2_000_000; i++) acc = (acc + i * 2654435761) % 4294967296;
      const ms = performance.now() - t0;
      if (acc < 0) return { value: '--', detail: 'benchmark failed', tone: 'bad' };
      const score = Math.round(200000 / Math.max(ms, 1));
      return {
        value: `${score} pts`,
        detail: cores ? `${cores} logical cores` : 'core count not reported',
        tone: ms > 600 ? 'warn' : 'ok',
      };
    },
  },
  {
    id: 'memory', label: 'Memory',
    async run() {
      const gb = navigator.deviceMemory;
      const heap = performance.memory?.jsHeapSizeLimit;
      if (!gb && !heap) return { value: 'Private', detail: 'not reported by this browser', tone: 'warn' };
      return {
        value: gb ? `${gb} GB` : bytes(heap),
        detail: gb ? 'device memory class' : 'JavaScript heap limit',
        tone: gb && gb <= 2 ? 'warn' : 'ok',
      };
    },
  },
  {
    id: 'display', label: 'Display',
    async run() {
      const hz = await measureHz();
      return {
        value: `${screen.width} × ${screen.height}`,
        detail: `${hz} Hz measured · ${devicePixelRatio || 1}× pixel ratio`,
        tone: hz < 45 ? 'warn' : 'ok',
      };
    },
  },
  {
    id: 'storage', label: 'Storage',
    async run() {
      if (!navigator.storage?.estimate) return { value: '--', detail: 'not available here', tone: 'warn' };
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      if (!quota) return { value: '--', detail: 'no quota reported', tone: 'warn' };
      return { value: bytes(quota - usage), detail: 'available to apps', tone: 'ok' };
    },
  },
  {
    id: 'battery', label: 'Battery',
    async run() {
      if (!navigator.getBattery) return { value: 'n/a', detail: 'no battery reported', tone: 'idle' };
      const b = await navigator.getBattery();
      const pct = Math.round(b.level * 100);
      return {
        value: `${pct}%`,
        detail: b.charging ? 'charging' : 'on battery',
        tone: pct <= 15 && !b.charging ? 'warn' : 'ok',
      };
    },
  },
  {
    id: 'network', label: 'Network',
    async run() {
      if (!navigator.onLine) return { value: 'Offline', detail: 'no connection', tone: 'warn' };
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const t = performance.now();
        try {
          await fetch(`icons/favicon-32.png?p=${Date.now()}_${i}`, { cache: 'no-store' });
          samples.push(performance.now() - t);
        } catch { /* one failed probe is not fatal */ }
        await sleep(30);
      }
      if (!samples.length) return { value: '--', detail: 'no response', tone: 'bad' };
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const c = navigator.connection;
      return {
        value: `${avg.toFixed(0)} ms`,
        detail: c?.effectiveType ? `round trip · ${c.effectiveType}` : 'round trip',
        tone: avg > 300 ? 'warn' : 'ok',
      };
    },
  },
];

function stepRow(s, state, res) {
  const mark = { ok: '✓', warn: '!', bad: '✕', idle: '·' }[res?.tone] || '·';
  return `
    <div class="dstep ${state}" data-step="${s.id}">
      <span class="dmark ${state === 'done' ? (res?.tone || 'ok') : state}">${state === 'run' ? '●' : state === 'done' ? mark : '·'}</span>
      <span class="dlabel">${esc(s.label)}</span>
      <span class="dval">${res ? esc(res.value) : ''}</span>
      <span class="ddetail">${res ? esc(res.detail) : (state === 'run' ? 'checking…' : 'waiting')}</span>
    </div>`;
}

async function runDemo() {
  const host = $('#demo-out');
  const btn = $('#demo-run');
  if (!host || !btn) return;

  btn.disabled = true;
  btn.textContent = 'Scanning…';
  const results = {};
  host.innerHTML = STEPS.map((s) => stepRow(s, 'idle')).join('');
  host.classList.add('running');

  for (const s of STEPS) {
    const row = host.querySelector(`[data-step="${s.id}"]`);
    row.outerHTML = stepRow(s, 'run');
    await sleep(160);
    let res;
    try { res = await s.run(); } catch (e) { res = { value: '--', detail: 'could not run', tone: 'warn' }; }
    results[s.id] = res;
    host.querySelector(`[data-step="${s.id}"]`).outerHTML = stepRow(s, 'done', res);
  }

  const graded = Object.values(results).filter((r) => r.tone !== 'idle');
  const good = graded.filter((r) => r.tone === 'ok').length;
  const score = Math.round((good / Math.max(graded.length, 1)) * 100);

  $('#demo-summary').innerHTML = `
    <div class="dscore">
      <div class="dscore-n">${score}</div>
      <div>
        <strong>${good} of ${graded.length} checks passed</strong>
        <div class="small muted">That was the free tier, running on this device — nothing was uploaded.</div>
      </div>
    </div>
    <p class="small muted" style="margin-top:14px">The full app adds screen, touch, camera, microphone,
       GPS and sensor tests, plus proper benchmarks. Pro adds your car.</p>
    <div class="btn-row" style="margin-top:16px">
      <a class="btn btn-primary" href="app/index.html#/phone">Run the full check — free</a>
      <a class="btn" href="#pro-locked">See what Pro adds</a>
    </div>`;
  $('#demo-summary').classList.add('in');

  btn.disabled = false;
  btn.textContent = 'Run it again';
}

$('#demo-run')?.addEventListener('click', runDemo);

/* ------------------------------------------------------------------ */
/* Rating                                                              */
/* ------------------------------------------------------------------ */
const RATING_KEY = 'omnidx.rating.v1';

function paintRating() {
  const host = $('#rating');
  if (!host) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(RATING_KEY) || 'null'); } catch { /* blocked */ }

  const stars = (active) => [1, 2, 3, 4, 5]
    .map((n) => `<button class="star${n <= active ? ' on' : ''}" data-n="${n}"
                   aria-label="${n} star${n === 1 ? '' : 's'}">★</button>`).join('');

  if (saved) {
    host.innerHTML = `
      <div class="stars" aria-hidden="true">${stars(saved.score)}</div>
      <p class="small">Thanks — you rated OmniDx ${saved.score} out of 5.
        <button class="linkish" id="rate-again">Change it</button></p>`;
    $('#rate-again').onclick = () => {
      try { localStorage.removeItem(RATING_KEY); } catch { /* blocked */ }
      paintRating();
    };
    return;
  }

  host.innerHTML = `
    <div class="stars" id="star-row">${stars(0)}</div>
    <p class="small muted" id="rate-hint">Tap a star to rate it.</p>`;

  const row = $('#star-row');
  const btns = $$('.star', row);
  const paint = (n) => btns.forEach((b, i) => b.classList.toggle('on', i < n));
  btns.forEach((b) => {
    b.addEventListener('mouseenter', () => paint(Number(b.dataset.n)));
    b.addEventListener('focus', () => paint(Number(b.dataset.n)));
    b.addEventListener('click', () => {
      const score = Number(b.dataset.n);
      try { localStorage.setItem(RATING_KEY, JSON.stringify({ score, at: Date.now() })); } catch { /* blocked */ }
      paintRating();
    });
  });
  row.addEventListener('mouseleave', () => paint(0));
}
paintRating();

/* ------------------------------------------------------------------ */
/* Platform detection for the download section                         */
/* ------------------------------------------------------------------ */
(function highlightPlatform() {
  const ua = navigator.userAgent;
  const p = /iPhone|iPad|iPod/.test(ua) ? 'ios'
    : /Android/.test(ua) ? 'android'
    : /Mac/.test(ua) ? 'mac'
    : /Win/.test(ua) ? 'windows' : null;
  if (!p) return;
  const card = document.querySelector(`[data-platform="${p}"]`);
  if (!card) return;
  card.classList.add('yours');
  const tag = card.querySelector('.plat-tag');
  if (tag) tag.textContent = 'Your device';
})();
