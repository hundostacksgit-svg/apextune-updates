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
  if (s.startsWith('SELECT * FROM tune_keys WHERE order_ref = ? OR order_ref LIKE ? OR (receipt IS NOT NULL AND receipt = ?)')) {
    return db.tune_keys.filter((r) => byOrder(r) || (r.receipt && r.receipt === args[2])).sort((a, b) => a.order_ref.localeCompare(b.order_ref));
  }
  if (s.startsWith('SELECT * FROM tune_keys WHERE key = ?')) return db.tune_keys.filter((r) => r.key === args[0]);
  if (s.startsWith('INSERT INTO tune_keys (key, product, seats, email, order_ref, receipt, provider, amount_cents, verified, created_at)')) {
    const [key, product, seats, email, order_ref, receipt, provider, amount_cents, verified, created_at] = args;
    if (db.tune_keys.some((r) => r.key === key || r.order_ref === order_ref)) throw new Error('UNIQUE constraint failed');
    db.tune_keys.push({ key, product, seats, email, order_ref, receipt, provider, amount_cents, verified, created_at, revoked_at: null, moved_at: null, emailed_at: null });
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
  throw new Error('the stand-in database does not model: ' + s);
}
// D1 lets a statement run bound or not; the stand-in does the same.
const bound = (sql, args) => ({
  first: async () => statement(sql, args)[0] ?? null,
  all: async () => ({ results: statement(sql, args) }),
  run: async () => { statement(sql, args); return { success: true }; },
});
const DB = { prepare: (sql) => ({ bind: (...args) => bound(sql, args), ...bound(sql, []) }) };

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
    return new Response(JSON.stringify({ payment: { status: 'COMPLETED', amount_money: { amount: p.cents }, buyer_email_address: p.email, receipt_url: 'https://squareup.com/receipt/x', order_id: p.orderId || null, receipt_number: p.receipt || null } }), { status: 200 });
  }
  throw new Error('unexpected fetch ' + u);
};

const env = {
  DB, SQUARE_ACCESS_TOKEN: 'sq-test', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sig-test-key', TUNE_ADMIN_TOKEN: 'owner-token-test',
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
const refund = async (refund) => {
  const raw = JSON.stringify({ type: 'refund.updated', data: { object: { refund } } });
  return call('/v1/webhooks/square', raw, { 'x-square-hmacsha256-signature': await sign(raw) });
};
const keyRe = /^TUNE-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const admin = (body) => call('/v1/tune/admin', { token: 'owner-token-test', ...body });

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

/* 4b. The redirect carries the payment id, the webhook the order id: one purchase, one set of keys. */
payments['PAY-DUAL-1'] = { cents: 3999, email: 'dual@example.test', orderId: 'ORDER-DUAL-1', receipt: 'zq7K' };
r = await call('/v1/tune/issue', { product: 'squad', order: 'PAY-DUAL-1' });
expect(r.status === 200 && (r.data.keys || []).length === 3, 'the key page, given the payment id, gets three keys');
const dualKeys = r.data.keys;
r = await webhook({ id: 'PAY-DUAL-1', order_id: 'ORDER-DUAL-1', status: 'COMPLETED', amount_money: { amount: 3999 }, buyer_email_address: 'dual@example.test', receipt_number: 'zq7K' });
expect(r.status === 200 && r.data.keys === 3 && db.tune_keys.filter((k) => k.order_ref.startsWith('ORDER-DUAL-1')).length === 3, 'the webhook for the same purchase mints nothing more');
expect(mails.some((m) => m.to[0] === 'dual@example.test' && /Receipt number: #ZQ7K/.test(m.text)), 'the key email carries the receipt number');
r = await admin({ action: 'lookup', ref: 'ORDER-DUAL-1' });
expect(r.status === 200 && r.data.receipt === 'ZQ7K', 'the owner page shows the receipt number on file');
r = await call('/v1/tune/issue', { product: 'squad', order: 'ORDER-DUAL-1' });
expect(r.status === 200 && JSON.stringify(r.data.keys) === JSON.stringify(dualKeys), 'the order id and the payment id land on the same keys');
r = await call('/v1/tune/issue', { product: 'squad', order: '#zq7k' });
expect(r.status === 403, 'the short receipt number alone is refused: it could be guessed');
r = await call('/v1/tune/issue', { product: 'squad', order: '#zq7k', email: 'somebody@else.test' });
expect(r.status === 403, 'the receipt number with the wrong email is refused');
r = await call('/v1/tune/issue', { product: 'squad', order: '#zq7k', email: 'Dual@Example.test' });
expect(r.status === 200 && JSON.stringify(r.data.keys) === JSON.stringify(dualKeys), 'the receipt number with the email paid with, in any case, gets the keys');
r = await call('/v1/tune/issue', { product: 'tune', order: 'nope', email: 'dual@example.test' });
expect(r.status === 404, 'a receipt number not on file says so without asking Square');
r = await call('/v1/tune/release', { key: dualKeys[1], order: 'ZQ7K' });
expect(r.status === 200 && r.data.ok, 'and the receipt number moves a key');

/* 4d. The webhook and the key page in the same instant: one order, one set of keys, both answered. */
payments['PAY-RACE-1'] = { cents: 3999, email: 'race@example.test', orderId: 'ORDER-RACE-1', receipt: 'RC01' };
const [ra, rb] = await Promise.all([
  call('/v1/tune/issue', { product: 'squad', order: 'PAY-RACE-1' }),
  webhook({ id: 'PAY-RACE-1', order_id: 'ORDER-RACE-1', status: 'COMPLETED', amount_money: { amount: 3999 }, buyer_email_address: 'race@example.test', receipt_number: 'RC01' }),
]);
expect(ra.status === 200 && rb.status === 200 && db.tune_keys.filter((k) => k.order_ref.startsWith('ORDER-RACE-1')).length === 3, `both callers are answered and the order has exactly three keys (${ra.status}, ${rb.status})`);
r = await call('/v1/tune/issue', { product: 'squad', order: 'ORDER-RACE-1' });
expect(r.status === 200 && JSON.stringify(r.data.keys) === JSON.stringify(ra.data.keys), 'and the key page gets the same three keys the webhook stored');

/* 4c. Two orders with the same short receipt number: the number alone answers nothing. */
r = await webhook({ id: 'PAY-TWIN-1', order_id: 'ORDER-TWIN-1', status: 'COMPLETED', amount_money: { amount: 1999 }, buyer_email_address: 'a@example.test', receipt_number: 'TW1N' });
r = await webhook({ id: 'PAY-TWIN-2', order_id: 'ORDER-TWIN-2', status: 'COMPLETED', amount_money: { amount: 1999 }, buyer_email_address: 'b@example.test', receipt_number: 'TW1N' });
r = await call('/v1/tune/issue', { product: 'tune', order: 'TW1N', email: 'a@example.test' });
expect(r.status === 409, 'a receipt number shared by two orders is refused even with a matching email, so nobody gets another buyer\'s key');
r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TWIN-2' });
expect(r.status === 200 && (r.data.keys || []).length === 1, 'while the order id still answers');
r = await call('/v1/tune/admin', { token: 'owner-token-test', action: 'lookup', ref: 'TW1N' });
expect(r.status === 409, 'and the owner page says the same');

/* 5. Refusals. */
const n0 = db.tune_keys.length;
r = await webhook({ id: 'pay9', order_id: 'ORDER-FORGED-1', status: 'COMPLETED', amount_money: { amount: 3999 } }, 'wrong-key');
expect(r.status === 400 && db.tune_keys.length === n0, 'a webhook with a bad signature is refused and mints nothing');
r = await webhook({ id: 'pay5', order_id: 'ORDER-CHEAP-1', status: 'COMPLETED', amount_money: { amount: 500 } });
expect(r.status === 200 && r.data.ignored && db.tune_keys.length === n0, 'a payment below the price is ignored');
r = await webhook({ id: 'pay6', order_id: 'ORDER-PENDING-1', status: 'PENDING', amount_money: { amount: 1999 } });
expect(r.status === 200 && r.data.ignored && db.tune_keys.length === n0, 'a payment that has not completed is ignored');
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

/* 8. Refunds switch keys off; a partial refund does not. */
const mailsBefore = mails.length;
r = await refund({ id: 'rf1', order_id: 'ORDER-SQUAD-1', status: 'COMPLETED', amount_money: { amount: 3999 } });
expect(r.status === 200 && r.data.revoked === 3, `a full refund of the Squad order revokes all three keys (${JSON.stringify(r.data)})`);
expect(mails.length === mailsBefore + 1 && /no longer work/.test(mails[mails.length - 1].text), 'and the buyer is told');
r = await call('/v1/tune/claim', { key: squadKeys[0], hwid: hw(1) });
expect(r.status === 410, 'a refunded key is refused even on the PC it was on');
r = await call('/v1/tune/issue', { product: 'squad', order: 'ORDER-SQUAD-1' });
expect(r.status === 410, 'the key page says the order was refunded');
r = await refund({ id: 'rf1', order_id: 'ORDER-SQUAD-1', status: 'COMPLETED', amount_money: { amount: 3999 } });
expect(r.status === 200 && r.data.revoked === 0 && mails.length === mailsBefore + 1, 'the same refund again does nothing more');
r = await refund({ id: 'rf2', order_id: 'ORDER-TUNE-1', status: 'COMPLETED', amount_money: { amount: 500 } });
expect(r.status === 200 && r.data.partial === true, 'a partial refund is left to support');
r = await call('/v1/tune/check', { key: (await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1' })).data.key });
expect(r.status === 200 && r.data.ok === true, 'and that key still works');
r = await refund({ id: 'rf3', order_id: 'ORDER-TUNE-1', status: 'PENDING', amount_money: { amount: 1999 } });
expect(r.status === 200 && r.data.ignored, 'a refund still pending changes nothing yet');

/* 9. The owner, from a phone. */
r = await call('/v1/tune/admin', { token: 'nope', action: 'lookup', ref: 'ORDER-TUNE-1' });
expect(r.status === 403, 'the owner page needs the right token');
r = await admin({ action: 'lookup', ref: 'ORDER-SQUAD-1' });
expect(r.status === 200 && r.data.keys.length === 3 && r.data.keys.every((k) => k.revoked) && r.data.email === 'buyer@example.test', 'lookup by order shows the three keys, revoked, and the email on file');
r = await admin({ action: 'lookup', ref: squadKeys[2] });
expect(r.status === 200 && r.data.order === 'ORDER-SQUAD-1' && r.data.keys.length === 3, 'lookup by one key finds the whole order');
r = await admin({ action: 'restore', ref: 'ORDER-SQUAD-1' });
expect(r.status === 200 && r.data.keys.every((k) => !k.revoked), 'switching the order back on');
r = await call('/v1/tune/claim', { key: squadKeys[0], hwid: hw(1) });
expect(r.status === 200 && r.data.ok, 'and the key works again on its PC');
const before = mails.length;
r = await admin({ action: 'resend', ref: 'ORDER-SQUAD-1', email: 'new@example.test' });
expect(r.status === 200 && r.data.ok && r.data.sentTo === 'new@example.test' && mails.length === before + 1 && mails[before].to[0] === 'new@example.test' && r.data.email === 'new@example.test', 'sending the keys again to a new address updates the address on file');
r = await admin({ action: 'release', ref: squadKeys[0] });
expect(r.status === 200 && r.data.released === squadKeys[0] && r.data.keys[0].pcs === 0, 'the owner frees one key from its PC');
r = await call('/v1/tune/release', { key: squadKeys[0], order: 'ORDER-SQUAD-1' });
expect(r.status === 200, 'and that did not spend the buyer\'s own monthly move');
r = await admin({ action: 'revoke', ref: 'ORDER-SQUAD-1' });
expect(r.status === 200 && r.data.keys.every((k) => k.revoked), 'the owner switches the order off');
r = await admin({ action: 'lookup', ref: 'ORDER-NOPE-9' });
expect(r.status === 404, 'an unknown order says so');
r = await admin({ action: 'recent' });
expect(r.status === 200 && r.data.orders.some((o) => o.order === 'ORDER-DUAL-1' && o.keys === 3) && r.data.orders.some((o) => o.order === 'ORDER-TUNE-1' && o.keys === 1), 'recent orders lists what sold, grouped by order');
r = await admin({ action: 'restore', ref: 'ORDER-DUAL-1' });
r = await admin({ action: 'revoke-key', ref: dualKeys[1] });
expect(r.status === 200 && r.data.revokedKey === dualKeys[1] && r.data.keys.filter((k) => k.revoked).length === 1, 'one key of a Squad order is switched off, the other two stay on');
r = await admin({ action: 'revoke-key', ref: 'ORDER-DUAL-1' });
expect(r.status === 400, 'switching off one key needs the key, not the order');
r = await call('/v1/tune/admin', { token: 'owner-token-test', action: 'lookup', ref: 'ORDER-TUNE-1' });
delete env.TUNE_ADMIN_TOKEN;
r = await call('/v1/tune/admin', { token: 'owner-token-test', action: 'lookup', ref: 'ORDER-TUNE-1' });
expect(r.status === 503, 'with no token set on the server the owner page is shut');

console.log(failed ? `${failed} problem(s)` : 'all good');
process.exit(failed ? 1 : 0);
