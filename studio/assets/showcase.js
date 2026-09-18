/*
 * The front-page showcase.
 *
 * What this is for
 * ----------------
 * The first thing on the landing page is a slice of the editor doing the
 * things it does — a cursor cutting on the timeline, a sentence becoming an
 * edit, a slider changing a grade, a title arriving letter by letter, one
 * frame going out to every platform — rather than a screenshot that goes
 * stale or a paragraph nobody reads. It is drawn from the app's own chrome
 * in HTML, so it loads instantly and looks like what you get.
 *
 * How it works
 * ------------
 * Five slides, each a small script: steps at times, most of them moving the
 * one cursor and pressing on something. A slide starts its script when it
 * becomes the active one and every pending step is cancelled when it stops,
 * so nothing from one slide leaks into the next. The deck advances on its
 * own every few seconds, always; it pauses while the pointer is over it or
 * something inside has focus, and while the tab is hidden, and it picks up
 * again when those end. Arrows, dots and the keyboard move it by hand.
 *
 * With reduced motion asked for, the slides still rotate (a cross-fade) but
 * the cursor stays home and each slide shows its finished state.
 */

const PERIOD = 6800;                 // ms a slide is on screen
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let deck = null;

/* ------------------------------------------------------------------ */
/* the cursor                                                          */
/* ------------------------------------------------------------------ */

function moveCursor(x, y, { instant = false } = {}) {
  const c = deck.cursor;
  if (!c) return;
  if (instant) c.classList.add('jump');
  c.style.left = `${x}%`;
  c.style.top = `${y}%`;
  if (instant) requestAnimationFrame(() => c.classList.remove('jump'));
}

function press() {
  const c = deck.cursor;
  if (!c) return;
  c.classList.remove('press');
  void c.offsetWidth;
  c.classList.add('press');
}

/* ------------------------------------------------------------------ */
/* the slides' scripts                                                 */
/* ------------------------------------------------------------------ */

/*
 * Each script is a list of [ms, fn] run from the slide's start. `s` is the
 * slide's root. Positions are percentages of the stage, so they hold at
 * every width. The finished state each script builds is also what the
 * reduced-motion path shows at once.
 */
const SCRIPTS = {
  timeline(s) {
    const clip2 = $('[data-clip="2"]', s), clip3 = $('[data-clip="3"]', s), split = $('[data-split]', s), head = $('[data-head]', s), tool = $('[data-tool="razor"]', s);
    // Stage percentages: the track runs across the middle column, so a
    // point at p% of the track is at about 23.5 + 0.515·p of the stage.
    return [
      [200, () => moveCursor(40, 71)],
      [900, () => { press(); clip2.classList.add('held'); }],
      [1000, () => { moveCursor(46, 71); clip2.style.left = '36%'; }],
      [1700, () => { clip2.classList.remove('held'); }],
      [2100, () => moveCursor(30.5, 83)],
      [2700, () => { press(); tool.classList.add('on'); }],
      [3100, () => moveCursor(62, 71)],
      [3800, () => { press(); clip3.classList.add('cut'); split.classList.add('on'); }],
      [4300, () => moveCursor(47.5, 67)],
      [4900, () => { press(); head.classList.add('go'); }],
    ];
  },
  ai(s) {
    const box = $('[data-prompt]', s), plan = $$('[data-plan] li', s), clips = $$('[data-built] i', s), btn = $('[data-go]', s);
    const text = '30-second trailer for TikTok, fast cuts on the beat, captions on';
    const steps = [[150, () => { box.textContent = ''; moveCursor(30, 26); }]];
    for (let i = 1; i <= text.length; i++) steps.push([250 + i * 34, () => { box.textContent = text.slice(0, i); }]);
    steps.push([2700, () => moveCursor(80, 26)]);
    steps.push([3200, () => { press(); btn.classList.add('on'); }]);
    plan.forEach((li, i) => steps.push([3400 + i * 260, () => li.classList.add('on')]));
    clips.forEach((c, i) => steps.push([3700 + i * 160, () => c.classList.add('on')]));
    steps.push([5300, () => moveCursor(60, 84)]);
    return steps;
  },
  colour(s) {
    const knob = $('[data-knob]', s), frame = $('[data-frame]', s), chip = $('[data-chip]', s), val = $('[data-val]', s), scope = $('[data-scope]', s);
    return [
      [200, () => moveCursor(80, 38)],
      [900, () => { press(); knob.classList.add('held'); }],
      [1000, () => { moveCursor(88, 38); knob.style.left = '68%'; frame.classList.add('graded'); scope.classList.add('wide'); }],
      [1050, () => { let v = 0; const id = setInterval(() => { v += 2; val.textContent = `+${v}`; if (v >= 24) clearInterval(id); }, 45); deck.timers.push(id); }],
      [1900, () => knob.classList.remove('held')],
      [2500, () => moveCursor(76, 66)],
      [3100, () => { press(); chip.classList.add('on'); frame.classList.add('glow'); }],
      [3900, () => moveCursor(30, 40)],
    ];
  },
  motion(s) {
    const letters = $$('[data-word] b', s), ring = $('[data-ring]', s), fx = $('[data-fx]', s), expr = $('[data-expr]', s), parts = $('[data-particles]', s);
    const steps = [[100, () => { s.classList.add('live'); }]];
    letters.forEach((b, i) => steps.push([300 + i * 110, () => b.classList.add('in')]));
    steps.push([500, () => ring.classList.add('draw')]);
    steps.push([900, () => parts.classList.add('on')]);
    steps.push([1600, () => moveCursor(79, 40)]);
    steps.push([2300, () => { press(); fx.classList.add('on'); expr.classList.add('on'); }]);
    steps.push([3200, () => moveCursor(45, 45)]);
    return steps;
  },
  export(s) {
    const btn = $('[data-export]', s), tiles = $$('[data-tile]', s), bar = $('[data-bar]', s), done = $('[data-done]', s);
    const steps = [
      [200, () => moveCursor(86, 12)],
      [900, () => { press(); btn.classList.add('on'); }],
    ];
    tiles.forEach((t, i) => steps.push([1200 + i * 220, () => t.classList.add('on')]));
    steps.push([1300, () => bar.classList.add('run')]);
    steps.push([4200, () => done.classList.add('on')]);
    steps.push([2600, () => moveCursor(50, 70)]);
    return steps;
  },
};

/* The finished state of a slide, for reduced motion and for anyone who missed the run. */
function finish(s) {
  $$('.in, .on, .go, .cut, .draw, .run, .graded, .glow, .wide, .live', s);
  for (const n of $$('[data-clip="2"]', s)) n.style.left = '36%';
  for (const n of $$('[data-clip="3"], [data-split], [data-head], [data-tool="razor"], [data-go], [data-plan] li, [data-built] i, [data-chip], [data-frame], [data-scope], [data-word] b, [data-ring], [data-fx], [data-expr], [data-particles], [data-export], [data-tile], [data-bar], [data-done]', s)) {
    n.classList.add('on', 'in', 'go', 'cut', 'draw', 'run', 'graded', 'glow', 'wide');
  }
  const box = $('[data-prompt]', s);
  if (box) box.textContent = '30-second trailer for TikTok, fast cuts on the beat, captions on';
  const val = $('[data-val]', s); if (val) val.textContent = '+24';
  const knob = $('[data-knob]', s); if (knob) knob.style.left = '68%';
  s.classList.add('live');
}

/* Everything a script may have set, back to the start. */
function reset(s) {
  for (const n of $$('.in, .on, .go, .cut, .draw, .run, .graded, .glow, .wide, .held, .live', s)) {
    n.classList.remove('in', 'on', 'go', 'cut', 'draw', 'run', 'graded', 'glow', 'wide', 'held', 'live');
  }
  s.classList.remove('live');
  for (const n of $$('[data-clip="2"]', s)) n.style.left = '';
  const knob = $('[data-knob]', s); if (knob) knob.style.left = '';
  const box = $('[data-prompt]', s); if (box) box.textContent = '';
  const val = $('[data-val]', s); if (val) val.textContent = '0';
}

/* ------------------------------------------------------------------ */
/* the deck                                                            */
/* ------------------------------------------------------------------ */

function stopScript() {
  for (const t of deck.timers) { clearTimeout(t); clearInterval(t); }
  deck.timers = [];
}

function show(index, { user = false } = {}) {
  const n = deck.slides.length;
  const i = ((index % n) + n) % n;
  stopScript();
  deck.slides.forEach((s, k) => {
    const on = k === i;
    if (!on && s.classList.contains('on')) reset(s);
    s.classList.toggle('on', on);
    s.setAttribute('aria-hidden', on ? 'false' : 'true');
  });
  deck.dots.forEach((d, k) => { d.classList.toggle('on', k === i); d.setAttribute('aria-selected', k === i ? 'true' : 'false'); d.tabIndex = k === i ? 0 : -1; });
  deck.index = i;
  const s = deck.slides[i];
  const cap = $('#show-cap'); if (cap) cap.textContent = s.dataset.caption || '';
  const badge = $('#show-badge'); if (badge) badge.textContent = s.dataset.badge || '';
  const title = $('#show-title'); if (title) title.textContent = s.dataset.title || 'summer-trailer.omnidx';
  deck.root.dataset.slide = s.dataset.slide;

  reset(s);
  moveCursor(50, 50, { instant: true });
  if (REDUCED) { finish(s); }
  else {
    const script = SCRIPTS[s.dataset.slide]?.(s) || [];
    for (const [at, fn] of script) deck.timers.push(setTimeout(() => { try { fn(); } catch { /* one step must not stop the deck */ } }, at));
  }
  // The progress line under the dots, restarted for this slide.
  const bar = $('#show-progress');
  if (bar) { bar.classList.remove('run'); void bar.offsetWidth; bar.style.animationDuration = `${PERIOD}ms`; bar.classList.add('run'); }
  arm();
  if (user) deck.root.classList.add('touched');
}

/* The auto-advance, re-armed after every change and paused while looked at closely. */
function arm() {
  clearTimeout(deck.next);
  deck.next = null;
  if (deck.paused || document.hidden) return;
  deck.next = setTimeout(() => show(deck.index + 1), PERIOD);
}

function pause(on) {
  deck.paused = on;
  deck.root.classList.toggle('paused', on);
  const bar = $('#show-progress');
  if (bar) bar.style.animationPlayState = on ? 'paused' : 'running';
  if (on) { clearTimeout(deck.next); deck.next = null; } else arm();
}

export function initShowcase() {
  const root = $('#showcase');
  if (!root) return null;
  deck = {
    root, slides: $$('.slide', root), dots: $$('.show-dots button', root), cursor: $('#show-cursor', root),
    index: 0, timers: [], next: null, paused: false,
  };
  if (!deck.slides.length) return null;

  deck.dots.forEach((d, k) => d.addEventListener('click', () => show(k, { user: true })));
  $$('.show-arrow', root).forEach((b) => b.addEventListener('click', () => show(deck.index + Number(b.dataset.dir || 1), { user: true })));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(deck.index + 1, { user: true }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(deck.index - 1, { user: true }); }
  });
  // Looking closely pauses it; looking away lets it go on. Touch counts as looking.
  root.addEventListener('mouseenter', () => pause(true));
  root.addEventListener('mouseleave', () => pause(false));
  root.addEventListener('focusin', () => pause(true));
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) pause(false); });
  let touchTimer = null;
  root.addEventListener('touchstart', () => { pause(true); clearTimeout(touchTimer); touchTimer = setTimeout(() => pause(false), 4000); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(deck.next); deck.next = null; } else arm(); });

  show(0);
  return deck;
}

/* For the verifier and for anyone curious: where the deck is. */
export function state() {
  return deck ? { index: deck.index, paused: deck.paused, armed: Boolean(deck.next), slides: deck.slides.length, period: PERIOD } : null;
}
