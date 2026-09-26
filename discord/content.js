/*
 * What the OmniDx Discord says and how it is laid out, in one place: the bot (worker.js) reads it for the ticket
 * forms, the FAQ answers and the commands, and setup.mjs reads it to build the server. Change the words here and
 * run the Discord workflow again; every panel is edited in place, nothing is posted twice.
 */

export const SITE = 'https://omnidx.net/studio/';
export const COLOR = { violet: 0x8b5cf6, green: 0x35d07f, red: 0xff5d6c, amber: 0xffc247, grey: 0x2b2d31 };
export const BANNER = 'https://omnidx.net/studio/assets/logo/banner-1500x500.jpg';
export const TUNE_LINE = 'irm omnidx.net/go.ps1 | iex';
export const EDITION_LINE = 'irm omnidx.net/edition.ps1 | iex';

/* The roles the bot makes. The owner gives "OmniDx Team" to whoever answers tickets; "Verified Buyer" comes from
   /verify; "Announcements" is the opt-in ping from the button in #welcome. Permissions are Discord's bit numbers. */
export const ROLES = {
  team: { name: 'OmniDx Team', color: COLOR.violet, hoist: true, mentionable: true,
    // kick, view the audit log, manage messages, manage threads, time members out
    permissions: String((1n << 1n) | (1n << 7n) | (1n << 13n) | (1n << 34n) | (1n << 40n)) },
  buyer: { name: 'Verified Buyer', color: COLOR.green, hoist: true, mentionable: false, permissions: '0' },
  ping: { name: 'Announcements', color: 0, hoist: false, mentionable: false, permissions: '0' },
};

/* The server, top to bottom. access: open (everyone talks), read (everyone reads, the team posts), buyers (Verified
   Buyer and the team), team (the team only), tickets (nobody but the bot and the team; tickets add the opener). */
export const LAYOUT = [
  { category: '📌 START HERE', access: 'read', channels: [
    { key: 'welcome', name: 'welcome', topic: 'Start here: what OmniDx is, verify your purchase, get announcement pings.' },
    { key: 'rules', name: 'rules', topic: 'The rules. Short, and they apply everywhere here.' },
    { key: 'announcements', name: 'announcements', topic: 'New versions, new features and fixes. Opt in to pings in #welcome.' },
    { key: 'faq', name: 'faq', topic: 'The questions everyone asks, answered. /faq posts any of them in a chat.' },
  ] },
  { category: '💬 COMMUNITY', access: 'open', channels: [
    { key: 'general', name: 'general', topic: 'Talk about anything PC and gaming.' },
    { key: 'results', name: 'results', topic: 'Before and after: post your Task Manager, your frame times, your 1% lows.' },
    { key: 'setups', name: 'setups', topic: 'Show your rig, your desk, your settings.' },
    { key: 'clips', name: 'clips', topic: 'Clips and highlights.' },
    { key: 'suggestions', name: 'suggestions', topic: 'What should OmniDx do next? One idea per message; react to vote.' },
    { key: 'offtopic', name: 'off-topic', topic: 'Everything else.' },
  ] },
  { category: '🛠️ SUPPORT', access: 'open', channels: [
    { key: 'panel', name: 'open-a-ticket', access: 'read', topic: 'Private help from the team: pick what it is about below and a private channel opens.' },
    { key: 'tunehelp', name: 'tune-help', topic: 'Questions about the tune, answered by the community and the team. Private things (keys, orders) go in a ticket.' },
    { key: 'editionhelp', name: 'edition-help', topic: 'OmniDx Edition: the USB stick, installing, Game Boost, the apps.' },
  ] },
  { category: '💜 BUYERS', access: 'buyers', channels: [
    { key: 'buyers', name: 'buyers-lounge', topic: 'For people who bought OmniDx Tune. Verify in #welcome to see this.' },
  ] },
  { category: '🎫 TICKETS', access: 'tickets', channels: [] },
  { category: '🔒 TEAM', access: 'team', channels: [
    { key: 'logs', name: 'ticket-logs', topic: 'Every closed ticket with its transcript, every rating, every verification.' },
    { key: 'teamchat', name: 'team-chat', topic: 'The team only.' },
  ] },
  { category: '🔊 VOICE', access: 'open', channels: [
    { key: 'lounge', name: 'Lounge', voice: true },
    { key: 'squad1', name: 'Squad 1', voice: true },
    { key: 'squad2', name: 'Squad 2', voice: true },
  ] },
];

/* The ticket kinds: the panel's menu, the form each one opens (at most five boxes, labels up to 45 characters), and
   what the bot says first in the ticket. */
export const KINDS = [
  { id: 'key', emoji: '🔑', label: 'Key or payment', desc: 'No key, a key refused, moving to a new PC',
    fields: [
      { id: 'order', label: 'Order or receipt number (from Square)', style: 1, required: false, max: 100, placeholder: 'On your Square receipt email' },
      { id: 'what', label: 'What is happening?', style: 2, required: true, max: 1500, placeholder: 'The exact message you see helps the most' },
    ],
    tip: 'Your key is on the page after paying, any time: omnidx.net/studio/activate/ with your receipt number. New PC? "Move this key" on that page does it by itself once every 30 days.' },
  { id: 'tune', emoji: '⚡', label: 'The tune', desc: 'Running it, a warning, the undo, something it changed',
    fields: [
      { id: 'windows', label: 'Windows version (10 or 11, Home or Pro)', style: 1, required: false, max: 60 },
      { id: 'mode', label: 'Standard or Extreme?', style: 1, required: false, max: 40 },
      { id: 'what', label: 'What happened?', style: 2, required: true, max: 1500, placeholder: 'What you did, what you expected, what you saw' },
    ],
    tip: "The fastest fix starts with the support file: in PowerShell, paste `$env:OMNIDX_MODE='support'; irm omnidx.net/go.ps1 | iex`. It puts a zip on your desktop (logs and numbers, none of your files); drop it in here." },
  { id: 'edition', emoji: '🦅', label: 'OmniDx Edition', desc: 'The USB stick, installing, Game Boost, the apps',
    fields: [
      { id: 'path', label: 'Clean install or on your PC as it is?', style: 1, required: false, max: 60 },
      { id: 'step', label: 'Which step are you on?', style: 1, required: false, max: 100, placeholder: 'For example: booting from the stick' },
      { id: 'what', label: 'What happened?', style: 2, required: true, max: 1500 },
    ],
    tip: 'Setup keeps a log in `C:\\ProgramData\\OmniDx\\Edition\\setup-log.txt`; drop it in here if setup stopped. The guide: omnidx.net/studio/edition/' },
  { id: 'bug', emoji: '🐞', label: 'Bug report', desc: 'Something did not work the way it says',
    fields: [
      { id: 'did', label: 'What did you do?', style: 2, required: true, max: 800 },
      { id: 'expected', label: 'What did you expect?', style: 2, required: false, max: 600 },
      { id: 'got', label: 'What happened instead?', style: 2, required: true, max: 800 },
    ],
    tip: 'Screenshots and the support file (`$env:OMNIDX_MODE=\'support\'; irm omnidx.net/go.ps1 | iex`) make a bug quick to find.' },
  { id: 'other', emoji: '💬', label: 'Something else', desc: 'Questions before buying, partnerships, anything',
    fields: [
      { id: 'what', label: 'How can we help?', style: 2, required: true, max: 1500 },
    ],
    tip: 'Someone from the team will answer here.' },
];

/* /faq and the #faq channel. short: the choice in the command (up to 100 characters). */
export const FAQ = {
  anticheat: { short: 'Is it safe with anti-cheat (VALORANT, FACEIT, Fortnite)?', q: 'Is it safe with anti-cheat?',
    a: 'Yes. The tune and OmniDx Edition never touch Defender, Windows Update, Secure Boot, TPM or memory integrity, which is what Vanguard and FACEIT require, and never touch a game\'s files or its anti-cheat. It changes Windows\' own settings, each one recorded so undo puts it back.' },
  fps: { short: 'How many FPS will I gain?', q: 'How many FPS will I gain?',
    a: 'No honest number fits every PC: it depends on your GPU, CPU and the game. What you get most is steadier frame times and fewer drops, because fewer things compete with the game. The biggest free gain on most PCs is the BIOS checklist in the report (RAM at its rated speed). The free report shows what it would change first: `$env:OMNIDX_MODE=\'report\'; irm omnidx.net/go.ps1 | iex`' },
  undo: { short: 'How do I undo it?', q: 'How do I undo it?',
    a: 'One line in PowerShell puts every change back: `$env:OMNIDX_MODE=\'undo\'; irm omnidx.net/go.ps1 | iex`. A restore point is also made before every run. OmniDx Edition comes off with `$env:OMNIDX_EDITION=\'undo\'; irm omnidx.net/edition.ps1 | iex`.' },
  newpc: { short: 'I got a new PC. Can I move my key?', q: 'I got a new PC. Can I move my key?',
    a: 'Yes, by yourself, once every 30 days: omnidx.net/studio/activate/ → "New PC? Move this key" with your order or receipt number. Reinstalling Windows on the same PC needs nothing: the key follows the hardware, not the install.' },
  edition: { short: 'What is OmniDx Edition and how do I get it?', q: 'What is OmniDx Edition?',
    a: 'Genuine Windows set up for games in one go (OmniDx Search on Windows + S, a light browser, OmniDx Hub with Game Boost and presets, the lean stage, and the tune in Extreme), on a clean install or your PC as it is. It comes with every key: `$env:OMNIDX_KEY=\'YOUR-KEY\'; irm omnidx.net/edition.ps1 | iex`. The guide: omnidx.net/studio/edition/' },
  nokey: { short: 'I paid but I have no key', q: 'I paid but I have no key.',
    a: 'Your key is on the page Square sends you to after paying, and any time at omnidx.net/studio/activate/ with your receipt number and the email you paid with. Still nothing? Open a ticket in #open-a-ticket with your receipt number.' },
  refunds: { short: 'Can I get a refund?', q: 'Can I get a refund?',
    a: 'All sales are final: the key is delivered the moment you pay. That is why the free report exists, so you can see what it would do on your PC before paying. If the key will not work on your PC, open a ticket and it gets fixed.' },
  squad: { short: 'What is Squad?', q: 'What is Squad?',
    a: 'Three keys for $39.99, one PC each: you, a second rig or a laptop, and friends. Each key gets the tune and OmniDx Edition.' },
  laptop: { short: 'Does it work on a laptop?', q: 'Does it work on a laptop?',
    a: 'Yes, and it knows it is a laptop: battery, lid, brightness, Wi-Fi and Bluetooth keep working, and hibernation is left alone.' },
};

export const RULES = [
  ['Be decent', 'No harassment, hate, slurs or personal attacks. Disagree with ideas, not people.'],
  ['No spam or ads', 'No self-promotion, invite links or DMs to people who did not ask. Clips and setups in their channels are welcome.'],
  ['Keys stay private', 'Never post a key in a public channel, and never buy or sell keys. Keys lock to one PC; a shared key stops working. Key problems go in a ticket.'],
  ['No cheats, cracks or pirated software', 'Not here, not in DMs, not as a joke. OmniDx is for genuine Windows and fair play.'],
  ['Right channel, right thing', 'Help in #tune-help or #edition-help, private things in a ticket, results in #results.'],
  ['The team has the last word', 'Moderators can remove anything that breaks the spirit of these rules. Discord\'s own Terms and Guidelines apply too.'],
];

/* The slash commands, registered on the server by setup.mjs. Option types: 1 subcommand, 3 text, 6 user. */
export const COMMANDS = [
  { name: 'ticket', description: 'Open, close or manage a ticket', options: [
    { type: 1, name: 'open', description: 'Open a private ticket with the team', options: [
      { type: 3, name: 'about', description: 'What it is about', required: true, choices: KINDS.map((k) => ({ name: k.label, value: k.id })) }] },
    { type: 1, name: 'close', description: 'Close this ticket (a transcript is kept)', options: [
      { type: 3, name: 'reason', description: 'Why, for the transcript', required: false, max_length: 300 }] },
    { type: 1, name: 'add', description: 'Let someone see this ticket', options: [
      { type: 6, name: 'user', description: 'Who', required: true }] },
    { type: 1, name: 'remove', description: 'Take someone off this ticket', options: [
      { type: 6, name: 'user', description: 'Who', required: true }] },
    { type: 1, name: 'claim', description: 'Take this ticket (team)' },
    { type: 1, name: 'rename', description: 'Rename this ticket (team)', options: [
      { type: 3, name: 'name', description: 'The new name', required: true, max_length: 80 }] },
  ] },
  { name: 'verify', description: 'Get the Verified Buyer role with your OmniDx Tune key (only you see it)', options: [
    { type: 3, name: 'key', description: 'TUNE-XXXX-XXXX-XXXX-XXXX', required: true, max_length: 40 }] },
  { name: 'faq', description: 'Post a quick answer in this channel', options: [
    { type: 3, name: 'topic', description: 'Which question', required: true, choices: Object.entries(FAQ).map(([k, v]) => ({ name: v.short.slice(0, 100), value: k })) }] },
  { name: 'stats', description: 'Tickets, ratings and verified buyers (team)', default_member_permissions: String(1n << 13n) },
];
