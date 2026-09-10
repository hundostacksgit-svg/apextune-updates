/*
 * What this copy is allowed to do.
 *
 * Everything routes through can(); no panel ever checks an edition name
 * directly. That means the free/paid split is one table in config.js and
 * moving a feature across it is a one-line change, not a hunt through the UI.
 *
 * Honest about the limit: this check runs on the buyer's machine, so anyone
 * determined can switch it off with dev tools. A server check would be
 * stronger, and the Worker in server/ does exactly that when it's deployed.
 * We are not going to make the app useless offline to stop the handful of
 * people who were never going to pay.
 */

import { ENTITLEMENTS, RANK, EDITIONS, AI_QUOTA, buyUrl } from '../../assets/config.js';
import * as auth from '../../assets/auth.js';
import { modal, closeModal, esc, toast } from './ui.js';

const QUOTA_KEY = 'omnidx.studio.aiquota.v1';

export function edition() { return auth.edition(); }
export function editionName() { return EDITIONS[edition()]?.name || 'Starter'; }

/** Can this copy use `feature`? Unknown features are free — fail open, not shut. */
export function can(feature) {
  const need = ENTITLEMENTS[feature];
  if (!need) return true;
  return RANK[edition()] >= RANK[need];
}

/** Which edition a feature needs, for the label on a locked control. */
export function requires(feature) {
  const need = ENTITLEMENTS[feature];
  return need && need !== 'free' ? EDITIONS[need] : null;
}

/**
 * Run `action` if the licence allows it, otherwise explain what it costs.
 * Returns true when the action ran.
 */
export function gate(feature, action, { what } = {}) {
  if (can(feature)) { action?.(); return true; }
  upgradePrompt(feature, what);
  return false;
}

export function upgradePrompt(feature, what) {
  const need = requires(feature);
  if (!need) return;
  const label = what || feature.replace(/-/g, ' ');
  modal(`
    <h3>${esc(label)} is in ${esc(need.name)}</h3>
    <p>${esc(need.blurb)}</p>
    <div class="note info">
      <b>$${need.once.toFixed(2)} once</b>, on up to ${need.id === 'studio' ? 10 : 3} devices, including every
      future update — or $${need.monthly.toFixed(2)} a month if you'd rather. Everything you've made
      stays yours either way.
    </div>
    <p class="tiny muted">Nothing on your timeline changes if you don't. This feature just stays greyed out.</p>
    <div class="btn-row" style="justify-content:flex-end">
      <button class="btn btn-ghost" data-x="close">Not now</button>
      <a class="btn" href="../pricing/" target="_blank" rel="noopener">Compare editions</a>
      <a class="btn btn-primary" href="${esc(buyUrl(need.id, 'once'))}" target="_blank" rel="noopener">
        Get ${esc(need.name)} — $${need.once.toFixed(2)}</a>
    </div>`);
  document.querySelector('[data-x="close"]')?.addEventListener('click', closeModal);
}

/* ------------------------------------------------------------------ */
/* AI quota                                                            */
/* ------------------------------------------------------------------ */
/* Counted per calendar month and stored locally. Free gets five real actions,
   not a teaser, because a feature nobody is allowed to try is a feature nobody
   buys. */

function quotaRecord() {
  const month = new Date().toISOString().slice(0, 7);
  try {
    const rec = JSON.parse(localStorage.getItem(QUOTA_KEY) || '{}');
    return rec.month === month ? rec : { month, used: 0 };
  } catch { return { month, used: 0 }; }
}

export function aiRemaining() {
  const limit = AI_QUOTA[edition()] ?? 0;
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit - quotaRecord().used);
}

export function aiLimit() { return AI_QUOTA[edition()] ?? 0; }

/** Spend one AI action. False means the month's allowance is gone. */
export function spendAi() {
  const limit = AI_QUOTA[edition()] ?? 0;
  if (limit === Infinity) return true;
  const rec = quotaRecord();
  if (rec.used >= limit) return false;
  rec.used++;
  try { localStorage.setItem(QUOTA_KEY, JSON.stringify(rec)); } catch { /* private mode */ }
  return true;
}

export function outOfAiPrompt() {
  const ed = edition();
  const next = ed === 'free' ? EDITIONS.creator : EDITIONS.studio;
  modal(`
    <h3>You've used this month's AI actions</h3>
    <p>The ${esc(editionName())} edition includes ${aiLimit()} a month, and it resets on the 1st.
       Everything else in the editor carries on working as normal.</p>
    <div class="note info"><b>${esc(next.name)}</b> — ${esc(next.blurb)}
      <br>$${next.once.toFixed(2)} once, or $${next.monthly.toFixed(2)} a month.</div>
    <div class="btn-row" style="justify-content:flex-end">
      <button class="btn btn-ghost" data-x="close">OK</button>
      <a class="btn btn-primary" href="${esc(buyUrl(next.id, 'once'))}" target="_blank" rel="noopener">
        Get ${esc(next.name)}</a>
    </div>`);
  document.querySelector('[data-x="close"]')?.addEventListener('click', closeModal);
}

/** Redeem a key typed into the account panel. */
export async function redeem(code) {
  const out = await auth.redeem(code);
  toast(`${EDITIONS[out.edition]?.name || 'Pro'} unlocked on this device`, 'ok');
  return out;
}

export { auth };
