/*
 * OmniDx Studio — the optional backend.
 *
 * The editor works with none of this. Deploying it adds four things the app
 * cannot do alone: accounts that follow you between devices, licences verified
 * on a server rather than in the buyer's browser, free-form AI phrasing, and
 * speech-to-text for captions.
 *
 * Everything here is Cloudflare Workers + D1. There is no framework: the whole
 * API is one file and about a dozen routes, which is easier to audit than it
 * would be split across twenty.
 *
 * What this never sees: your footage. The AI route is sent the prompt and a
 * list of file names and durations. Frames and audio never leave the device
 * except on the transcription route, which exists only for captions and only
 * runs when you call it.
 */

import Anthropic from '@anthropic-ai/sdk';

/* Kept in step with studio/assets/config.js. If you change the split there,
   change it here too — the server is the side that decides. */
const RANK = { free: 0, creator: 1, studio: 2, team: 3 };
const DEVICE_LIMIT = { free: 2, creator: 3, studio: 10, team: 9 };
const AI_QUOTA = { free: 5, creator: 200, studio: Number.MAX_SAFE_INTEGER, team: Number.MAX_SAFE_INTEGER };
/* Three means three. This is the only place it can actually be guaranteed —
   a client-side check is a suggestion, and the whole point of the Team price
   is that it is cheaper than three individual licences. */
const SEATS = { free: 1, creator: 1, studio: 1, team: 3 };

const SESSION_DAYS = 60;
const DEFAULT_PBKDF2_ROUNDS = 210_000;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();

function corsHeaders(env, request) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  // With no allowlist configured, echo the origin — convenient in development,
  // and the deploy notes tell you to set ALLOWED_ORIGINS before going live.
  const allow = !allowed.length ? (origin || '*') : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'POST,GET,OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(data, { status = 200, env, request } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...(env ? corsHeaders(env, request) : {}) },
  });
}

const fail = (message, status, env, request) => json({ error: message }, { status, env, request });

function randomHex(bytes = 32) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * PBKDF2-SHA-256. The iteration count is an env var because it is a real
 * tradeoff on Workers: higher is better against an offline attack on a stolen
 * database, and it is CPU time on every login. 210k needs the paid plan's CPU
 * allowance — see the deploy notes.
 */
async function hashPassword(password, salt, rounds) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(salt), iterations: rounds, hash: 'SHA-256' },
    base, 256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time compare, so a timing difference can't leak a hash. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v || '').trim());

/* ------------------------------------------------------------------ */
/* licence keys — the same format the app and tools/make-studio-key.py  */
/* produce, so a key made in any of the three validates in the others.  */
/* ------------------------------------------------------------------ */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAGS = { CRE: 'creator', STU: 'studio', TEA: 'team' };
const TAG_FOR = { creator: 'CRE', studio: 'STU', team: 'TEA' };
const KEY_SALT = 'omnidx-studio-2026';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function checksum(tag, payload) {
  let h = fnv1a(`${KEY_SALT}:${tag}:${payload}`);
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHABET[h % ALPHABET.length]; h = Math.floor(h / ALPHABET.length) + (h % 7); }
  return out;
}

function makeKey(edition) {
  const tag = TAG_FOR[edition];
  if (!tag) throw new Error(`No key format for edition "${edition}"`);
  let payload = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) payload += ALPHABET[b % ALPHABET.length];
  return `OMNIDX${tag}${payload}${checksum(tag, payload)}`;
}

function parseKey(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^OMNIDX[A-Z]{3}[A-Z0-9]{12}$/.test(c)) return null;
  const tag = c.slice(6, 9);
  const edition = TAGS[tag];
  if (!edition) return null;
  const payload = c.slice(9, 17);
  if ([...payload].some((ch) => !ALPHABET.includes(ch))) return null;
  if (checksum(tag, payload) !== c.slice(17, 21)) return null;
  return { edition, key: c };
}

/* ------------------------------------------------------------------ */
/* OmniDx Tune keys                                                    */
/* ------------------------------------------------------------------ */
/*
 * TUNE-XXXX-XXXX-XXXX-CCCC binds to one PC. A Squad order ($39.99) is three
 * of them, one per person, each locked to its own PC; the SQUAD tag (one key
 * for several PCs) is still parsed so a key issued that way keeps working,
 * but nothing issues one now. Same alphabet as the Studio keys, a different
 * salt, and the same four lines of checksum arithmetic — mirrored exactly in
 * tune/omnidx.ps1, studio/assets/tunekey.js and tools/make-tune-key.py, so a
 * key made in any of them validates in the others.
 */
const TUNE_SALT = 'omnidx-tune-2026';
const TUNE_PRODUCTS = {
  tune: { tag: 'TUNE', seats: 1, keys: 1, cents: 1999 },
  squad: { tag: 'TUNE', seats: 1, keys: 3, cents: 3999 },
};
const TUNE_SEATS_BY_TAG = { TUNE: 1, SQUAD: 3 };
const TUNE_BY_TAG = { TUNE: 'tune', SQUAD: 'squad' };

function tuneChecksum(tag, payload) {
  let h = fnv1a(`${TUNE_SALT}:${tag}:${payload}`);
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHABET[h % ALPHABET.length]; h = Math.floor(h / ALPHABET.length) + (h % 7); }
  return out;
}

function makeTuneKey(product) {
  const p = TUNE_PRODUCTS[product];
  if (!p) throw new Error(`No key format for "${product}"`);
  let payload = '';
  for (const b of crypto.getRandomValues(new Uint8Array(12))) payload += ALPHABET[b % ALPHABET.length];
  return `${p.tag}${payload}${tuneChecksum(p.tag, payload)}`;
}

function parseTuneKey(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^(TUNE|SQUAD)([A-Z0-9]{12})([A-Z0-9]{4})$/.exec(c);
  if (!m) return null;
  const [, tag, payload, sum] = m;
  if ([...payload].some((ch) => !ALPHABET.includes(ch))) return null;
  if (tuneChecksum(tag, payload) !== sum) return null;
  return { product: TUNE_BY_TAG[tag], key: c, seats: TUNE_SEATS_BY_TAG[tag] };
}

/** TUNE-ABCD-EFGH-JKLM-NPQR — the way a person reads it. */
function prettyTuneKey(key) {
  const tag = key.startsWith('SQUAD') ? 'SQUAD' : 'TUNE';
  const rest = key.slice(tag.length);
  return `${tag}-${rest.slice(0, 4)}-${rest.slice(4, 8)}-${rest.slice(8, 12)}-${rest.slice(12, 16)}`;
}

/**
 * Ask Square whether an order or payment really completed, and for how much.
 * Only runs when SQUARE_ACCESS_TOKEN is set; without it the redirect is
 * trusted, which is exactly as strong as the Studio activation page was.
 * Returns { ok, cents } or null when Square cannot be asked.
 */
async function squareOrder(env, ref) {
  if (!env.SQUARE_ACCESS_TOKEN || !ref) return null;
  const base = env.SQUARE_API_BASE || 'https://connect.squareup.com';
  const headers = { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, 'Square-Version': '2025-01-23' };
  const tryGet = async (path, pick) => {
    const r = await fetch(`${base}${path}`, { headers });
    if (!r.ok) return null;
    return pick(await r.json());
  };
  const order = await tryGet(`/v2/orders/${encodeURIComponent(ref)}`, (d) => d.order && ({
    ok: d.order.state === 'COMPLETED', cents: Number(d.order.total_money?.amount || 0),
    email: d.order.fulfillments?.[0]?.pickup_details?.recipient?.email_address || d.order.fulfillments?.[0]?.shipment_details?.recipient?.email_address || null,
  }));
  if (order) return order;
  const payment = await tryGet(`/v2/payments/${encodeURIComponent(ref)}`, (d) => d.payment && ({
    ok: d.payment.status === 'COMPLETED', cents: Number(d.payment.amount_money?.amount || 0),
    email: d.payment.buyer_email_address || null, receipt: d.payment.receipt_url || null,
    orderId: d.payment.order_id || null, receiptNumber: d.payment.receipt_number || null,
  }));
  return payment || { ok: false, cents: 0 };
}

/** Which product a payment of this many cents bought; null below the price of a key. */
function tuneProductFor(cents) {
  if (cents >= TUNE_PRODUCTS.squad.cents - 100) return 'squad';
  if (cents >= TUNE_PRODUCTS.tune.cents - 100) return 'tune';
  return null;
}

/**
 * The keys for a paid order, minted once. A Squad order is three rows that
 * share the order reference (the first carries it plainly, the others with
 * #2 and #3 on the end), so a second look at the same order returns the same
 * three keys and never a fourth.
 */
const receiptOf = (v) => String(v || '').trim().toUpperCase().replace(/^#/, '');

/**
 * The keys for a paid order, minted once, found by the Square order id or by
 * the short receipt number printed on Square's receipt email (the thing a
 * buyer who closed the tab actually has). A Squad order is three rows that
 * share the order reference (plain, #2, #3), so a second look at the same
 * order returns the same three keys and never a fourth.
 */
/**
 * A handful of tries per connection every ten minutes on the routes that take
 * an order reference, a receipt number, a key or the owner token, so none of
 * them can be found by trying. Counted in D1, one small row per connection and
 * window, cleared as windows expire. A database that cannot count fails open:
 * a buyer must never be locked out by a hiccup on our side.
 */
const HITS_WINDOW = 600;
const TOO_MANY = 'Too many tries from this connection. Wait ten minutes and try again, or email support with your Square receipt.';
async function hitCount(env, request, scope, add) {
  try {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const bucket = `${scope}:${ip}`;
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare('SELECT n, until FROM tune_hits WHERE bucket = ?').bind(bucket).first();
    const live = Boolean(row && row.until > now);
    if (!add) return live ? row.n : 0;
    const n = live ? row.n + 1 : 1;
    const until = live ? row.until : now + HITS_WINDOW;
    if (!live) await env.DB.prepare('DELETE FROM tune_hits WHERE until < ?').bind(now).run();
    await env.DB.prepare('INSERT OR REPLACE INTO tune_hits (bucket, n, until) VALUES (?, ?, ?)').bind(bucket, n, until).run();
    return n;
  } catch (err) {
    console.error('tune_hits', err);
    return 0;
  }
}
const tooMany = async (env, request, scope, limit) => (await hitCount(env, request, scope, true)) > limit;
/** True the first time a mark is seen, false after; kept in tune_hits for the given days, so a repeated webhook does one thing once. */
async function firstTime(env, mark, days = 30) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare('SELECT n, until FROM tune_hits WHERE bucket = ?').bind(mark).first();
    if (row && row.until > now) return false;
    await env.DB.prepare('INSERT OR REPLACE INTO tune_hits (bucket, n, until) VALUES (?, ?, ?)').bind(mark, 1, now + days * 86400).run();
    return true;
  } catch (err) { console.error('tune_hits', err); return true; }
}

async function tuneKeysFor(env, order) {
  const rows = await env.DB.prepare(
    "SELECT * FROM tune_keys WHERE order_ref = ? OR order_ref LIKE ? OR (receipt IS NOT NULL AND receipt = ?) ORDER BY order_ref",
  ).bind(order, `${order}#%`, receiptOf(order)).all();
  return rows.results || [];
}

/** The distinct orders a set of rows belongs to (a Squad order's #2 and #3 count as its own). */
const ordersIn = (rows) => [...new Set(rows.map((r) => String(r.order_ref || '').replace(/#\d+$/, '')))];

/**
 * Square's four-character receipt numbers are short enough to repeat over
 * time. A reference that lands on more than one order answers nothing: the
 * long order id from the page Square sent the buyer to always works.
 */
const AMBIGUOUS = 'That receipt number belongs to more than one order. Use the long order id from the page Square sent you to, or email support with the receipt.';

async function issueTuneKeys(env, { order, product, cents, email, receipt }) {
  const p = TUNE_PRODUCTS[product];
  const keys = [];
  for (let i = 1; i <= p.keys; i++) {
    const key = makeTuneKey(product);
    const ref = i === 1 ? order : `${order}#${i}`;
    try {
      await env.DB.prepare(
        `INSERT INTO tune_keys (key, product, seats, email, order_ref, receipt, provider, amount_cents, verified, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(key, product, p.seats, email || null, ref, receipt ? receiptOf(receipt) : null, 'square', cents, 1, Date.now()).run();
    } catch (err) {
      // The webhook and the key page arriving in the same instant: whoever
      // was second hits the unique order reference, and the order's keys
      // are simply the ones already there.
      if (/UNIQUE|constraint/i.test(String(err?.message || err))) return (await tuneKeysFor(env, order)).map((r) => r.key);
      throw err;
    }
    keys.push(key);
  }
  return keys;
}

function tuneFields(rows) {
  const live = rows.filter((r) => !r.revoked_at);
  if (!live.length) return null;
  const keys = live.map((r) => prettyTuneKey(r.key));
  return { key: keys[0], keys, product: live[0].product, seats: live[0].seats, verified: Boolean(live[0].verified), emailed: Boolean(live[0].emailed_at) };
}
const REFUNDED = 'That order was refunded, so its keys no longer work.';
function tuneAnswer(rows, env, request) {
  const f = tuneFields(rows);
  if (!f) return fail(REFUNDED, 410, env, request);
  return json(f, { env, request });
}
/** b***@example.test: enough to recognise the address, not enough to learn it. */
const maskEmail = (e) => String(e || '').replace(/^(.)[^@]*(@.*)$/, '$1***$2');

/**
 * The keys again, from the key page, to the address on file and nowhere
 * else: the order id proves the purchase, not a right to redirect the mail.
 * Ten minutes between sends, so a stuck button is not a mailbox flood.
 */
async function resendTuneKeys(env, request, rows) {
  const f = tuneFields(rows);
  if (!f) return fail(REFUNDED, 410, env, request);
  if (!env.RESEND_API_KEY) return fail('Mail is not switched on here yet. Save the keys from this page, or email support with your receipt.', 503, env, request);
  const live = rows.filter((r) => !r.revoked_at);
  const to = live[0].email;
  if (!to) return fail('No email address is on file for that order. Save the keys from this page, or email support with your receipt.', 400, env, request);
  const order = ordersIn(rows)[0];
  const lately = live.some((r) => r.emailed_at && Date.now() - r.emailed_at < 10 * 60_000);
  if (lately) return json({ ...f, resent: false, sentTo: maskEmail(to), reason: 'Sent within the last ten minutes. Give it a moment, and check spam.' }, { env, request });
  const sent = await emailTuneKeys(env, to, f.product, f.keys, order, null, live[0].receipt ? receiptOf(live[0].receipt) : null);
  if (!sent) return fail('The mail could not be sent just now. Save the keys from this page, or email support with your receipt.', 502, env, request);
  await env.DB.prepare("UPDATE tune_keys SET emailed_at = ? WHERE order_ref = ? OR order_ref LIKE ?").bind(Date.now(), order, `${order}#%`).run();
  return json({ ...f, emailed: true, resent: true, sentTo: maskEmail(to) }, { env, request });
}

/**
 * Square's webhook signature: base64(HMAC-SHA256(signature key, notification
 * URL + body)). The URL is the one registered in the Square developer
 * dashboard, exactly, so it is configured rather than read from the request.
 */
async function verifySquare(raw, signature, notificationUrl, signatureKey) {
  if (!signature || !notificationUrl || !signatureKey) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(signatureKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(notificationUrl + raw));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sameSecret(expected, signature);
}

/* ------------------------------------------------------------------ */
/* sessions                                                            */
/* ------------------------------------------------------------------ */

async function createSession(env, userId) {
  const token = randomHex(32);
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)')
    .bind(await sha256(token), userId, expires, Date.now()).run();
  return token;
}

async function userFor(env, request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), Date.now()).first();
  return row ? { ...row, token } : null;
}

/**
 * The edition a user is entitled to.
 *
 * Two routes: a licence they own outright, or a seat somebody gave them on a
 * Team licence. The higher of the two wins.
 */
async function editionFor(env, userId) {
  const owned = await env.DB.prepare(
    'SELECT edition FROM licences WHERE user_id = ? AND revoked_at IS NULL',
  ).bind(userId).all();
  let best = 'free';
  for (const r of owned.results || []) {
    if ((RANK[r.edition] ?? -1) > RANK[best]) best = r.edition;
  }

  const seat = await env.DB.prepare(
    `SELECT l.edition FROM seats s JOIN licences l ON l.key = s.licence_key
     WHERE s.user_id = ? AND s.released_at IS NULL AND l.revoked_at IS NULL`,
  ).bind(userId).first();
  if (seat && (RANK[seat.edition] ?? -1) > RANK[best]) best = seat.edition;

  return best;
}

/** The Team licence this user owns, if any. */
function teamLicenceFor(env, userId) {
  return env.DB.prepare(
    `SELECT * FROM licences WHERE user_id = ? AND edition = 'team' AND revoked_at IS NULL LIMIT 1`,
  ).bind(userId).first();
}

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */

const routes = {

  'GET /v1/health': async (_req, env) => json({
    ok: true,
    ai: Boolean(env.ANTHROPIC_API_KEY),
    transcription: Boolean(env.STT_URL && env.STT_KEY),
    payments: Boolean(env.STRIPE_WEBHOOK_SECRET),
    mail: Boolean(env.RESEND_API_KEY),
    square: Boolean(env.SQUARE_ACCESS_TOKEN),
    squareWebhook: Boolean(env.SQUARE_WEBHOOK_SIGNATURE_KEY && env.SQUARE_WEBHOOK_URL),
    owner: Boolean(env.TUNE_ADMIN_TOKEN),
    build: env.DEPLOYED_SHA || null,
    deployed: env.DEPLOYED_AT || null,
  }, { env, request: _req }),

  /* ---------------- auth ---------------- */

  'POST /v1/auth/signup': async (request, env, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email)) return fail('That email address does not look right.', 400, env, request);
    if (String(body.password || '').length < 8) {
      return fail('Passwords need to be at least 8 characters. Longer beats fancier.', 400, env, request);
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return fail('There is already an account with that email.', 409, env, request);

    const rounds = Number(env.PBKDF2_ROUNDS) || DEFAULT_PBKDF2_ROUNDS;
    const salt = randomHex(16);
    const hash = await hashPassword(body.password, salt, rounds);
    const id = randomHex(12);

    await env.DB.prepare(
      'INSERT INTO users (id, email, name, pw_hash, pw_salt, pw_rounds, created_at) VALUES (?,?,?,?,?,?,?)',
    ).bind(id, email, String(body.name || '').slice(0, 80), hash, salt, rounds, Date.now()).run();

    await touchDevice(env, id, body.device, 'free');
    return json({ token: await createSession(env, id), edition: 'free', name: body.name || '' },
      { env, request });
  },

  'POST /v1/auth/login': async (request, env, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

    // Same message and roughly the same work either way, so this cannot be
    // used to find out which addresses have accounts.
    if (!user) {
      await hashPassword(String(body.password || ''), randomHex(16), Number(env.PBKDF2_ROUNDS) || DEFAULT_PBKDF2_ROUNDS);
      return fail('Wrong email or password.', 401, env, request);
    }
    const hash = await hashPassword(String(body.password || ''), user.pw_salt, user.pw_rounds);
    if (!sameSecret(hash, user.pw_hash)) return fail('Wrong email or password.', 401, env, request);

    const edition = await editionFor(env, user.id);
    const placed = await touchDevice(env, user.id, body.device, edition);

    return json({ token: await createSession(env, user.id), edition, name: user.name, evicted: placed.evicted || null },
      { env, request });
  },

  /* ---------------- passwords and recovery ---------------- */

  /* A new password, knowing the old one. Every other session is ended. */
  'POST /v1/auth/password': async (request, env, body) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    const hash = await hashPassword(String(body.password || ''), user.pw_salt, user.pw_rounds);
    if (!sameSecret(hash, user.pw_hash)) return fail('The current password is wrong.', 403, env, request);
    if (String(body.next || '').length < 8) return fail('Passwords need to be at least 8 characters.', 400, env, request);
    await setPassword(env, user.id, body.next);
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, await sha256(user.token)).run();
    return json({ ok: true }, { env, request });
  },

  /*
   * The recovery code, server side. The app derives a key from the code and
   * a salt and sends a verifier of it — the code itself never reaches the
   * server, so a stolen database cannot reset anybody's password.
   */
  'POST /v1/auth/recovery/set': async (request, env, body) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    if (!body.salt || !body.verifier) return fail('A salt and a verifier are needed.', 400, env, request);
    await env.DB.prepare(
      `INSERT INTO recovery (user_id, salt, verifier, created_at) VALUES (?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET salt = excluded.salt, verifier = excluded.verifier, created_at = excluded.created_at`,
    ).bind(user.id, String(body.salt).slice(0, 64), String(body.verifier).slice(0, 128), Date.now()).run();
    return json({ ok: true }, { env, request });
  },

  /* The salt, so the app can derive the verifier. An unknown email gets a
     stable fake salt, so this cannot be used to find out who has an account. */
  'POST /v1/auth/recovery/salt': async (request, env, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const row = await env.DB.prepare(
      'SELECT r.salt FROM recovery r JOIN users u ON u.id = r.user_id WHERE u.email = ?',
    ).bind(email).first();
    const salt = row?.salt || (await sha256(`no-such-account:${email}:${env.SALT_PEPPER || ''}`)).slice(0, 24);
    return json({ salt }, { env, request });
  },

  'POST /v1/auth/recovery/reset': async (request, env, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const row = await env.DB.prepare(
      'SELECT u.*, r.verifier AS rv FROM users u JOIN recovery r ON r.user_id = u.id WHERE u.email = ?',
    ).bind(email).first();
    if (!row || !sameSecret(String(body.verifier || ''), row.rv)) {
      return fail('That recovery code is not right for this account.', 403, env, request);
    }
    if (String(body.password || '').length < 8) return fail('Passwords need to be at least 8 characters.', 400, env, request);
    await setPassword(env, row.id, body.password);
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.id).run();
    const edition = await editionFor(env, row.id);
    await touchDevice(env, row.id, body.device, edition);
    return json({ token: await createSession(env, row.id), edition, name: row.name }, { env, request });
  },

  /* A reset link by email, when a mailer is configured. The answer is the
     same whether or not the address has an account. */
  'POST /v1/auth/reset/request': async (request, env, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (!env.RESEND_API_KEY) return json({ ok: true, sent: false, reason: 'no mailer configured' }, { env, request });
    const user = await env.DB.prepare('SELECT id, name FROM users WHERE email = ?').bind(email).first();
    if (user) {
      const token = randomHex(32);
      await env.DB.prepare('INSERT INTO resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)')
        .bind(await sha256(token), user.id, Date.now() + 3600_000, Date.now()).run();
      await emailReset(env, email, `${env.SITE_URL || 'https://omnidx.net'}/studio/account/?reset=${token}`);
    }
    return json({ ok: true, sent: true }, { env, request });
  },

  'POST /v1/auth/reset/confirm': async (request, env, body) => {
    const row = await env.DB.prepare(
      'SELECT r.user_id, u.email, u.name FROM resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.expires_at > ?',
    ).bind(await sha256(String(body.token || '')), Date.now()).first();
    if (!row) return fail('That reset link has expired or was already used. Ask for a new one.', 403, env, request);
    if (String(body.password || '').length < 8) return fail('Passwords need to be at least 8 characters.', 400, env, request);
    await setPassword(env, row.user_id, body.password);
    await env.DB.prepare('DELETE FROM resets WHERE user_id = ?').bind(row.user_id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id).run();
    const edition = await editionFor(env, row.user_id);
    await touchDevice(env, row.user_id, body.device, edition);
    return json({ token: await createSession(env, row.user_id), edition, email: row.email, name: row.name }, { env, request });
  },

  /* ---------------- the sealed vault ---------------- */

  /* An opaque blob per account — the recovery file, sealed on the device.
     The server stores bytes it cannot read, so a new device signed in with
     the password gets the purchase back without the file. */
  'POST /v1/vault/put': async (request, env, body) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    const blob = String(body.blob || '');
    if (!blob || blob.length > 200_000) return fail('The vault must be between 1 byte and 200 KB.', 400, env, request);
    await env.DB.prepare(
      `INSERT INTO vaults (user_id, blob, updated_at) VALUES (?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at`,
    ).bind(user.id, blob, Date.now()).run();
    return json({ ok: true }, { env, request });
  },

  'POST /v1/vault/get': async (request, env) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    const row = await env.DB.prepare('SELECT blob, updated_at AS updatedAt FROM vaults WHERE user_id = ?').bind(user.id).first();
    return json({ blob: row?.blob || null, updatedAt: row?.updatedAt || null }, { env, request });
  },

  'POST /v1/auth/logout': async (request, env) => {
    const user = await userFor(env, request);
    if (user) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(await sha256(user.token)).run();
    }
    return json({ ok: true }, { env, request });
  },

  /* ---------------- devices ---------------- */

  'POST /v1/devices/list': async (request, env) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    const rows = await env.DB.prepare(
      'SELECT device_id AS id, label, os, screen, last_seen AS lastSeen FROM devices WHERE user_id = ? ORDER BY last_seen DESC',
    ).bind(user.id).all();
    return json({ devices: rows.results || [] }, { env, request });
  },

  'POST /v1/devices/remove': async (request, env, body) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    await env.DB.prepare('DELETE FROM devices WHERE user_id = ? AND device_id = ?')
      .bind(user.id, String(body.id || '')).run();
    return json({ ok: true }, { env, request });
  },

  /* ---------------- licences ---------------- */

  'POST /v1/licence/redeem': async (request, env, body) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first, then redeem the key.', 401, env, request);

    const parsed = parseKey(body.code);
    if (!parsed) return fail('That key is not valid. Check for a typo.', 400, env, request);

    const row = await env.DB.prepare('SELECT * FROM licences WHERE key = ?').bind(parsed.key).first();
    if (!row) return fail('That key was not issued by us.', 404, env, request);
    if (row.revoked_at) return fail('That key has been refunded or revoked.', 410, env, request);
    if (row.user_id && row.user_id !== user.id) {
      return fail('That key is already on another account.', 409, env, request);
    }

    await env.DB.prepare('UPDATE licences SET user_id = ?, redeemed_at = ? WHERE key = ?')
      .bind(user.id, Date.now(), parsed.key).run();

    return json({ edition: await editionFor(env, user.id) }, { env, request });
  },

  /* ---------------- team seats ---------------- */

  'POST /v1/team/list': async (request, env) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    const licence = await teamLicenceFor(env, user.id);
    if (!licence) return json({ owner: false, seats: [], limit: 0 }, { env, request });

    const rows = await env.DB.prepare(
      `SELECT s.email, s.user_id AS userId, s.claimed_at AS claimedAt, s.invite_code AS invite
       FROM seats s WHERE s.licence_key = ? AND s.released_at IS NULL ORDER BY s.claimed_at`,
    ).bind(licence.key).all();

    return json({
      owner: true,
      limit: SEATS.team,
      used: (rows.results || []).length,
      seats: rows.results || [],
    }, { env, request });
  },

  /**
   * Invite someone to a seat.
   *
   * The limit is checked here, against the database, inside the same request
   * that writes the row. A fourth invite fails whatever the client believes,
   * and no amount of editing the app in dev tools changes that — the seat only
   * counts when this route says it does.
   */
  'POST /v1/team/invite': async (request, env, body) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    const licence = await teamLicenceFor(env, user.id);
    if (!licence) return fail('You do not own a Team licence.', 403, env, request);

    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email)) return fail('That email address does not look right.', 400, env, request);

    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM seats WHERE licence_key = ? AND released_at IS NULL',
    ).bind(licence.key).first();

    if (count >= SEATS.team) {
      return fail(
        `A Team licence is ${SEATS.team} people, and all ${SEATS.team} seats are taken. `
        + 'Remove someone first, or buy a second Team licence.',
        409, env, request,
      );
    }

    const existing = await env.DB.prepare(
      'SELECT email FROM seats WHERE licence_key = ? AND email = ? AND released_at IS NULL',
    ).bind(licence.key, email).first();
    if (existing) return fail('That person already has a seat.', 409, env, request);

    const invite = randomHex(8).toUpperCase();
    const target = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();

    await env.DB.prepare(
      `INSERT INTO seats (licence_key, email, user_id, invite_code, claimed_at, created_at)
       VALUES (?,?,?,?,?,?)`,
    ).bind(licence.key, email, target?.id || null, invite, target ? Date.now() : null, Date.now()).run();

    if (env.RESEND_API_KEY) await emailInvite(env, email, invite, user.email);

    return json({
      ok: true,
      invite,
      used: count + 1,
      limit: SEATS.team,
      joined: Boolean(target),
    }, { env, request });
  },

  'POST /v1/team/claim': async (request, env, body) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first, then use the invite.', 401, env, request);
    const code = String(body.invite || '').trim().toUpperCase();

    const seat = await env.DB.prepare(
      'SELECT * FROM seats WHERE invite_code = ? AND released_at IS NULL',
    ).bind(code).first();
    if (!seat) return fail('That invite is not valid, or it has been withdrawn.', 404, env, request);
    if (seat.user_id && seat.user_id !== user.id) {
      return fail('That invite has already been used by someone else.', 409, env, request);
    }
    // The count is re-checked at claim time as well as at invite time: seats
    // can be handed out, revoked and re-issued, and only this check is between
    // that history and a fourth person editing.
    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM seats WHERE licence_key = ? AND released_at IS NULL AND user_id IS NOT NULL',
    ).bind(seat.licence_key).first();
    if (count >= SEATS.team && !seat.user_id) {
      return fail(`All ${SEATS.team} seats on that licence are in use.`, 409, env, request);
    }

    await env.DB.prepare('UPDATE seats SET user_id = ?, claimed_at = ? WHERE invite_code = ?')
      .bind(user.id, Date.now(), code).run();

    return json({ edition: await editionFor(env, user.id) }, { env, request });
  },

  'POST /v1/team/remove': async (request, env, body) => {
    const user = await userFor(env, request);
    if (!user) return fail('Sign in first.', 401, env, request);
    const licence = await teamLicenceFor(env, user.id);
    if (!licence) return fail('You do not own a Team licence.', 403, env, request);

    await env.DB.prepare(
      'UPDATE seats SET released_at = ? WHERE licence_key = ? AND email = ? AND released_at IS NULL',
    ).bind(Date.now(), licence.key, String(body.email || '').toLowerCase()).run();

    return json({ ok: true }, { env, request });
  },

  /* ---------------- AI ---------------- */

  /* ---------------- ratings ---------------- */
  /*
   * A star rating from the app or the site. One row per device per day, so
   * a person changing their mind updates rather than piles up, and nobody
   * can vote a hundred times from one machine. Nothing identifying beyond a
   * device id that already exists for licensing; the note is capped.
   */
  'POST /v1/rate': async (request, env, body) => {
    const stars = Math.round(Number(body.stars));
    if (!(stars >= 1 && stars <= 5)) return fail('Stars must be 1 to 5.', 400, env, request);
    const device = String(body.device || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
    if (!device) return fail('No device id.', 400, env, request);
    const day = new Date().toISOString().slice(0, 10);
    const note = String(body.note || '').slice(0, 500);
    const where = ['app', 'web', 'desktop'].includes(body.where) ? body.where : 'app';
    const edition = String(body.edition || 'free').slice(0, 16);
    const version = String(body.version || '').slice(0, 24);
    const user = await userFor(env, request);
    await env.DB.prepare(
      `INSERT INTO ratings (id, device_id, day, stars, note, place, edition, version, user_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(device_id, day) DO UPDATE SET stars = excluded.stars, note = excluded.note,
         place = excluded.place, edition = excluded.edition, version = excluded.version, created_at = excluded.created_at`,
    ).bind(randomHex(12), device, day, stars, note, where, edition, version, user?.id || null, Date.now()).run();
    const sum = await env.DB.prepare('SELECT COUNT(*) AS n, AVG(stars) AS avg FROM ratings').first();
    return json({ ok: true, count: sum?.n || 0, average: sum?.avg ? Number(Number(sum.avg).toFixed(2)) : null }, { env, request });
  },

  /* The public figure for the site: shown only once there are enough to mean something. */
  'GET /v1/rate/summary': async (request, env) => {
    const sum = await env.DB.prepare('SELECT COUNT(*) AS n, AVG(stars) AS avg FROM ratings').first();
    const n = sum?.n || 0;
    return json({ count: n, average: n >= 5 && sum?.avg ? Number(Number(sum.avg).toFixed(2)) : null }, { env, request });
  },

  'POST /v1/ai/plan': async (request, env, body) => {
    if (!env.ANTHROPIC_API_KEY) return fail('No AI key is configured on this server.', 503, env, request);

    const user = await userFor(env, request);
    const edition = user ? await editionFor(env, user.id) : 'free';
    if (user) {
      const spent = await spendQuota(env, user.id, edition);
      if (!spent) return fail(`That is this month's ${edition} AI allowance used up.`, 402, env, request);
    }

    const prompt = String(body.prompt || '').slice(0, 2000);
    if (!prompt.trim()) return fail('Say what you want the edit to be.', 400, env, request);

    try {
      const plan = await askClaude(env, prompt, body);
      return json(plan, { env, request });
    } catch (err) {
      // The client falls back to its own planner on any failure, so this is
      // reported rather than retried into a spiral.
      return fail(`The planner could not answer (${err.message}).`, 502, env, request);
    }
  },

  'POST /v1/ai/transcribe': async (request, env) => {
    /* Anthropic's API does not do speech-to-text, so this is a thin pass to
       whichever transcription service you configure. Without one it says so
       plainly rather than pretending — the app's offline caption timing still
       works either way. */
    if (!env.STT_URL || !env.STT_KEY) {
      return fail('No transcription service is configured on this server.', 503, env, request);
    }
    const form = await request.formData();
    const audio = form.get('audio');
    if (!audio) return fail('No audio was sent.', 400, env, request);

    const upstream = await fetch(env.STT_URL, {
      method: 'POST',
      headers: { authorization: `Token ${env.STT_KEY}`, 'content-type': audio.type || 'audio/webm' },
      body: audio.stream(),
      duplex: 'half',
    });
    if (!upstream.ok) return fail(`Transcription failed (${upstream.status}).`, 502, env, request);
    return json({ cues: normaliseCues(await upstream.json()) }, { env, request });
  },

  /* ---------------- payments ---------------- */

  /* ---------------- OmniDx Tune ---------------- */

  /**
   * Hand a buyer their key.
   *
   * Square sends the buyer back to the activation page with its order id on
   * the URL; the page posts it here. One key per order: the second visit with
   * the same id gets the same key back, so a refresh, a lost tab or a second
   * browser can never mint a second licence.
   *
   * The order is looked up in Square and the product is decided by what was
   * actually paid — a $19.99 order asking for a five-PC key gets a one-PC
   * key. Without SQUARE_ACCESS_TOKEN nothing can confirm a payment, so no key
   * is issued at all: a key is never minted on the strength of a URL.
   */
  'POST /v1/tune/issue': async (request, env, body) => {
    if (await tooMany(env, request, 'issue', 20)) return fail(TOO_MANY, 429, env, request);
    const wanted = String(body.product || 'tune').toLowerCase();
    if (!TUNE_PRODUCTS[wanted]) return fail('Unknown product.', 400, env, request);
    // The Square order id from the redirect, or the short receipt number (four characters, sometimes written with a #) from Square's email.
    const order = String(body.order || '').trim().replace(/^#/, '').slice(0, 120);
    if (order.length < 4) return fail('The order reference or the receipt number from your Square receipt is needed to issue a key.', 400, env, request);
    if (!/^[A-Za-z0-9_\-:.]+$/.test(order)) return fail('That does not look like a Square order reference.', 400, env, request);
    const email = validEmail(body.email) ? String(body.email).trim().toLowerCase() : null;

    const existing = await tuneKeysFor(env, order);
    if (ordersIn(existing).length > 1) return fail(AMBIGUOUS, 409, env, request);
    // A four-character receipt number could be guessed; with it, the email the
    // buyer paid with has to match the order. The long order id stands alone.
    const isReceipt = order.length <= 8;
    if (existing.length && isReceipt) {
      const onFile = String(existing[0].email || '').toLowerCase();
      if (!email) return fail('With the receipt number, the email address you paid with is needed too.', 403, env, request);
      if (!onFile || !sameSecret(onFile, email)) return fail('That email address does not match the order for that receipt number. Use the long order id from the page Square sent you to, or email support with the receipt.', 403, env, request);
    }
    if (existing.length && body.resend === true) return resendTuneKeys(env, request, existing);
    if (existing.length) return tuneAnswer(existing, env, request);
    if (isReceipt) return fail('That receipt number is not on file yet: Square confirms a payment within a minute or so, then it is. Try again shortly, or use the long order id from the page Square sent you to.', 404, env, request);

    if (!env.SQUARE_ACCESS_TOKEN) return fail('Payments cannot be confirmed right now, so no key can be issued. Email support with your Square receipt and it will be sorted by hand.', 503, env, request);
    const sq = await squareOrder(env, order);
    if (!sq || !sq.ok) return fail('Square does not show a completed payment for that order reference. Check the receipt email; the id is near the top.', 402, env, request);
    const product = tuneProductFor(sq.cents);
    if (!product) return fail('That payment is below the price of a key.', 402, env, request);

    // Square's redirect may carry the payment id while the webhook carries the
    // order id; the keys live under the order id, so a purchase is never minted twice.
    const canonical = sq.orderId || order;
    const already = canonical !== order ? await tuneKeysFor(env, canonical) : [];
    if (!already.length) await issueTuneKeys(env, { order: canonical, product, cents: sq.cents, email: email || sq.email || null, receipt: sq.receiptNumber || null });
    const rows = await tuneKeysFor(env, canonical);
    // The keys go to the checkout email too, when there is one and a mailer.
    const to = email || sq.email;
    if (env.RESEND_API_KEY && to && !rows[0].emailed_at) {
      const sent = await emailTuneKeys(env, to, product, rows.map((r) => prettyTuneKey(r.key)), canonical, sq.receipt || null, sq.receiptNumber ? receiptOf(sq.receiptNumber) : null);
      if (sent) { await env.DB.prepare("UPDATE tune_keys SET emailed_at = ? WHERE order_ref = ? OR order_ref LIKE ?").bind(Date.now(), canonical, `${canonical}#%`).run(); rows.forEach((r) => { r.emailed_at = Date.now(); }); }
    }
    return tuneAnswer(rows, env, request);
  },

  /**
   * Support from a phone. The owner's token (TUNE_ADMIN_TOKEN, a repository
   * secret) unlocks, by order reference or by key: look the order up, send
   * the keys again (to the address on file or one given here), switch the
   * order's keys off or back on, and free one key from its PC. Every answer
   * is the order as the buyer would see it.
   */
  'POST /v1/tune/admin': async (request, env, body) => {
    if (!env.TUNE_ADMIN_TOKEN) return fail('The owner token is not set on the server.', 503, env, request);
    // Ten wrong tokens from one connection shut the owner page for ten minutes; right ones are never counted.
    if ((await hitCount(env, request, 'owner', false)) >= 10) return fail(TOO_MANY, 429, env, request);
    const token = String(body.token || '');
    if (!token || !sameSecret(token, env.TUNE_ADMIN_TOKEN)) { await hitCount(env, request, 'owner', true); return fail('Wrong token.', 403, env, request); }
    const action = String(body.action || 'lookup');
    // The last sixty keys, grouped by order: what sold, to whom, on or off.
    if (action === 'recent') {
      const recent = (await env.DB.prepare('SELECT * FROM tune_keys ORDER BY created_at DESC LIMIT 60').all()).results || [];
      const byOrder = new Map();
      for (const r of recent) {
        const o = String(r.order_ref || '').replace(/#\d+$/, '');
        if (!byOrder.has(o)) byOrder.set(o, { order: o, receipt: r.receipt || null, product: r.product, email: r.email || null, paidCents: r.amount_cents || null, createdAt: r.created_at, emailedAt: r.emailed_at || null, keys: 0, off: 0 });
        const g = byOrder.get(o); g.keys++; if (r.revoked_at) g.off++;
      }
      // The totals, once per order: what sold, what was refunded, since the first sale.
      const every = (await env.DB.prepare('SELECT product, amount_cents, order_ref, revoked_at FROM tune_keys').all()).results || [];
      const perOrder = new Map();
      for (const r of every) {
        const o = String(r.order_ref || '').replace(/#\d+$/, '');
        if (!perOrder.has(o)) perOrder.set(o, { cents: r.amount_cents || 0, keys: 0, off: 0 });
        const g = perOrder.get(o); g.keys++; if (r.revoked_at) g.off++;
      }
      const totals = { orders: 0, paidCents: 0, refundedOrders: 0, refundedCents: 0, keys: every.length };
      for (const g of perOrder.values()) {
        totals.orders++;
        if (g.keys && g.off === g.keys) { totals.refundedOrders++; totals.refundedCents += g.cents; } else totals.paidCents += g.cents;
      }
      return json({ ok: true, orders: [...byOrder.values()], totals }, { env, request });
    }
    // Every order whose keys never went out (mail was off or refused at the time): send them now, once each.
    if (action === 'resend-unsent') {
      if (!env.RESEND_API_KEY) return fail('Mail is off: RESEND_API_KEY is not set on the Worker.', 503, env, request);
      const unsent = (await env.DB.prepare('SELECT * FROM tune_keys WHERE emailed_at IS NULL AND revoked_at IS NULL AND email IS NOT NULL ORDER BY created_at').all()).results || [];
      const groups = new Map();
      for (const r of unsent) { const o = String(r.order_ref || '').replace(/#\d+$/, ''); if (!groups.has(o)) groups.set(o, []); groups.get(o).push(r); }
      const sent = []; const failed = [];
      for (const [o, rows] of groups) {
        const f = tuneFields(rows);
        if (!f) continue;
        const ok = await emailTuneKeys(env, rows[0].email, f.product, f.keys, o, null, rows[0].receipt ? receiptOf(rows[0].receipt) : null);
        if (ok) { await env.DB.prepare("UPDATE tune_keys SET emailed_at = ? WHERE order_ref = ? OR order_ref LIKE ?").bind(Date.now(), o, `${o}#%`).run(); sent.push({ order: o, email: maskEmail(rows[0].email) }); }
        else failed.push({ order: o, email: maskEmail(rows[0].email) });
      }
      return json({ ok: true, sent, failed, orders: groups.size }, { env, request });
    }
    // The week and the totals, as the Monday email, now.
    if (action === 'summary') {
      const r = await emailTuneSummary(env, 'on request');
      if (!r.ok) return fail(r.detail ? `Resend refused the send: ${r.detail}` : r.reason, r.detail ? 502 : 503, env, request);
      return json({ ok: true, ...r }, { env, request });
    }
    // Does mail work: one short email to the support address or one typed in, with Resend's exact refusal when it does not.
    if (action === 'mail-test') {
      if (!env.RESEND_API_KEY) return fail('Mail is off: RESEND_API_KEY is not set on the Worker.', 503, env, request);
      const to = validEmail(body.email) ? String(body.email).trim().toLowerCase() : (validEmail(env.SUPPORT_EMAIL) ? String(env.SUPPORT_EMAIL).trim().toLowerCase() : null);
      if (!to) return fail('No address to send to: type one, or set SUPPORT_EMAIL.', 400, env, request);
      const from = env.TUNE_MAIL_FROM || env.MAIL_FROM || 'OmniDx Tune <keys@omnidx.net>';
      const sent = await sendMail(env, {
        to,
        subject: 'OmniDx Tune: the mail works',
        text: `If you are reading this, the key emails will arrive.\n\nSent from ${from}; replies go to ${env.SUPPORT_EMAIL || 'nobody (SUPPORT_EMAIL is not set)'}.\nSent from the owner page at ${new Date().toISOString()}.`,
      });
      if (!sent.ok) return fail(`Resend refused the send (${sent.status || 'no answer'}): ${sent.detail || 'no detail'}`, 502, env, request);
      return json({ ok: true, sentTo: to, from }, { env, request });
    }
    const ref = String(body.ref || '').trim().slice(0, 120);
    if (!ref) return fail('An order reference or a key is needed.', 400, env, request);
    // By key or by order; a key finds its order, and the whole order is answered.
    let rows = [];
    const parsed = parseTuneKey(ref);
    if (parsed) {
      const row = await env.DB.prepare('SELECT * FROM tune_keys WHERE key = ?').bind(parsed.key).first();
      if (row) rows = row.order_ref ? await tuneKeysFor(env, String(row.order_ref).replace(/#\d+$/, '')) : [row];
    } else if (/^[A-Za-z0-9_\-:.#]{4,}$/.test(ref)) {
      rows = await tuneKeysFor(env, ref.replace(/^#/, '').replace(/#\d+$/, ''));
    }
    if (!rows.length) return fail('No keys for that order or key.', 404, env, request);
    if (ordersIn(rows).length > 1) return fail(AMBIGUOUS, 409, env, request);
    const order = String(rows[0].order_ref || '').replace(/#\d+$/, '');
    const describe = async () => {
      const keys = [];
      for (const r of rows) {
        const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM tune_machines WHERE key = ?').bind(r.key).first();
        keys.push({ key: prettyTuneKey(r.key), product: r.product, pcs: count, revoked: Boolean(r.revoked_at), movedAt: r.moved_at || null });
      }
      return { order, receipt: rows[0].receipt || null, email: rows[0].email || null, paidCents: rows[0].amount_cents || null, createdAt: rows[0].created_at, emailedAt: rows[0].emailed_at || null, keys };
    };
    if (action === 'lookup') return json({ ok: true, ...(await describe()) }, { env, request });
    if (action === 'resend') {
      const to = validEmail(body.email) ? String(body.email).trim().toLowerCase() : rows[0].email;
      if (!to) return fail('No email on that order; give one.', 400, env, request);
      if (!env.RESEND_API_KEY) return fail('No mailer is configured on the server.', 503, env, request);
      const live = rows.filter((r) => !r.revoked_at);
      if (!live.length) return fail('Every key of that order is switched off.', 410, env, request);
      const sent = await emailTuneKeys(env, to, live[0].product, live.map((r) => prettyTuneKey(r.key)), order, null, live[0].receipt || null);
      if (sent) {
        await env.DB.prepare("UPDATE tune_keys SET email = ?, emailed_at = ? WHERE order_ref = ? OR order_ref LIKE ?").bind(to, Date.now(), order, `${order}#%`).run();
        rows = await tuneKeysFor(env, order);
      }
      return json({ ok: sent, sentTo: sent ? to : null, ...(await describe()) }, { env, request });
    }
    if (action === 'revoke') {
      await env.DB.prepare("UPDATE tune_keys SET revoked_at = ? WHERE (order_ref = ? OR order_ref LIKE ?) AND revoked_at IS NULL").bind(Date.now(), order, `${order}#%`).run();
      rows = await tuneKeysFor(env, order);
      return json({ ok: true, ...(await describe()) }, { env, request });
    }
    if (action === 'restore') {
      await env.DB.prepare("UPDATE tune_keys SET revoked_at = NULL WHERE order_ref = ? OR order_ref LIKE ?").bind(order, `${order}#%`).run();
      rows = await tuneKeysFor(env, order);
      return json({ ok: true, ...(await describe()) }, { env, request });
    }
    // One key of a Squad order, for a partial refund; the order's other keys stay on.
    if (action === 'revoke-key') {
      if (!parsed) return fail('Switching off one key needs the key itself, not the order.', 400, env, request);
      await env.DB.prepare('UPDATE tune_keys SET revoked_at = ? WHERE key = ? AND revoked_at IS NULL').bind(Date.now(), parsed.key).run();
      rows = await tuneKeysFor(env, order);
      return json({ ok: true, revokedKey: prettyTuneKey(parsed.key), ...(await describe()) }, { env, request });
    }
    if (action === 'release') {
      const which = parsed ? parsed.key : rows[0].key;
      await env.DB.prepare('DELETE FROM tune_machines WHERE key = ?').bind(which).run();
      await env.DB.prepare('UPDATE tune_keys SET moved_at = NULL WHERE key = ?').bind(which).run();
      rows = await tuneKeysFor(env, order);
      return json({ ok: true, released: prettyTuneKey(which), ...(await describe()) }, { env, request });
    }
    return fail('Unknown action.', 400, env, request);
  },

  /**
   * Square tells us about every payment as it happens, so the keys are
   * issued and emailed the moment the money lands, whether or not the buyer
   * ever reaches the key page. The signature proves the call is Square's.
   * Square retries until it gets a 2xx, and re-sends on any doubt, so this
   * is safe to run twice: the same order gets the same keys and one email.
   */
  'POST /v1/webhooks/square': async (request, env) => {
    if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY || !env.SQUARE_WEBHOOK_URL) return fail('The Square webhook is not configured.', 503, env, request);
    const raw = await request.text();
    const ok = await verifySquare(raw, request.headers.get('x-square-hmacsha256-signature'), env.SQUARE_WEBHOOK_URL, env.SQUARE_WEBHOOK_SIGNATURE_KEY);
    if (!ok) return fail('Bad signature.', 400, env, request);

    let event; try { event = JSON.parse(raw); } catch { return fail('Not JSON.', 400, env, request); }
    const type = String(event.type || '');

    // A refund switches the keys off, so refunding in Square is the whole job.
    // A partial refund (one friend's share of a Squad, say) changes nothing
    // here; support decides that one by hand.
    if (type === 'refund.created' || type === 'refund.updated') {
      const refund = event.data?.object?.refund;
      if (!refund || refund.status !== 'COMPLETED') return json({ ignored: `refund ${refund?.status || 'missing'}` });
      const order = String(refund.order_id || '').trim().slice(0, 120);
      if (!/^[A-Za-z0-9_\-:.]{6,}$/.test(order)) return json({ ignored: 'refund without an order id' });
      const rows = await tuneKeysFor(env, order);
      if (!rows.length) return json({ ignored: 'no keys for that order' });
      const paid = Number(rows[0].amount_cents || 0);
      const back = Number(refund.amount_money?.amount || 0);
      if (paid && back < paid - 100) {
        // Nothing changes here; the owner hears about it once, and decides on the owner page.
        let told = false;
        if (env.RESEND_API_KEY && validEmail(env.SUPPORT_EMAIL) && await firstTime(env, `refund:${String(refund.id || order).slice(0, 80)}`)) {
          const r = await sendMail(env, {
            to: String(env.SUPPORT_EMAIL).trim().toLowerCase(),
            subject: `OmniDx Tune: a partial refund on order ${order}`,
            text: `Square refunded ${dollars(back)} of the ${dollars(paid)} paid on order ${order}${rows[0].email ? ` (${maskEmail(rows[0].email)})` : ''}.\n\nThe keys stay on: a partial refund is your call. If it was one friend's share of a Squad, switch off that key only from the owner page: https://omnidx.net/studio/admin/\nOrder reference to paste there: ${order}`,
          });
          told = r.ok;
        }
        return json({ ok: true, order, partial: true, revoked: 0, told });
      }
      const live = rows.filter((r) => !r.revoked_at);
      if (live.length) {
        await env.DB.prepare("UPDATE tune_keys SET revoked_at = ? WHERE (order_ref = ? OR order_ref LIKE ?) AND revoked_at IS NULL").bind(Date.now(), order, `${order}#%`).run();
        if (rows[0].email && env.RESEND_API_KEY) await emailTuneRefund(env, rows[0].email, live.length, order);
      }
      return json({ ok: true, order, revoked: live.length });
    }

    if (type !== 'payment.updated' && type !== 'payment.created') return json({ ignored: type });
    const payment = event.data?.object?.payment;
    if (!payment || payment.status !== 'COMPLETED') return json({ ignored: `payment ${payment?.status || 'missing'}` });

    // The order id is what the key page sends, so the same order lands on the same keys either way.
    const order = String(payment.order_id || payment.id || '').trim().slice(0, 120);
    if (!/^[A-Za-z0-9_\-:.]{6,}$/.test(order)) return json({ ignored: 'no order id' });
    const cents = Number(payment.amount_money?.amount || 0);
    const product = tuneProductFor(cents);
    if (!product) return json({ ignored: `amount ${cents}` });
    const to = validEmail(payment.buyer_email_address) ? String(payment.buyer_email_address).trim().toLowerCase() : null;

    const receipt = payment.receipt_number ? receiptOf(payment.receipt_number) : null;
    let rows = await tuneKeysFor(env, order);
    if (!rows.length) {
      await issueTuneKeys(env, { order, product, cents, email: to, receipt });
      rows = await tuneKeysFor(env, order);
    } else {
      if (to && !rows[0].email) await env.DB.prepare("UPDATE tune_keys SET email = ? WHERE order_ref = ? OR order_ref LIKE ?").bind(to, order, `${order}#%`).run();
      if (receipt && !rows[0].receipt) await env.DB.prepare("UPDATE tune_keys SET receipt = ? WHERE order_ref = ? OR order_ref LIKE ?").bind(receipt, order, `${order}#%`).run();
    }
    const live = rows.filter((r) => !r.revoked_at);
    let emailed = Boolean(rows[0]?.emailed_at);
    if (!emailed && to && env.RESEND_API_KEY && live.length) {
      const sent = await emailTuneKeys(env, to, live[0].product, live.map((r) => prettyTuneKey(r.key)), order, payment.receipt_url || null, receipt);
      if (sent) { await env.DB.prepare("UPDATE tune_keys SET emailed_at = ? WHERE order_ref = ? OR order_ref LIKE ?").bind(Date.now(), order, `${order}#%`).run(); emailed = true; }
    }
    return json({ ok: true, order, product: live[0]?.product || product, keys: live.length, emailed, to: to ? 'yes' : 'none on the payment' });
  },

  /**
   * The script calls this before it changes anything. A key binds to the
   * first PC that claims it (one PC per key; a Squad order is three keys) and
   * is refused everywhere else.
   * The same PC claiming again is fine — that is how re-running after a
   * Windows update works — and it is how a refund actually stops a key.
   */
  'POST /v1/tune/claim': async (request, env, body) => {
    if (await tooMany(env, request, 'claim', 40)) return fail(TOO_MANY, 429, env, request);
    const parsed = parseTuneKey(body.key);
    if (!parsed) return fail('That key is not valid. Check it for typos.', 400, env, request);
    const hwid = String(body.hwid || '').trim().toLowerCase();
    if (!/^[0-9a-f]{16,64}$/.test(hwid)) return fail('No machine id was sent.', 400, env, request);

    const row = await env.DB.prepare('SELECT * FROM tune_keys WHERE key = ?').bind(parsed.key).first();
    if (!row) return fail('That key was not issued by us.', 404, env, request);
    if (row.revoked_at) return fail('That key has been refunded or revoked.', 410, env, request);

    const label = body.machine
      ? String([body.machine.name, body.machine.cpu, body.machine.gpu].filter(Boolean).join(' · ')).slice(0, 160)
      : null;
    const version = body.machine?.version ? String(body.machine.version).slice(0, 20) : null;
    const os = body.machine?.os ? String(body.machine.os).slice(0, 120) : null;
    const now = Date.now();
    const mine = await env.DB.prepare('SELECT hwid FROM tune_machines WHERE key = ? AND hwid = ?').bind(parsed.key, hwid).first();
    if (!mine) {
      const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM tune_machines WHERE key = ?').bind(parsed.key).first();
      if (count >= row.seats) {
        return fail(
          row.seats === 1
            ? 'This key is already locked to another PC. One key, one PC — email support if you replaced your machine.'
            : `This key is already on ${row.seats} PCs, which is all a Squad key covers.`,
          409, env, request,
        );
      }
      await env.DB.prepare('INSERT INTO tune_machines (key, hwid, label, version, os, first_seen, last_seen) VALUES (?,?,?,?,?,?,?)')
        .bind(parsed.key, hwid, label, version, os, now, now).run();
    } else {
      await env.DB.prepare('UPDATE tune_machines SET last_seen = ?, label = COALESCE(?, label), version = COALESCE(?, version), os = COALESCE(?, os) WHERE key = ? AND hwid = ?')
        .bind(now, label, version, os, parsed.key, hwid).run();
    }
    const { count: used } = await env.DB.prepare('SELECT COUNT(*) AS count FROM tune_machines WHERE key = ?').bind(parsed.key).first();
    return json({ ok: true, product: row.product, seats: row.seats, used }, { env, request });
  },

  /**
   * Move a key to a new PC, self-service.
   *
   * Proof of ownership is the Square order reference the key was issued
   * against — the thing only the buyer's receipt has. Once every 30 days, so
   * a key cannot be passed around by "moving" it every evening; more often
   * than that is a support email.
   */
  'POST /v1/tune/release': async (request, env, body) => {
    if (await tooMany(env, request, 'release', 10)) return fail(TOO_MANY, 429, env, request);
    const parsed = parseTuneKey(body.key);
    if (!parsed) return fail('That key is not valid. Check it for typos.', 400, env, request);
    const order = String(body.order || '').trim().replace(/^#/, '').slice(0, 120);
    if (order.length < 4) return fail('The order reference or the receipt number from your Square receipt is needed.', 400, env, request);
    const row = await env.DB.prepare('SELECT * FROM tune_keys WHERE key = ?').bind(parsed.key).first();
    if (!row) return fail('That key was not issued by us.', 404, env, request);
    if (row.revoked_at) return fail('That key has been refunded or revoked.', 410, env, request);
    // The second and third keys of a Squad order carry #2 and #3 after the
    // order reference; the receipt shows the plain reference, so that is what is compared.
    const plainRef = String(row.order_ref || '').replace(/#\d+$/, '');
    const byOrder = plainRef && sameSecret(plainRef.toLowerCase(), order.toLowerCase());
    const byReceipt = row.receipt && sameSecret(String(row.receipt), receiptOf(order));
    if (!byOrder && !byReceipt) {
      return fail('That order reference does not match this key.', 403, env, request);
    }
    const days = 30;
    if (row.moved_at && Date.now() - row.moved_at < days * 86400_000) {
      const next = new Date(row.moved_at + days * 86400_000).toISOString().slice(0, 10);
      return fail(`This key was moved recently. It can move again on ${next}, or email support with your receipt.`, 429, env, request);
    }
    const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM tune_machines WHERE key = ?').bind(parsed.key).first();
    await env.DB.prepare('DELETE FROM tune_machines WHERE key = ?').bind(parsed.key).run();
    await env.DB.prepare('UPDATE tune_keys SET moved_at = ? WHERE key = ?').bind(Date.now(), parsed.key).run();
    return json({ ok: true, released: count, seats: row.seats }, { env, request });
  },

  /** Is this key real, and how many PCs is it on. Changes nothing. */
  'POST /v1/tune/check': async (request, env, body) => {
    if (await tooMany(env, request, 'check', 60)) return json({ ok: false, reason: TOO_MANY }, { status: 429, env, request });
    const parsed = parseTuneKey(body.key);
    if (!parsed) return json({ ok: false, reason: 'That key is not valid.' }, { env, request });
    const row = await env.DB.prepare('SELECT * FROM tune_keys WHERE key = ?').bind(parsed.key).first();
    if (!row) return json({ ok: false, reason: 'That key was not issued by us.' }, { env, request });
    if (row.revoked_at) return json({ ok: false, reason: 'That key has been refunded or revoked.' }, { env, request });
    const { count: used } = await env.DB.prepare('SELECT COUNT(*) AS count FROM tune_machines WHERE key = ?').bind(parsed.key).first();
    return json({ ok: true, product: row.product, seats: row.seats, used }, { env, request });
  },

  'POST /v1/webhooks/stripe': async (request, env) => {
    if (!env.STRIPE_WEBHOOK_SECRET) return fail('Payments are not configured.', 503, env, request);

    const raw = await request.text();
    const ok = await verifyStripe(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
    if (!ok) return fail('Bad signature.', 400, env, request);

    const event = JSON.parse(raw);
    if (event.type !== 'checkout.session.completed') return json({ ignored: event.type });

    const session = event.data.object;
    // Which edition was bought is decided by the amount, so a new price or a
    // discount code cannot accidentally hand out the wrong tier.
    const cents = session.amount_total ?? 0;
    const edition = cents >= 6000 ? 'team'
      : cents >= 3000 ? 'studio'
      : cents >= 1000 ? 'creator'
      : null;
    if (!edition) return json({ ignored: 'amount below any edition' });

    const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
    const key = makeKey(edition);
    const existing = email
      ? await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
      : null;

    await env.DB.prepare(
      `INSERT INTO licences (key, edition, email, user_id, amount_cents, provider, provider_ref, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(key, edition, email, existing?.id || null, cents, 'stripe', session.id, Date.now()).run();

    // Deliver the key. If no mailer is configured the licence still exists and
    // is attached to the buyer's account the moment they sign in with that
    // email — nobody's money is stranded by a missing env var.
    if (env.RESEND_API_KEY && email) await emailKey(env, email, key, edition);

    return json({ ok: true, edition, emailed: Boolean(env.RESEND_API_KEY && email) });
  },
};

/* ------------------------------------------------------------------ */
/* device registration                                                 */
/* ------------------------------------------------------------------ */

async function touchDevice(env, userId, device, edition) {
  if (!device?.id) return {};
  const id = String(device.id).slice(0, 64);
  const seen = await env.DB.prepare('SELECT device_id FROM devices WHERE user_id = ? AND device_id = ?')
    .bind(userId, id).first();

  let evicted = null;
  if (!seen) {
    /*
     * Past the plan's limit the device seen longest ago is dropped to make
     * room, and its name is returned so the app can say so. Refusing here
     * was the wrong shape of limit: "remove one from your account page
     * first" cannot be done from a device that was lost, and a limit that
     * locks the owner out of their own account is not enforcing anything
     * worth enforcing. The count still holds.
     */
    const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM devices WHERE user_id = ?')
      .bind(userId).first();
    const limit = DEVICE_LIMIT[edition] ?? 2;
    if (count >= limit) {
      const oldest = await env.DB.prepare('SELECT device_id, label FROM devices WHERE user_id = ? ORDER BY last_seen ASC LIMIT 1')
        .bind(userId).first();
      if (oldest) {
        await env.DB.prepare('DELETE FROM devices WHERE user_id = ? AND device_id = ?').bind(userId, oldest.device_id).run();
        evicted = oldest.label || 'an older device';
      }
    }
  }

  await env.DB.prepare(
    `INSERT INTO devices (user_id, device_id, label, os, screen, last_seen)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id, device_id) DO UPDATE SET last_seen = excluded.last_seen, label = excluded.label`,
  ).bind(userId, id, String(device.label || '').slice(0, 80), String(device.os || '').slice(0, 24),
    String(device.screen || '').slice(0, 24), Date.now()).run();
  return { evicted };
}

/** A new password hash for a user, with a fresh salt. */
async function setPassword(env, userId, password) {
  const rounds = Number(env.PBKDF2_ROUNDS) || DEFAULT_PBKDF2_ROUNDS;
  const salt = randomHex(16);
  const hash = await hashPassword(String(password), salt, rounds);
  await env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, pw_rounds = ? WHERE id = ?')
    .bind(hash, salt, rounds, userId).run();
}

/* ------------------------------------------------------------------ */
/* AI quota                                                            */
/* ------------------------------------------------------------------ */

async function spendQuota(env, userId, edition) {
  const month = new Date().toISOString().slice(0, 7);
  const limit = AI_QUOTA[edition] ?? 0;
  const row = await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id = ? AND month = ?')
    .bind(userId, month).first();
  const used = row?.used ?? 0;
  if (used >= limit) return false;
  await env.DB.prepare(
    `INSERT INTO ai_usage (user_id, month, used) VALUES (?,?,1)
     ON CONFLICT(user_id, month) DO UPDATE SET used = used + 1`,
  ).bind(userId, month).run();
  return true;
}

/* ------------------------------------------------------------------ */
/* Claude                                                              */
/* ------------------------------------------------------------------ */

const PLAN_TOOL = {
  name: 'emit_plan',
  description: 'Return the edit plan. Every step must use one of the listed operations.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One sentence describing the finished edit.' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', description: 'One of the allowed operation names.' },
            args: { type: 'string', description: 'A JSON object of arguments, as a string.' },
            label: { type: 'string', description: 'What this step does, in plain language.' },
            detail: { type: 'string', description: 'Why, or what to expect. One or two sentences.' },
          },
          required: ['op', 'args', 'label', 'detail'],
          additionalProperties: false,
        },
      },
      warnings: { type: 'array', items: { type: 'string' },
        description: 'What you could not do, and why. Empty if nothing.' },
      questions: { type: 'array', items: { type: 'string' },
        description: 'At most one short question, only when the answer would change the edit. Always return a plan as well.' },
    },
    required: ['summary', 'steps', 'warnings', 'questions'],
    additionalProperties: false,
  },
};

const SYSTEM = `You plan video edits for OmniDx Studio. You are the difference
between this app and the ones people give up on, so the bar is: a working
editor reads your plan and says "yes, that is what I would have done".

WHAT YOU GET
- What the person asked for, in their words.
- Their media: names, durations, dimensions, whether each has audio. You never
  see a frame. Do not pretend to know what is in the footage.
- What is already on their timeline, the canvas ratio, and the tempo if a
  track has been analysed.
- "spec": every operation you may use and exactly what arguments it takes.
- "styles": the named looks that already exist, with the words people use for
  them.

HOW TO THINK ABOUT IT
1. Work out whether they want you to BUILD an edit or CHANGE the one they have.
   "Sync my clips to the music", "re-time these", "match the beat" mean use
   syncToTrack and keep their clips and order. Replacing someone's timeline
   when they asked you to sync it is the worst thing you can do here.
2. If they named a style ("anime", "phonk", "velocity", "cinematic") use the
   matching entry in "styles" as your backbone, then adjust for anything else
   they said. Do not reinvent a style that already exists.
3. Order matters and the app enforces it anyway: ratio, then build the
   timeline, then speed, then grade, then effects, then transitions, then
   text and captions, then music, then fades.
4. Fewer, larger steps. Fifteen steps is a plan nobody reads. Eight is plenty.

RULES
- Only operation names from "operations". Anything else is dropped.
- "args" is a JSON object serialised as a string: "{\\"ratio\\":\\"9:16\\"}".
  Follow "spec" exactly — invented argument names are ignored silently.
- Never invent media, a logo, a voice, music or footage they did not import.
  If they asked for something their files cannot support, do the closest real
  thing and say what was missing in "warnings".
- Labels are read by someone who has never edited video. "Cut on the beat at
  124 BPM" is a good label. "beatCut(every=4)" is not. The "detail" line says
  why, or what to expect, in one or two sentences.
- If something genuinely changes the result and they did not say it — what
  shape, how long, which clip is the subject — put ONE short question in
  "questions" AND still return your best plan. Never return questions alone;
  a plan they can adjust beats an interrogation.
- Be decisive. Pick sensible numbers rather than asking about every one. Fast
  cuts are 2 beats, normal 4, slow 8. A TikTok is 9:16. A trailer is 15-30s.
- If the request is vague ("make it good", "do something cool"), pick the style
  that suits their media and say why in the summary. Do not stall.
- If "timeline.clipCount" is above zero, an edit EXISTS. Never use layout,
  beatCut or structuredCut on it unless they said rebuild, start over or from
  scratch — use the targeted operations (setColor, setClipSpeed, setVolume,
  addTitle, captions, addTransitions, setRatio, fitDuration) on top of it.
  "add captions" on an existing edit is one captions step, nothing else.
- If part of the request names something no operation can do (a freeze frame,
  a reverse, a crop, a stabiliser, a logo you have not been given), do the
  rest and name the missing part in "warnings" with the manual way to do it.
- Negations are binding: "no captions", "without transitions", "keep the
  original colours", "don't add music" remove that step even when the style
  would normally include it.`

async function askClaude(env, prompt, body) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const request = {
    model: env.CLAUDE_MODEL || 'claude-opus-5',
    max_tokens: 4000,
    system: SYSTEM,
    tools: [PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'emit_plan' },
    messages: [{
      role: 'user',
      content: JSON.stringify({
        request: prompt,
        media: Array.isArray(body.media) ? body.media.slice(0, 60) : [],
        timeline: body.timeline || {},
        beats: body.beats || null,
        operations: Array.isArray(body.operations) ? body.operations : [],
        spec: body.spec && typeof body.spec === 'object' ? body.spec : undefined,
        styles: Array.isArray(body.styles) ? body.styles : undefined,
      }),
    }],
  };

  // Adaptive thinking: planning an edit is a reasoning task, and the
  // difference between a plan that works and one that reads well is exactly
  // the sort of thing it buys.
  request.thinking = { type: 'adaptive' };

  const message = await client.messages.create(request);

  if (message.stop_reason === 'refusal') {
    throw new Error('the model declined that request');
  }
  const block = message.content.find((b) => b.type === 'tool_use' && b.name === 'emit_plan');
  if (!block) throw new Error('no plan came back');

  const out = block.input;
  return {
    summary: String(out.summary || '').slice(0, 300),
    warnings: (out.warnings || []).map((w) => String(w).slice(0, 240)).slice(0, 5),
    questions: (out.questions || []).map((q) => String(q).slice(0, 240)).slice(0, 3),
    steps: (out.steps || []).slice(0, 20).map((s) => ({
      op: String(s.op),
      args: safeArgs(s.args),
      label: String(s.label || '').slice(0, 140),
      detail: String(s.detail || '').slice(0, 300),
    })),
  };
}

/** args arrives as a JSON string; a malformed one is a step with no options,
 *  not a 500. The client validates the op name again before running anything. */
function safeArgs(value) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

/* ------------------------------------------------------------------ */
/* transcription shaping                                               */
/* ------------------------------------------------------------------ */

/**
 * Squash whatever the STT service returns into caption cues. Handles the two
 * common shapes: a flat word list with timings, or ready-made segments.
 */
function normaliseCues(data) {
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words
    || data?.words
    || null;

  if (Array.isArray(words) && words.length) {
    const cues = [];
    let current = null;
    for (const w of words) {
      const start = Number(w.start ?? w.start_time ?? 0);
      const end = Number(w.end ?? w.end_time ?? start + 0.3);
      const text = String(w.punctuated_word ?? w.word ?? '').trim();
      if (!text) continue;
      // Break every ~2.5 seconds or 7 words: longer than that and nobody reads it.
      if (!current || end - current.start > 2.5 || current.text.split(' ').length >= 7) {
        current = { start, end, text };
        cues.push(current);
      } else {
        current.end = end;
        current.text += ` ${text}`;
      }
    }
    return cues;
  }

  const segments = data?.segments || data?.results?.segments || [];
  return segments
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end))
    .map((s) => ({ start: s.start, end: s.end, text: String(s.text || '').trim() }));
}

/* ------------------------------------------------------------------ */
/* Stripe signature                                                    */
/* ------------------------------------------------------------------ */

/**
 * Stripe signs `timestamp.payload` with HMAC-SHA256. Verified by hand here so
 * the Worker does not need the Stripe SDK for one function.
 */
async function verifyStripe(payload, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject anything older than five minutes, so a captured request cannot be
  // replayed later to mint a second licence.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sameSecret(expected, signature);
}

/* ------------------------------------------------------------------ */
/* delivery                                                            */
/* ------------------------------------------------------------------ */

async function emailInvite(env, email, invite, from) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'OmniDx Studio <keys@omnidx.net>',
        to: [email],
        subject: 'You have a seat on OmniDx Studio',
        text: `${from} has given you a seat on their OmniDx Studio Team licence.

Your invite code: ${invite}

Make an account at https://omnidx.net/studio/account/ with this email address,
then paste the code in. That unlocks everything — the full editor, unlimited AI,
every effect — on up to three of your devices.

There is nothing to pay and nothing to cancel.`,
      }),
    });
  } catch { /* the seat row exists; the code can be passed on by hand */ }
}

async function emailReset(env, email, link) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'OmniDx Studio <keys@omnidx.net>',
        to: [email],
        subject: 'Reset your OmniDx Studio password',
        text: `Somebody asked to reset the password on your OmniDx Studio account.

If that was you, open this link within the hour and choose a new one:
${link}

If it was not you, nothing happens — the link does nothing until it is used,
and your recovery code still works as it always did.`,
      }),
    });
  } catch { /* the token exists; the person can ask again */ }
}

/**
 * The keys, the one line to paste, and the way back. Plain text: it has to
 * read the same in every mail app and survive being forwarded to a friend.
 * Returns true only when Resend accepted it.
 */
/** One email through Resend, with Resend's own words when it refuses (an unverified domain, a bad from address). */
async function sendMail(env, { to, subject, text }) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.TUNE_MAIL_FROM || env.MAIL_FROM || 'OmniDx Tune <keys@omnidx.net>', to: [to], reply_to: env.SUPPORT_EMAIL || undefined, subject, text }),
    });
    if (r.ok) return { ok: true, status: r.status, detail: '' };
    const raw = (await r.text().catch(() => '')).slice(0, 400);
    let detail = raw;
    try { detail = JSON.parse(raw).message || raw; } catch { /* not JSON */ }
    return { ok: false, status: r.status, detail };
  } catch (err) {
    return { ok: false, status: 0, detail: String((err && err.message) || err) };
  }
}

/**
 * The figures behind the owner page and the Monday email: orders counted once,
 * the last seven days and everything since the first sale, keys issued, PCs
 * bound, orders whose keys never went out. Counts and money, nothing about a buyer.
 */
async function tuneFigures(env) {
  const rows = (await env.DB.prepare('SELECT product, amount_cents, order_ref, revoked_at, created_at, emailed_at, email FROM tune_keys').all()).results || [];
  const pcsRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM tune_machines').first();
  const since = Date.now() - 7 * 86400_000;
  const perOrder = new Map();
  for (const r of rows) {
    const o = String(r.order_ref || '').replace(/#\d+$/, '');
    if (!perOrder.has(o)) perOrder.set(o, { cents: r.amount_cents || 0, product: r.product, keys: 0, off: 0, createdAt: r.created_at || 0, unsent: false });
    const g = perOrder.get(o); g.keys++; if (r.revoked_at) g.off++; if (!r.emailed_at && r.email && !r.revoked_at) g.unsent = true;
  }
  const tally = (orders) => {
    const t = { orders: 0, paidCents: 0, refundedOrders: 0, refundedCents: 0, tune: 0, squad: 0, unsent: 0 };
    for (const g of orders) {
      t.orders++;
      if (g.keys && g.off === g.keys) { t.refundedOrders++; t.refundedCents += g.cents; } else { t.paidCents += g.cents; if (g.product === 'squad') t.squad++; else t.tune++; }
      if (g.unsent) t.unsent++;
    }
    return t;
  };
  const all = [...perOrder.values()];
  return { all: tally(all), week: tally(all.filter((g) => g.createdAt >= since)), keys: rows.length, pcs: Number((pcsRow && pcsRow.count) || 0) };
}
const dollars = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The week as one email to the owner: sent by the Monday cron and by the owner page on demand. */
async function emailTuneSummary(env, when = 'the week') {
  if (!env.RESEND_API_KEY || !validEmail(env.SUPPORT_EMAIL)) return { ok: false, reason: 'Mail is off, or SUPPORT_EMAIL is not set.' };
  const f = await tuneFigures(env);
  const line = (t) => `${plural(t.orders, 'order')} (${t.tune} Tune, ${t.squad} Squad), ${dollars(t.paidCents)} kept, ${t.refundedOrders} refunded (${dollars(t.refundedCents)})${t.unsent ? `, ${t.unsent} not emailed` : ''}`;
  const text = [
    `OmniDx Tune, ${when}.`, '',
    `Last seven days: ${line(f.week)}.`,
    `Since the first sale: ${line(f.all)}; ${plural(f.keys, 'key')} issued, on ${plural(f.pcs, 'PC')}.`, '',
    f.all.unsent ? 'Some keys never went out by email: "Send every unsent order" on the owner page sends them.' : 'Every order has had its keys emailed.',
    'Owner page: https://omnidx.net/studio/admin/',
  ].join('\n');
  const to = String(env.SUPPORT_EMAIL).trim().toLowerCase();
  const sent = await sendMail(env, { to, subject: `OmniDx Tune: ${plural(f.week.orders, 'order')} this week`, text });
  return { ok: sent.ok, sentTo: to, detail: sent.detail, ...f };
}

async function emailTuneKeys(env, email, product, keys, order, receiptUrl, receiptNumber = null) {
  const three = keys.length > 1;
  const lines = [
    three ? 'Thanks for buying OmniDx Tune Squad: three keys, one per PC.' : 'Thanks for buying OmniDx Tune.',
    '',
    three ? 'Your keys (one is yours; give the other two away, one each):' : 'Your key:',
    ...keys.map((k, i) => (three ? `  ${i + 1}.  ${k}` : `  ${k}`)),
    '',
    'On the PC you want tuned, open PowerShell (Windows key, type powershell, Enter) and paste:',
    ...keys.map((k) => `  $env:OMNIDX_KEY='${k}'; irm omnidx.net/go.ps1 | iex`),
    '',
    'Each key locks to the first PC that runs it; running it again on that PC after a Windows update is free.',
    'Undo, any time:   $env:OMNIDX_MODE=\'undo\'; irm omnidx.net/go.ps1 | iex',
    'Extreme (caution, fewer conveniences, a few more frames; undo puts it all back):',
    ...keys.slice(0, 1).map((k) => `  $env:OMNIDX_MODE='extreme'; $env:OMNIDX_KEY='${k}'; irm omnidx.net/go.ps1 | iex`),
    '',
    `Your keys are also on the page Square sent you to, and any time at https://omnidx.net/studio/activate/ with your order number: ${order}`,
    receiptNumber ? `Receipt number: #${receiptNumber} (that, with this email address, shows the keys again on that page)` : null,
    receiptUrl ? `Square receipt: ${receiptUrl}` : null,
    'What it does, screen by screen: https://omnidx.net/studio/download/',
    'Terms, privacy and refunds, one page: https://omnidx.net/studio/terms/',
    '',
    'Nothing renews and there is no account. Fourteen days to change your mind: reply to this email with the order number.',
  ].filter((l) => l !== null);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.TUNE_MAIL_FROM || env.MAIL_FROM || 'OmniDx Tune <keys@omnidx.net>',
        to: [email],
        reply_to: env.SUPPORT_EMAIL || undefined,
        subject: three ? 'Your three OmniDx Tune keys' : 'Your OmniDx Tune key',
        text: lines.join('\n'),
      }),
    });
    return r.ok;
  } catch { return false; }
}

/** The keys stop working with the refund; say so, so nobody wonders. */
async function emailTuneRefund(env, email, count, order) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.TUNE_MAIL_FROM || env.MAIL_FROM || 'OmniDx Tune <keys@omnidx.net>',
        to: [email],
        reply_to: env.SUPPORT_EMAIL || undefined,
        subject: 'Your OmniDx Tune refund',
        text: `Your refund for order ${order} has gone through on Square's side; the money follows in a few days, depending on the bank.

${count === 1 ? 'The key from that order no longer works.' : `The ${count} keys from that order no longer work.`} Nothing else changes: a PC that was tuned keeps its settings, and C:\\OmniDx\\undo\\undo.ps1 puts every one of them back whenever you like.

If this refund was not you, reply to this email.`,
      }),
    });
    return r.ok;
  } catch { return false; }
}

async function emailKey(env, email, key, edition) {
  const pretty = `OMNIDX-${key.slice(6, 9)}-${key.slice(9, 13)}-${key.slice(13, 17)}-${key.slice(17, 21)}`;
  const body = {
    from: env.MAIL_FROM || 'OmniDx Studio <keys@omnidx.net>',
    to: [email],
    subject: `Your OmniDx Studio ${edition} key`,
    text: `Thanks for buying OmniDx Studio.

Your key: ${pretty}

Paste it into Settings → Account & licence in the app, or at
https://omnidx.net/studio/account/ — it unlocks every device you sign in on.

Nothing expires and there is nothing to renew. If you want a refund within 14
days, just reply to this email.`,
  };
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { /* the licence row is already written; delivery can be retried by hand */ }
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export default {
  // Monday mornings (wrangler.toml, [triggers]): the week's figures to the owner.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(emailTuneSummary(env, 'the week').catch((err) => console.error('summary', err)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    const handler = routes[`${request.method} ${url.pathname}`];
    if (!handler) return fail('No such endpoint.', 404, env, request);

    let body = {};
    if (request.method === 'POST' && !url.pathname.includes('/webhooks/')
        && !url.pathname.endsWith('/transcribe')) {
      try { body = await request.json(); } catch { body = {}; }
    }

    try {
      return await handler(request, env, body);
    } catch (err) {
      // Never leak a stack trace to the browser; the details go to the log.
      console.error(url.pathname, err);
      return fail('Something went wrong on our side.', 500, env, request);
    }
  },
};
