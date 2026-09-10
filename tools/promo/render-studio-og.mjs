/*
 * Render the OmniDx Studio link-preview card.
 *
 *   python3 -m http.server 8099 &        # from the repository root
 *   node tools/promo/render-studio-og.mjs
 *
 * Writes studio/assets/og-card.png at 1200x630, which is what every scraper
 * crops to. Commit the PNG — it is served, not built.
 */

import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'studio', 'assets', 'og-card.png');
const port = process.env.PORT || 8099;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/tools/promo/studio-og.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
