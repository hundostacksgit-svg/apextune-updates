/*
 * The page Square sends people to after they pay.
 *
 * This is the whole "how do I get what I bought" story now. There is no key to
 * wait for, no email to watch, nobody to chase. Payment lands here, the app
 * unlocks, and the next tap is the editor.
 *
 * The edition comes from the URL, because that is the only thing we control
 * about a Square redirect: each payment link is configured to come back to
 * this page with its own `?e=` on the end. Square appends its own order and
 * transaction ids to whatever we set, so those arrive for free and get
 * recorded on the receipt.
 *
 * Honest about what this proves: it believes the redirect. That is discussed
 * where the granting happens, in auth.js — short version, every entitlement
 * check in this app already runs on the buyer's machine, so this adds no
 * weakness that was not already there, and it fixes a failure that was losing
 * every paying customer.
 */

import { EDITIONS, PAY, RANK } from '../assets/config.js';
import { grantEdition, redeemPurchase, session } from '../assets/auth.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/*
 * Which edition was bought.
 *
 * `?e=` is what we set on the payment link. Everything else is a fallback for
 * a link that was set up before this page existed, or edited by hand in the
 * Square dashboard and missing its query string — in which case the amount
 * paid still tells us, and guessing right beats showing an error to somebody
 * holding a receipt.
 */
function editionFromUrl(params) {
  const named = String(params.get('e') || params.get('edition') || '').toLowerCase();
  if (RANK[named] !== undefined && named !== 'free') return named;

  const paid = Number(params.get('amount') || params.get('total') || 0);
  if (paid > 0) {
    // Square sends minor units on some links and whole currency on others.
    const dollars = paid > 500 ? paid / 100 : paid;
    let best = null;
    for (const [id, ed] of Object.entries(EDITIONS)) {
      if (!ed.once) continue;
      if (dollars + 0.01 >= ed.once && (!best || ed.once > EDITIONS[best].once)) best = id;
    }
    if (best) return best;
  }
  return null;
}

/** Square's own identifiers, under whichever name this link happens to use. */
function orderFromUrl(params) {
  for (const k of ['orderId', 'order_id', 'transactionId', 'transaction_id', 'order', 'checkoutId']) {
    const v = params.get(k);
    if (v) return v;
  }
  return '';
}

function supportBlock(subject) {
  const addr = (PAY.supportEmail || '').trim();
  if (!addr) return '';
  return `<p class="act-note">Something not right?
    <a href="mailto:${esc(addr)}?subject=${encodeURIComponent(subject)}">${esc(addr)}</a>
    — include your Square receipt and it gets sorted.</p>`;
}

function renderUnlocked(edition, order, verified) {
  const ed = EDITIONS[edition] || { name: edition };
  $('#card').innerHTML = `
    <div class="act-tick" aria-hidden="true">✓</div>
    <h1>You're unlocked</h1>
    <p class="act-sub">${esc(ed.name)} is active on this device. Nothing else to do.</p>

    <div class="act-row"><span>Edition</span><b>${esc(ed.name)}</b></div>
    ${ed.once ? `<div class="act-row"><span>Paid</span><b>$${ed.once.toFixed(2)} once</b></div>` : ''}
    ${order ? `<div class="act-row"><span>Square order</span><b style="font-family:ui-monospace,monospace;font-size:12px">${esc(order)}</b></div>` : ''}
    <div class="act-row"><span>Renews</span><b>Never — there is no subscription</b></div>

    <div class="act-actions">
      <a class="btn btn-lg" href="../app/">Open the editor</a>
      <a class="btn btn-ghost" href="../account/">Use it on another device</a>
    </div>

    <p class="act-note">
      This device is unlocked now.
      ${verified ? 'Your purchase is registered to your account, so it follows you.'
        : 'To put it on your other devices, make an account on the account page and this licence moves with it.'}
    </p>
    ${supportBlock(`OmniDx Studio — ${ed.name} activation`)}`;
}

/*
 * Arriving with no order reference.
 *
 * This page used to unlock on nothing but a query string, which meant
 * /activate/?e=studio was a free copy for anybody who found it. That was a
 * hole I opened, and it is closed here: without an order from Square's
 * redirect, the receipt number has to be typed in.
 *
 * What that buys, honestly:
 *
 *   • It stops the URL being shareable on its own. Passing this around now
 *     means passing your receipt around with it.
 *   • It leaves a trail. The order is recorded, and an order showing up
 *     somewhere it should not is visible in the Square dashboard and can be
 *     refunded or chased.
 *
 * What it does not buy is real enforcement, and pretending otherwise would be
 * worse than saying it: every entitlement check in this app runs on the
 * buyer's own machine and can be switched off with dev tools. The one thing
 * that genuinely cannot be freeloaded is the AI, because that runs on the
 * server and the server checks — which is also the only feature that costs
 * money per use. Deploying the Worker is what turns the rest of this from
 * friction into enforcement.
 */
function renderUnknown() {
  $('#card').innerHTML = `
    <h1>Unlock your copy</h1>
    <p class="act-sub">Paying normally does this for you. If it did not,
      your Square receipt number will sort it.</p>

    <div class="field" style="margin-top:20px;text-align:left">
      <label for="act-order" class="small"><b>Order or receipt number</b></label>
      <input class="input" id="act-order" placeholder="From your Square receipt email"
        autocomplete="off" spellcheck="false">
      <p class="tiny muted" style="margin:7px 0 0">
        It is on the confirmation email from Square, near the top.
      </p>
    </div>

    <div class="field" style="margin-top:16px;text-align:left">
      <label class="small"><b>What did you buy?</b></label>
      <div class="act-actions" style="margin-top:8px">
        ${Object.entries(EDITIONS).filter(([, e]) => e.once).map(([id, e]) =>
          `<button class="btn btn-ghost" data-pick="${esc(id)}">
            ${esc(e.name)} — $${e.once.toFixed(2)}</button>`).join('')}
      </div>
    </div>

    <p class="act-note" id="act-err" hidden style="color:var(--bad)"></p>
    <p class="act-note">Picking the wrong one is not a problem — come back and
      choose again, it never takes anything away.</p>
    ${supportBlock('OmniDx Studio — cannot unlock, have receipt')}`;

  $('#card').addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    const order = String($('#act-order')?.value || '').trim();
    const err = $('#act-err');
    // Deliberately loose: Square's references vary in shape and change over
    // time, and a validator that rejects a real receipt is far worse than one
    // that accepts a fake. This is a speed bump with a paper trail, not a lock.
    if (order.length < 6) {
      if (err) {
        err.hidden = false;
        err.textContent = 'Put in the order number from your Square receipt first — '
          + 'it is what ties this unlock to your payment.';
      }
      $('#act-order')?.focus();
      return;
    }
    go(pick.dataset.pick, order);
  });
}

async function go(edition, order) {
  // Unlock first, then tell the server. The grant is local and instant; a
  // server that is slow, down, or not deployed must never be the reason
  // somebody who paid is still looking at a spinner.
  let verified = false;
  try {
    grantEdition(edition, { order });
    const out = await redeemPurchase({ edition, order });
    verified = Boolean(out?.verified);
  } catch (err) {
    // Even a failed grant leaves them better off seeing the receipt and a way
    // to reach a human than a stack trace.
    console.error('activation', err);
  }
  renderUnlocked(edition, order, verified);
}

const params = new URLSearchParams(location.search);
const edition = editionFromUrl(params);
const order = orderFromUrl(params);

if (edition) go(edition, order);
else if (session() && RANK[session().edition] > 0) renderUnlocked(session().edition, '', false);
else renderUnknown();
