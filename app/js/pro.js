/*
 * Pro unlock.
 *
 * Honest about what this is: OmniDx is a static app, so this code runs on the
 * buyer's machine and the salt below is readable by anyone who opens dev tools.
 * It stops a code being guessed and stops casual "just type anything" sharing.
 * It does not stop a determined person, and no purely client-side check can.
 * The trade is deliberate — see docs/PAYMENTS.md.
 */

const KEY = 'omnidx.licence.v1';
const SALT = 'omnidx-2026-licence';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0 or 1

/** Which features a licence unlocks. Change this to re-cut the free/paid split. */
export const PRO_FEATURES = ['live-scan', 'logging', 'garage'];

/** FNV-1a, 32-bit. Chosen because it is trivial to reproduce byte-for-byte in
 *  the Python generator, so codes made offline always validate here. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function checksum(a, b) {
  let h = fnv1a(`${SALT}:${a}-${b}`);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[h % ALPHABET.length];
    h = Math.floor(h / ALPHABET.length) + (h % 7);
  }
  return out;
}

export function normalise(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True when the code is well-formed and its checksum group matches. */
export function isValidCode(code) {
  const c = normalise(code);
  if (!/^OMNIDX[A-Z0-9]{12}$/.test(c)) return false;
  const body = c.slice(6);
  const [a, b, chk] = [body.slice(0, 4), body.slice(4, 8), body.slice(8, 12)];
  if ([...a + b].some((ch) => !ALPHABET.includes(ch))) return false;
  return checksum(a, b) === chk;
}

export function format(code) {
  const c = normalise(code);
  if (c.length !== 18) return code;
  return `OMNIDX-${c.slice(6, 10)}-${c.slice(10, 14)}-${c.slice(14, 18)}`;
}

export function activate(code) {
  if (!isValidCode(code)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: normalise(code), at: Date.now() }));
  } catch { /* private mode — Pro stays on for this session only */ }
  return true;
}

export function deactivate() {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
}

export function licence() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    return isValidCode(rec.code) ? rec : null;
  } catch {
    return null;
  }
}

export function isPro() {
  return licence() !== null;
}

/** Gate helper: `can('logging')` is false on the free tier. */
export function can(feature) {
  return !PRO_FEATURES.includes(feature) || isPro();
}
