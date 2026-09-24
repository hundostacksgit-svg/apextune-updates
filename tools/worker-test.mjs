/*
 * The licence server's money path, offline.
 *
 * Runs server/worker.js in Node with a stand-in D1 and a stand-in network:
 * Square's webhook for a Squad payment must mint three keys and send one
 * email; sent again it must mint nothing and send nothing; the key page's
 * request for the same order must get the same three keys; a one-PC order
 * gets one; a bad signature is refused; each key locks to one PC and a
 * second PC on it is refused; a payment below the price is ignored; a
 * Squad key moves with the plain order number; guessing receipt numbers, keys
 * or the owner token is shut off after a handful of tries. Anything the Worker asks the
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

import { db, mails, payments, refunds, counters, fakeConnect, DB, installFetch, makeEnv } from './worker-standin.mjs';
installFetch({ strict: true });
const env = makeEnv();
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
{
  const n = mails.length;
  r = await refund({ id: 'rf2', order_id: 'ORDER-TUNE-1', status: 'COMPLETED', amount_money: { amount: 500 } });
  expect(r.status === 200 && r.data.partial === true && r.data.told === true && mails.length === n + 1 && mails[n].to[0] === 'owner@example.test' && /\$5\.00 of the \$19\.99/.test(mails[n].text) && /ORDER-TUNE-1/.test(mails[n].subject), 'a partial refund changes nothing and tells the owner once, with the amounts and the order');
  r = await refund({ id: 'rf2', order_id: 'ORDER-TUNE-1', status: 'COMPLETED', amount_money: { amount: 500 } });
  expect(r.status === 200 && r.data.partial === true && r.data.told === false && mails.length === n + 1, 'the same partial refund again tells nobody twice');
}
r = await call('/v1/tune/check', { key: (await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1' })).data.key });
expect(r.status === 200 && r.data.ok === true, 'and that key still works');
r = await refund({ id: 'rf3', order_id: 'ORDER-TUNE-1', status: 'PENDING', amount_money: { amount: 1999 } });
expect(r.status === 200 && r.data.ignored, 'a refund still pending changes nothing yet');

/* 8b. The keys again, from the key page: to the address on file only, ten minutes apart. */
{
  const n = mails.length;
  r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1', resend: true });
  expect(r.status === 200 && r.data.resent === false && /ten minutes/.test(r.data.reason) && mails.length === n, 'asked within ten minutes of the last send, nothing goes and the page is told why');
  db.tune_keys.filter((k) => k.order_ref === 'ORDER-TUNE-1').forEach((k) => { k.emailed_at = Date.now() - 11 * 60_000; });
  r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1', resend: true, email: 'someone-else@example.test' });
  expect(r.status === 200 && r.data.resent === true && r.data.sentTo === 's***@example.test' && mails.length === n + 1 && mails[n].to[0] === 'solo@example.test' && r.data.key, 'after ten minutes the keys go again, to the address on file and never to one typed in, and the answer masks it');
  expect(db.tune_keys.find((k) => k.order_ref === 'ORDER-TUNE-1').emailed_at > Date.now() - 5000, 'and the send is recorded');
  db.tune_keys.filter((k) => k.order_ref === 'ORDER-TUNE-1').forEach((k) => { k.emailed_at = Date.now() - 11 * 60_000; });
  delete env.GMAIL_USER;
  r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1', resend: true });
  expect(r.status === 503 && /not switched on/.test(r.data.error), 'with mail off the page is told to save the keys');
  env.GMAIL_USER = 'owner@gmail.test';
  r = await call('/v1/tune/issue', { product: 'squad', order: 'ORDER-SQUAD-1', resend: true });
  expect(r.status === 410, 'a refunded order gets no mail');
}

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
{
  const plain = (o) => String(o).replace(/#\d+$/, '');
  const orders = [...new Set(db.tune_keys.map((k) => plain(k.order_ref)))];
  const off = orders.filter((o) => db.tune_keys.filter((k) => plain(k.order_ref) === o).every((k) => k.revoked_at));
  const cents = (list) => list.reduce((sum, o) => sum + (db.tune_keys.find((k) => plain(k.order_ref) === o).amount_cents || 0), 0);
  const t = r.data.totals;
  expect(t && t.orders === orders.length && t.refundedOrders === off.length && t.paidCents === cents(orders.filter((o) => !off.includes(o))) && t.refundedCents === cents(off) && t.keys === db.tune_keys.length, `the totals count each order once: ${orders.length} orders, ${off.length} refunded, $${(t.paidCents / 100).toFixed(2)} kept`);
}
r = await admin({ action: 'restore', ref: 'ORDER-DUAL-1' });
r = await admin({ action: 'revoke-key', ref: dualKeys[1] });
expect(r.status === 200 && r.data.revokedKey === dualKeys[1] && r.data.keys.filter((k) => k.revoked).length === 1, 'one key of a Squad order is switched off, the other two stay on');
r = await admin({ action: 'revoke-key', ref: 'ORDER-DUAL-1' });
expect(r.status === 400, 'switching off one key needs the key, not the order');
/* 10. Guessing is not a way in: a handful of tries per connection, then that connection waits ten minutes. */
const from = (ip) => ({ 'cf-connecting-ip': ip });
let last;
for (let i = 0; i < 20; i++) last = await call('/v1/tune/issue', { product: 'tune', order: 'AB' + String(10 + i), email: 'guess@example.test' }, from('203.0.113.7'));
expect(last.status === 404, 'twenty wrong receipt numbers from one connection each get the ordinary answer');
r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1' }, from('203.0.113.7'));
expect(r.status === 429 && /Too many tries/.test(r.data.error), 'the twenty-first try from that connection is refused, even for a real order');
r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1' }, from('203.0.113.8'));
expect(r.status === 200 && r.data.key, 'another connection is served as usual');
db.tune_hits.forEach((h) => { if (h.bucket.endsWith(':203.0.113.7')) h.until = 1; });
r = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-TUNE-1' }, from('203.0.113.7'));
expect(r.status === 200 && db.tune_hits.every((h) => h.until > 1), 'ten minutes later that connection is served again and the stale row is gone');
for (let i = 0; i < 10; i++) last = await call('/v1/tune/admin', { token: 'guess-' + i, action: 'recent' }, from('203.0.113.9'));
expect(last.status === 403, 'ten wrong owner tokens from one connection each get "wrong token"');
r = await call('/v1/tune/admin', { token: 'owner-token-test', action: 'recent' }, from('203.0.113.9'));
expect(r.status === 429, 'the eleventh try from that connection is refused even with the right token');
r = await admin({ action: 'recent' });
expect(r.status === 200, 'the owner on another connection is served: right tokens were never counted');
r = await call('/v1/tune/claim', { key: 'TUNE-AAAA-AAAA-AAAA-AAAA', hwid: hw(1) }, from('203.0.113.10'));
for (let i = 0; i < 40; i++) last = await call('/v1/tune/claim', { key: 'TUNE-AAAA-AAAA-AAAA-AAAA', hwid: hw(1) }, from('203.0.113.10'));
expect(last.status === 429, 'forty-one made-up keys from one connection and the door shuts there too');
for (let i = 0; i < 11; i++) last = await call('/v1/tune/release', { key: 'TUNE-AAAA-AAAA-AAAA-AAAA', order: 'ORDER-X' }, from('203.0.113.11'));
expect(last.status === 429, 'the eleventh move attempt from one connection is refused');
for (let i = 0; i < 61; i++) last = await call('/v1/tune/check', { key: 'TUNE-AAAA-AAAA-AAAA-AAAA' }, from('203.0.113.12'));
expect(last.status === 429 && last.data.ok === false && /Too many tries/.test(last.data.reason), 'the sixty-first key check from one connection is refused, in the shape the script reads');

/* 10b. The orders whose keys never went out, sent in one press. */
{
  const n = mails.length;
  r = await admin({ action: 'resend-unsent' });
  expect(r.status === 200 && r.data.orders === 0 && r.data.sent.length === 0 && mails.length === n, 'with every order emailed there is nothing to send');
  db.tune_keys.filter((k) => k.order_ref.startsWith('ORDER-DUAL-1')).forEach((k) => { k.emailed_at = null; });
  db.tune_keys.filter((k) => k.order_ref === 'ORDER-TUNE-1').forEach((k) => { k.emailed_at = null; k.email = 'refuse@example.test'; });
  r = await admin({ action: 'resend-unsent' });
  const dual = db.tune_keys.filter((k) => k.order_ref.startsWith('ORDER-DUAL-1'));
  expect(r.status === 200 && r.data.orders === 2 && r.data.sent.length === 1 && r.data.sent[0].order === 'ORDER-DUAL-1' && r.data.failed.length === 1 && r.data.failed[0].order === 'ORDER-TUNE-1' && mails.length === n + 1 && (mails[n].text.match(/TUNE-/g) || []).length >= dual.filter((k) => !k.revoked_at).length && dual.every((k) => k.emailed_at), 'two orders unsent: one goes out with its live keys and is recorded, the one Resend refuses is listed as failed');
  db.tune_keys.filter((k) => k.order_ref === 'ORDER-TUNE-1').forEach((k) => { k.emailed_at = Date.now(); k.email = 'solo@example.test'; });
}

/* 11. Does mail work, from the owner page. */
let n = mails.length;
r = await admin({ action: 'mail-test' });
expect(r.status === 200 && r.data.sentTo === 'owner@example.test' && mails.length === n + 1 && mails[n].to[0] === 'owner@example.test' && /mail works/.test(mails[n].subject), 'a test email goes to the support address');
r = await admin({ action: 'mail-test', email: 'me@example.test' });
expect(r.status === 200 && r.data.sentTo === 'me@example.test' && mails[mails.length - 1].to[0] === 'me@example.test', 'or to an address typed in');
r = await admin({ action: 'mail-test', email: 'refuse@example.test' });
expect(r.status === 502 && /not verified/.test(r.data.error), 'and the mail server\'s refusal comes back in its own words');
expect(mails[mails.length - 1].via === 'gmail' && /^From: OmniDx Tune <owner@gmail.test>$/m.test(mails[mails.length - 1].head) && /^Reply-To: <owner@example.test>$/m.test(mails[mails.length - 1].head), 'the mail left through Gmail, from the owner\'s own address, with the support address as the reply-to');
{
  const saved = env.GMAIL_APP_PASSWORD; env.GMAIL_APP_PASSWORD = 'wrong';
  r = await admin({ action: 'mail-test' });
  expect(r.status === 502 && /Password not accepted/.test(r.data.error), 'a wrong app password comes back as Gmail\'s own refusal');
  env.GMAIL_APP_PASSWORD = saved;
  delete env.GMAIL_USER; env.RESEND_API_KEY = 'rs-test';
  const n2 = mails.length;
  r = await admin({ action: 'mail-test' });
  expect(r.status === 200 && mails.length === n2 + 1 && mails[n2].via === 'resend', 'with Resend configured instead, the same mail goes through Resend');
  delete env.RESEND_API_KEY; env.GMAIL_USER = 'owner@gmail.test';
}
delete env.GMAIL_USER;
r = await admin({ action: 'mail-test' });
expect(r.status === 503 && /Mail is off/.test(r.data.error), 'with no mailer the answer says so');
env.RESEND_API_KEY = 'rs-test';

env.GMAIL_USER = 'owner@gmail.test';

/* 12. The week, as one email: Monday's cron, and the owner page on demand. */
{
  const n = mails.length;
  const jobs = [];
  await worker.scheduled({ cron: '0 13 * * 1', scheduledTime: Date.now() }, env, { waitUntil: (p) => jobs.push(p) });
  await Promise.all(jobs);
  const orders = new Set(db.tune_keys.map((k) => String(k.order_ref).replace(/#\d+$/, ''))).size;
  expect(mails.length === n + 1 && mails[n].to[0] === 'owner@example.test' && /Last seven days: \d+ orders? \(/.test(mails[n].text) && new RegExp(`Since the first sale: ${orders} orders`).test(mails[n].text) && new RegExp(`on ${db.tune_machines.length} PCs?`).test(mails[n].text), 'Monday\'s cron emails the owner the week and the totals since the first sale');
  r = await admin({ action: 'summary' });
  expect(r.status === 200 && r.data.sentTo === 'owner@example.test' && r.data.all.orders === orders && r.data.week.orders === orders && r.data.pcs === db.tune_machines.length && mails.length === n + 2, 'the owner page sends the same email on demand and answers with the figures');
  const saved = env.SUPPORT_EMAIL; delete env.SUPPORT_EMAIL;
  r = await admin({ action: 'summary' });
  expect(r.status === 503 && /SUPPORT_EMAIL/.test(r.data.error), 'without a support address the answer says so');
  env.SUPPORT_EMAIL = saved;
}

/* 13. No webhook: Square is asked about refunds at the key page, the claim, the check, and on the hour. */
{
  const solo = db.tune_keys.find((k) => k.order_ref === 'ORDER-TUNE-1');
  const order = 'ORDER-TUNE-1';
  const rowsOf = () => db.tune_keys.filter((k) => String(k.order_ref).replace(/#\d+$/, '') === order);
  rowsOf().forEach((k) => { k.revoked_at = null; k.refund_checked_at = null; k.email = 'solo@example.test'; });
  const pretty = (k) => { const tag = k.startsWith('SQUAD') ? 'SQUAD' : 'TUNE'; const t = k.slice(tag.length); return `${tag}-${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}`; };
  const mine = db.tune_machines.find((m) => m.key === solo.key);
  const hwid = mine ? mine.hwid : 'a'.repeat(32);
  let looks = counters.squareLooks;
  r = await call('/v1/tune/claim', { key: pretty(solo.key), hwid });
  expect(r.status === 200 && counters.squareLooks === looks + 1 && rowsOf().every((k) => k.refund_checked_at), 'a claim asks Square about the order once, and notes when');
  r = await call('/v1/tune/claim', { key: pretty(solo.key), hwid });
  expect(r.status === 200 && counters.squareLooks === looks + 1, 'a second claim within the hour does not ask again');
  rowsOf().forEach((k) => { k.refund_checked_at = Date.now() - 2 * 3600_000; });
  refunds[order] = { paid: solo.amount_cents, back: 500 };
  let n = mails.length;
  r = await call('/v1/tune/claim', { key: pretty(solo.key), hwid });
  expect(r.status === 200 && rowsOf().every((k) => !k.revoked_at) && mails.length === n + 1 && mails[n].to[0] === 'owner@example.test' && /partial refund/.test(mails[n].subject), 'a partial refund Square reports leaves the key on and tells the owner once');
  rowsOf().forEach((k) => { k.refund_checked_at = Date.now() - 2 * 3600_000; });
  r = await call('/v1/tune/claim', { key: pretty(solo.key), hwid });
  expect(r.status === 200 && mails.length === n + 1, 'and the same partial refund is not reported twice');
  refunds[order] = { paid: solo.amount_cents, back: solo.amount_cents };
  rowsOf().forEach((k) => { k.refund_checked_at = Date.now() - 2 * 3600_000; });
  n = mails.length;
  r = await call('/v1/tune/claim', { key: pretty(solo.key), hwid });
  expect(r.status === 410 && rowsOf().every((k) => k.revoked_at) && mails.length === n + 1 && mails[n].to[0] === 'solo@example.test' && /no longer work/.test(mails[n].text), 'a full refund Square reports switches the key off at the next claim, and the buyer is told');
  db.tune_hits = []; // the scenarios above spent this connection's tries
  r = await call('/v1/tune/issue', { order });
  expect(r.status === 410, 'the key page says the order was refunded');
  // The hourly cron: a refunded order nobody has asked about since goes off on its own.
  const other = db.tune_keys.find((k) => !k.revoked_at && String(k.order_ref).replace(/#\d+$/, '') !== order);
  const o2 = String(other.order_ref).replace(/#\d+$/, '');
  db.tune_keys.filter((k) => String(k.order_ref).replace(/#\d+$/, '') === o2).forEach((k) => { k.refund_checked_at = null; k.created_at = Date.now() - 86400_000; });
  refunds[o2] = { paid: other.amount_cents, back: other.amount_cents };
  const jobs = [];
  await worker.scheduled({ cron: '0 * * * *', scheduledTime: Date.now() }, env, { waitUntil: (p) => jobs.push(p) });
  const swept = await Promise.all(jobs);
  expect(swept[0] && swept[0].revoked >= 1 && db.tune_keys.filter((k) => String(k.order_ref).replace(/#\d+$/, '') === o2).every((k) => k.revoked_at), 'the hourly cron finds a refund on an order nobody asked about and switches its keys off');
  r = await call('/v1/tune/check', { key: pretty(other.key) });
  expect(r.status === 200 && r.data.ok === false && /refunded/.test(r.data.reason), 'and a check of that key says refunded');
  const h = await (await worker.fetch(new Request('https://api.example.test/v1/health'), env)).json();
  expect(h.mail === true && h.mailer === 'gmail' && h.refunds === 'webhook', 'the health line names the mailer and how refunds arrive');
  const savedSig = env.SQUARE_WEBHOOK_SIGNATURE_KEY; delete env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const h2 = await (await worker.fetch(new Request('https://api.example.test/v1/health'), env)).json();
  expect(h2.refunds === 'hourly' && h2.squareWebhook === false, 'without a webhook it says refunds are checked hourly');
  env.SQUARE_WEBHOOK_SIGNATURE_KEY = savedSig;
}

r = await call('/v1/tune/admin', { token: 'owner-token-test', action: 'lookup', ref: 'ORDER-TUNE-1' });
delete env.TUNE_ADMIN_TOKEN;
r = await call('/v1/tune/admin', { token: 'owner-token-test', action: 'lookup', ref: 'ORDER-TUNE-1' });
expect(r.status === 503, 'with no token set on the server the owner page is shut');

console.log(failed ? `${failed} problem(s)` : 'all good');
process.exit(failed ? 1 : 0);
