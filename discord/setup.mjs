#!/usr/bin/env node
/*
 * Builds the OmniDx Discord server from content.js, with the bot's token: the roles, the categories and channels
 * with their permissions, the welcome, rules, FAQ, buyers and ticket panels, the server's icon and settings, the bot's
 * name and picture, an invite that never expires, and the slash commands. Run again at any time: whatever exists is
 * kept and brought in line (found by name), panels are edited in place, nothing is posted twice, and nothing the
 * owner made is deleted.
 *
 *   DISCORD_TOKEN=... [GUILD_ID=...] node discord/setup.mjs OUT_DIR
 *
 * Writes OUT_DIR/config.sql (the ids the bot needs, for its D1 table) and OUT_DIR/discord.json (the invite, for the
 * site). Exit 3: the bot is in no server yet (the invite link is printed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discord } from './bot.js';
import { LAYOUT, ROLES, KINDS, FAQ, RULES, COMMANDS, COLOR, BANNER, SITE, TUNE_LINE, EDITION_LINE, BENCH_LINE } from './content.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = { DISCORD_TOKEN: process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN };
const out = process.argv[2] || process.env.DISCORD_OUT || path.join(here, '.out');
const B = (n) => 1n << BigInt(n);
const P = { VIEW: B(10), SEND: B(11), MANAGE_MESSAGES: B(13), EMBED: B(14), ATTACH: B(15), HISTORY: B(16), ADD_REACTIONS: B(6),
  MANAGE_CHANNELS: B(4), SEND_THREADS: B(38), PUBLIC_THREADS: B(35), PRIVATE_THREADS: B(36), CONNECT: B(20), SPEAK: B(21) };
const TALK = P.VIEW | P.SEND | P.HISTORY | P.EMBED | P.ATTACH | P.ADD_REACTIONS;
const log = (...a) => console.log(...a);
const api = (method, p, body, opts) => discord(env, method, p, body, opts);

if (!env.DISCORD_TOKEN) { console.error('DISCORD_TOKEN is not set'); process.exit(2); }

const me = await api('GET', '/users/@me');
const app = await api('GET', '/applications/@me');
const invite = `https://discord.com/oauth2/authorize?client_id=${app.id}&scope=bot+applications.commands&permissions=8`;
log(`bot: ${me.username} (${me.id}), application ${app.id}`);

const guilds = await api('GET', '/users/@me/guilds');
let gid = process.env.GUILD_ID || '';
if (!gid) {
  if (guilds.length === 1) gid = guilds[0].id;
  else if (guilds.length > 1) { console.error(`The bot is in ${guilds.length} servers (${guilds.map((g) => `${g.name} ${g.id}`).join(', ')}); set DISCORD_GUILD_ID to the one to build.`); process.exit(4); }
}
if (!gid) {
  log(`The bot is not in a server yet. Add it with this link (pick your server, press Authorize), then run this again:\n${invite}`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'invite-bot.txt'), invite + '\n');
  process.exit(3);
}

const guild = await api('GET', `/guilds/${gid}`);
log(`server: ${guild.name} (${gid})`);
const everyone = gid;

/* ---------------------------------------------------------------- roles */
let roles = await api('GET', `/guilds/${gid}/roles`);
const role = {};
for (const [key, want] of Object.entries(ROLES)) {
  let r = roles.find((x) => x.name === want.name);
  if (!r) { r = await api('POST', `/guilds/${gid}/roles`, want, { reason: 'OmniDx setup' }); log(`role made: ${want.name}`); }
  else if (r.color !== want.color || r.hoist !== want.hoist || r.permissions !== want.permissions) {
    r = await api('PATCH', `/guilds/${gid}/roles/${r.id}`, { color: want.color, hoist: want.hoist, permissions: want.permissions }, { reason: 'OmniDx setup' }).catch((e) => { log(`role ${want.name} left as it is: ${e.message}`); return r; });
  }
  role[key] = r.id;
}
// The owner answers tickets too, so they wear the team role.
await api('PUT', `/guilds/${gid}/members/${guild.owner_id}/roles/${role.team}`, undefined, { reason: 'OmniDx setup: the owner is on the team' }).catch((e) => log(`owner role: ${e.message}`));

/* ---------------------------------------------------------------- channels */
const ow = (id, type, allow = 0n, deny = 0n) => ({ id, type, allow: String(allow), deny: String(deny) });
function overwrites(access) {
  const bot = ow(me.id, 1, TALK | P.MANAGE_CHANNELS | P.MANAGE_MESSAGES);
  if (access === 'read') return [ow(everyone, 0, P.VIEW | P.HISTORY | P.ADD_REACTIONS, P.SEND | P.SEND_THREADS | P.PUBLIC_THREADS | P.PRIVATE_THREADS), ow(role.team, 0, TALK | P.MANAGE_MESSAGES), bot];
  if (access === 'buyers') return [ow(everyone, 0, 0n, P.VIEW), ow(role.buyer, 0, TALK), ow(role.team, 0, TALK | P.MANAGE_MESSAGES), bot];
  if (access === 'team') return [ow(everyone, 0, 0n, P.VIEW), ow(role.team, 0, TALK | P.MANAGE_MESSAGES), bot];
  if (access === 'tickets') return [ow(everyone, 0, 0n, P.VIEW), ow(role.team, 0, P.VIEW | P.HISTORY), bot];
  return [bot];
}
const sameOverwrites = (a = [], b = []) => {
  const key = (x) => `${x.id}:${x.type}:${x.allow}:${x.deny}`;
  return a.map(key).sort().join('|') === b.map(key).sort().join('|');
};

let channels = await api('GET', `/guilds/${gid}/channels`);
const ids = {};
const order = [];
for (const [ci, cat] of LAYOUT.entries()) {
  let parent = channels.find((c) => c.type === 4 && c.name === cat.category);
  const catOw = overwrites(cat.access);
  if (!parent) { parent = await api('POST', `/guilds/${gid}/channels`, { name: cat.category, type: 4, permission_overwrites: catOw }, { reason: 'OmniDx setup' }); log(`category made: ${cat.category}`); channels.push(parent); }
  else if (!sameOverwrites(parent.permission_overwrites, catOw)) await api('PATCH', `/channels/${parent.id}`, { permission_overwrites: catOw }, { reason: 'OmniDx setup' });
  order.push({ id: parent.id, position: ci });
  if (cat.access === 'tickets') ids.tickets_category = parent.id;
  for (const [i, ch] of cat.channels.entries()) {
    const type = ch.voice ? 2 : 0;
    const chOw = overwrites(ch.access || cat.access);
    let c = channels.find((x) => x.type === type && x.name === ch.name && x.parent_id === parent.id)
      || channels.find((x) => x.type === type && x.name === ch.name);
    const want = { name: ch.name, parent_id: parent.id, permission_overwrites: chOw, ...(type === 0 ? { topic: ch.topic || null } : {}) };
    if (!c) { c = await api('POST', `/guilds/${gid}/channels`, { ...want, type }, { reason: 'OmniDx setup' }); log(`channel made: ${cat.category} / ${ch.name}`); channels.push(c); }
    else if (c.parent_id !== parent.id || (type === 0 && (c.topic || null) !== (ch.topic || null)) || !sameOverwrites(c.permission_overwrites, chOw)) {
      c = await api('PATCH', `/channels/${c.id}`, want, { reason: 'OmniDx setup' });
    }
    ids[ch.key] = c.id;
    order.push({ id: c.id, position: i });
  }
}
// A new server's own "Text Channels" and "Voice Channels" categories go once they are empty; its General voice
// channel joins the voice category.
channels = await api('GET', `/guilds/${gid}/channels`);
const voiceCat = channels.find((c) => c.type === 4 && c.name === LAYOUT[LAYOUT.length - 1].category);
for (const c of channels.filter((x) => x.type === 2 && x.name === 'General' && x.parent_id !== voiceCat?.id)) {
  await api('PATCH', `/channels/${c.id}`, { parent_id: voiceCat.id, permission_overwrites: overwrites('open') }, { reason: 'OmniDx setup' }).catch(() => { });
}
channels = await api('GET', `/guilds/${gid}/channels`);
for (const cat of channels.filter((c) => c.type === 4 && ['Text Channels', 'Voice Channels'].includes(c.name))) {
  if (!channels.some((c) => c.parent_id === cat.id)) { await api('DELETE', `/channels/${cat.id}`, undefined, { reason: 'OmniDx setup: empty default category' }).catch(() => { }); log(`empty category removed: ${cat.name}`); }
}
await api('PATCH', `/guilds/${gid}/channels`, order.filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i), { reason: 'OmniDx setup: order' }).catch((e) => log(`order: ${e.message}`));

/* ---------------------------------------------------------------- panels */
// Each panel channel holds only the bot's messages: the ones there are edited in order, missing ones posted, extras
// removed. Other people's messages are never touched.
async function panel(channelId, messages) {
  const mine = (await api('GET', `/channels/${channelId}/messages?limit=50`)).filter((m) => m.author.id === me.id).reverse();
  for (const [i, m] of messages.entries()) {
    const body = { content: m.content || '', embeds: m.embeds || [], components: m.components || [], allowed_mentions: { parse: [] } };
    if (mine[i]) await api('PATCH', `/channels/${channelId}/messages/${mine[i].id}`, body);
    else await api('POST', `/channels/${channelId}/messages`, body);
  }
  for (const extra of mine.slice(messages.length)) await api('DELETE', `/channels/${channelId}/messages/${extra.id}`).catch(() => { });
}
const link = (label, url, emoji) => ({ type: 2, style: 5, label, url, ...(emoji ? { emoji: { name: emoji } } : {}) });
const row = (...components) => ({ type: 1, components });

await panel(ids.welcome, [{
  embeds: [
    { color: COLOR.violet, image: { url: BANNER } },
    { color: COLOR.violet, title: `Welcome to ${guild.name}`,
      description: [
        '**OmniDx Tune** cuts Windows down to what your games need with one command: startup apps, services, bloat and telemetry off, a power plan built for frames, your network, Discord, Spotify and browser tuned, a profile for each game, and a BIOS checklist for your board. Undo is one line.',
        '',
        '**OmniDx Edition** comes with every key: genuine Windows set up for games in one go.',
        '',
        `▸ Run it: \`${TUNE_LINE}\` in PowerShell (the free report changes nothing)`,
        `▸ Your FPS, measured: \`${BENCH_LINE}\` (free), then post the card in <#` + ids.results + '>',
        '▸ Bought it? Press **Verify my purchase** for the Verified Buyer role and the buyers lounge',
        '▸ Need help? <#' + ids.tunehelp + '> for questions, <#' + ids.panel + '> for anything private',
        '▸ Read <#' + ids.rules + '>, then say hi in <#' + ids.general + '>',
      ].join('\n') },
  ],
  components: [
    row({ type: 2, style: 3, custom_id: 'vf:open', label: 'Verify my purchase', emoji: { name: '✅' } },
      { type: 2, style: 2, custom_id: 'role:ping', label: 'Announcement pings', emoji: { name: '🔔' } }),
    row(link('Website', SITE, '🌐'), link('Get it', `${SITE}pricing/`, '⚡'), link('Showcase', `${SITE}showcase/`, '🎬'), link('OmniDx Edition', `${SITE}edition/`, '🦅')),
  ],
}]);

await panel(ids.rules, [{
  embeds: [{ color: COLOR.violet, title: '📜 The rules', description: 'Short, and they apply everywhere here, DMs included.',
    fields: RULES.map(([name, value], i) => ({ name: `${i + 1}. ${name}`, value })), footer: { text: 'Breaking them gets a warning, a timeout or a ban, depending on how bad.' } }],
}]);

const faqs = Object.values(FAQ).map((f) => ({ color: COLOR.violet, title: f.q, description: f.a }));
await panel(ids.faq, [
  { content: '## Questions everyone asks\nType `/faq` in any channel to post one of these answers there.', embeds: faqs.slice(0, 5) },
  { embeds: faqs.slice(5, 10) },
]);

await panel(ids.panel, [{
  embeds: [{ color: COLOR.violet, title: '🎫 Open a ticket',
    description: [
      'Pick what it is about below. A short form opens, then a **private channel** only you and the team can see.',
      '',
      ...KINDS.map((k) => `${k.emoji} **${k.label}** — ${k.desc}`),
      '',
      'Questions others might have too are faster in <#' + ids.tunehelp + '> or <#' + ids.editionhelp + '>.',
      "For tune problems, the support file helps most: `$env:OMNIDX_MODE='support'; irm omnidx.net/go.ps1 | iex` puts a zip on your desktop.",
    ].join('\n'),
    footer: { text: 'One open ticket per person. A copy of the conversation comes to you by DM when it closes.' } }],
  components: [row({ type: 3, custom_id: 'tk:open', placeholder: 'What is it about?', options: KINDS.map((k) => ({ label: k.label, value: k.id, description: k.desc.slice(0, 100), emoji: { name: k.emoji } })) })],
}]);

await panel(ids.buyers, [{
  embeds: [{ color: COLOR.green, title: '💜 Thanks for buying OmniDx Tune',
    description: [
      'This lounge is for buyers: talk settings, share results, and get answers first.',
      '',
      `▸ Your key, any time: ${SITE}activate/ (with your receipt number)`,
      `▸ Extreme: \`$env:OMNIDX_MODE='extreme'; ${TUNE_LINE}\``,
      `▸ OmniDx Edition: \`$env:OMNIDX_KEY='YOUR-KEY'; ${EDITION_LINE}\` (the guide: ${SITE}edition/)`,
      `▸ Undo: \`$env:OMNIDX_MODE='undo'; ${TUNE_LINE}\``,
      `▸ Stock against tuned, measured: \`${BENCH_LINE}\` before and after (restart first), card in <#` + ids.results + '>',
      '▸ Every update is free: the same command always fetches the newest version.',
    ].join('\n') }],
}]);

/* ---------------------------------------------------------------- the server and the bot */
const settings = {};
if (!guild.icon) {
  const pic = path.join(here, '..', 'studio', 'assets', 'logo', 'pfp-800.jpg');
  if (fs.existsSync(pic)) settings.icon = `data:image/jpeg;base64,${fs.readFileSync(pic).toString('base64')}`;
}
if (guild.system_channel_id !== ids.general) settings.system_channel_id = ids.general;
if (guild.verification_level < 1) settings.verification_level = 1;
if (guild.explicit_content_filter < 2) settings.explicit_content_filter = 2;
if (guild.default_message_notifications !== 1) settings.default_message_notifications = 1;
if (Object.keys(settings).length) await api('PATCH', `/guilds/${gid}`, settings, { reason: 'OmniDx setup' }).then(() => log(`server settings: ${Object.keys(settings).join(', ')}`)).catch((e) => log(`server settings left as they are: ${e.message}`));
const profile = {};
if (me.username !== 'OmniDx') profile.username = 'OmniDx';
if (!me.avatar) {
  const pic = path.join(here, '..', 'studio', 'assets', 'logo', 'pfp-800.jpg');
  if (fs.existsSync(pic)) profile.avatar = `data:image/jpeg;base64,${fs.readFileSync(pic).toString('base64')}`;
}
if (Object.keys(profile).length) await api('PATCH', '/users/@me', profile).then(() => log(`bot profile: ${Object.keys(profile).join(', ')}`)).catch((e) => log(`bot profile left as it is: ${e.message}`));

/* ---------------------------------------------------------------- invite, commands, config */
let code = '';
try {
  const invites = await api('GET', `/guilds/${gid}/invites`);
  const keep = invites.find((v) => v.inviter?.id === me.id && v.max_age === 0 && v.max_uses === 0 && v.channel?.id === ids.welcome);
  code = keep ? keep.code : (await api('POST', `/channels/${ids.welcome}/invites`, { max_age: 0, max_uses: 0, unique: false }, { reason: 'OmniDx setup: the invite on omnidx.net' })).code;
} catch (e) { log(`invite: ${e.message}`); }
const inviteUrl = code ? `https://discord.gg/${code}` : '';

await api('PUT', `/applications/${app.id}/guilds/${gid}/commands`, COMMANDS);
log(`slash commands: ${COMMANDS.map((c) => '/' + c.name).join(' ')}`);

const cfg = {
  guild_id: gid, bot_id: me.id, team_role: role.team, buyer_role: role.buyer, ping_role: role.ping,
  tickets_category: ids.tickets_category, logs_channel: ids.logs, panel_channel: ids.panel, welcome_channel: ids.welcome,
  general_channel: ids.general, buyers_channel: ids.buyers, announcements_channel: ids.announcements, team_channel: ids.teamchat,
  invite: inviteUrl,
};
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'config.sql'), Object.entries(cfg).filter(([, v]) => v).map(([k, v]) => `INSERT OR REPLACE INTO config (k, v) VALUES (${q(k)}, ${q(v)});`).join('\n') + '\n');
fs.writeFileSync(path.join(out, 'discord.json'), JSON.stringify({ invite: inviteUrl, name: guild.name }, null, 2) + '\n');
log(`done. Invite: ${inviteUrl || '(none: give the bot Manage Server)'}`);
