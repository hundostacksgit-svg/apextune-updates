/*
 * The OmniDx Discord bot, offline: discord/worker.js (and bot.js behind it) against a stand-in Discord (channels, messages, roles, DMs and
 * the interaction webhooks, in memory), a real SQLite database with discord/schema.sql, and a stand-in licence
 * server. Every interaction is signed with a fresh Ed25519 key, the way Discord signs them. Nothing talks to the
 * internet. The Discord workflow runs this before it deploys; so does anyone with:
 *
 *   node tools/discord-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });
const { DatabaseSync } = await import('node:sqlite');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const print = console.log.bind(console);   // setup.mjs's own lines are captured below; the results never are
const ok = (m) => print('  ok  ' + m);
const bad = (m) => { failed++; print('  FAIL ' + m); };
const expect = (c, m) => (c ? ok(m) : bad(m));

/* ---------------- a D1 over SQLite ---------------- */
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(root, 'discord/schema.sql'), 'utf8'));
const conv = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const DB = {
  prepare(sql) {
    const st = {
      args: [],
      bind(...a) { st.args = a.map(conv); return st; },
      async first() { const r = sqlite.prepare(sql).get(...st.args); return r ? { ...r } : null; },
      async all() { return { results: sqlite.prepare(sql).all(...st.args).map((r) => ({ ...r })) }; },
      async run() { const r = sqlite.prepare(sql).run(...st.args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
    return st;
  },
};
const rows = (sql, ...a) => sqlite.prepare(sql).all(...a).map((r) => ({ ...r }));

/* ---------------- a stand-in Discord ---------------- */
const G = 'G1', BOT = 'BOT', APP = 'APP';
let seq = 0;
const snow = (t = Date.now()) => String(((BigInt(t) - 1420070400000n) << 22n) | BigInt(++seq));
const state = {
  guild: { id: G, name: 'OmniDx Test', owner_id: 'OWNER' },
  channels: new Map(), messages: new Map(), memberRoles: new Map(), followups: new Map(), dms: new Map(), noDm: new Set(), calls: [],
};
function addChannel(c) { const ch = { guild_id: G, permission_overwrites: [], ...c, id: c.id || snow() }; state.channels.set(ch.id, ch); state.messages.set(ch.id, []); return ch; }
addChannel({ id: 'CAT_TICKETS', type: 4, name: '🎫 TICKETS' });
addChannel({ id: 'LOGS', type: 0, name: 'ticket-logs' });
addChannel({ id: 'PANEL', type: 0, name: 'open-a-ticket' });
addChannel({ id: 'GENERAL', type: 0, name: 'general' });
async function readBody(body) {
  if (!body) return { json: undefined, files: [] };
  if (typeof body === 'string') return { json: JSON.parse(body), files: [] };
  const json = JSON.parse(body.get('payload_json'));
  const files = [];
  for (let i = 0; body.get(`files[${i}]`); i++) { const f = body.get(`files[${i}]`); files.push({ filename: f.name, text: await f.text() }); }
  return { json, files };
}
const reply = (o, status = 200) => new Response(o === null ? null : JSON.stringify(o), { status: o === null ? 204 : status, headers: { 'content-type': 'application/json' } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input.url || input);
  if (!url.startsWith('https://discord.com/api/v10')) throw new Error(`unexpected fetch ${url}`);
  const u = new URL(url);
  const p = u.pathname.replace('/api/v10', '');
  const method = init.method || 'GET';
  const { json, files } = await readBody(init.body);
  state.calls.push({ method, p, json, files });
  let m;
  if (method === 'GET' && p === `/guilds/${G}`) return reply(state.guild);
  if (method === 'POST' && p === `/guilds/${G}/channels`) {
    if (json.parent_id && !state.channels.has(json.parent_id)) return reply({ message: 'Unknown parent', code: 50035 }, 400);
    return reply(addChannel({ type: json.type, name: json.name, parent_id: json.parent_id || null, topic: json.topic, permission_overwrites: json.permission_overwrites || [] }));
  }
  if ((m = /^\/channels\/([^/]+)$/.exec(p))) {
    const ch = state.channels.get(m[1]);
    if (!ch) return reply({ message: 'Unknown Channel', code: 10003 }, 404);
    if (method === 'GET') return reply(ch);
    if (method === 'PATCH') { Object.assign(ch, json); return reply(ch); }
    if (method === 'DELETE') { state.channels.delete(m[1]); return reply(ch); }
  }
  if ((m = /^\/channels\/([^/]+)\/messages$/.exec(p))) {
    const list = state.channels.has(m[1]) && state.messages.get(m[1]);
    if (!list) return reply({ message: 'Unknown Channel', code: 10003 }, 404);
    if (method === 'GET') {
      const limit = Number(u.searchParams.get('limit') || 50);
      const before = u.searchParams.get('before');
      let newest = [...list].reverse();
      if (before) newest = newest.filter((x) => BigInt(x.id) < BigInt(before));
      return reply(newest.slice(0, limit));
    }
    if (method === 'POST') {
      const msg = { id: snow(), channel_id: m[1], author: { id: BOT, username: 'OmniDx', bot: true }, content: json.content || '', embeds: json.embeds || [], components: json.components || [], attachments: files.map((f) => ({ filename: f.filename, url: `https://cdn.example/${f.filename}`, text: f.text })), timestamp: new Date().toISOString() };
      list.push(msg);
      return reply(msg);
    }
  }
  if ((m = /^\/channels\/([^/]+)\/permissions\/([^/]+)$/.exec(p))) {
    const ch = state.channels.get(m[1]);
    ch.permission_overwrites = ch.permission_overwrites.filter((o) => o.id !== m[2]);
    if (method === 'PUT') ch.permission_overwrites.push({ id: m[2], ...json });
    return reply(null);
  }
  if ((m = /^\/guilds\/G1\/members\/([^/]+)\/roles\/([^/]+)$/.exec(p))) {
    const set = state.memberRoles.get(m[1]) || new Set();
    if (method === 'PUT') set.add(m[2]); else set.delete(m[2]);
    state.memberRoles.set(m[1], set);
    return reply(null);
  }
  if (method === 'POST' && p === '/users/@me/channels') {
    if (state.noDm.has(json.recipient_id)) return reply({ message: 'Cannot send messages to this user', code: 50007 }, 403);
    const id = `DM_${json.recipient_id}`;
    if (!state.channels.has(id)) addChannel({ id, type: 1, name: 'dm' });
    state.dms.set(json.recipient_id, id);
    return reply({ id, type: 1 });
  }
  if ((m = /^\/webhooks\/APP\/([^/]+)\/messages\/@original$/.exec(p))) {
    state.followups.set(m[1], json);
    return reply({ id: snow(), ...json });
  }
  // What setup.mjs uses on top.
  if (method === 'GET' && p === '/users/@me') return reply(state.me);
  if (method === 'PATCH' && p === '/users/@me') { Object.assign(state.me, json, json.avatar ? { avatar: 'set' } : {}); return reply(state.me); }
  if (method === 'GET' && p === '/applications/@me') return reply({ id: APP, verify_key: pub, flags: 0 });
  if (method === 'GET' && p === '/users/@me/guilds') return reply(state.inGuild ? [{ id: G, name: state.guild.name }] : []);
  if (method === 'PATCH' && p === `/guilds/${G}`) { Object.assign(state.guild, json, json.icon ? { icon: 'set' } : {}); return reply(state.guild); }
  if (method === 'GET' && p === `/guilds/${G}/roles`) return reply(state.roles);
  if (method === 'POST' && p === `/guilds/${G}/roles`) { const r = { id: snow(), ...json }; state.roles.push(r); return reply(r); }
  if ((m = /^\/guilds\/G1\/roles\/([^/]+)$/.exec(p)) && method === 'PATCH') { const r = state.roles.find((x) => x.id === m[1]); Object.assign(r, json); return reply(r); }
  if (method === 'GET' && p === `/guilds/${G}/channels`) return reply([...state.channels.values()].filter((c) => c.guild_id === G && c.type !== 1));
  if (method === 'PATCH' && p === `/guilds/${G}/channels`) { for (const o of json) { const c = state.channels.get(o.id); if (c) c.position = o.position; } return reply(null); }
  if ((m = /^\/channels\/([^/]+)\/messages\/([^/]+)$/.exec(p))) {
    const list = state.messages.get(m[1]) || [];
    const msg = list.find((x) => x.id === m[2]);
    if (!msg) return reply({ message: 'Unknown Message' }, 404);
    if (method === 'PATCH') { Object.assign(msg, json); return reply(msg); }
    if (method === 'DELETE') { list.splice(list.indexOf(msg), 1); return reply(null); }
  }
  if (method === 'GET' && p === `/guilds/${G}/invites`) return reply(state.invites);
  if ((m = /^\/channels\/([^/]+)\/invites$/.exec(p)) && method === 'POST') { const v = { code: `inv${state.invites.length + 1}`, inviter: { id: state.me.id }, max_age: 0, max_uses: 0, channel: { id: m[1] } }; state.invites.push(v); return reply(v); }
  if (method === 'PUT' && p === `/applications/${APP}/guilds/${G}/commands`) { state.commands = json; return reply(json); }
  return reply({ message: `stand-in has no route for ${method} ${p}` }, 404);
};

/* ---------------- a stand-in licence server ---------------- */
const LICENCE = {
  async fetch(url, init) {
    const { key } = JSON.parse(init.body);
    const out = key === 'TUNE-GOOD-KEYA-BCDE-FGHJ' ? { ok: true, product: 'tune', seats: 1, used: 1 }
      : key === 'TUNE-SQUA-DKEY-ABCD-EFGH' ? { ok: true, product: 'squad', seats: 1, used: 0 }
      : key === 'TUNE-REFU-NDED-ABCD-EFGH' ? { ok: false, reason: 'That key has been refunded or revoked.' }
      : { ok: false, reason: 'That key was not issued by us.' };
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  },
};

/* ---------------- the bot, signed calls ---------------- */
const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const pub = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex');
const env = { DB, LICENCE, DISCORD_TOKEN: 'test-token', PUBLIC_KEY: pub, APP_ID: APP, CLOSE_DELAY_MS: 0 };
const cfg = { guild_id: G, bot_id: BOT, team_role: 'R_TEAM', buyer_role: 'R_BUYER', ping_role: 'R_PING', tickets_category: 'CAT_TICKETS', logs_channel: 'LOGS', panel_channel: 'PANEL', buyers_channel: 'BUYERS', announcements_channel: 'ANN' };
for (const [k, v] of Object.entries(cfg)) sqlite.prepare('INSERT INTO config (k, v) VALUES (?, ?)').run(k, v);
const worker = (await import(pathToFileURL(path.join(root, 'discord/worker.js')).href)).default;
const { sweep, transcript, tidyKey } = await import(pathToFileURL(path.join(root, 'discord/bot.js')).href);

let tok = 0;
async function send(payload, { sign = true, tamper = false } = {}) {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const headers = { 'content-type': 'application/json', 'x-signature-timestamp': ts };
  if (sign) headers['x-signature-ed25519'] = tamper ? sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')) : sig;
  const waits = [];
  const res = await worker.fetch(new Request('https://bot.example/interactions', { method: 'POST', headers, body }), env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
const member = (id, name, roles = [], permissions = '0') => ({ user: { id, username: name, global_name: name[0].toUpperCase() + name.slice(1) }, roles, permissions });
const PLAYER = member('U1', 'player', []);
const FRIEND = member('U2', 'friend', []);
const STAFF = member('STAFF', 'staff', ['R_TEAM']);
const base = (m, channel = 'PANEL') => ({ application_id: APP, token: `tok${++tok}`, guild_id: G, channel_id: channel, member: m });
const command = (m, name, options, channel) => ({ ...base(m, channel), type: 2, data: { name, options } });
const button = (m, custom_id, channel, message) => ({ ...base(m, channel), type: 3, data: { custom_id, component_type: 2 }, message });
const select = (m, custom_id, values, channel) => ({ ...base(m, channel), type: 3, data: { custom_id, component_type: 3, values } });
const modal = (m, custom_id, values, channel) => ({ ...base(m, channel), type: 5, data: { custom_id, components: Object.entries(values).map(([k, v]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: v }] })) } });

console.log('The OmniDx Discord bot, offline');

/* 1. Discord's checks on the endpoint. */
{
  let r = await send({ type: 1 }, { sign: false });
  expect(r.status === 401, 'an unsigned request is refused (401)');
  r = await send({ type: 1 }, { tamper: true });
  expect(r.status === 401, 'a request with a wrong signature is refused (401)');
  r = await send({ type: 1 });
  expect(r.status === 200 && r.body.type === 1, 'a signed PING gets a PONG');
  const h = await worker.fetch(new Request('https://bot.example/health'), env, { waitUntil() { } });
  expect(h.status === 200 && (await h.json()).db === true, '/health answers and reaches the database');
}

/* 2. Opening a ticket. */
let ticketChannel;
{
  let r = await send(select(PLAYER, 'tk:open', ['tune']));
  const comps = r.body.data?.components || [];
  expect(r.body.type === 9 && r.body.data.custom_id === 'tk:form:tune' && comps.length === 3, 'picking "The tune" in the panel opens its three-box form');
  expect(comps.every((row) => row.components[0].label.length <= 45), 'every form label fits Discord\'s 45 characters');
  const token = `tok${tok + 1}`;
  r = await send(modal(PLAYER, 'tk:form:tune', { windows: 'Windows 11 Home', mode: 'Extreme', what: 'Discord stopped starting with Windows.' }));
  expect(r.body.type === 5 && r.body.data.flags === 64, 'sending the form answers at once (deferred, only visible to the member)');
  const t = rows("SELECT * FROM tickets WHERE user_id = 'U1'")[0];
  ticketChannel = t && t.channel_id;
  const ch = state.channels.get(ticketChannel);
  expect(t && t.status === 'open' && t.kind === 'tune' && ch, 'a ticket row and its channel exist');
  expect(ch && ch.parent_id === 'CAT_TICKETS' && /^ticket-0001-player$/.test(ch.name), `the channel is in the tickets category, named ${ch && ch.name}`);
  const o = (id) => ch.permission_overwrites.find((x) => x.id === id);
  const VIEW = 1n << 10n;
  expect(o(G) && (BigInt(o(G).deny) & VIEW) && o('U1') && (BigInt(o('U1').allow) & VIEW) && o('R_TEAM') && (BigInt(o('R_TEAM').allow) & VIEW) && o(BOT), 'everyone else is shut out; the member, the team and the bot can see it');
  const first = state.messages.get(ticketChannel)[0];
  expect(first && first.content.includes('<@U1>') && first.content.includes('<@&R_TEAM>') && first.embeds[0].fields.some((f) => f.value === 'Windows 11 Home'), 'the first message pings the member and the team and carries the answers');
  expect(first.embeds[1].description.includes("OMNIDX_MODE='support'"), 'the tip for tune tickets is the support-file line');
  expect(first.components[0].components.map((b) => b.custom_id).join() === 'tk:claim,tk:close', 'it has Claim and Close');
  expect(state.followups.get(token)?.content.includes(`<#${ticketChannel}>`), 'the member is told where the ticket is');
  r = await send(select(PLAYER, 'tk:open', ['key']));
  expect(r.body.type === 4 && r.body.data.content.includes(`<#${ticketChannel}>`), 'a second ticket is refused while one is open, with a link to it');
}

/* 3. In the ticket. */
{
  const first = state.messages.get(ticketChannel)[0];
  let r = await send(button(PLAYER, 'tk:claim', ticketChannel, first));
  expect(r.body.type === 4 && /for the team/.test(r.body.data.content), 'a member cannot claim');
  r = await send(button(STAFF, 'tk:claim', ticketChannel, first));
  expect(r.body.type === 7 && r.body.data.components[0].components[0].disabled && /Claimed by Staff/.test(r.body.data.components[0].components[0].label), 'the team claims it; the button says who');
  expect(rows('SELECT claimed_by FROM tickets WHERE id = 1')[0].claimed_by === 'STAFF', 'the claim is recorded');
  r = await send(command(PLAYER, 'ticket', [{ type: 1, name: 'add', options: [{ name: 'user', value: 'U2' }] }], ticketChannel));
  expect(r.body.type === 4 && state.channels.get(ticketChannel).permission_overwrites.some((o) => o.id === 'U2'), '/ticket add lets a friend in');
  r = await send(command(PLAYER, 'ticket', [{ type: 1, name: 'remove', options: [{ name: 'user', value: 'U2' }] }], ticketChannel));
  expect(!state.channels.get(ticketChannel).permission_overwrites.some((o) => o.id === 'U2'), '/ticket remove takes them off');
  r = await send(command(PLAYER, 'ticket', [{ type: 1, name: 'rename', options: [{ name: 'name', value: 'x' }] }], ticketChannel));
  expect(/for the team/.test(r.body.data.content), 'renaming is for the team');
  r = await send(command(PLAYER, 'ticket', [{ type: 1, name: 'close' }], 'GENERAL'));
  expect(/inside a ticket channel/.test(r.body.data.content), '/ticket close outside a ticket says where it works');
  r = await send(command(FRIEND, 'ticket', [{ type: 1, name: 'close' }], ticketChannel));
  expect(/Only the person who opened it/.test(r.body.data.content), 'someone else cannot close it');
  // The conversation, for the transcript.
  state.messages.get(ticketChannel).push({ id: snow(), author: { id: 'U1', username: 'player' }, content: 'Here is my <support> file & a note', embeds: [], attachments: [{ filename: 'OmniDx-support.zip', url: 'https://cdn.example/OmniDx-support.zip' }], timestamp: new Date().toISOString() });
  state.messages.get(ticketChannel).push({ id: snow(), author: { id: 'STAFF', username: 'staff' }, content: 'Fixed: Discord is back in the startup list.', embeds: [], attachments: [], timestamp: new Date().toISOString() });
}

/* 4. Closing: transcript to the logs, a copy by DM with the rating, the channel gone. */
{
  let r = await send(button(PLAYER, 'tk:close', ticketChannel));
  expect(r.body.type === 4 && r.body.data.components[0].components.length === 2, 'Close asks first (close, or close with a reason)');
  r = await send(button(PLAYER, 'tk:close:reason', ticketChannel));
  expect(r.body.type === 9 && r.body.data.custom_id === 'tk:closemodal', 'with a reason opens a one-box form');
  r = await send(modal(PLAYER, 'tk:closemodal', { reason: 'Solved' }, ticketChannel));
  const t = rows('SELECT * FROM tickets WHERE id = 1')[0];
  if (!(t.status === 'closed' && t.reason === 'Solved' && t.closed_by === 'U1' && t.messages === 4)) console.log('    ticket 1:', JSON.stringify(t));
  expect(t.status === 'closed' && t.reason === 'Solved' && t.closed_by === 'U1' && t.messages === 4, 'the ticket is closed with its reason, who closed it and how many messages (the opening, the claim note and two replies)');
  expect(!state.channels.has(ticketChannel), 'the channel is deleted');
  const log = state.messages.get('LOGS').at(-1);
  const html = log && log.attachments[0] && log.attachments[0].text;
  expect(log && /Ticket #1 closed/.test(log.embeds[0].title) && log.embeds[0].fields.some((f) => f.value === 'Solved'), 'the logs get the summary with the reason');
  expect(html && html.includes('Here is my &lt;support&gt; file &amp; a note') && html.includes('OmniDx-support.zip') && html.includes('Fixed: Discord is back'), 'the transcript has every message, escaped, with the attachments');
  const dm = state.messages.get('DM_U1').at(-1);
  expect(dm && dm.attachments[0].filename === 'ticket-0001.html' && dm.components[0].components.length === 5, 'the member gets the transcript by DM with five rating buttons');
  r = await send({ application_id: APP, token: `tok${++tok}`, type: 3, user: PLAYER.user, channel_id: 'DM_U1', data: { custom_id: 'rate:1:5' }, message: dm });
  expect(r.body.type === 7 && r.body.data.components.length === 0 && rows('SELECT rating FROM tickets WHERE id = 1')[0].rating === 5, 'a 5-star rating from the DM is saved and the buttons go');
  expect(/rated 5\/5/.test(state.messages.get('LOGS').at(-1).content), 'the rating is posted to the logs');
  r = await send({ application_id: APP, token: `tok${++tok}`, type: 3, user: FRIEND.user, channel_id: 'DM_U2', data: { custom_id: 'rate:1:1' }, message: dm });
  expect(/not yours/.test(r.body.data.content), 'nobody else can rate it');
}

/* 5. /verify. */
{
  let r = await send(command(PLAYER, 'verify', [{ name: 'key', value: 'tune good keya bcde fghj' }]));
  expect(r.body.data.flags === 64 && /Verified/.test(r.body.data.content) && state.memberRoles.get('U1')?.has('R_BUYER'), 'a real key (typed loosely) gives the Verified Buyer role, privately');
  expect(r.body.data.content.includes("irm omnidx.net/edition.ps1 | iex"), 'and hands over the OmniDx Edition line');
  expect(rows("SELECT user_id FROM links WHERE key = 'TUNE-GOOD-KEYA-BCDE-FGHJ'")[0]?.user_id === 'U1', 'the key is linked to that account');
  r = await send(command(FRIEND, 'verify', [{ name: 'key', value: 'TUNE-GOOD-KEYA-BCDE-FGHJ' }]));
  expect(/another Discord account/.test(r.body.data.content) && !state.memberRoles.get('U2')?.has('R_BUYER'), 'the same key on another account is refused');
  r = await send(modal(FRIEND, 'vf:form', { key: 'TUNE-REFU-NDED-ABCD-EFGH' }));
  expect(/refunded or revoked/.test(r.body.data.content), 'a refunded key is refused in the key server\'s words (from the Verify button\'s form)');
  r = await send(command(FRIEND, 'verify', [{ name: 'key', value: 'hello' }]));
  expect(/does not look like a key/.test(r.body.data.content), 'something that is not a key gets the format');
  for (let i = 0; i < 4; i++) await send(command(FRIEND, 'verify', [{ name: 'key', value: 'TUNE-NOPE-NOPE-NOPE-NOPE' }]));
  r = await send(command(FRIEND, 'verify', [{ name: 'key', value: 'TUNE-SQUA-DKEY-ABCD-EFGH' }]));
  expect(/Too many tries/.test(r.body.data.content), 'the seventh try in an hour is stopped');
  expect(tidyKey('squad-abcd-efgh-jklm-npqr') === 'SQUAD-ABCD-EFGH-JKLM-NPQR' && tidyKey('TUNE-ABC') === null, 'keys are tidied the way the site writes them');
}

/* 6. The other buttons and commands. */
{
  let r = await send(button(PLAYER, 'role:ping', 'GENERAL'));
  expect(/pinged/.test(r.body.data.content) && state.memberRoles.get('U1').has('R_PING'), 'Announcement pings: on');
  r = await send(button(member('U1', 'player', ['R_PING']), 'role:ping', 'GENERAL'));
  expect(/off/.test(r.body.data.content) && !state.memberRoles.get('U1').has('R_PING'), 'and off again');
  r = await send(command(PLAYER, 'faq', [{ name: 'topic', value: 'anticheat' }], 'GENERAL'));
  expect(r.body.type === 4 && !r.body.data.flags && /anti-cheat/i.test(r.body.data.embeds[0].title), '/faq posts the answer for everyone to see');
  r = await send(command(PLAYER, 'stats', [], 'GENERAL'));
  expect(/for the team/.test(r.body.data.content), '/stats is for the team');
  r = await send(command(member('OWNER', 'owner', [], String(1n << 3n)), 'stats', [], 'GENERAL'));
  const f = r.body.data.embeds?.[0]?.fields || [];
  expect(f.find((x) => x.name === 'Rating, 30 days')?.value.startsWith('5.00') && f.find((x) => x.name === 'Verified buyers')?.value === '1', '/stats for an administrator: the rating and the verified buyers');
  r = await send(button(PLAYER, 'vf:open', 'GENERAL'));
  expect(r.body.type === 9 && r.body.data.custom_id === 'vf:form', 'Verify my purchase opens the key form');
  r = await send(command(PLAYER, 'ticket', [{ type: 1, name: 'open', options: [{ name: 'about', value: 'edition' }] }], 'GENERAL'));
  expect(r.body.type === 9 && r.body.data.custom_id === 'tk:form:edition', '/ticket open about:OmniDx Edition opens that form');
}

/* 7. The sweep: waiting on the team, waiting on the member, and closing a quiet ticket. */
{
  state.noDm.add('U2');
  await send(modal(FRIEND, 'tk:form:key', { order: '#1234', what: 'No key on the page.' }));
  const t = rows("SELECT * FROM tickets WHERE user_id = 'U2' AND status = 'open'")[0];
  const ch = t && t.channel_id;
  expect(ch && state.channels.get(ch).name === 'ticket-0002-friend', 'a second ticket opens as #0002');
  const now = Date.now();
  state.messages.get(ch).push({ id: snow(now), author: { id: 'U2', username: 'friend' }, content: 'Anyone?', embeds: [], attachments: [] });
  await sweep(env, now + 13 * 3600e3);
  expect(/waited 12 hours/.test(state.messages.get('LOGS').at(-1).content) && rows('SELECT reminded_at FROM tickets WHERE id = ?', t.id)[0].reminded_at, 'waiting on the team for 12 hours: the team is told once');
  const before = state.messages.get('LOGS').length;
  await sweep(env, now + 14 * 3600e3);
  expect(state.messages.get('LOGS').length === before, 'and only once');
  state.messages.get(ch).push({ id: snow(now), author: { id: 'STAFF', username: 'staff' }, content: 'Which email did you pay with?', embeds: [], attachments: [] });
  await sweep(env, now + 25 * 3600e3);
  expect(/closes by itself/.test(state.messages.get(ch).at(-1).content) && rows('SELECT warned_at FROM tickets WHERE id = ?', t.id)[0].warned_at, 'waiting on the member for 24 hours: a note that it closes in 24 more');
  await sweep(env, now + 30 * 3600e3);
  expect(state.channels.has(ch), 'not closed before those 24 hours are up');
  await sweep(env, now + 50 * 3600e3);
  const done = rows('SELECT * FROM tickets WHERE id = ?', t.id)[0];
  expect(done.status === 'closed' && done.reason === 'No reply for 48 hours' && done.closed_by === 'bot' && !state.channels.has(ch), 'then it closes by itself, with the transcript kept');
  expect(!state.messages.has('DM_U2') || !state.messages.get('DM_U2').length, 'a member who takes no DMs just gets no copy (and nothing breaks)');
  // A ticket whose channel was deleted by hand is marked closed.
  await send(modal(PLAYER, 'tk:form:other', { what: 'Hello' }));
  const t3 = rows("SELECT * FROM tickets WHERE user_id = 'U1' AND status = 'open'")[0];
  state.channels.delete(t3.channel_id);
  await sweep(env, now);
  if (!t3) console.log('    no third ticket open:', JSON.stringify(rows("SELECT id, user_id, status FROM tickets")));
  expect(t3 && rows('SELECT status FROM tickets WHERE id = ?', t3.id)[0].status === 'closed', 'a ticket channel deleted by hand is marked closed at the next sweep');
}

/* 8. setup.mjs on a brand-new server, twice: everything made the first time, nothing made twice the second. */
{
  const os = await import('node:os');
  for (const id of [...state.channels.keys()]) { state.channels.delete(id); state.messages.delete(id); }
  Object.assign(state, { me: { id: BOT, username: 'omnidx-bot', avatar: null }, roles: [{ id: G, name: '@everyone', color: 0, hoist: false, permissions: '0' }], invites: [], commands: [], inGuild: false });
  Object.assign(state.guild, { icon: null, verification_level: 0, explicit_content_filter: 0, default_message_notifications: 0, system_channel_id: null });
  const tc = addChannel({ type: 4, name: 'Text Channels' }); addChannel({ type: 0, name: 'general', parent_id: tc.id });
  const vc = addChannel({ type: 4, name: 'Voice Channels' }); addChannel({ type: 2, name: 'General', parent_id: vc.id });
  process.env.DISCORD_TOKEN = 'test-token';
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'omnidx-discord-'));
  process.env.DISCORD_OUT = out;
  const exits = [];
  const realExit = process.exit;
  process.exit = (code) => { exits.push(code); throw new Error(`exit ${code}`); };
  const run = async (n) => { try { await import(pathToFileURL(path.join(root, 'discord/setup.mjs')).href + `?run=${n}`); } catch (e) { if (!/^exit /.test(e.message)) throw e; } };
  const logSave = console.log; const lines = []; console.log = (...a) => lines.push(a.join(' '));
  try {
    await run(0);
    expect(exits[0] === 3 && lines.some((l) => l.includes(`client_id=${APP}`)), 'with the bot in no server yet, setup stops with exit 3 and prints the link that adds it');
    state.inGuild = true;
    const before = state.calls.length;
    await run(1);
    const posts = (re) => state.calls.slice(before).filter((c) => c.method === 'POST' && re.test(c.p)).length;
    const chans = [...state.channels.values()];
    const byName = (n, t = 0) => chans.find((c) => c.name === n && c.type === t);
    const cats = chans.filter((c) => c.type === 4).map((c) => c.name);
    expect(state.roles.filter((r) => ['OmniDx Team', 'Verified Buyer', 'Announcements'].includes(r.name)).length === 3, 'the three roles are made');
    expect(['📌 START HERE', '💬 COMMUNITY', '🛠️ SUPPORT', '💜 BUYERS', '🎫 TICKETS', '🔒 TEAM', '🔊 VOICE'].every((n) => cats.includes(n)), 'every category is made, in the layout\'s order of names');
    expect(!cats.includes('Text Channels') && !cats.includes('Voice Channels'), 'the new server\'s own empty categories are gone');
    const general = byName('general');
    expect(general && general.parent_id === byName('💬 COMMUNITY', 4).id && chans.filter((c) => c.name === 'general').length === 1, 'the server\'s own #general is kept and moved into COMMUNITY (not duplicated)');
    expect(byName('General', 2).parent_id === byName('🔊 VOICE', 4).id, 'its General voice channel joins VOICE');
    const VIEW = 1n << 10n, SEND = 1n << 11n;
    const ow = (c, id) => (c.permission_overwrites || []).find((o) => o.id === id);
    const team = state.roles.find((r) => r.name === 'OmniDx Team').id, buyer = state.roles.find((r) => r.name === 'Verified Buyer').id;
    expect(BigInt(ow(byName('rules'), G).deny) & SEND && BigInt(ow(byName('rules'), team).allow) & SEND, '#rules: everyone reads, only the team posts');
    expect(BigInt(ow(byName('buyers-lounge'), G).deny) & VIEW && BigInt(ow(byName('buyers-lounge'), buyer).allow) & VIEW, '#buyers-lounge: only Verified Buyers (and the team) see it');
    expect(BigInt(ow(byName('ticket-logs'), G).deny) & VIEW && !ow(byName('ticket-logs'), buyer), '#ticket-logs: the team only');
    const panelMsgs = (n) => (state.messages.get(byName(n).id) || []).length;
    expect(panelMsgs('welcome') === 1 && panelMsgs('rules') === 1 && panelMsgs('faq') === 2 && panelMsgs('open-a-ticket') === 1 && panelMsgs('buyers-lounge') === 1, 'the welcome, rules, FAQ (two messages), ticket panel and buyers panels are posted');
    const tp = state.messages.get(byName('open-a-ticket').id)[0];
    expect(tp.components[0].components[0].custom_id === 'tk:open' && tp.components[0].components[0].options.length === 5, 'the ticket panel has the five kinds in its menu');
    const wm = state.messages.get(byName('welcome').id)[0];
    expect(wm.components.flatMap((r) => r.components).some((b) => b.custom_id === 'vf:open'), 'the welcome has Verify my purchase');
    expect(state.guild.icon === 'set' && state.guild.system_channel_id === general.id && state.guild.verification_level === 1, 'the server gets the eagle as its icon, #general for join messages, and email verification');
    expect(state.me.username === 'OmniDx' && state.me.avatar === 'set', 'the bot is named OmniDx and wears the eagle');
    expect(state.commands.map((c) => c.name).join() === 'ticket,verify,faq,stats', 'the four slash commands are registered');
    expect(state.memberRoles.get('OWNER')?.has(team), 'the owner wears the OmniDx Team role');
    const sql = fs.readFileSync(path.join(out, 'config.sql'), 'utf8');
    expect(['guild_id', 'bot_id', 'team_role', 'buyer_role', 'tickets_category', 'logs_channel', 'invite'].every((k) => sql.includes(`'${k}'`)), 'config.sql carries every id the bot needs, and the invite');
    expect(JSON.parse(fs.readFileSync(path.join(out, 'discord.json'), 'utf8')).invite === 'https://discord.gg/inv1', 'discord.json has the invite for the site');
    // The second run: the same server, nothing new.
    const mark = state.calls.length;
    await run(2);
    const made = state.calls.slice(mark).filter((c) => c.method === 'POST' && /\/(channels|roles|messages|invites)$/.test(c.p)).length;
    expect(made === 0, `a second run makes nothing new (${made} creates)`);
    expect(panelMsgs('faq') === 2 && [...state.channels.values()].filter((c) => c.name === 'welcome').length === 1 && state.invites.length === 1, 'the panels are edited in place, the invite is reused');
    expect(posts(/\/channels$/) > 10, 'the first run made the channels it needed');
  } finally { console.log = logSave; process.exit = realExit; }
}

/* 9. The transcript on its own. */
{
  const html = transcript({ id: 7, kind: 'bug', user_name: '<b>x</b>', user_id: '1', opened_at: Date.now(), reason: 'ok' }, [{ id: snow(), author: { username: 'a' }, content: '<script>alert(1)</script>', embeds: [], attachments: [] }], 'Srv');
  expect(!html.includes('<script>alert') && html.includes('&lt;script&gt;') && html.includes('&lt;b&gt;x&lt;/b&gt;'), 'the transcript escapes everything it is given');
}

globalThis.fetch = realFetch;
console.log(failed ? `${failed} problem(s)` : 'all good');
process.exit(failed ? 1 : 0);
