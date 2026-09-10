/*
 * Skill levels.
 *
 * The whole mechanism is one attribute on <html> plus one CSS rule; anything
 * tagged data-min="expert" simply isn't there below expert. Nothing is
 * disabled, greyed out or hidden behind a "show advanced" checkbox — those
 * read as the software judging you, which is exactly the feeling that makes
 * people close Resolve and never open it again.
 *
 * The level never touches the project. Switching to Beginner hides the curve
 * editor; it does not throw away the curve.
 */

const KEY = 'omnidx.studio.level';
export const LEVELS = ['beginner', 'intermediate', 'expert'];

export const DESCRIPTIONS = {
  beginner: {
    name: 'Beginner',
    line: 'Nine tools and a guided path. Nothing on screen that you do not need yet.',
    shows: ['Media', 'AI editor', 'One-tap looks', 'Text', 'Music', 'Export presets'],
  },
  intermediate: {
    name: 'Intermediate',
    line: 'The real timeline and inspector, without the colour-science vocabulary.',
    shows: ['Multitrack timeline', 'Ripple editing', 'Transform and crop', 'Colour sliders',
      'Audio mixing', 'Transitions', 'Markers'],
  },
  expert: {
    name: 'Expert',
    line: 'Everything. Nothing is hidden from you at this level.',
    shows: ['Keyframes and easing', 'Curves and scopes', 'Speed ramping', 'Blend modes',
      'Grain, tint, highlights and shadows', 'Custom shortcuts', 'Raw project JSON'],
  },
};

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
