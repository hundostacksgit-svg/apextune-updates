/*
 * The licence server's stand-ins, shared by the offline money-path test and
 * the browser test: a D1 that models the statements the tune routes use (and
 * fails the run on any it does not), a network where Square answers order and
 * payment lookups and Resend takes mail, and a Gmail SMTP server on a fake
 * TLS socket. Nothing here talks to the internet.
 */
export const counters = { squareLooks: 0, smtpSessions: 0 };
const realFetch = globalThis.fetch;

/* ---------------- a stand-in D1: the statements the tune routes use ---------------- */
export const db = { tune_keys: [], tune_machines: [], tune_hits: [] };

/*
 * The support tables are a real SQLite in memory, made from server/schema.sql,
 * so every statement the ticket routes send is checked against the schema D1
 * gets. (node:sqlite ships with Node 22; its "experimental" notice is dropped.)
 */
let lite = null;
{
  const emit = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w && w.message || w).includes('SQLite') ? undefined : emit.call(process, w, ...rest));
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const { readFileSync } = await import('node:fs');
    lite = new DatabaseSync(':memory:');
    lite.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  } catch (err) { lite = { error: err }; }
  process.emitWarning = emit;
}
export const supportDb = lite;
function sqlite(s, args) {
  if (!lite || lite.error) throw new Error('the support tables need node:sqlite (Node 22.13 or newer): ' + (lite && lite.error && lite.error.message));
  const st = lite.prepare(s);
  if (/^(SELECT|WITH)\b/i.test(s)) return st.all(...args).map((r) => ({ ...r }));
  const out = []; out.changes = Number(st.run(...args).changes); return out;
}
const like = (v, pat) => pat.endsWith('%') && String(v || '').startsWith(pat.slice(0, -1));
function statement(sql, args) {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/\bsupport_(tickets|messages|keys|devices)\b/.test(s)) return sqlite(s, args);
  const byOrder = (r) => r.order_ref === args[0] || like(r.order_ref, args[1]);
  if (s.startsWith('SELECT * FROM tune_keys WHERE order_ref = ? OR order_ref LIKE ? OR (receipt IS NOT NULL AND receipt = ?)')) {
    return db.tune_keys.filter((r) => byOrder(r) || (r.receipt && r.receipt === args[2])).sort((a, b) => a.order_ref.localeCompare(b.order_ref));
  }
  if (s.startsWith('SELECT * FROM tune_keys WHERE key = ?')) return db.tune_keys.filter((r) => r.key === args[0]);
  if (s.startsWith('INSERT INTO tune_keys (key, product, seats, email, order_ref, receipt, provider, amount_cents, verified, created_at)')) {
    const [key, product, seats, email, order_ref, receipt, provider, amount_cents, verified, created_at] = args;
    if (db.tune_keys.some((r) => r.key === key || r.order_ref === order_ref)) throw new Error('UNIQUE constraint failed');
    db.tune_keys.push({ key, product, seats, email, order_ref, receipt, provider, amount_cents, verified, created_at, revoked_at: null, moved_at: null, emailed_at: null, refund_checked_at: null });
    return [];
  }
  if (s.startsWith('UPDATE tune_keys SET receipt = ? WHERE order_ref = ? OR order_ref LIKE ?')) {
    db.tune_keys.filter((r) => r.order_ref === args[1] || like(r.order_ref, args[2])).forEach((r) => { r.receipt = args[0]; }); return [];
  }
  if (s.startsWith('UPDATE tune_keys SET emailed_at = ? WHERE order_ref = ? OR order_ref LIKE ?')) {
    db.tune_keys.filter((r) => r.order_ref === args[1] || like(r.order_ref, args[2])).forEach((r) => { r.emailed_at = args[0]; }); return [];
  }
  if (s.startsWith('UPDATE tune_keys SET email = ? WHERE order_ref = ? OR order_ref LIKE ?')) {
    db.tune_keys.filter((r) => r.order_ref === args[1] || like(r.order_ref, args[2])).forEach((r) => { r.email = args[0]; }); return [];
  }
  if (s.startsWith('UPDATE tune_keys SET moved_at = ? WHERE key = ?')) { db.tune_keys.filter((r) => r.key === args[1]).forEach((r) => { r.moved_at = args[0]; }); return []; }
  if (s.startsWith('SELECT * FROM tune_keys WHERE emailed_at IS NULL AND revoked_at IS NULL AND email IS NOT NULL ORDER BY created_at')) return db.tune_keys.filter((r) => !r.emailed_at && !r.revoked_at && r.email).sort((a, b) => a.created_at - b.created_at);
  if (s.startsWith('SELECT product, amount_cents, order_ref, revoked_at FROM tune_keys')) return db.tune_keys.map((r) => ({ product: r.product, amount_cents: r.amount_cents, order_ref: r.order_ref, revoked_at: r.revoked_at }));
  if (s.startsWith('SELECT * FROM tune_keys ORDER BY created_at DESC LIMIT 60')) return [...db.tune_keys].sort((a, b) => b.created_at - a.created_at).slice(0, 60);
  if (s.startsWith('UPDATE tune_keys SET revoked_at = ? WHERE key = ? AND revoked_at IS NULL')) { db.tune_keys.filter((r) => r.key === args[1] && !r.revoked_at).forEach((r) => { r.revoked_at = args[0]; }); return []; }
  if (s.startsWith('UPDATE tune_keys SET moved_at = NULL WHERE key = ?')) { db.tune_keys.filter((r) => r.key === args[0]).forEach((r) => { r.moved_at = null; }); return []; }
  if (s.startsWith('UPDATE tune_keys SET email = ?, emailed_at = ? WHERE order_ref = ? OR order_ref LIKE ?')) {
    db.tune_keys.filter((r) => r.order_ref === args[2] || like(r.order_ref, args[3])).forEach((r) => { r.email = args[0]; r.emailed_at = args[1]; }); return [];
  }
  if (s.startsWith('UPDATE tune_keys SET revoked_at = NULL WHERE order_ref = ? OR order_ref LIKE ?')) {
    db.tune_keys.filter((r) => r.order_ref === args[0] || like(r.order_ref, args[1])).forEach((r) => { r.revoked_at = null; }); return [];
  }
  if (s.startsWith('UPDATE tune_keys SET revoked_at = ? WHERE (order_ref = ? OR order_ref LIKE ?) AND revoked_at IS NULL')) {
    db.tune_keys.filter((r) => (r.order_ref === args[1] || like(r.order_ref, args[2])) && !r.revoked_at).forEach((r) => { r.revoked_at = args[0]; }); return [];
  }
  if (s.startsWith('SELECT hwid FROM tune_machines WHERE key = ? AND hwid = ?')) return db.tune_machines.filter((r) => r.key === args[0] && r.hwid === args[1]);
  if (s.startsWith('SELECT COUNT(*) AS count FROM tune_machines WHERE key = ?')) return [{ count: db.tune_machines.filter((r) => r.key === args[0]).length }];
  if (s.startsWith('INSERT INTO tune_machines (key, hwid, label, version, os, first_seen, last_seen)')) {
    const [key, hwid, label, version, os, first_seen, last_seen] = args; db.tune_machines.push({ key, hwid, label, version, os, first_seen, last_seen }); return [];
  }
  if (s.startsWith('UPDATE tune_machines SET last_seen = ?')) return [];
  if (s.startsWith('DELETE FROM tune_machines WHERE key = ?')) { db.tune_machines = db.tune_machines.filter((r) => r.key !== args[0]); return []; }
  if (s.startsWith('SELECT n, until FROM tune_hits WHERE bucket = ?')) return db.tune_hits.filter((h) => h.bucket === args[0]);
  if (s.startsWith('DELETE FROM tune_hits WHERE until < ?')) { db.tune_hits = db.tune_hits.filter((h) => h.until >= args[0]); return []; }
  if (s.startsWith('INSERT OR REPLACE INTO tune_hits (bucket, n, until) VALUES (?, ?, ?)')) {
    db.tune_hits = db.tune_hits.filter((h) => h.bucket !== args[0]); db.tune_hits.push({ bucket: args[0], n: args[1], until: args[2] }); return [];
  }
  if (s === 'SELECT product, amount_cents, order_ref, revoked_at, created_at, emailed_at, email FROM tune_keys') return db.tune_keys.map((r) => ({ product: r.product, amount_cents: r.amount_cents, order_ref: r.order_ref, revoked_at: r.revoked_at, created_at: r.created_at, emailed_at: r.emailed_at, email: r.email }));
  if (s === 'SELECT COUNT(*) AS count FROM tune_machines') return [{ count: db.tune_machines.length }];
  if (s.startsWith('UPDATE tune_keys SET refund_checked_at = ? WHERE order_ref = ? OR order_ref LIKE ?')) {
    db.tune_keys.filter((r) => r.order_ref === args[1] || like(r.order_ref, args[2])).forEach((r) => { r.refund_checked_at = args[0]; }); return [];
  }
  if (s.startsWith('SELECT DISTINCT order_ref FROM tune_keys WHERE revoked_at IS NULL AND created_at > ? AND (refund_checked_at IS NULL OR refund_checked_at < ?) LIMIT 40')) {
    const seen = new Set();
    return db.tune_keys.filter((r) => !r.revoked_at && r.created_at > args[0] && (!r.refund_checked_at || r.refund_checked_at < args[1]) && !seen.has(r.order_ref) && seen.add(r.order_ref)).slice(0, 40).map((r) => ({ order_ref: r.order_ref }));
  }
  throw new Error('the stand-in database does not model: ' + s);
}
// D1 lets a statement run bound or not; the stand-in does the same.
const bound = (sql, args) => ({
  first: async () => statement(sql, args)[0] ?? null,
  all: async () => ({ results: statement(sql, args) }),
  run: async () => { const r = statement(sql, args); return { success: true, meta: { changes: r.changes ?? 1 } }; },
});
export const DB = { prepare: (sql) => ({ bind: (...args) => bound(sql, args), ...bound(sql, []) }) };

/* ---------------- a stand-in network: Square, Resend, and Gmail's SMTP server ---------------- */
export const mails = [];
export const payments = {}; // order id -> { cents, email }
export const refunds = {}; // order id -> { paid, back }: what Square would say when asked about the order
/** Stand in for the network. Strict (the offline test) fails on any URL not modelled; otherwise the real fetch answers it. */
export function installFetch({ strict = true } = {}) {
  globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.resend.com/emails')) {
    const mail = JSON.parse(init.body);
    if (mail.to[0] === 'refuse@example.test') return new Response('{"statusCode":403,"message":"The omnidx.net domain is not verified"}', { status: 403 });
    mails.push({ ...mail, via: 'resend' }); return new Response('{"id":"m"}', { status: 200 });
  }
  let m = /\/v2\/orders\/([^/?]+)/.exec(u);
  if (m) {
    counters.squareLooks++;
    const f = refunds[decodeURIComponent(m[1])];
    if (!f) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ order: { id: m[1], state: 'COMPLETED', total_money: { amount: f.paid }, refunds: f.back ? [{ id: 'rf-' + m[1], status: 'COMPLETED', amount_money: { amount: f.back } }] : [] } }), { status: 200 });
  }
  m = /\/v2\/payments\/([^/?]+)/.exec(u);
  if (m) {
    const p = payments[decodeURIComponent(m[1])];
    if (!p) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ payment: { status: 'COMPLETED', amount_money: { amount: p.cents }, buyer_email_address: p.email, receipt_url: 'https://squareup.com/receipt/x', order_id: p.orderId || null, receipt_number: p.receipt || null } }), { status: 200 });
  }
  if (!strict) return realFetch(url, init);
  throw new Error('unexpected fetch ' + u);
  };
}

/*
 * Gmail, as the Worker sees it: a TLS socket to smtp.gmail.com. This one
 * speaks just enough SMTP to take a message, keeps what was sent, checks the
 * app password, and refuses one address so a refusal can be seen to come back.
 */
export function fakeConnect() {
  counters.smtpSessions++;
  let buf = ''; let rcpt = null; let data = null;
  const out = new TransformStream();
  const w = out.writable.getWriter();
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const say = (t) => { w.write(enc.encode(t + '\r\n')).catch(() => {}); };
  say('220 smtp.gmail.test ESMTP ready');
  const writable = new WritableStream({
    write(chunk) {
      buf += dec.decode(chunk);
      for (;;) {
        if (data !== null) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) break;
          const msg = buf.slice(0, end); buf = buf.slice(end + 5); data = null;
          const at = msg.indexOf('\r\n\r\n');
          const head = msg.slice(0, at); const body = msg.slice(at + 4);
          mails.push({ to: [rcpt], subject: (/^Subject: (.*)$/m.exec(head) || [])[1] || '', text: body.replace(/\r\n/g, '\n').replace(/^\.\./gm, '.'), head, via: 'gmail' });
          say('250 2.0.0 OK queued'); continue;
        }
        const nl = buf.indexOf('\r\n'); if (nl < 0) break;
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        if (/^EHLO /i.test(line)) say('250-smtp.gmail.test at your service\r\n250-SIZE 35882577\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME');
        else if (/^AUTH PLAIN /i.test(line)) { const c = atob(line.slice(11)).split('\u0000'); say(c[1] === 'owner@gmail.test' && c[2] === 'app-pass' ? '235 2.7.0 Accepted' : '535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 https://support.google.com/mail/?p=BadCredentials'); }
        else if (/^MAIL FROM:/i.test(line)) say('250 2.1.0 OK');
        else if (/^RCPT TO:/i.test(line)) { rcpt = (/<([^>]+)>/.exec(line) || [])[1]; say(rcpt === 'refuse@example.test' ? '550-5.1.1 The email account that you tried to reach does not exist.\r\n550 5.1.1 That address is not verified anywhere' : '250 2.1.5 OK'); }
        else if (/^DATA$/i.test(line)) { data = ''; say('354 Go ahead'); }
        else if (/^QUIT$/i.test(line)) say('221 2.0.0 closing connection');
        else say('500 5.5.1 Unrecognized command');
      }
    },
  });
  return { readable: out.readable, writable, close: async () => { w.abort().catch(() => {}); } };
}


/** The Worker's environment as the tests want it: Square on, a webhook key, the owner token, Gmail on through the fake socket. */
export function makeEnv(extra = {}) {
  return {
  DB, SQUARE_ACCESS_TOKEN: 'sq-test', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sig-test-key', TUNE_ADMIN_TOKEN: 'owner-token-test',
  SQUARE_WEBHOOK_URL: 'https://api.example.test/v1/webhooks/square', ALLOWED_ORIGINS: '', SUPPORT_EMAIL: 'owner@example.test',
  GMAIL_USER: 'owner@gmail.test', GMAIL_APP_PASSWORD: 'app-pass', __connect: fakeConnect,

    ...extra,
  };
}
