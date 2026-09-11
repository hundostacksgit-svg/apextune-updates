/*
 * Hover help.
 *
 * The native `title` attribute is already on most controls, but it is a poor
 * teacher: it waits a second and a half, it cannot be styled, it never appears
 * on a touch screen at all, and it vanishes the moment you move. For somebody
 * learning an editor, that is the difference between a label and a lesson.
 *
 * So Beginner gets real tips: a styled bubble, quickly, that says what the
 * control does and — where it matters — what will happen if you press it.
 *
 * It is deliberately a level feature. A professional hovering over the razor
 * tool does not need to be told what a razor is, and a bubble appearing every
 * time their pointer crosses the toolbar is an irritation they cannot
 * outrun. So this is on at Beginner, off above it, and switchable either way
 * from the Settings menu for anyone who disagrees with that default.
 */

import { $, $$ } from './ui.js';

const KEY = 'omnidx.studio.tips.v1';
const DELAY = 380;          // long enough not to fire while crossing the screen

let enabled = false;
let timer = 0;
let bubble = null;
let current = null;

/*
 * What things actually do, in plain words.
 *
 * Written as answers to "what is this", not as names. "Razor" is the name;
 * "cut a clip in two where you click" is the answer. Keyed by the id or the
 * data attribute already on the control, so nothing has to be re-tagged.
 */
export const TIPS = {
  /* transport */
  'tp-play': 'Play or pause. Space does the same, and works wherever you are.',
  'tp-start': 'Jump to the very beginning.',
  'tp-back': 'Step back one single frame — for landing a cut exactly.',
  'tp-fwd': 'Step forward one single frame.',
  'tp-end': 'Jump to the end of everything on the timeline.',

  /* tools */
  'tl-import': 'Add video, photos or music. They stay on your device — nothing is uploaded.',
  'tl-split': 'Cut the selected clip in two at the playhead, so you can delete or move half of it.',
  'tl-delete': 'Remove the selected clip. Undo brings it straight back.',
  'tl-dup': 'Make a second copy of the selected clip, right after it.',
  'tl-marker': 'Drop a marker at the playhead — a note to yourself about this moment.',
  'tg-snap': 'Clips stick to each other and to the playhead as you drag, so there are no one-frame gaps.',
  'tg-ripple': 'When you delete or shorten a clip, everything after it slides back to close the gap.',
  'tg-safe': "Shows where TikTok's and YouTube's own buttons sit over your video, so captions do not end up underneath them.",
  'tg-ratios': 'Shows this frame cropped for TikTok, YouTube and a square post at the same time.',

  /* top bar */
  'btn-undo': 'Take back the last thing you did. Safe to press — you can always redo.',
  'btn-redo': 'Put back something you just undid.',
  'btn-export': 'Turn your timeline into a video file you can post or save.',
  'btn-projects': 'Your saved projects. Everything autosaves as you work.',
  'btn-palette': 'Search every command in the app by name.',

  /* rail */
  'panel:media': 'Your clips, photos and music. Drag one onto the timeline to use it.',
  'panel:ai': 'Describe the edit you want in your own words and it builds it for you.',
  'panel:templates': 'One-tap styles — anime, velocity, phonk. They put a look on your edit without changing your cuts.',
  'panel:effects': 'Filters and transitions. Every one shows you what it does before you use it.',
  'panel:color': 'Brightness, contrast and colour. Start with a look, then fine-tune.',
  'panel:text': 'Titles, captions and stickers.',
  'panel:audio': 'Volume, fades and audio effects for each clip.',
  'panel:captions': 'Subtitles, timed to where the speech is.',
  'panel:settings': 'Frame rate, resolution and how the app behaves.',
  'panel:help': 'The walkthrough and every keyboard shortcut.',

  /* tools by data-tool */
  'tool:select': 'Normal mode — click a clip to select it, drag to move it.',
  'tool:razor': 'Razor — click anywhere on a clip to cut it in two there.',
};

export function tipsOn() { return enabled; }

export function setTips(on) {
  enabled = Boolean(on);
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* private mode */ }
  if (!enabled) hide();
}

/**
 * Decide whether tips should be on, given the skill level.
 *
 * An explicit choice always wins and is remembered. Without one, Beginner gets
 * them and everyone else does not.
 */
export function applyTipsForLevel(level) {
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
  if (stored === '1' || stored === '0') { enabled = stored === '1'; return; }
  enabled = level === 'beginner';
}

/* ------------------------------------------------------------------ *
 * The bubble
 * ------------------------------------------------------------------ */

function el() {
  if (bubble) return bubble;
  bubble = document.createElement('div');
  bubble.className = 'tip-bubble';
  bubble.setAttribute('role', 'tooltip');
  document.body.appendChild(bubble);
  return bubble;
}

function hide() {
  clearTimeout(timer);
  current = null;
  bubble?.classList.remove('on');
}

/** Which tip, if any, belongs to this element or one of its parents. */
function tipFor(node) {
  const host = node?.closest?.('[id],[data-panel],[data-tool],[data-tip]');
  if (!host) return null;
  if (host.dataset.tip) return { host, text: host.dataset.tip };
  if (host.dataset.panel && TIPS[`panel:${host.dataset.panel}`]) {
    return { host, text: TIPS[`panel:${host.dataset.panel}`] };
  }
  if (host.dataset.tool && TIPS[`tool:${host.dataset.tool}`]) {
    return { host, text: TIPS[`tool:${host.dataset.tool}`] };
  }
  if (host.id && TIPS[host.id]) return { host, text: TIPS[host.id] };
  return null;
}

function place(host) {
  const b = el();
  const r = host.getBoundingClientRect();
  b.style.visibility = 'hidden';
  b.classList.add('on');
  const bw = b.offsetWidth, bh = b.offsetHeight;

  // Below by default, above when there is no room — a tip that runs off the
  // bottom of the screen is a tip nobody reads.
  let top = r.bottom + 9;
  let below = true;
  if (top + bh > window.innerHeight - 8) { top = r.top - bh - 9; below = false; }
  // And clamped horizontally, so a control at the edge of the window still
  // gets a readable bubble rather than one sliced in half.
  const left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2));

  b.style.top = `${Math.max(8, top)}px`;
  b.style.left = `${left}px`;
  b.classList.toggle('above', !below);
  b.style.visibility = '';
}

export function initTips() {
  document.addEventListener('pointerover', (e) => {
    if (!enabled) return;
    // Touch raises a pointerover just before the tap. A bubble that appears
    // under the finger and then the thing is pressed anyway is pure noise.
    if (e.pointerType === 'touch') return;
    const found = tipFor(e.target);
    if (!found) { hide(); return; }
    if (found.host === current) return;
    clearTimeout(timer);
    current = found.host;
    timer = setTimeout(() => {
      const b = el();
      b.textContent = found.text;
      place(found.host);
    }, DELAY);
  });

  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !current?.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('pointerdown', hide);
  // A tip pinned in place while the page moves under it points at nothing.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);

  /*
   * Keyboard users get the same help. Focusing a control shows its tip, which
   * is the only way somebody tabbing through the app ever sees one.
   */
  document.addEventListener('focusin', (e) => {
    if (!enabled) return;
    const found = tipFor(e.target);
    if (!found) { hide(); return; }
    current = found.host;
    const b = el();
    b.textContent = found.text;
    place(found.host);
  });
  document.addEventListener('focusout', hide);

  void $$; void $;
}
