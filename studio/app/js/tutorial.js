/*
 * The walkthrough.
 *
 * Eight steps, a ring around the thing being talked about, and a Skip button
 * that is visible on every single step rather than hidden behind a corner ✕.
 * It never touches the project, so it is safe to run in the middle of an edit,
 * and it remembers that you finished or skipped it so it only offers itself
 * once.
 */

import { $ } from './ui.js';

const SEEN_KEY = 'omnidx.studio.tour.v1';

const STEPS = [
  {
    target: null,
    title: 'This is a real editor',
    body: 'Multitrack timeline, colour tools, keyframes, proper export. Nothing here is a demo, '
      + 'nothing is watermarked, and you can close this in one tap. Two minutes and you will have '
      + 'made something.',
  },
  {
    target: '#rail [data-panel="media"]',
    title: 'Start by bringing footage in',
    body: 'Media lives here. You can also just drag video, photos or music anywhere in this window. '
      + 'Nothing is uploaded — every file stays on this device.',
  },
  {
    target: '#tl-body',
    title: 'The timeline',
    body: 'Drag a clip from Media onto a track. Drag its ends to trim, drag its middle to move it. '
      + 'Press S to cut it in half wherever the playhead is.',
  },
  {
    target: '#viewer',
    title: 'The viewer',
    body: 'What you see here is exactly what exports — same renderer, no surprises at the end. '
      + 'Space plays and pauses; the arrow keys move one frame at a time.',
  },
  {
    target: '#rail [data-panel="ai"]',
    title: 'The part that saves you an hour',
    body: 'Describe what you want — "30 second TikTok, fast cuts on the beat, captions on" — and it '
      + 'plans the whole edit. You see every step before it runs, and one Ctrl+Z undoes all of it.',
  },
  {
    target: '#rail [data-panel="color"]',
    title: 'Make it look like something',
    body: 'Tap a look to grade every clip at once, or select one clip and grade just that. '
      + 'Everything is a slider you can put back.',
  },
  {
    target: '#level-switch',
    title: 'Three editors in one',
    body: 'Beginner keeps nine tools on screen. Expert shows everything, including curves, scopes and '
      + 'keyframes. Switch whenever — it never changes your project, only what is visible.',
  },
  {
    target: '#btn-export',
    title: 'When you are done',
    body: 'Pick where it is going — TikTok, YouTube, a square post — and it handles the rest. '
      + 'No watermark on any tier. Ctrl+K finds anything you cannot see.',
  },
];

let index = 0;
let active = false;

export function startTour() {
  index = 0;
  active = true;
  $('#coach').hidden = false;
  paint();
}

export function endTour(completed = false) {
  active = false;
  $('#coach').hidden = true;
  try { localStorage.setItem(SEEN_KEY, completed ? 'done' : 'skipped'); } catch { /* private mode */ }
}

/** Offer the tour on a first run, but never interrupt someone mid-edit. */
export function maybeOfferTour() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch { seen = 'skipped'; }
  if (seen) return;
  setTimeout(startTour, 900);
}

function paint() {
  const step = STEPS[index];
  $('#coach-step').textContent = `Step ${index + 1} of ${STEPS.length}`;
  $('#coach-title').textContent = step.title;
  $('#coach-body').textContent = step.body;
  $('#coach-prev').disabled = index === 0;
  $('#coach-next').textContent = index === STEPS.length - 1 ? 'Start editing' : 'Next';

  const ring = $('#coach-ring');
  const target = step.target ? document.querySelector(step.target) : null;
  if (!target) {
    // No target: park the ring off screen rather than leaving it over whatever
    // it highlighted last, which reads as pointing at the wrong thing.
    ring.style.opacity = '0';
    ring.style.width = ring.style.height = '0px';
    return;
  }
  const r = target.getBoundingClientRect();
  const pad = 7;
  ring.style.opacity = '1';
  ring.style.left = `${r.left - pad}px`;
  ring.style.top = `${r.top - pad}px`;
  ring.style.width = `${r.width + pad * 2}px`;
  ring.style.height = `${r.height + pad * 2}px`;
}

/* Wiring runs once at module load; the overlay is hidden until startTour. */
$('#coach-next')?.addEventListener('click', () => {
  if (index === STEPS.length - 1) { endTour(true); return; }
  index++;
  paint();
});
$('#coach-prev')?.addEventListener('click', () => { index = Math.max(0, index - 1); paint(); });
$('#coach-skip')?.addEventListener('click', () => endTour(false));
window.addEventListener('resize', () => { if (active) paint(); });
document.addEventListener('keydown', (e) => {
  if (!active) return;
  if (e.key === 'Escape') endTour(false);
  if (e.key === 'ArrowRight') $('#coach-next').click();
  if (e.key === 'ArrowLeft') $('#coach-prev').click();
});
