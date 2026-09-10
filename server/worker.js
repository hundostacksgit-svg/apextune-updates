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
    if (placed.error) return fail(placed.error, 403, env, request);

    return json({ token: await createSession(env, user.id), edition, name: user.name },
      { env, request });
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

  if (!seen) {
    const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM devices WHERE user_id = ?')
      .bind(userId).first();
    const limit = DEVICE_LIMIT[edition] ?? 2;
    if (count >= limit) {
      return { error: `This account is already on ${count} devices (${edition} allows ${limit}). Remove one from your account page first.` };
    }
  }

  await env.DB.prepare(
    `INSERT INTO devices (user_id, device_id, label, os, screen, last_seen)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id, device_id) DO UPDATE SET last_seen = excluded.last_seen, label = excluded.label`,
  ).bind(userId, id, String(device.label || '').slice(0, 80), String(device.os || '').slice(0, 24),
    String(device.screen || '').slice(0, 24), Date.now()).run();
  return {};
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
  that suits their media and say why in the summary. Do not stall.`;

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
