/*
 * The OmniDx Discord bot (worker.js is the Worker's entry; everything is here so the tests and setup.mjs can use
 * the pieces): a Cloudflare Worker that answers Discord's interactions over HTTP (no gateway, nothing to
 * keep running) and a half-hourly sweep.
 *
 *   Tickets    the panel in #open-a-ticket (or /ticket open) asks what it is about, opens a short form, then a private
 *              channel for the member and the team: the answers, a tip for that kind of problem, Claim and Close.
 *              /ticket add, remove, rename, claim, close. Closing keeps an HTML transcript in #ticket-logs, sends the
 *              member a copy by DM with a 1-5 rating, and deletes the channel. A ticket waiting on the member for 24
 *              hours gets a note, and closes 24 hours after it; one waiting on the team for 12 hours is flagged to the
 *              team.
 *   /verify    a key the licence server issued (and not refunded) gives the Verified Buyer role; a key belongs to
 *              one Discord account. Also from the button in #welcome.
 *   /faq       a quick answer, posted where it is asked. /stats: the numbers, for the team.
 *   /review    Verified Buyers review OmniDx; the team shows or hides each one from a card in #ticket-logs, and the shown
 *              ones are served on GET /reviews, which omnidx.net reads. Nothing reaches the site without the team.
 *
 * Environment: DISCORD_TOKEN (secret), PUBLIC_KEY and APP_ID (vars set by the deploy), DB (D1), LICENCE (a service
 * binding to the licence Worker; LICENCE_API is the fallback URL). setup.mjs writes the server's role and channel
 * ids into the config table.
 */
import { KINDS, FAQ, COLOR, SITE } from './content.js';

const API = 'https://discord.com/api/v10';
const EPHEMERAL = 64;
const T = { PING: 1, COMMAND: 2, COMPONENT: 3, MODAL: 5 };
const R = { PONG: 1, MESSAGE: 4, DEFER: 5, DEFER_UPDATE: 6, UPDATE: 7, MODAL: 9 };
const P = {
  VIEW: 1n << 10n, SEND: 1n << 11n, MANAGE_MESSAGES: 1n << 13n, EMBED: 1n << 14n, ATTACH: 1n << 15n, HISTORY: 1n << 16n,
  MANAGE_CHANNELS: 1n << 4n, ADMIN: 1n << 3n, MANAGE_GUILD: 1n << 5n, ADD_REACTIONS: 1n << 6n,
};
const MEMBER_CAN = P.VIEW | P.SEND | P.HISTORY | P.ATTACH | P.EMBED | P.ADD_REACTIONS;
const HOUR = 3600e3;
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1];

/* ---------------------------------------------------------------- plumbing */

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const say = (content, { ephemeral = true, embeds, components } = {}) => ({ type: R.MESSAGE, data: { content, embeds, components, flags: ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((b) => parseInt(b, 16)));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const snowTime = (id) => Number(BigInt(id) >> 22n) + 1420070400000;
const unix = (ms) => Math.floor(ms / 1000);
const pad = (n) => String(n).padStart(4, '0');

async function verifySignature(request, body, publicKey) {
  const sig = request.headers.get('x-signature-ed25519');
  const ts = request.headers.get('x-signature-timestamp');
  if (!sig || !ts || !publicKey) return false;
  const data = new TextEncoder().encode(ts + body);
  for (const alg of [{ name: 'Ed25519' }, { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }]) {
    try {
      const key = await crypto.subtle.importKey('raw', unhex(publicKey), alg, false, ['verify']);
      return await crypto.subtle.verify(alg.name === 'Ed25519' ? 'Ed25519' : alg, key, unhex(sig), data);
    } catch { /* try the older name */ }
  }
  return false;
}

/* Discord's REST API with the bot's token; a rate limit is waited out (up to five seconds at a time). files: [{name,
   data, type}] go up as attachments. */
export async function discord(env, method, path, body, { reason, files, auth = true } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const headers = { 'User-Agent': 'DiscordBot (https://omnidx.net, 1.0)' };
    if (auth) headers.Authorization = `Bot ${env.DISCORD_TOKEN}`;
    if (reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(reason).slice(0, 500);
    let payload;
    if (files && files.length) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify({ ...body, attachments: files.map((f, id) => ({ id, filename: f.name })) }));
      files.forEach((f, i) => form.append(`files[${i}]`, new Blob([f.data], { type: f.type || 'application/octet-stream' }), f.name));
      payload = form;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const r = await fetch(API + path, { method, headers, body: payload });
    if (r.status === 429) {
      const j = await r.json().catch(() => ({}));
      await sleep(Math.min(5000, Math.ceil((Number(j.retry_after) || 1) * 1000)));
      continue;
    }
    if (r.status === 204) return null;
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch { j = text; }
    if (!r.ok) {
      const e = new Error(`Discord ${method} ${path.split('?')[0]}: ${r.status} ${(j && j.message) || text}`.slice(0, 300));
      e.status = r.status; e.code = j && j.code;
      throw e;
    }
    return j;
  }
  throw new Error(`Discord ${method} ${path}: still rate limited`);
}

const followup = (env, i, body, files) => discord(env, 'PATCH', `/webhooks/${i.application_id}/${i.token}/messages/@original`, body, { files, auth: false });

let cached = null;
async function config(env) {
  if (cached && Date.now() - cached.at < 30e3) return cached.c;
  const { results } = await env.DB.prepare('SELECT k, v FROM config').all();
  const c = {};
  for (const r of results || []) c[r.k] = r.v;
  cached = { at: Date.now(), c };
  return c;
}

function isTeam(i, c) {
  const perms = BigInt(i.member?.permissions || '0');
  if (perms & (P.ADMIN | P.MANAGE_GUILD)) return true;
  return !!(c.team_role && (i.member?.roles || []).includes(c.team_role));
}
const who = (i) => i.member?.user || i.user;
const nameOf = (u) => u?.global_name || u?.username || 'someone';

async function ticketHere(env, channelId) {
  return env.DB.prepare("SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'").bind(channelId).first();
}

/* ---------------------------------------------------------------- the Worker (worker.js exports this as the default) */

export const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      let db = false;
      try { await env.DB.prepare('SELECT 1').first(); db = true; } catch { }
      return json({ ok: true, db, app: env.APP_ID || null });
    }
    if (request.method === 'GET' && url.pathname === '/reviews') return publicReviews(env);
    if (request.method !== 'POST' || url.pathname !== '/interactions') return new Response('OmniDx Discord bot. Nothing to see here.', { status: 404 });
    const body = await request.text();
    if (!(await verifySignature(request, body, env.PUBLIC_KEY))) return new Response('invalid request signature', { status: 401 });
    const i = JSON.parse(body);
    if (i.type === T.PING) return json({ type: R.PONG });
    try {
      return json(await route(i, env, ctx));
    } catch (e) {
      console.error('interaction failed', e && e.stack || e);
      return json(say(`Something went wrong on our side (${String(e.message || e).slice(0, 160)}). Try again in a minute, or tell the team.`));
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sweep(env).catch((e) => console.error('sweep failed', e && e.stack || e)));
  },
};

async function route(i, env, ctx) {
  const c = await config(env);
  if (i.type === T.COMMAND) {
    const name = i.data.name;
    if (name === 'ticket') return ticketCommand(i, env, ctx, c);
    if (name === 'verify') return verify(i, env, ctx, c, option(i.data.options, 'key'));
    if (name === 'faq') return faq(option(i.data.options, 'topic'));
    if (name === 'stats') return stats(i, env, c);
    if (name === 'review') return review(i, env, ctx, c);
    return say('That command is not known here any more.');
  }
  if (i.type === T.COMPONENT) {
    const id = i.data.custom_id;
    if (id === 'tk:open') return askForm(i, env, c, i.data.values && i.data.values[0]);
    if (id.startsWith('tk:open:')) return askForm(i, env, c, id.slice(8));
    if (id === 'tk:claim') return claim(i, env, ctx, c, true);
    if (id === 'tk:close') return closeAsk(i, env, c);
    if (id === 'tk:close:yes') return closeFromButton(i, env, ctx, c, '');
    if (id === 'tk:close:reason') return { type: R.MODAL, data: { custom_id: 'tk:closemodal', title: 'Close this ticket', components: [row({ type: 4, custom_id: 'reason', label: 'Why is it closed?', style: 2, required: false, max_length: 300, placeholder: 'Solved, no reply, duplicate...' })] } };
    if (id.startsWith('rate:')) return rate(i, env, ctx, c);
    if (id === 'vf:open') return { type: R.MODAL, data: { custom_id: 'vf:form', title: 'Verify your purchase', components: [row({ type: 4, custom_id: 'key', label: 'Your OmniDx Tune key', style: 1, required: true, max_length: 40, placeholder: 'TUNE-XXXX-XXXX-XXXX-XXXX' })] } };
    if (id === 'role:ping') return togglePing(i, env, c);
    if (id.startsWith('rv:')) return decideReview(i, env, c);
    return say('That button is from an older version of this message.');
  }
  if (i.type === T.MODAL) {
    const id = i.data.custom_id;
    const values = {};
    for (const r of i.data.components || []) for (const x of r.components || []) values[x.custom_id] = (x.value || '').trim();
    if (id.startsWith('tk:form:')) return openTicket(i, env, ctx, c, id.slice(8), values);
    if (id === 'tk:closemodal') return closeFromButton(i, env, ctx, c, values.reason || '');
    if (id === 'vf:form') return verify(i, env, ctx, c, values.key);
  }
  return say('Nothing to do with that.');
}

const option = (opts, name) => (opts || []).find((o) => o.name === name)?.value;
const row = (...components) => ({ type: 1, components });

/* ---------------------------------------------------------------- tickets: opening */

async function askForm(i, env, c, kindId) {
  if (!i.guild_id) return say('Tickets open from the server, in #open-a-ticket.');
  if (!c.tickets_category) return say('The ticket desk is not set up yet. The owner runs the Discord workflow once to build it.');
  const u = who(i);
  const open = await env.DB.prepare("SELECT * FROM tickets WHERE user_id = ? AND status IN ('open', 'opening') ORDER BY id DESC LIMIT 1").bind(u.id).first();
  if (open && open.status === 'open' && open.channel_id) return say(`You already have a ticket open: <#${open.channel_id}>. Add to it there, or close it to open a new one.`);
  if (open && open.status === 'opening' && Date.now() - open.opened_at < 60e3) return say('Your ticket is still being opened; give it a few seconds.');
  const k = kindOf(kindId);
  return {
    type: R.MODAL,
    data: {
      custom_id: `tk:form:${k.id}`,
      title: `${k.emoji} ${k.label}`.slice(0, 45),
      components: k.fields.map((f) => row({ type: 4, custom_id: f.id, label: f.label, style: f.style, required: f.required, max_length: f.max, placeholder: f.placeholder })),
    },
  };
}

async function openTicket(i, env, ctx, c, kindId, values) {
  const k = kindOf(kindId);
  const u = who(i);
  const buyer = !!(c.buyer_role && (i.member?.roles || []).includes(c.buyer_role));
  const open = await env.DB.prepare("SELECT * FROM tickets WHERE user_id = ? AND status = 'open' LIMIT 1").bind(u.id).first();
  if (open && open.channel_id) return say(`You already have a ticket open: <#${open.channel_id}>.`);
  await env.DB.prepare("DELETE FROM tickets WHERE user_id = ? AND status = 'opening'").bind(u.id).run();
  const t = await env.DB.prepare('INSERT INTO tickets (user_id, user_name, kind, status, buyer, answers, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(u.id, nameOf(u), k.id, 'opening', buyer ? 1 : 0, JSON.stringify(values), Date.now()).first();
  ctx.waitUntil(makeTicketChannel(i, env, c, t.id, k, u, buyer, values).catch(async (e) => {
    console.error('ticket failed', e && e.stack || e);
    await env.DB.prepare('DELETE FROM tickets WHERE id = ?').bind(t.id).run();
    await followup(env, i, { content: `The ticket could not be opened (${String(e.message).slice(0, 150)}). Try again in a minute; if it keeps failing, tell the team in #tune-help.` }).catch(() => { });
  }));
  return { type: R.DEFER, data: { flags: EPHEMERAL } };
}

async function makeTicketChannel(i, env, c, n, k, u, buyer, values) {
  const slug = (u.username || 'member').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'member';
  const overwrites = [
    { id: i.guild_id, type: 0, deny: String(P.VIEW), allow: '0' },
    { id: u.id, type: 1, allow: String(MEMBER_CAN), deny: '0' },
    { id: c.bot_id, type: 1, allow: String(MEMBER_CAN | P.MANAGE_CHANNELS | P.MANAGE_MESSAGES), deny: '0' },
  ];
  if (c.team_role) overwrites.push({ id: c.team_role, type: 0, allow: String(MEMBER_CAN | P.MANAGE_MESSAGES), deny: '0' });
  const make = (parent) => discord(env, 'POST', `/guilds/${i.guild_id}/channels`, {
    name: `ticket-${pad(n)}-${slug}`, type: 0, parent_id: parent, permission_overwrites: overwrites,
    topic: `Ticket #${n} · ${k.label} · opened by ${nameOf(u)} (${u.id})`,
  }, { reason: `Ticket #${n} for ${u.username}` });
  let ch;
  try { ch = await make(c.tickets_category); } catch (e) {
    // A category holds at most 50 channels; a full one gets the ticket outside it rather than no ticket at all.
    if (e.status === 400) ch = await make(undefined); else throw e;
  }
  await env.DB.prepare("UPDATE tickets SET channel_id = ?, status = 'open' WHERE id = ?").bind(ch.id, n).run();
  const fields = k.fields.filter((f) => values[f.id]).map((f) => ({ name: f.label, value: values[f.id].slice(0, 1024) }));
  const ping = c.team_role ? ` <@&${c.team_role}>` : '';
  await discord(env, 'POST', `/channels/${ch.id}/messages`, {
    content: `<@${u.id}>${ping}`,
    allowed_mentions: { users: [u.id], roles: c.team_role ? [c.team_role] : [] },
    embeds: [
      { title: `${k.emoji} Ticket #${n} · ${k.label}`, color: COLOR.violet,
        description: `Thanks, ${nameOf(u)}. Someone from the team will answer here; this channel is only you and the team. Add screenshots or files any time.`,
        fields, footer: { text: buyer ? 'Verified buyer ✓' : 'Not verified yet: /verify with your key gets the Verified Buyer role' }, timestamp: new Date().toISOString() },
      { description: `💡 ${k.tip}`, color: COLOR.grey },
    ],
    components: [row(
      { type: 2, style: 1, custom_id: 'tk:claim', label: 'Claim', emoji: { name: '🙋' } },
      { type: 2, style: 4, custom_id: 'tk:close', label: 'Close', emoji: { name: '🔒' } },
    )],
  });
  await followup(env, i, { content: `Your ticket is open: <#${ch.id}>` });
}

/* ---------------------------------------------------------------- tickets: in the channel */

async function ticketCommand(i, env, ctx, c) {
  const sub = i.data.options && i.data.options[0];
  if (!sub) return say('Which one?');
  if (sub.name === 'open') return askForm(i, env, c, option(sub.options, 'about'));
  const t = await ticketHere(env, i.channel_id);
  if (!t) return say('That works inside a ticket channel.');
  const u = who(i);
  const team = isTeam(i, c);
  if (sub.name === 'close') {
    if (!team && u.id !== t.user_id) return say('Only the person who opened it, or the team, can close a ticket.');
    const reason = option(sub.options, 'reason') || '';
    ctx.waitUntil(closeTicket(env, c, t, u, reason).catch((e) => console.error('close failed', e && e.stack || e)));
    return say(`🔒 Closing this ticket${reason ? `: ${reason}` : ''}. A copy of the conversation goes to <@${t.user_id}> by DM.`, { ephemeral: false });
  }
  if (sub.name === 'add' || sub.name === 'remove') {
    if (!team && u.id !== t.user_id) return say('Only the person who opened it, or the team, can do that.');
    const target = option(sub.options, 'user');
    if (target === t.user_id && sub.name === 'remove') return say('The person who opened the ticket stays on it.');
    if (sub.name === 'add') await discord(env, 'PUT', `/channels/${i.channel_id}/permissions/${target}`, { type: 1, allow: String(MEMBER_CAN), deny: '0' }, { reason: `Added to ticket #${t.id} by ${u.username}` });
    else await discord(env, 'DELETE', `/channels/${i.channel_id}/permissions/${target}`, undefined, { reason: `Removed from ticket #${t.id} by ${u.username}` });
    return { type: R.MESSAGE, data: { content: sub.name === 'add' ? `➕ <@${target}> can now see this ticket.` : `➖ <@${target}> was taken off this ticket.`, allowed_mentions: { parse: [] } } };
  }
  if (sub.name === 'claim') return claim(i, env, ctx, c, false);
  if (sub.name === 'rename') {
    if (!team) return say('Renaming is for the team.');
    const name = String(option(sub.options, 'name') || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    if (!name) return say('That name has nothing Discord can use in it.');
    ctx.waitUntil(discord(env, 'PATCH', `/channels/${i.channel_id}`, { name }, { reason: `Ticket #${t.id} renamed by ${u.username}` }).catch((e) => console.error(e)));
    return say(`Renaming to #${name} (Discord allows two renames per ten minutes).`);
  }
  return say('Unknown.');
}

async function claim(i, env, ctx, c, fromButton) {
  const t = await ticketHere(env, i.channel_id);
  if (!t) return say('That works inside a ticket channel.');
  if (!isTeam(i, c)) return say('Claiming is for the team; they will be with you soon.');
  const u = who(i);
  if (t.claimed_by && t.claimed_by !== u.id) return say(`<@${t.claimed_by}> already has this ticket.`);
  await env.DB.prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?').bind(u.id, t.id).run();
  if (fromButton) {
    const msg = i.message;
    const components = [row(
      { type: 2, style: 2, custom_id: 'tk:claim', label: `Claimed by ${nameOf(u)}`.slice(0, 80), emoji: { name: '🙋' }, disabled: true },
      { type: 2, style: 4, custom_id: 'tk:close', label: 'Close', emoji: { name: '🔒' } },
    )];
    ctx.waitUntil(discord(env, 'POST', `/channels/${i.channel_id}/messages`, { content: `🙋 <@${u.id}> is on this ticket.`, allowed_mentions: { parse: [] } }).catch(() => { }));
    return { type: R.UPDATE, data: { embeds: msg.embeds, components } };
  }
  return { type: R.MESSAGE, data: { content: `🙋 <@${u.id}> is on this ticket.`, allowed_mentions: { parse: [] } } };
}

async function closeAsk(i, env, c) {
  const t = await ticketHere(env, i.channel_id);
  if (!t) return say('This ticket is already closed.');
  const u = who(i);
  if (!isTeam(i, c) && u.id !== t.user_id) return say('Only the person who opened it, or the team, can close a ticket.');
  return say('Close this ticket? The conversation is kept, and a copy goes to the person who opened it.', {
    components: [row(
      { type: 2, style: 4, custom_id: 'tk:close:yes', label: 'Close it' },
      { type: 2, style: 2, custom_id: 'tk:close:reason', label: 'Close with a reason' },
    )],
  });
}

async function closeFromButton(i, env, ctx, c, reason) {
  const t = await ticketHere(env, i.channel_id);
  if (!t) return { type: R.UPDATE, data: { content: 'This ticket is already closed.', components: [] } };
  const u = who(i);
  if (!isTeam(i, c) && u.id !== t.user_id) return say('Only the person who opened it, or the team, can close a ticket.');
  ctx.waitUntil(closeTicket(env, c, t, u, reason).catch((e) => console.error('close failed', e && e.stack || e)));
  // From the confirmation (an ephemeral message) the reply replaces it; from the reason form it is a new one.
  if (i.type === T.COMPONENT) return { type: R.UPDATE, data: { content: '🔒 Closing…', components: [] } };
  return say('🔒 Closing…');
}

/* ---------------------------------------------------------------- tickets: closing */

async function allMessages(env, channelId) {
  const out = [];
  let before = '';
  for (let page = 0; page < 10; page++) {
    const batch = await discord(env, 'GET', `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`);
    if (!batch || !batch.length) break;
    out.push(...batch);
    before = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  return out.reverse();
}

export function transcript(t, msgs, guildName) {
  const k = kindOf(t.kind);
  const line = (m) => {
    const when = new Date(m.timestamp || snowTime(m.id)).toISOString().replace('T', ' ').slice(0, 16);
    const embeds = (m.embeds || []).map((e) => `<div class="em">${e.title ? `<b>${esc(e.title)}</b>` : ''}${e.description ? `<p>${esc(e.description)}</p>` : ''}${(e.fields || []).map((f) => `<p><i>${esc(f.name)}</i><br>${esc(f.value)}</p>`).join('')}</div>`).join('');
    const files = (m.attachments || []).map((a) => `<a href="${esc(a.url)}">${esc(a.filename)}</a>`).join(' ');
    const text = m.content ? esc(m.content) : (embeds || files ? '' : '<span class="dim">(no text)</span>');
    return `<div class="m${m.author?.bot ? ' bot' : ''}"><div class="h"><b>${esc(m.author?.global_name || m.author?.username || 'unknown')}</b> <span class="dim">${when} UTC</span></div><div class="c">${text}</div>${embeds}${files ? `<div class="f">📎 ${files}</div>` : ''}</div>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ticket #${t.id} · ${esc(k.label)}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#0b0a10;color:#e9e6f2;font:15px/1.5 system-ui,Segoe UI,sans-serif}.w{max-width:860px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0 0 4px}.meta{color:#a59fb8;font-size:13px;margin-bottom:20px}.m{padding:10px 14px;border-left:3px solid #8b5cf6;background:#15131d;border-radius:8px;margin:8px 0}
.m.bot{border-left-color:#3a3550}.h{font-size:13px}.dim{color:#8a849c}.c{white-space:pre-wrap;word-break:break-word;margin-top:2px}.em{margin-top:6px;padding:8px 10px;background:#1c1928;border-radius:6px;font-size:14px}
.em p{margin:4px 0;white-space:pre-wrap}.f{margin-top:6px;font-size:13px}a{color:#b69cff}</style></head><body><div class="w">
<h1>${esc(guildName || 'OmniDx')} · Ticket #${t.id} · ${esc(k.label)}</h1>
<div class="meta">Opened by ${esc(t.user_name)} (${esc(t.user_id)}) on ${new Date(t.opened_at).toISOString().slice(0, 16).replace('T', ' ')} UTC${t.reason ? ` · Closed: ${esc(t.reason)}` : ''} · ${msgs.length} messages</div>
${msgs.map(line).join('\n')}
</div></body></html>`;
}

async function closeTicket(env, c, t, closer, reason) {
  const claimed = await env.DB.prepare("UPDATE tickets SET status = 'closing' WHERE id = ? AND status = 'open'").bind(t.id).run();
  if (claimed.meta && claimed.meta.changes === 0) return;   // someone else is already closing it
  try { await closeNow(env, c, t, closer, reason); } catch (e) {
    // Put it back so Close can be pressed again; nothing is lost while the channel is still there.
    await env.DB.prepare("UPDATE tickets SET status = 'open' WHERE id = ? AND status = 'closing'").bind(t.id).run();
    await discord(env, 'POST', `/channels/${t.channel_id}/messages`, { content: `The ticket could not be closed (${String(e.message).slice(0, 150)}). Press Close again in a minute.` }).catch(() => { });
    throw e;
  }
}

async function closeNow(env, c, t, closer, reason) {
  const now = Date.now();
  let msgs = [];
  try { msgs = await allMessages(env, t.channel_id); } catch (e) { console.error('transcript read failed', e.message); }
  const closed = { ...t, reason: reason || null };
  let guildName = 'OmniDx';
  try { guildName = (await discord(env, 'GET', `/guilds/${c.guild_id}`)).name; } catch { }
  const html = transcript(closed, msgs, guildName);
  const file = { name: `ticket-${pad(t.id)}.html`, data: html, type: 'text/html' };
  const k = kindOf(t.kind);
  const took = Math.max(1, Math.round((now - t.opened_at) / 60e3));
  const embed = {
    title: `${k.emoji} Ticket #${t.id} closed · ${k.label}`, color: COLOR.grey, timestamp: new Date(now).toISOString(),
    fields: [
      { name: 'Opened by', value: `<@${t.user_id}> (${t.user_name || t.user_id})${t.buyer ? ' ✓ buyer' : ''}`, inline: true },
      { name: 'Claimed by', value: t.claimed_by ? `<@${t.claimed_by}>` : 'nobody', inline: true },
      { name: 'Closed by', value: closer ? `<@${closer.id}>` : 'the bot (no reply)', inline: true },
      { name: 'Open for', value: took < 120 ? `${took} min` : took < 2880 ? `${Math.round(took / 60)} h` : `${Math.round(took / 1440)} days`, inline: true },
      { name: 'Messages', value: String(msgs.length), inline: true },
      { name: 'Reason', value: (reason || 'none given').slice(0, 1024) },
    ],
  };
  if (c.logs_channel) await discord(env, 'POST', `/channels/${c.logs_channel}/messages`, { embeds: [embed], allowed_mentions: { parse: [] } }, { files: [file] }).catch((e) => console.error('log failed', e.message));
  // The member's copy, with the rating. Members who do not take DMs from the server simply do not get one.
  try {
    const dm = await discord(env, 'POST', '/users/@me/channels', { recipient_id: t.user_id });
    await discord(env, 'POST', `/channels/${dm.id}/messages`, {
      embeds: [{ title: `Your ticket #${t.id} in ${guildName} is closed`, color: COLOR.violet,
        description: `${reason ? `**Reason:** ${reason}\n\n` : ''}The whole conversation is attached. How did we do?\n\nNeed more help? Open a new ticket in #open-a-ticket any time. ${SITE}` }],
      components: [row(...[1, 2, 3, 4, 5].map((n) => ({ type: 2, style: n >= 4 ? 3 : 2, custom_id: `rate:${t.id}:${n}`, label: '★'.repeat(n) })))],
    }, { files: [file] });
  } catch (e) { console.log('no DM for ticket', t.id, e.message); }
  await env.DB.prepare("UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ?, reason = ?, messages = ? WHERE id = ?")
    .bind(now, closer ? closer.id : 'bot', reason || null, msgs.length, t.id).run();
  await sleep(Number(env.CLOSE_DELAY_MS ?? 2500));   // long enough to read "Closing" before the channel goes
  await discord(env, 'DELETE', `/channels/${t.channel_id}`, undefined, { reason: `Ticket #${t.id} closed` }).catch((e) => console.error('delete failed', e.message));
}

async function rate(i, env, ctx, c) {
  const [, id, n] = i.data.custom_id.split(':');
  const t = await env.DB.prepare('SELECT * FROM tickets WHERE id = ?').bind(Number(id)).first();
  const u = who(i);
  if (!t || t.user_id !== u.id) return say('That rating is not yours to give.');
  const stars = Math.max(1, Math.min(5, Number(n) || 0));
  const first = !t.rating;
  await env.DB.prepare('UPDATE tickets SET rating = ? WHERE id = ?').bind(stars, t.id).run();
  if (first && c.logs_channel) ctx.waitUntil(discord(env, 'POST', `/channels/${c.logs_channel}/messages`, { content: `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}  ticket #${t.id} (${kindOf(t.kind).label}) rated ${stars}/5 by <@${u.id}>`, allowed_mentions: { parse: [] } }).catch(() => { }));
  const embeds = (i.message && i.message.embeds) || [];
  return { type: R.UPDATE, data: { embeds, components: [], content: `Thanks — you rated it ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}.` } };
}

/* ---------------------------------------------------------------- the sweep */

export async function sweep(env, now = Date.now()) {
  const c = await config(env);
  const { results } = await env.DB.prepare("SELECT * FROM tickets WHERE status = 'open'").all();
  for (const t of results || []) {
    try {
      let last;
      try { last = (await discord(env, 'GET', `/channels/${t.channel_id}/messages?limit=1`))[0]; } catch (e) {
        if (e.status === 404) { await env.DB.prepare("UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = 'deleted', reason = 'The channel was deleted by hand' WHERE id = ?").bind(now, t.id).run(); }
        continue;
      }
      if (!last) continue;
      const at = snowTime(last.id);
      const byMember = last.author && last.author.id === t.user_id;
      if (byMember) {
        // Waiting on the team: one flag in the logs after 12 hours.
        if (t.warned_at) await env.DB.prepare('UPDATE tickets SET warned_at = NULL WHERE id = ?').bind(t.id).run();
        if (!t.reminded_at && now - at > 12 * HOUR && c.logs_channel) {
          await discord(env, 'POST', `/channels/${c.logs_channel}/messages`, { content: `⏰ <#${t.channel_id}> (ticket #${t.id}, ${kindOf(t.kind).label}) has waited 12 hours for a reply${c.team_role ? ` <@&${c.team_role}>` : ''}.`, allowed_mentions: { roles: c.team_role ? [c.team_role] : [] } });
          await env.DB.prepare('UPDATE tickets SET reminded_at = ? WHERE id = ?').bind(now, t.id).run();
        }
        continue;
      }
      if (t.reminded_at && !byMember) await env.DB.prepare('UPDATE tickets SET reminded_at = NULL WHERE id = ?').bind(t.id).run();
      // Waiting on the member.
      if (!t.warned_at) {
        if (now - at > 24 * HOUR) {
          await discord(env, 'POST', `/channels/${t.channel_id}/messages`, {
            content: `<@${t.user_id}> this ticket has had no reply for 24 hours and closes by itself in 24 more. Still need help? Just reply here.`,
            allowed_mentions: { users: [t.user_id] },
            components: [row({ type: 2, style: 4, custom_id: 'tk:close', label: 'Close it now', emoji: { name: '🔒' } })],
          });
          await env.DB.prepare('UPDATE tickets SET warned_at = ? WHERE id = ?').bind(now, t.id).run();
        }
      } else if (at > t.warned_at + 10e3) {
        await env.DB.prepare('UPDATE tickets SET warned_at = NULL WHERE id = ?').bind(t.id).run();   // someone spoke
      } else if (now - t.warned_at > 24 * HOUR) {
        await closeTicket(env, c, t, null, 'No reply for 48 hours');
      }
    } catch (e) { console.error('sweep ticket', t.id, e.message); }
  }
  await env.DB.prepare('DELETE FROM hits WHERE until < ?').bind(now).run();
}

/* ---------------------------------------------------------------- /verify */

export function tidyKey(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^(TUNE|SQUAD)([A-Z0-9]{16})$/.exec(s);
  return m ? `${m[1]}-${m[2].slice(0, 4)}-${m[2].slice(4, 8)}-${m[2].slice(8, 12)}-${m[2].slice(12, 16)}` : null;
}

async function checkWithLicence(env, key) {
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) };
  const r = env.LICENCE ? await env.LICENCE.fetch('https://licence/v1/tune/check', init) : await fetch(`${String(env.LICENCE_API || '').replace(/\/$/, '')}/v1/tune/check`, init);
  const j = await r.json().catch(() => null);
  if (!j) throw new Error(`the key server answered ${r.status}`);
  return j;
}

async function verify(i, env, ctx, c, raw) {
  if (!i.guild_id) return say('Verify from the server: /verify there, or the button in #welcome.');
  if (!c.buyer_role) return say('Verification is not set up yet.');
  const u = who(i);
  const key = tidyKey(raw);
  if (!key) return say('That does not look like a key. It looks like `TUNE-XXXX-XXXX-XXXX-XXXX` and is on the page after you paid (omnidx.net/studio/activate/).');
  const bucket = `verify:${u.id}`;
  const now = Date.now();
  const hit = await env.DB.prepare('SELECT n, until FROM hits WHERE bucket = ?').bind(bucket).first();
  const n = hit && hit.until > now ? hit.n + 1 : 1;
  await env.DB.prepare('INSERT OR REPLACE INTO hits (bucket, n, until) VALUES (?, ?, ?)').bind(bucket, n, hit && hit.until > now ? hit.until : now + HOUR).run();
  if (n > 6) return say('Too many tries for now. Try again in an hour, or open a ticket.');
  const linked = await env.DB.prepare('SELECT * FROM links WHERE key = ?').bind(key).first();
  if (linked && linked.user_id !== u.id) return say('That key is already linked to another Discord account. If that is wrong, open a ticket (Key or payment) and the team sorts it.');
  let r;
  try { r = await checkWithLicence(env, key); } catch (e) { return say(`The key server is not answering right now (${String(e.message).slice(0, 80)}). Try again in a few minutes.`); }
  if (!r.ok) return say(`The key server says: ${r.reason || 'that key is not valid'}`);
  await discord(env, 'PUT', `/guilds/${i.guild_id}/members/${u.id}/roles/${c.buyer_role}`, undefined, { reason: 'Verified an OmniDx Tune key' });
  await env.DB.prepare('INSERT OR REPLACE INTO links (key, user_id, product, linked_at) VALUES (?, ?, ?, ?)').bind(key, u.id, r.product || null, now).run();
  if (c.logs_channel && !linked) ctx.waitUntil(discord(env, 'POST', `/channels/${c.logs_channel}/messages`, { content: `✅ <@${u.id}> verified a ${r.product === 'squad' || r.seats > 1 ? 'Squad' : 'Tune'} key (…${key.slice(-4)})`, allowed_mentions: { parse: [] } }).catch(() => { }));
  return say(`✅ Verified. You have the **Verified Buyer** role${c.buyers_channel ? ` and <#${c.buyers_channel}> is open to you` : ''}. Your key is on ${r.used} of ${r.seats} PC${r.seats === 1 ? '' : 's'} so far.\n\nOmniDx Edition comes with it: \`$env:OMNIDX_KEY='${key}'; irm omnidx.net/edition.ps1 | iex\``);
}

async function togglePing(i, env, c) {
  if (!c.ping_role) return say('Announcement pings are not set up yet.');
  const u = who(i);
  const has = (i.member?.roles || []).includes(c.ping_role);
  await discord(env, has ? 'DELETE' : 'PUT', `/guilds/${i.guild_id}/members/${u.id}/roles/${c.ping_role}`, undefined, { reason: has ? 'Announcement pings off' : 'Announcement pings on' });
  return say(has ? '🔕 Announcement pings off.' : `🔔 You will be pinged for announcements${c.announcements_channel ? ` in <#${c.announcements_channel}>` : ''}. Press again to stop.`);
}

/* ---------------------------------------------------------------- /review and the reviews omnidx.net shows */

// Plain text only: no mentions, no links, no markdown that would look different on the site, one line of spaces.
const cleanReview = (s) => String(s || '').replace(/<[@#][!&]?\d+>/g, '').replace(/https?:\/\/\S+|discord\.gg\/\S+|www\.\S+/gi, '').replace(/[*_~`|>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} ._'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 32);
const starLine = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function reviewCard(r, decidedBy) {
  const state = r.status === 'shown' ? `Shown on omnidx.net${decidedBy ? ` (by ${decidedBy})` : ''}` : r.status === 'hidden' ? `Hidden${decidedBy ? ` (by ${decidedBy})` : ''}` : 'Waiting for the team';
  return {
    content: '', allowed_mentions: { parse: [] },
    embeds: [{ color: r.status === 'shown' ? COLOR.green : r.status === 'hidden' ? COLOR.grey : COLOR.amber, title: `📝 A review: ${starLine(r.stars)}`, description: r.text,
      fields: [{ name: 'Shown as', value: `${r.name} · Verified Buyer`, inline: true }, { name: 'From', value: `<@${r.user_id}>`, inline: true }, { name: 'Status', value: state, inline: true }] }],
    components: [row(
      { type: 2, style: 3, custom_id: `rv:show:${r.user_id}`, label: 'Show on omnidx.net', disabled: r.status === 'shown' },
      { type: 2, style: 4, custom_id: `rv:hide:${r.user_id}`, label: 'Hide', disabled: r.status === 'hidden' })],
  };
}

async function review(i, env, ctx, c) {
  if (!i.guild_id) return say('Review from the server: /review there.');
  const u = who(i);
  if (!c.buyer_role || !(i.member?.roles || []).includes(c.buyer_role)) return say('Reviews come from Verified Buyers, so every one on omnidx.net is from someone who paid. Verify first with /verify and your key (or the button in #welcome), then /review.');
  const stars = Math.max(1, Math.min(5, Math.round(Number(option(i.data.options, 'stars')) || 0)));
  const text = cleanReview(option(i.data.options, 'text'));
  if (text.length < 10) return say('A sentence or two, please: what it did for you. Links and mentions are taken out.');
  const name = cleanName(option(i.data.options, 'name')) || cleanName(nameOf(u)) || 'A buyer';
  const old = await env.DB.prepare('SELECT user_id FROM reviews WHERE user_id = ?').bind(u.id).first();
  await env.DB.prepare("INSERT OR REPLACE INTO reviews (user_id, name, stars, text, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").bind(u.id, name, stars, text, Date.now()).run();
  if (c.logs_channel) ctx.waitUntil((async () => {
    const m = await discord(env, 'POST', `/channels/${c.logs_channel}/messages`, reviewCard({ user_id: u.id, name, stars, text, status: 'pending' }));
    if (m && m.id) await env.DB.prepare('UPDATE reviews SET log_message = ? WHERE user_id = ?').bind(m.id, u.id).run();
  })().catch(() => { }));
  return say(`${old ? 'Updated' : 'Thank you'}: ${starLine(stars)} as **${name}**. The team reads every review before it goes on omnidx.net, with your name and the Verified Buyer mark. /review again any time to change it.`);
}

async function decideReview(i, env, c) {
  if (!isTeam(i, c)) return say('That is for the team.');
  const [, action, userId] = i.data.custom_id.split(':');
  const r = await env.DB.prepare('SELECT * FROM reviews WHERE user_id = ?').bind(userId).first();
  if (!r) return say('That review is gone (replaced or removed).');
  const status = action === 'show' ? 'shown' : 'hidden';
  const by = nameOf(who(i));
  await env.DB.prepare('UPDATE reviews SET status = ?, decided_at = ?, decided_by = ? WHERE user_id = ?').bind(status, Date.now(), who(i).id, userId).run();
  return { type: R.UPDATE, data: reviewCard({ ...r, status }, by) };
}

// What omnidx.net shows: the shown reviews, newest decision first, and the average of all of them. Anyone may read it.
async function publicReviews(env) {
  const { results } = await env.DB.prepare("SELECT name, stars, text, decided_at FROM reviews WHERE status = 'shown' ORDER BY decided_at DESC LIMIT 30").all();
  const all = await env.DB.prepare("SELECT COUNT(*) AS n, AVG(stars) AS avg FROM reviews WHERE status = 'shown'").first();
  const list = (results || []).map((r) => ({ name: r.name, stars: r.stars, text: r.text, date: new Date(r.decided_at).toISOString().slice(0, 10) }));
  return new Response(JSON.stringify({ count: all?.n || 0, average: all?.n ? Math.round(all.avg * 10) / 10 : null, reviews: list }), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
  });
}

/* ---------------------------------------------------------------- /faq and /stats */

function faq(topic) {
  const f = FAQ[topic];
  if (!f) return say('No answer by that name.');
  return { type: R.MESSAGE, data: { embeds: [{ title: f.q, description: f.a, color: COLOR.violet, footer: { text: 'More in #faq · omnidx.net' } }], allowed_mentions: { parse: [] } } };
}

async function stats(i, env, c) {
  if (!isTeam(i, c)) return say('That is for the team.');
  const now = Date.now();
  const one = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).first()) || {};
  const open = await one("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'");
  const opened = await one('SELECT COUNT(*) AS n FROM tickets WHERE opened_at > ?', now - 7 * 24 * HOUR);
  const closed = await one("SELECT COUNT(*) AS n, AVG(closed_at - opened_at) AS took FROM tickets WHERE status = 'closed' AND closed_at > ?", now - 7 * 24 * HOUR);
  const rated = await one('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM tickets WHERE rating IS NOT NULL AND closed_at > ?', now - 30 * 24 * HOUR);
  const buyers = await one('SELECT COUNT(DISTINCT user_id) AS n FROM links');
  const revs = await one("SELECT SUM(status = 'shown') AS shown, SUM(status = 'pending') AS waiting FROM reviews");
  const byKind = await env.DB.prepare('SELECT kind, COUNT(*) AS n FROM tickets WHERE opened_at > ? GROUP BY kind ORDER BY n DESC').bind(now - 30 * 24 * HOUR).all();
  const hours = closed.took ? (closed.took / HOUR).toFixed(1) : '–';
  return say('', {
    embeds: [{ title: '📊 The ticket desk', color: COLOR.violet, fields: [
      { name: 'Open now', value: String(open.n || 0), inline: true },
      { name: 'Opened, 7 days', value: String(opened.n || 0), inline: true },
      { name: 'Closed, 7 days', value: `${closed.n || 0} (avg ${hours} h open)`, inline: true },
      { name: 'Rating, 30 days', value: rated.n ? `${Number(rated.avg).toFixed(2)} / 5 from ${rated.n}` : 'no ratings yet', inline: true },
      { name: 'Verified buyers', value: String(buyers.n || 0), inline: true },
      { name: 'Reviews', value: `${revs.shown || 0} shown, ${revs.waiting || 0} waiting`, inline: true },
      { name: 'What about, 30 days', value: (byKind.results || []).map((r) => `${kindOf(r.kind).emoji} ${kindOf(r.kind).label}: ${r.n}`).join('\n') || 'nothing yet' },
    ] }],
  });
}
