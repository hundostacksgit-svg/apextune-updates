/*
 * The keyboard, as data.
 *
 * Every shortcut used to be a `case` in one switch in main.js, which made the
 * set fixed: the Professional level has advertised "custom keyboard maps" since
 * it was written and there was nothing behind it. A shortcut somebody cannot
 * move is also a shortcut somebody cannot reach — the editors people arrive
 * from all disagree about which key splits a clip, and an editor that insists
 * on its own answer is one they put down.
 *
 * So the bindings live here as a list of commands with default chords, main.js
 * asks `commandFor(event)` what was pressed, and the Settings panel rebinds
 * them. Overrides are stored per device; the defaults are never written, so a
 * later change to a default reaches everybody who has not moved that key.
 *
 * Chords are matched on `event.code`, not `event.key`. Option+C on a Mac is
 * "ç" and Shift+L is "L" — matching on the character means a key that works
 * unshifted and silently does nothing shifted, which reads as a broken app. The
 * code is the physical key, which is what somebody is actually pressing.
 */

const STORE = 'omnidx.studio.keymap.v1';

/* Physical keys that have a name worth showing rather than a code. */
const NAMED = {
  Space: 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Delete: 'Delete', Backspace: 'Backspace', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab',
  Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.',
  Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`',
};

/** The physical key of an event, as a token a binding can be written with. */
function token(e) {
  const c = e.code || '';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit[0-9]$/.test(c)) return c.slice(5);
  if (/^Numpad[0-9]$/.test(c)) return `Num${c.slice(6)}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c;
  if (NAMED[c]) return NAMED[c];
  /* A layout this does not know about: fall back to the character, upper-cased
     so "a" and "A" are the same physical key. */
  return e.key && e.key.length === 1 ? e.key.toUpperCase() : (e.key || c);
}

/**
 * The chord an event represents, e.g. "Ctrl+Shift+Z".
 *
 * Modifiers always in the same order, so two ways of writing the same chord
 * cannot both end up in the map pointing at different commands.
 */
export function chordOf(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const t = token(e);
  /* A modifier pressed on its own is not a chord. */
  if (/^(Control|Meta|Alt|Shift|ControlLeft|ControlRight|MetaLeft|MetaRight|AltLeft|AltRight|ShiftLeft|ShiftRight)$/.test(e.code || '')) return null;
  parts.push(t);
  return parts.join('+');
}

/*
 * Every command the keyboard can reach.
 *
 * `keys` is a list because a command can have more than one way in and both are
 * correct: Ctrl+Y and Ctrl+Shift+Z are both redo, and L and Shift+L are the
 * same shuttle key on layouts where the letter needs a shift. Rebinding
 * replaces the list with the one chord somebody chose.
 */
export const COMMANDS = [
  /* ---- transport ---- */
  { id: 'play', group: 'Transport', label: 'Play / pause', keys: ['Space'] },
  { id: 'stepBack', group: 'Transport', label: 'Back one frame', keys: ['Left'] },
  { id: 'stepFwd', group: 'Transport', label: 'Forward one frame', keys: ['Right'] },
  { id: 'jumpBack', group: 'Transport', label: 'Back one second', keys: ['Shift+Left'] },
  { id: 'jumpFwd', group: 'Transport', label: 'Forward one second', keys: ['Shift+Right'] },
  { id: 'goStart', group: 'Transport', label: 'Go to the start', keys: ['Home'] },
  { id: 'goEnd', group: 'Transport', label: 'Go to the end', keys: ['End'] },
  { id: 'shuttleFwd', group: 'Transport', label: 'Shuttle forward (faster each press)', keys: ['L', 'Shift+L'] },
  { id: 'shuttleBack', group: 'Transport', label: 'Shuttle back (faster each press)', keys: ['J', 'Shift+J'] },
  { id: 'shuttleStop', group: 'Transport', label: 'Stop the shuttle', keys: ['K', 'Shift+K'] },

  /* ---- editing ---- */
  { id: 'split', group: 'Editing', label: 'Split at the playhead', keys: ['S', 'Shift+S'] },
  { id: 'delete', group: 'Editing', label: 'Delete the selection', keys: ['Delete', 'Backspace'] },
  { id: 'undo', group: 'Editing', label: 'Undo', keys: ['Ctrl+Z', 'Meta+Z'] },
  { id: 'redo', group: 'Editing', label: 'Redo', keys: ['Ctrl+Shift+Z', 'Meta+Shift+Z', 'Ctrl+Y', 'Meta+Y'] },
  { id: 'duplicate', group: 'Editing', label: 'Duplicate', keys: ['Ctrl+D', 'Meta+D'] },
  { id: 'selectAll', group: 'Editing', label: 'Select everything', keys: ['Ctrl+A', 'Meta+A'] },
  { id: 'cut', group: 'Editing', label: 'Cut', keys: ['Ctrl+X', 'Meta+X'] },
  { id: 'copy', group: 'Editing', label: 'Copy', keys: ['Ctrl+C', 'Meta+C'] },
  { id: 'paste', group: 'Editing', label: 'Paste', keys: ['Ctrl+V', 'Meta+V'] },
  { id: 'copyAttrs', group: 'Editing', label: 'Copy attributes', keys: ['Ctrl+Alt+C', 'Meta+Alt+C'] },
  { id: 'pasteAttrs', group: 'Editing', label: 'Paste attributes', keys: ['Ctrl+Alt+V', 'Meta+Alt+V'] },
  { id: 'freezeFrame', group: 'Editing', label: 'Freeze this frame', keys: ['E', 'Shift+E'] },
  { id: 'matchFrame', group: 'Editing', label: 'Match frame to the source', keys: ['Y', 'Shift+Y'] },
  { id: 'marker', group: 'Editing', label: 'Add a marker', keys: ['M', 'Shift+M'] },

  /* ---- tools ---- */
  { id: 'toolSelect', group: 'Tools', label: 'Select tool', keys: ['V', 'Shift+V'] },
  { id: 'toolRazor', group: 'Tools', label: 'Razor tool (press again to go back)', keys: ['C', 'Shift+C'] },
  { id: 'toolTrim', group: 'Tools', label: 'Trim tool (press again to go back)', keys: ['T', 'Shift+T'] },

  /* ---- the window ---- */
  { id: 'zoomIn', group: 'View', label: 'Zoom the timeline in', keys: ['=', 'Shift+='] },
  { id: 'zoomOut', group: 'View', label: 'Zoom the timeline out', keys: ['-', 'Shift+-'] },
  { id: 'timelineFull', group: 'View', label: 'Timeline full screen', keys: ['Shift+F'] },
  { id: 'escape', group: 'View', label: 'Deselect / leave full screen', keys: ['Esc'] },

  /* ---- the app ---- */
  { id: 'palette', group: 'App', label: 'Command palette', keys: ['Ctrl+K', 'Meta+K'] },
  { id: 'save', group: 'App', label: 'Save now', keys: ['Ctrl+S', 'Meta+S'] },
  { id: 'export', group: 'App', label: 'Export', keys: ['Ctrl+E', 'Meta+E'] },
  { id: 'settings', group: 'App', label: 'Settings', keys: ['Ctrl+O', 'Meta+O'] },

  /* ---- panels, which double as multicam angles while one is under the playhead ---- */
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `panel${i + 1}`, group: 'Panels', label: `Panel ${i + 1} · angle ${i + 1} on a multicam clip`, keys: [String(i + 1)],
  })),
];

const BY_ID = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

/* ---------------------------------------------------------------- storage */
function readOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || '{}');
    /* Only ids this build still has: a binding for a command that was removed
       is dead weight that would otherwise sit in the map forever. */
    return Object.fromEntries(Object.entries(raw).filter(([id, keys]) => BY_ID[id] && Array.isArray(keys)));
  } catch { return {}; }
}
let overrides = readOverrides();

function write() {
  try { localStorage.setItem(STORE, JSON.stringify(overrides)); } catch { /* private window: this session only */ }
  index = null;
}

/** Every command with the chords actually in force. */
export function bindings() {
  return COMMANDS.map((c) => ({ ...c, keys: overrides[c.id] || c.keys, custom: Boolean(overrides[c.id]) }));
}

/* chord → command id, built once and thrown away whenever a binding moves. */
let index = null;
function chordIndex() {
  if (index) return index;
  index = {};
  for (const c of bindings()) for (const k of c.keys) index[k] = c.id;
  return index;
}

/** Which command a keyboard event runs, or null. */
export function commandFor(e) {
  const chord = chordOf(e);
  return chord ? (chordIndex()[chord] || null) : null;
}

/** Which command owns a chord, or null. */
export function ownerOf(chord) { return chordIndex()[chord] || null; }

/**
 * Give a command a chord.
 *
 * A chord belongs to one command: taking it from another is allowed, and said
 * so plainly, because the alternative is two commands on one key and a
 * shortcut that does whichever the loop reached first.
 */
export function setKey(id, chord) {
  if (!BY_ID[id] || !chord) return { ok: false };
  const taken = ownerOf(chord);
  if (taken === id) return { ok: true, tookFrom: null };
  if (taken) {
    const from = bindings().find((c) => c.id === taken);
    const left = from.keys.filter((k) => k !== chord);
    overrides[taken] = left;
  }
  overrides[id] = [chord];
  write();
  return { ok: true, tookFrom: taken ? BY_ID[taken].label : null };
}

/** Put one command back to the chords it shipped with. */
export function resetKey(id) { delete overrides[id]; write(); }

/** Put the whole keyboard back. */
export function resetAll() { overrides = {}; write(); }

/** How many commands have been moved. */
export function customCount() { return Object.keys(overrides).length; }

/*
 * A chord as somebody would read it.
 *
 * Mac users are shown the symbols they have on their keys; everybody else is
 * shown the words. Getting this wrong is a small thing that makes an app feel
 * like it was written for somewhere else.
 */
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export function label(chord) {
  if (!chord) return '';
  return chord.split('+').map((p) => {
    if (p === 'Meta') return MAC ? '⌘' : 'Win';
    if (p === 'Ctrl') return MAC ? '⌃' : 'Ctrl';
    if (p === 'Alt') return MAC ? '⌥' : 'Alt';
    if (p === 'Shift') return MAC ? '⇧' : 'Shift';
    return p;
  }).join(MAC ? '' : '+');
}

/**
 * The chords worth printing next to a command.
 *
 * Both Ctrl+Z and ⌘Z are bound so the app works on either machine, but showing
 * a Mac user the Windows chord as well is noise — so only the ones that match
 * the keyboard in front of them, and if that leaves nothing, all of them.
 */
export function shownKeys(cmd) {
  const mine = cmd.keys.filter((k) => (MAC ? !k.startsWith('Ctrl+') : !k.startsWith('Meta+')));
  return (mine.length ? mine : cmd.keys).slice(0, 2);
}

/** The first chord for a command, for printing on a button or a menu row. */
export function keyFor(id) {
  const cmd = bindings().find((c) => c.id === id);
  return cmd ? label(shownKeys(cmd)[0]) : '';
}
