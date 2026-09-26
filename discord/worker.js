// The Worker's entry: only the handler is exported here (Cloudflare reads every export of this file); the bot is in bot.js.
import { handler } from './bot.js';

export default handler;
