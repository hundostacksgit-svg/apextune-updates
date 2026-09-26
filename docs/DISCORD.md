# The OmniDx Discord

A server with a real ticket desk, built and run by a bot that lives next to the
licence server on Cloudflare (free, always on, nothing to keep running on a PC).

## Going live: three steps

1. **Make the server.** In Discord: the **+** on the left > **Create My Own** >
   **For me and my friends** > name it **OmniDx** > Create. Leave it empty; the
   bot builds everything.
2. **Make the bot and copy its token.** Open
   <https://discord.com/developers/applications> > **New Application** > name it
   **OmniDx** > Create > **Bot** on the left > **Reset Token** > **Copy**.
3. **Give GitHub the token.** The repository > **Settings** > **Secrets and
   variables** > **Actions** > **New repository secret**: name
   `DISCORD_BOT_TOKEN`, paste the token, **Add secret**. Then **Actions** >
   **Discord** > **Run workflow**.

The first run deploys the bot and, because it is not in a server yet, emails
you (and puts on the run's Summary tab) the link that adds it. Open it, pick
**OmniDx**, press **Authorize**, and run the workflow once more: the server is
built. The site links the server's permanent invite
(https://discord.gg/VvbYJcDQbB, `DISCORD` in `tools/build-site.py`) from a Discord
button in the bar on every page, the phone menu, the footer and the key page.

Everything else is read off that token: the application id, the public key,
the server. The Cloudflare token the licence server already deploys with is
reused.

## What it builds

| | |
|---|---|
| **📌 START HERE** | #welcome (the banner, what OmniDx is, **Verify my purchase**, **Announcement pings**, links to the site), #rules, #announcements, #faq (ten answers, one of them the free FPS bench). Everyone reads; only the team posts. |
| **💬 COMMUNITY** | #general, #results (before and after, and OmniDx Bench cards), #setups, #clips, #suggestions, #off-topic. |
| **🛠️ SUPPORT** | #open-a-ticket (the panel), #tune-help, #edition-help. |
| **💜 BUYERS** | #buyers-lounge: Verified Buyers and the team only. |
| **🎫 TICKETS** | Where each ticket's private channel opens. |
| **🔒 TEAM** | #ticket-logs (every closed ticket with its transcript, every rating, every verification, 12-hour waits), #team-chat. |
| **🔊 VOICE** | Lounge, Squad 1, Squad 2. |
| **Roles** | **OmniDx Team** (give it to anyone who answers tickets; the owner gets it), **Verified Buyer** (from /verify), **Announcements** (the opt-in ping). |
| **The server** | The eagle as its icon, join messages in #general, email verification, mentions-only notifications by default. The bot is named OmniDx and wears the eagle. |

## The ticket desk

- **Opening:** the menu in #open-a-ticket (or `/ticket open`) asks what it is
  about: Key or payment, The tune, OmniDx Edition, Bug report, Something else.
  Each opens its own short form. A private channel opens
  (`ticket-0001-name`) that only the member, the team and the bot can see, with
  the answers, a tip for that kind of problem (the support-file line, the setup
  log's path, the key page), and **Claim** and **Close**. The team is pinged.
  One open ticket per person.
- **In the ticket:** `/ticket add @someone`, `/ticket remove @someone`,
  `/ticket claim`, `/ticket rename` (team), `/ticket close [reason]`.
- **Closing:** the member or the team. The whole conversation is saved as an
  HTML transcript in #ticket-logs with who opened, claimed and closed it, how
  long it was open and why; the member gets the same file by DM with a 1 to 5
  star rating, and the rating goes to the logs. Then the channel is deleted.
- **By itself (every half hour):** a ticket waiting on the member for 24 hours
  gets a note, and closes 24 hours later with its transcript; a ticket waiting
  on the team for 12 hours is flagged in #ticket-logs. A ticket channel deleted
  by hand is marked closed.
- **/stats** (team): open now, opened and closed this week, average rating,
  verified buyers, and what tickets are about.

## Purchase verification

`/verify key:TUNE-...` (or **Verify my purchase** in #welcome) asks the licence
server whether the key is real and not refunded. Yes: the **Verified Buyer**
role, #buyers-lounge, and the OmniDx Edition line with their key in it. A key
belongs to one Discord account; six tries an hour per person. Only the member
sees the key or the answer.

## Changing it

The words, channels, ticket kinds, FAQ and rules are all in
`discord/content.js`. Change them and push: the workflow redeploys, and setup
edits every panel in place (nothing is posted twice and nothing you made is
deleted). Rename channels in `content.js` rather than in Discord: setup finds
channels by name, so one renamed in Discord gets a fresh one with the layout's
name next to it on the next run.

## Files

| | |
|---|---|
| `discord/bot.js` | The bot: interactions (signed by Discord, checked with its public key), tickets, transcripts, ratings, /verify, /faq, /stats, the sweep. `worker.js` is its entry. |
| `discord/setup.mjs` | Builds the server from `content.js`; run by the workflow. |
| `discord/schema.sql` | Its D1 database (`omnidx-discord`): tickets, verified keys, the server's ids. |
| `tools/discord-test.mjs` | Everything above against a stand-in Discord and licence server, and setup run twice on a new server; the workflow runs it before every deploy. |
| `.github/workflows/discord.yml` | Test, deploy, point Discord at the bot, build the server. |
