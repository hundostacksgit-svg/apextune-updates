/*
 * The front page's tour: what a buyer gets, one slide at a time.
 *
 * Every slide is built from something real. The run is the build machine's last
 * verified run, read from the log the check commits; the window and the card are
 * the images the check draws from the current script. The rest are the lines and
 * lists the tune prints, with the places your own numbers go marked as such.
 *
 * It advances on its own every seven seconds, pauses while the pointer is over it,
 * while something inside has focus, while the tab is hidden, and for good once the
 * pause button is pressed. With reduced motion asked for it starts paused. Arrows,
 * dots and the arrow keys move it by hand; slides not on screen are inert.
 */

const PERIOD = 7000;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The run slide: the first lines of the build machine's log, with the headings, the
// changes and the warnings coloured the way the console colours them.
async function fillRun(box) {
  try {
    const r = await fetch(new URL('ci-log.txt', import.meta.url).href, { cache: 'no-store' });
    if (!r.ok) return;
    const lines = (await r.text()).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    const pick = [];
    for (const l of lines) {
      if (/^== (Services|Scheduled tasks|Preinstalled apps)/.test(l)) break;
      pick.push(l);
    }
    const done = lines.filter((l) => /^ {2}(After:|Processes:)/.test(l));
    const shown = pick.slice(0, 13).concat(done.length ? ['  ...'].concat(done) : []);
    box.innerHTML = shown.map((l) => {
      const cls = l.startsWith('==') ? 'h' : /^ {2}\+/.test(l) ? 'ok' : /^ {2}!/.test(l) ? 'w' : /^ {2}(After:|Processes:)/.test(l) ? 'ok' : 'dim';
      return `<span class="${cls}">${esc(l)}</span>`;
    }).join('\n');
  } catch { /* the static lines stay */ }
}

export function initTour() {
  const root = $('#tour-deck');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const slides = $$('.tour-slide', root);
  const dots = $$('[data-go]', root);
  const live = $('[data-tour-live]', root);
  const pauseBtn = $('[data-tour-pause]', root);
  let at = 0, timer = 0, hover = false, focus = false, stopped = REDUCED;

  const show = (i, announce) => {
    at = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      const on = n === at;
      s.classList.toggle('on', on);
      s.setAttribute('aria-hidden', on ? 'false' : 'true');
      if ('inert' in s) s.inert = !on;
    });
    dots.forEach((d, n) => d.setAttribute('aria-current', n === at ? 'true' : 'false'));
    if (announce && live) live.textContent = `Slide ${at + 1} of ${slides.length}: ${slides[at].dataset.title || ''}`;
  };
  const schedule = () => {
    clearTimeout(timer);
    if (stopped || hover || focus || document.hidden) return;
    timer = setTimeout(() => { show(at + 1, false); schedule(); }, PERIOD);
  };
  const setPaused = (p) => {
    stopped = p;
    if (pauseBtn) {
      pauseBtn.setAttribute('aria-pressed', p ? 'true' : 'false');
      pauseBtn.setAttribute('aria-label', p ? 'Play the tour' : 'Pause the tour');
      pauseBtn.textContent = p ? '▶' : '❚❚';
    }
    schedule();
  };

  $$('[data-dir]', root).forEach((b) => b.addEventListener('click', () => { show(at + Number(b.dataset.dir), true); schedule(); }));
  dots.forEach((d) => d.addEventListener('click', () => { show(Number(d.dataset.go), true); schedule(); }));
  if (pauseBtn) pauseBtn.addEventListener('click', () => setPaused(!stopped));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { show(at + 1, true); schedule(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { show(at - 1, true); schedule(); e.preventDefault(); }
  });
  root.addEventListener('pointerenter', () => { hover = true; schedule(); });
  root.addEventListener('pointerleave', () => { hover = false; schedule(); });
  root.addEventListener('focusin', () => { focus = true; schedule(); });
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) { focus = false; schedule(); } });
  document.addEventListener('visibilitychange', schedule);

  const run = $('[data-tour-run]', root);
  if (run) fillRun(run);
  show(0, false);
  setPaused(stopped);
}
