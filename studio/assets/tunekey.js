/*
 * OmniDx Tune keys, in the browser.
 *
 * TUNE-XXXX-XXXX-XXXX-CCCC is one PC; SQUAD-XXXX-XXXX-XXXX-CCCC is five. The
 * last block is a checksum over the rest, so a mistyped key is caught before
 * anything is asked of a server. These four lines of arithmetic are mirrored
 * exactly in server/worker.js, tune/omnidx.ps1 and tools/make-tune-key.py;
 * change one and you must change all four.
 *
 * A key made here is only as real as the place that records it. With the
 * Worker deployed the activation page asks the server for a key and the
 * script asks the server before it runs; without it, the key is made here,
 * checked by its checksum, and locked to the first PC that runs it.
 */

export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0 or 1
export const SALT = 'omnidx-tune-2026';
export const TAGS = { tune: 'TUNE', squad: 'SQUAD' };
const BY_TAG = { TUNE: 'tune', SQUAD: 'squad' };
const SEATS = { tune: 1, squad: 5 };

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function checksum(tag, payload) {
  let h = fnv1a(`${SALT}:${tag}:${payload}`);
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHABET[h % ALPHABET.length]; h = Math.floor(h / ALPHABET.length) + (h % 7); }
  return out;
}

/** A new key for a product, compact (no dashes). */
export function makeKey(product) {
  const tag = TAGS[product];
  if (!tag) throw new Error(`No key format for "${product}"`);
  let payload = '';
  for (const b of crypto.getRandomValues(new Uint8Array(12))) payload += ALPHABET[b % ALPHABET.length];
  return `${tag}${payload}${checksum(tag, payload)}`;
}

/** { product, seats, key, pretty } or null when the key does not check out. */
export function parseKey(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^(TUNE|SQUAD)([A-Z0-9]{12})([A-Z0-9]{4})$/.exec(c);
  if (!m) return null;
  const [, tag, payload, sum] = m;
  if ([...payload].some((ch) => !ALPHABET.includes(ch))) return null;
  if (checksum(tag, payload) !== sum) return null;
  const product = BY_TAG[tag];
  return { product, seats: SEATS[product], key: c, pretty: pretty(c) };
}

/** TUNE-ABCD-EFGH-JKLM-NPQR — the way a person reads and types it. */
export function pretty(key) {
  const c = String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const tag = c.startsWith('SQUAD') ? 'SQUAD' : 'TUNE';
  const rest = c.slice(tag.length);
  return `${tag}-${rest.slice(0, 4)}-${rest.slice(4, 8)}-${rest.slice(8, 12)}-${rest.slice(12, 16)}`;
}

