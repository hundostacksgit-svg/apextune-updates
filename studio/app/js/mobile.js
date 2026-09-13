/*
 * Touch behaviour for phones.
 *
 * The layout half of the phone rebuild lives in app.css. This is the half CSS
 * cannot do: dragging a sheet to resize it, pinching the timeline to zoom,
 * and making sure only one sheet is ever open at a time.
 *
 * All of it is additive. Nothing here runs on a desktop, nothing here is
 * required for the app to work, and every listener is passive or explicitly
 * cancels only the gesture it owns — so a failure in this file makes the phone
 * experience worse, never broken.
 */

import { $, $$ } from './ui.js';

/** Phone-shaped, by the same breakpoint the stylesheet uses. */
export function isPhone() {
  return window.matchMedia('(max-width: 760px)').matches;
}

/* ------------------------------------------------------------------ *
 * Sheets
 * ------------------------------------------------------------------ */

/**
 * A dimmed backdrop behind whichever sheet is open.
 *
 * Tapping it closes the sheet, which is the gesture every phone user already
 * has in their hands from every other app. Without it the only way out of a
 * panel is to find the same tab button again, which people do not think to do.
 */
function scrim() {
  let el = $('.sheet-scrim');
  if (!el) {
    el = document.createElement('div');
    el.className = 'sheet-scrim';
    document.body.appendChild(el);
    el.addEventListener('click', () => closeSheets());
  }
  return el;
}

export function closeSheets() {
  $('#panel')?.classList.remove('open');
  $('#inspector')?.classList.remove('open');
  $('.sheet-scrim')?.classList.remove('on');
  $$('#rail [data-panel]').forEach((b) => b.classList.remove('on'));
}

/**
 * Keep the scrim, and the rest of the layout, in step with whatever is open.
 *
 * `sheet-open` on the body is what lets the viewer get out of the way in
 * landscape. The canvas is centred in the stage, so a sheet occupying the right
 * third lands squarely on top of a centred picture — the video is technically
 * on screen and entirely invisible. CSS cannot know a fixed-position sheet is
 * there, so it has to be told.
 */
export function syncScrim() {
  if (!isPhone()) {
    $('.sheet-scrim')?.classList.remove('on');
    document.body.classList.remove('sheet-open');
    return;
  }
  const open = Boolean($('#panel')?.classList.contains('open')
    || $('#inspector')?.classList.contains('open'));
  scrim().classList.toggle('on', open);
  document.body.classList.toggle('sheet-open', open);
}

/**
 * Drag the handle at the top of a sheet to resize it; flick it down to close.
 *
 * Two details matter more than they look. The gesture only starts on the
 * handle strip, so dragging anywhere else still scrolls the sheet's contents —
 * hijacking the whole surface is what makes bottom sheets feel broken. And the
 * decision to close is made on velocity as well as distance, because a quick
 * flick is how people dismiss things, and requiring them to drag most of the
 * way down instead feels like the app is arguing with them.
 */
function makeDraggable(sheet) {
  if (!sheet || sheet.dataset.dragWired) return;
  sheet.dataset.dragWired = '1';

  const HANDLE = 30;          // the strip at the top that owns the gesture
  let startY = 0, startH = 0, lastY = 0, lastT = 0, velocity = 0, dragging = false;

  sheet.addEventListener('pointerdown', (e) => {
    if (!isPhone()) return;
    if (e.clientY - sheet.getBoundingClientRect().top > HANDLE) return;
    dragging = true;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    startH = sheet.getBoundingClientRect().height;
    sheet.style.transition = 'none';
    sheet.setPointerCapture(e.pointerId);
  });

  sheet.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = (e.clientY - lastY) / dt;       // px per ms, positive = downward
    lastY = e.clientY;
    lastT = e.timeStamp;

    const max = window.innerHeight * 0.92;
    const next = Math.min(max, startH - (e.clientY - startY));
    sheet.style.setProperty('--sheet-h', `${Math.max(120, next)}px`);
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    try { sheet.releasePointerCapture(e.pointerId); } catch { /* already released */ }

    const dropped = lastY - startY;
    const flicked = velocity > 0.5;           // a deliberate downward flick
    if (flicked || dropped > startH * 0.45) {
      sheet.style.removeProperty('--sheet-h');
      closeSheets();
    }
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

/**
 * Pinch the timeline to zoom it.
 *
 * Two fingers on the timeline is the one gesture every editor on a phone has,
 * and without it the only zoom control is a slider in a toolbar that scrolls
 * off the side of a small screen.
 *
 * The pinch is anchored to the midpoint between the fingers: whatever is under
 * them stays under them. Zooming around the left edge instead — which is what
 * you get by just changing the scale — throws away the part of the timeline
 * the person was looking at, every time.
 */
function wirePinch(setZoom, getZoom) {
  const scroll = $('#tl-scroll') || $('.tl-scroll');
  if (!scroll || scroll.dataset.pinchWired) return;
  scroll.dataset.pinchWired = '1';

  const points = new Map();
  let startSpread = 0, startZoom = 0, anchorTime = 0;

  const spread = () => {
    const [a, b] = [...points.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  scroll.addEventListener('pointerdown', (e) => {
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size === 2) {
      startSpread = spread();
      startZoom = getZoom();
      const [a, b] = [...points.values()];
      const mid = (a.x + b.x) / 2 - scroll.getBoundingClientRect().left;
      anchorTime = (scroll.scrollLeft + mid) / startZoom;
    }
  });

  scroll.addEventListener('pointermove', (e) => {
    if (!points.has(e.pointerId)) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size !== 2 || !startSpread) return;
    e.preventDefault();

    const next = Math.max(8, Math.min(600, startZoom * (spread() / startSpread)));
    setZoom(next);

    // Put the anchored moment back under the fingers.
    const [a, b] = [...points.values()];
    const mid = (a.x + b.x) / 2 - scroll.getBoundingClientRect().left;
    scroll.scrollLeft = Math.max(0, anchorTime * next - mid);
  }, { passive: false });

  const drop = (e) => { points.delete(e.pointerId); if (points.size < 2) startSpread = 0; };
  scroll.addEventListener('pointerup', drop);
  scroll.addEventListener('pointercancel', drop);
  scroll.addEventListener('pointerleave', drop);
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

/**
 * @param hooks.setZoom / hooks.getZoom  timeline pixels-per-second, from main.js
 */
export function initMobile({ setZoom, getZoom } = {}) {
  makeDraggable($('#panel'));
  makeDraggable($('#inspector'));
  if (setZoom && getZoom) wirePinch(setZoom, getZoom);

  /*
   * iOS zooms the whole page when two fingers land on it, which on a timeline
   * you are trying to pinch is exactly wrong — you get a magnified, blurry app
   * instead of a zoomed timeline, and no way back except reloading.
   */
  document.addEventListener('gesturestart', (e) => {
    if (isPhone() && e.target.closest('.timeline')) e.preventDefault();
  });

  /*
   * A double-tap on a control counts as a zoom gesture on iOS unless something
   * says otherwise. Since the transport buttons sit next to each other, a quick
   * play-pause-play reads as a double tap and magnifies the app.
   */
  document.addEventListener('dblclick', (e) => {
    if (isPhone() && e.target.closest('.transport,.tl-bar,.rail')) e.preventDefault();
  });

  // Rotating to landscape, or resizing on a desktop, must not leave a sheet
  // sized for the old viewport.
  window.matchMedia('(max-width: 760px)').addEventListener('change', () => {
    $('#panel')?.style.removeProperty('--sheet-h');
    $('#inspector')?.style.removeProperty('--sheet-h');
    if (!isPhone()) $('.sheet-scrim')?.classList.remove('on');
  });

  syncScrim();
}
