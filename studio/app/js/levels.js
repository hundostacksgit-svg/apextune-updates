/*
 * Skill levels.
 *
 * The mechanism is one attribute on <html>; anything tagged data-min="expert"
 * simply isn't there below expert. Nothing is disabled, greyed out or hidden
 * behind a "show advanced" checkbox — those read as the software judging you,
 * which is exactly the feeling that makes people close Resolve and never open
 * it again.
 *
 * The three levels are not the same app with things taken away. They are three
 * densities:
 *
 *   Beginner       roomy, guided, the inspector out of the way entirely, and
 *                  one screen: panel, picture, timeline.
 *   Intermediate   pages, the real timeline and inspector, at a working
 *                  density. A node graph and scopes, without the vocabulary.
 *   Professional   finishing-suite density — smaller type, tighter rows, a
 *                  taller timeline, tabular figures, serial correctors, and a
 *                  deliberately grey chrome so the only saturated thing on
 *                  screen is the image.
 *
 * That last one matters more than the feature list. A colourist judging a
 * grade next to bright blue furniture is being lied to by their own eye, which
 * is why every serious finishing application is grey. Ours is too, at the
 * level where people are doing that work.
 *
 * The level never touches the project. Switching to Beginner hides the curve
 * editor; it does not throw away the curve.
 */

const KEY = 'omnidx.studio.level';
export const LEVELS = ['beginner', 'intermediate', 'expert'];

export const DESCRIPTIONS = {
  beginner: {
    name: 'Beginner',
    tag: 'Guided',
    line: 'Nine tools and a guided path. Nothing on screen that you do not need yet.',
    shows: ['Media', 'AI editor', 'One-tap looks', 'Text', 'Music', 'Export presets'],
  },
  intermediate: {
    name: 'Intermediate',
    tag: 'Editing',
    line: 'Pages, the full timeline and the inspector at a working density, without the colour-science vocabulary.',
    shows: ['Pages: Media, Cut, Edit, Colour, Fairlight, Deliver',
      'Multitrack timeline with ripple, roll and slip',
      'Inspector: transform, crop, opacity, blend',
      'A node graph, colour sliders and the whole look library',
      'Scopes, the stills gallery and the shot strip',
      'Audio mixing, fades, ducking and creative filters',
      'Transitions, markers and snapping',
      'Motion tracking',
      'Shortcuts shown on every control'],
  },
  expert: {
    name: 'Professional',
    tag: 'Finishing',
    line: 'A finishing suite: seven pages, serial correctors, scopes, and a neutral grey room around the picture.',
    shows: ['Serial correctors — a real node chain, each one keying the last one\u2019s output',
      'The Motion page, plus the lightbox for matching a sequence',
      'Stills gallery: grab a grade, drop it on the next shot',
      'Keyframes with bezier easing on every property',
      'Curves, scopes and HSL qualifiers',
      'Three-way colour wheels and unlimited LUT slots',
      'Bypass on one key, to see the shot as it was',
      'Speed ramping and time remapping',
      'Frame-accurate timecode on every field',
      'ProRes, DNxHR and H.265 delivery',
      'Custom keyboard maps and the command palette',
      'Raw project JSON, editable in place'],
  },
};

/** The display name for a level id. `expert` is shown as "Professional". */
export function nameOf(level) {
  return DESCRIPTIONS[level]?.name || 'Beginner';
}

export function current() {
  try { return LEVELS.includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'beginner'; }
  catch { return 'beginner'; }
}

export function set(level) {
  const next = LEVELS.includes(level) ? level : 'beginner';
  document.documentElement.setAttribute('data-level', next);
  try { localStorage.setItem(KEY, next); } catch { /* private mode — this session only */ }
  return next;
}

export function apply() { return set(current()); }

/** True when a control tagged for `min` should be visible at the current level. */
export function allows(min) {
  if (!min) return true;
  return LEVELS.indexOf(current()) >= LEVELS.indexOf(min);
}

/** Has this person ever changed level? Used to decide whether to offer the tour. */
export function isFirstRun() {
  try { return localStorage.getItem(KEY) === null; } catch { return true; }
}
