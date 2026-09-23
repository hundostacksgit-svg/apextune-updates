/*
 * The licence server's money path, offline.
 *
 * Runs server/worker.js in Node with a stand-in D1 and a stand-in network:
 * Square's webhook for a Squad payment must mint three keys and send one
 * email; sent again it must mint nothing and send nothing; the key page's
 * request for the same order must get the same three keys; a one-PC order
 * gets one; a bad signature is refused; each key locks to one PC and a
 * second PC on it is refused; a payment below the price is ignored; a
 * Squad key moves with the plain order number. Anything the Worker asks the
 * database that this file does not model fails the run, on purpose.
 *
 *   node tools/worker-test.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(path.join(root, 'server/worker.js'))).default;

let failed = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { failed++; console.log('  FAIL ' + m); };
const expect = (cond, m) => (cond ? ok(m) : bad(m));

/* ---------------- a stand-in D1: the statements the tune routes use ---------------- */
const db = { tune_keys: [], tune_machines: [] };
const like = (v, pat) => pat.endsWith('%') && String(v || '').startsWith(pat.slice(0, -1));
function statement(sql, args) {
  const s = sql.replace(/\s+/g, ' ').trim();
  const byOrder = (r) => r.order_ref === args[0] || like(r.order_ref, args[1]);
  if (s.startsWith('SELECT * FROM tune_keys WHERE order_ref = ? OR order_ref LIKE ?')) {
    return db.tune_keys.filter(byOrder).sort((a, b) => a.order_ref.localeCompare(b.order_ref));
  }
  if (s.startsWith('SELECT * FROM tune_keys WHERE key = ?')) return db.tune_keys.filter((r) => r.key === args[0]);
  if (s.startsWith('INSERT INTO tune_keys (key, product, seats, email, order_ref, provider, amount_cents, verified, created_at)')) {
    const [key, product, seats, email, order_ref, provider, amount_cents, verified, created_at] = args;
    if (db.tune_keys.some((r) => r.key === key || r.order_ref === order_ref)) throw new Error('UNIQUE constraint failed');
    db.tune_keys.push({ key, product, seats, email, order_ref, provider, amount_cents, verified, created_at, revoked_at: null, moved_at: null, emailed_at: null });
    return [];
  }
  if (s.startsWith('UPDATE tune_keys SET emailed_at = ? WHERE order_ref = ? OR order_ref LIKE ?')) {
    db.tune_keys.filter((r) => r.order_ref === args[1] || like(r.order_ref, args[2])).forEach((r) => { r.emailed_at = args[0]; }); return [];
  }
  if (s.startsWith('UPDATE tune_keys SET email = ? WHERE order_ref = ? OR order_ref LIKE ?')) {
    db.tune_keys.filter((r) => r.order_ref === args[1] || like(r.order_ref, args[2])).forEach((r) => { r.email = args[0]; }); return [];
  }
  if (s.startsWith('UPDATE tune_keys SET moved_at = ? WHERE key = ?')) { db.tune_keys.filter((r) => r.key === args[1]).forEach((r) => { r.moved_at = args[0]; }); return []; }
  if (s.startsWith('SELECT hwid FROM tune_machines WHERE key = ? AND hwid = ?')) return db.tune_machines.filter((r) => r.key === args[0] && r.hwid === args[1]);
  if (s.startsWith('SELECT COUNT(*) AS count FROM tune_machines WHERE key = ?')) return [{ count: db.tune_machines.filter((r) => r.key === args[0]).length }];
  if (s.startsWith('INSERT INTO tune_machines (key, hwid, label, version, os, first_seen, last_seen)')) {
    const [key, hwid, label, version, os, first_seen, last_seen] = args; db.tune_machines.push({ key, hwid, label, version, os, first_seen, last_seen }); return [];
  }
  if (s.startsWith('UPDATE tune_machines SET last_seen = ?')) return [];
  if (s.startsWith('DELETE FROM tune_machines WHERE key = ?')) { db.tune_machines = db.tune_machines.filter((r) => r.key !== args[0]); return []; }
  throw new Error('the stand-in database does not model: ' + s);
}
const DB = {
  prepare: (sql) => ({
    bind: (...args) => ({
      first: async () => statement(sql, args)[0] ?? null,
      all: async () => ({ results: statement(sql, args) }),
      run: async () => { statement(sql, args); return { success: true }; },
    }),
  }),
};

/* ---------------- a stand-in network: Square and Resend ---------------- */
const mails = [];
const payments = {}; // order id -> { cents, email }
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.resend.com/emails')) { mails.push(JSON.parse(init.body)); return new Response('{"id":"m"}', { status: 200 }); }
  let m = /\/v2\/orders\/([^/?]+)/.exec(u);
  if (m) return new Response('{}', { status: 404 });
  m = /\/v2\/payments\/([^/?]+)/.exec(u);
  if (m) {
    const p = payments[decodeURIComponent(m[1])];
    if (!p) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ payment: { status: 'COMPLETED', amount_money: { amount: p.cents }, buyer_email_address: p.email, receipt_url: 'https://squareup.com/receipt/x' } }), { status: 200 });
  }
  throw new Error('unexpected fetch ' + u);
};

const env = {
  DB, SQUARE_ACCESS_TOKEN: 'sq-test', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sig-test-key',
  SQUARE_WEBHOOK_URL: 'https://api.example.test/v1/webhooks/square', RESEND_API_KEY: 'rs-test', ALLOWED_ORIGINS: '',
};
const enc = new TextEncoder();
async function sign(body, key = env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, enc.encode(env.SQUARE_WEBHOOK_URL + body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}
async function call(pathname, body, headers = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const r = await worker.fetch(new Request('https://api.example.test' + pathname, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw }), env);
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const webhook = async (payment, key) => {
  const raw = JSON.stringify({ type: 'payment.updated', data: { object: { payment } } });
  return call('/v1/webhooks/square', raw, { 'x-square-hmacsha256-signature': await sign(raw, key) });
};
const keyRe = /^TUNE-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

console.log('The licence server, offline');

/* 1. A Squad payment arrives by webhook: three keys, one email. */
let r = await webhook({ id: 'pay1', order_id: 'ORDER-SQUAD-1', status: 'COMPLETED', amount_money: { amount: 3999 }, buyer_email_address: 'buyer@example.test', receipt_url: 'https://squareup.com/receipt/1' });
expect(r.status === 200 && r.data.keys === 3 && r.data.emailed === true && r.data.product === 'squad', `a $39.99 webhook mints three keys and emails them (${r.status} ${JSON.stringify(r.data)})`);
expect(mails.length === 1 && mails[0].to[0] === 'buyer@example.test' && (mails[0].text.match(/TUNE-/g) || []).length >= 3, 'one email, to the checkout address, carrying all three keys');
expect(db.tune_keys.filter((k) => k.order_ref.startsWith('ORDER-SQUAD-1')).length === 3, 'three rows share the order reference');

/* 2. Square retries: nothing new. */
r = await webhook({ id: 'pay1', order_id: 'ORDER-SQUAD-1', status: 'COMPLETED', amount_money: { amount: 3999 }, buyer_email_address: 'buyer@example.test' });
expect(r.status === 200 && db.tune_keys.length === 3 && mails.length === 1, 'the same webhook again mints nothing and sends nothing');

/* 3. The key page asks for the same order. */
r = await call('/v1/tune/issue', { product: 'squad', order: 'ORDER-SQUAD-1' });
const squadKeys = r.data.keys || [];
expect(r.status === 200 && squadKeys.length === 3 && squadKeys.every((k) => keyRe.test(k)) && r.data.emailed === true, 'the key page gets the same three keys back');
expect(new Set(squadKeys).size === 3, 'the three keys differ');

/* 4. A one-PC order the webhook has not reached yet: the page confirms with Square and emails. */
payments['ORDER-TUNE-1'] = { cents: 1999, email: 'solo@example.test' };
r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1' });
expect(r.status === 200 && (r.data.keys || []).length === 1 && keyRe.test(r.data.key) && r.data.product === 'tune', `a $19.99 order from the key page gets one key (${r.status})`);
expect(mails.length === 2 && mails[1].to[0] === 'solo@example.test', 'and it is emailed to the address Square holds');
r = await call('/v1/tune/issue', { product: 'squad', order: 'ORDER-TUNE-1' });
expect(r.status === 200 && (r.data.keys || []).length === 1 && r.data.product === 'tune', 'asking for Squad on a $19.99 order still gets one key');

/* 5. Refusals. */
r = await webhook({ id: 'pay9', order_id: 'ORDER-FORGED-1', status: 'COMPLETED', amount_money: { amount: 3999 } }, 'wrong-key');
expect(r.status === 400 && db.tune_keys.length === 4, 'a webhook with a bad signature is refused and mints nothing');
r = await webhook({ id: 'pay5', order_id: 'ORDER-CHEAP-1', status: 'COMPLETED', amount_money: { amount: 500 } });
expect(r.status === 200 && r.data.ignored && db.tune_keys.length === 4, 'a payment below the price is ignored');
r = await webhook({ id: 'pay6', order_id: 'ORDER-PENDING-1', status: 'PENDING', amount_money: { amount: 1999 } });
expect(r.status === 200 && r.data.ignored && db.tune_keys.length === 4, 'a payment that has not completed is ignored');
r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-NOPE-1' });
expect(r.status === 402, 'an order Square does not know gets no key');

/* 6. Each key locks to one PC. */
const hw = (n) => n.toString(16).padStart(16, 'a');
for (const [i, k] of squadKeys.entries()) {
  r = await call('/v1/tune/claim', { key: k, hwid: hw(i + 1), machine: { name: 'PC' + i } });
  expect(r.status === 200 && r.data.ok && r.data.used === 1 && r.data.seats === 1, `Squad key ${i + 1} locks to its PC`);
}
r = await call('/v1/tune/claim', { key: squadKeys[0], hwid: hw(1) });
expect(r.status === 200 && r.data.used === 1, 'the same PC claiming again is fine');
r = await call('/v1/tune/claim', { key: squadKeys[0], hwid: hw(9) });
expect(r.status === 409, 'a second PC on a Squad key is refused');
r = await call('/v1/tune/check', { key: squadKeys[2] });
expect(r.status === 200 && r.data.ok && r.data.used === 1, 'check reports one PC on key 3');

/* 7. Moving a Squad key with the plain order number. */
r = await call('/v1/tune/release', { key: squadKeys[1], order: 'ORDER-SQUAD-1' });
expect(r.status === 200 && r.data.released === 1, 'key 2 of a Squad order moves with the order number from the receipt');
r = await call('/v1/tune/release', { key: squadKeys[1], order: 'ORDER-SQUAD-1' });
expect(r.status === 429, 'and cannot move again the same month');
r = await call('/v1/tune/release', { key: squadKeys[2], order: 'ORDER-OTHER-1' });
expect(r.status === 403, 'a wrong order number does not move a key');

console.log(failed ? `${failed} problem(s)` : 'all good');
process.exit(failed ? 1 : 0);
