/*
 * Accounts, devices and sessions for OmniDx Studio.
 *
 * There are two backends behind one API, chosen by whether API.base is set in
 * config.js.
 *
 *   Local  — no server at all. The password never leaves the machine; what's
 *            stored is a PBKDF2 verifier and an AES-GCM vault holding the
 *            things worth protecting (licence, brand kit, project index).
 *            Honest limits: this cannot sync between devices, and anyone with
 *            the device and the password gets in. It is a lock on a drawer,
 *            not a bank.
 *
 *   Server — the Worker in server/. Real sessions, real device limits, real
 *            licence verification, and the same screens on every device.
 *
 * Both enforce the same rules so nothing changes for the rest of the app when
 * you deploy the Worker later.
 */

import { API, DEVICE_LIMIT, RANK } from './config.js';

const K = {
  account: 'omnidx.studio.account.v1',   // local-mode account record
  session: 'omnidx.studio.session.v1',   // { email, token, edition, at }
  device:  'omnidx.studio.device.v1',    // this device's stable id
  remember:'omnidx.studio.remember.v1',  // device-wrapped key, opt-in
};

const PBKDF2_ROUNDS = 310_000;           // OWASP's 2023 floor for SHA-256
const enc = new TextEncoder();

/* ------------------------------------------------------------------ */
/* storage helpers — never throw, private mode is a supported state     */
/* ------------------------------------------------------------------ */
function get(key, fallback = null) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}
function put(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function drop(key) { try { localStorage.removeItem(key); } catch { /* nothing to remove */ } }

/* ------------------------------------------------------------------ */
/* crypto                                                              */
/* ------------------------------------------------------------------ */
const b64 = {
  from: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  to: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKey(password, saltBytes, rounds = PBKDF2_ROUNDS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: rounds, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/** A value derived from the key that proves the password without storing it. */
async function verifierFor(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array([...new Uint8Array(raw), ...enc.encode('omnidx-verify')]));
  return b64.from(digest);
}

async function seal(key, obj) {
  const iv = randomBytes(12);
  const data = enc.encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: b64.from(iv), ct: b64.from(ct) };
}

async function open(key, box) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64.to(box.iv) }, key, b64.to(box.ct),
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

/* Rough, deliberately coarse: enough to tell two of your own devices apart in
   a list, not enough to be a tracking fingerprint. */
export function deviceInfo() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return {
    id: deviceId(),
    os,
    browser,
    kind: standalone ? 'app' : 'browser',
    label: `${browser} on ${os}${standalone ? ' (installed)' : ''}`,
    screen: `${screen.width}×${screen.height}`,
    lastSeen: Date.now(),
  };
}

/** Stable per-device identifier. Random, local, and meaningless off-device. */
export function deviceId() {
  let id = get(K.device);
  if (!id) { id = b64.from(randomBytes(16)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 22); put(K.device, id); }
  return id;
}

/* ------------------------------------------------------------------ */
/* password strength — shown live, and enforced at 3+                   */
/* ------------------------------------------------------------------ */
const WEAK = ['password', '12345678', 'qwerty', 'letmein', 'welcome', 'omnidx', 'iloveyou', 'admin'];

/**
 * Length is what actually makes a password hard to guess, so it dominates
 * here. A four-word passphrase scores higher than "P@ssw0rd!", because it is
 * higher — rules that reject a 28-character phrase for having no digit are the
 * reason people end up with "Summer2024!" on every site they use.
 */
export function strength(pw) {
  const s = String(pw || '');
  if (!s) return { score: 0, label: 'Enter a password', hint: '' };
  if (WEAK.some((w) => s.toLowerCase().includes(w))) {
    return { score: 1, label: 'Too guessable', hint: 'That word shows up in every leaked-password list.' };
  }

  let score = s.length >= 20 ? 4
    : s.length >= 16 ? 3
    : s.length >= 12 ? 2
    : s.length >= 8 ? 1 : 0;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((re) => re.test(s)).length;
  if (classes >= 2) score++;
  if (classes >= 3 && s.length >= 10) score++;

  // A single repeated character is long but not strong.
  if (/^(.)\1*$/.test(s)) score = Math.min(score, 1);

  score = Math.max(0, Math.min(5, score));
  const label = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][score];
  const hint = score < 3
    ? 'Longer beats fancier — four unrelated words is stronger than P@ssw0rd.'
    : '';
  return { score, label, hint };
}

export function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v || '').trim());
}

/* ------------------------------------------------------------------ */
/* server backend                                                      */
/* ------------------------------------------------------------------ */
const online = () => Boolean(API.base);

async function api(path, body, token) {
  const res = await fetch(API.base + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server said ${res.status}`);
  return data;
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

export function session() {
  return get(K.session);
}

export function isSignedIn() {
  return Boolean(session());
}

/** The edition this session is entitled to. Signed out is always 'free'. */
export function edition() {
  const s = session();
  if (!s) return localEdition();
  return s.edition && RANK[s.edition] !== undefined ? s.edition : 'free';
}

/**
 * What this device is entitled to when nobody is signed in.
 *
 * The account record is checked first, then the purchase record — and the
 * second half matters more than it looks. Somebody who paid without ever
 * making an account has no account record for the edition to live in, so
 * before this their unlock lasted exactly until something cleared the session,
 * and then quietly reverted them to free. They paid, and the app forgot.
 *
 * A purchase that belongs to an account is deliberately not honoured here:
 * signing out has to actually take the licence off the machine, or a shared
 * laptop hands the next person a paid copy.
 */
function localEdition() {
  const acc = get(K.account);
  if (acc?.edition && RANK[acc.edition] !== undefined && acc.edition !== 'free') return acc.edition;

  const bought = get(K_PURCHASE);
  if (bought?.edition && RANK[bought.edition] !== undefined && !bought.account) return bought.edition;

  return 'free';
}

export async function signUp({ email, password, name }) {
  email = String(email || '').trim().toLowerCase();
  if (!validEmail(email)) throw new Error('That email address does not look right.');
  if (strength(password).score < 3) throw new Error('Pick a stronger password — aim for 12+ characters.');

  if (online()) {
    const out = await api('/v1/auth/signup', { email, password, name, device: deviceInfo() });
    put(K.session, { email, token: out.token, edition: out.edition || 'free', name, at: Date.now() });
    return out;
  }

  if (get(K.account)) throw new Error('An account already exists on this device. Sign in, or reset it below.');

  const salt = randomBytes(32);
  const key = await deriveKey(password, salt);
  const vault = await seal(key, { licence: null, brandKit: null, createdAt: Date.now() });
  const dev = deviceInfo();
  put(K.account, {
    email, name: name || '',
    salt: b64.from(salt), rounds: PBKDF2_ROUNDS,
    verifier: await verifierFor(key),
    vault, edition: 'free',
    devices: [dev],
    createdAt: Date.now(),
  });
  put(K.session, { email, token: 'local', edition: 'free', name: name || '', at: Date.now() });
  return { local: true };
}

export async function signIn({ email, password, remember = false }) {
  email = String(email || '').trim().toLowerCase();

  if (online()) {
    const out = await api('/v1/auth/login', { email, password, device: deviceInfo() });
    put(K.session, { email, token: out.token, edition: out.edition || 'free', name: out.name, at: Date.now() });
    return out;
  }

  /*
   * Local mode holds accounts on the device that made them, so signing in on a
   * second device genuinely has nothing to check against.
   *
   * The old message stated that fact and stopped, which reads as "your account
   * is gone" to the person it happens to. It is the single most common thing
   * anyone sees on this screen — you sign up on a phone, open the site on a
   * laptop, and get told you do not exist. What people need here is what to do
   * next, and the honest answer is: making one here takes a moment and costs
   * nothing, and a paid licence is not tied to it either way.
   */
  const acc = get(K.account);
  if (!acc) {
    throw new Error(
      'There is no account on this device yet. Accounts live on the device that made them '
      + 'until the sync server is switched on — so if you signed up somewhere else, create one '
      + 'here with the same email. It takes a second, and anything you have bought stays unlocked.');
  }
  if (acc.email !== email) {
    throw new Error(
      `This device has an account for ${acc.email}, not ${email}. Sign in with that one, `
      + 'or sign out of it first to use a different email here.');
  }
  const key = await deriveKey(password, b64.to(acc.salt), acc.rounds || PBKDF2_ROUNDS);
  if (await verifierFor(key) !== acc.verifier) throw new Error('Wrong password.');

  // Touch this device, and refuse a new one past the plan's limit.
  const dev = deviceInfo();
  const devices = (acc.devices || []).filter((d) => d.id !== dev.id);
  const limit = DEVICE_LIMIT[acc.edition || 'free'];
  if (devices.length >= limit) {
    throw new Error(`This account is already on ${devices.length} devices (limit ${limit}). Remove one first.`);
  }
  devices.push(dev);
  put(K.account, { ...acc, devices });

  if (remember) {
    const dk = await deriveKey(deviceId(), b64.to(acc.salt), 120_000);
    put(K.remember, await seal(dk, { email, at: Date.now() }));
  }
  put(K.session, { email, token: 'local', edition: acc.edition || 'free', name: acc.name || '', at: Date.now() });
  return { local: true };
}

/** Silent re-auth on a device the user chose to trust. */
export async function resumeRemembered() {
  const box = get(K.remember);
  const acc = get(K.account);
  if (!box || !acc || session()) return false;
  try {
    const dk = await deriveKey(deviceId(), b64.to(acc.salt), 120_000);
    const { email } = await open(dk, box);
    if (email !== acc.email) return false;
    put(K.session, { email, token: 'local', edition: acc.edition || 'free', name: acc.name || '', at: Date.now() });
    return true;
  } catch {
    drop(K.remember);            // wrong device, or storage tampered with
    return false;
  }
}

export async function signOut() {
  const s = session();
  if (online() && s?.token) { try { await api('/v1/auth/logout', {}, s.token); } catch { /* leaving anyway */ } }
  drop(K.session);
  drop(K.remember);

  /*
   * A licence bought under an account leaves with that account.
   *
   * Otherwise signing out on a shared or borrowed machine hands the next
   * person a paid copy — they never signed in, so nothing asks who they are,
   * and the entitlement is just sitting there on the device. Somebody who paid
   * without ever making an account keeps their unlock, because there is no
   * account for it to belong to and taking it away would punish them for the
   * thing this app told them was optional.
   */
  const bought = get(K_PURCHASE);
  const acc = get(K.account);
  if (bought?.account && bought.account === acc?.email) {
    drop(K_PURCHASE);
    if (acc) put(K.account, { ...acc, edition: 'free', purchase: null });
  }
}

export async function devices() {
  const s = session();
  if (online() && s?.token) return (await api('/v1/devices/list', {}, s.token)).devices || [];
  return get(K.account)?.devices || [];
}

export async function removeDevice(id) {
  const s = session();
  if (online() && s?.token) return api('/v1/devices/remove', { id }, s.token);
  const acc = get(K.account);
  if (!acc) return null;
  put(K.account, { ...acc, devices: (acc.devices || []).filter((d) => d.id !== id) });
  return { ok: true };
}

/**
 * Redeem a licence key. On the server this is verified against the purchase
 * record; locally it is checked against the same signed format the Worker
 * issues, which stops a typo or a shared guess but not a determined person.
 * That trade is deliberate and written down in docs/STUDIO-PAYMENTS.md.
 */
export async function redeem(code) {
  const key = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const s = session();

  if (online() && s?.token) {
    const out = await api('/v1/licence/redeem', { code: key, device: deviceInfo() }, s.token);
    put(K.session, { ...s, edition: out.edition });
    return out;
  }

  const parsed = parseKey(key);
  if (!parsed) throw new Error('That key is not valid. Check for a typo — keys look like OMNIDX-STU-XXXX-XXXX-XXXX.');
  const acc = get(K.account);
  if (acc) put(K.account, { ...acc, edition: parsed.edition, licence: key });
  if (s) put(K.session, { ...s, edition: parsed.edition });
  else put(K.session, { email: '', token: 'local', edition: parsed.edition, at: Date.now() });
  return { edition: parsed.edition, local: true };
}

/* ------------------------------------------------------------------ */
/* licence keys                                                        */
/* ------------------------------------------------------------------ */
/* Format: OMNIDX + edition tag + 8 payload chars + 4 checksum chars.
   FNV-1a is used, not because it is strong, but because it reproduces
   byte-for-byte in the Python generator and the Worker, so a key made offline
   always validates in all three. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0, 1
const TAGS = { CRE: 'creator', STU: 'studio' };
const SALT = 'omnidx-studio-2026';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function checksum(tag, payload) {
  let h = fnv1a(`${SALT}:${tag}:${payload}`);
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHABET[h % ALPHABET.length]; h = Math.floor(h / ALPHABET.length) + (h % 7); }
  return out;
}

export function parseKey(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^OMNIDX[A-Z]{3}[A-Z0-9]{12}$/.test(c)) return null;
  const tag = c.slice(6, 9);
  const edition = TAGS[tag];
  if (!edition) return null;
  const payload = c.slice(9, 17);
  if ([...payload].some((ch) => !ALPHABET.includes(ch))) return null;
  if (checksum(tag, payload) !== c.slice(17, 21)) return null;
  return { edition, tag, payload };
}

export function formatKey(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 21) return code;
  return `OMNIDX-${c.slice(6, 9)}-${c.slice(9, 13)}-${c.slice(13, 17)}-${c.slice(17, 21)}`;
}

/** Reset the local account. Destroys the vault; projects are stored separately. */
export function resetLocalAccount() {
  drop(K.account); drop(K.session); drop(K.remember);
}

export const MODE = { get server() { return online(); } };

/* ------------------------------------------------------------------ *
 * Activation after payment
 * ------------------------------------------------------------------ */

const K_PURCHASE = 'omnidx.studio.purchase.v1';

/**
 * Unlock this copy because a payment went through.
 *
 * Why this exists, and what it replaces
 * -------------------------------------
 * The old flow was: pay Square, wait for a human to generate a licence key,
 * wait for that key to arrive, type it in. Every one of those steps is a place
 * to lose somebody who has already given you money — and the first person it
 * failed was the person who built it, who paid and got nothing, because there
 * was no automation behind "somebody issues a key".
 *
 * So payment now unlocks the app directly, the way every other editor does it.
 * No key, no email, no waiting.
 *
 * What this does and does not prove
 * ---------------------------------
 * Called from the page Square redirects to after a successful payment, this
 * grants the edition on this device and records the order. It is trust on
 * arrival: it believes the redirect. Someone who copies that URL can unlock a
 * copy too.
 *
 * That is a real limit and it is worth being plain about it, but it is not a
 * new one. Every entitlement check in this app already runs on the buyer's
 * machine and can be switched off with dev tools — licence.js says so at the
 * top of the file. This adds no weakness that was not already there, and it
 * fixes a failure that was costing every single paying customer.
 *
 * When the Worker is deployed, `redeemPurchase` below also verifies the order
 * with Square server-side and binds it to the account, which closes the gap
 * properly. This function is the floor, not the ceiling.
 */
export function grantEdition(edition, { order = '', source = 'square' } = {}) {
  if (!RANK[edition] && edition !== 'free') {
    throw new Error(`Unknown edition: ${edition}`);
  }

  const record = {
    edition,
    order: String(order || '').slice(0, 120),
    source,
    at: Date.now(),
    device: deviceId(),
    // Who it belongs to, when there is somebody to belong to. This is what
    // lets it leave with them on sign-out rather than staying on the machine.
    account: session()?.email || get(K.account)?.email || null,
  };
  put(K_PURCHASE, record);

  // Never downgrade. Somebody who owns Studio and lands on a Creator link —
  // by revisiting an old receipt, say — must not lose what they paid for.
  const acc = get(K.account);
  const s = session();
  const held = Math.max(RANK[acc?.edition || 'free'] || 0, RANK[s?.edition || 'free'] || 0);
  if (RANK[edition] < held) return { edition: s?.edition || acc?.edition, kept: true };

  if (acc) put(K.account, { ...acc, edition, purchase: record });

  /*
   * A session is created if there is not one.
   *
   * Buying must not put a login wall between the payment and the app. Someone
   * who has just paid opens the editor and it is unlocked — whether or not
   * they ever made an account. An account is for moving the licence to a
   * second device, which is a thing you do later, not a toll on the way in.
   */
  if (s) put(K.session, { ...s, edition });
  else put(K.session, { email: acc?.email || '', token: 'local', edition, at: Date.now() });

  return { edition, local: true };
}

/** The recorded purchase on this device, if there is one. */
export function purchase() { return get(K_PURCHASE); }

/**
 * Tell the server about a purchase, when there is a server.
 *
 * With the Worker deployed this is what turns trust-on-arrival into a verified
 * entitlement: the Worker asks Square whether the order is real and paid,
 * binds it to the account, and from then on the licence follows the person
 * rather than the device.
 *
 * It never throws and never blocks the unlock. A server that is down, or not
 * deployed at all, must not stand between somebody and the thing they bought.
 */
export async function redeemPurchase({ edition, order }) {
  const local = grantEdition(edition, { order });
  if (!online()) return { ...local, verified: false, reason: 'no server configured' };
  const s = session();
  try {
    const out = await api('/v1/licence/activate', { order, edition, device: deviceInfo() }, s?.token);
    if (out?.edition) put(K.session, { ...(session() || {}), edition: out.edition });
    return { ...out, verified: true };
  } catch (err) {
    return { ...local, verified: false, reason: err.message };
  }
}
