/*
 * The two typefaces the promo is set in, fetched once.
 *
 * Inter for everything readable, Sora for the big words. Both are on Google
 * Fonts under the SIL Open Font License, and both ship as variable fonts, so
 * one file each covers every weight comp.css asks for. Kept out of the repo
 * because font binaries do not belong in a code diff; this puts them where
 * render.mjs expects them.
 *
 *   PROMO_ASSETS=/somewhere node tools/promo/studio/fonts.mjs
 *
 * Writes $PROMO_ASSETS/fonts/Inter-400.woff2 and Sora-600.woff2 (the names
 * comp.css references; the files are the full variable fonts).
 */
import fs from 'node:fs';
import path from 'node:path';

const ASSETS = process.env.PROMO_ASSETS || path.join(process.env.HOME || '/tmp', 'omnidx-promo');
const OUT = path.join(ASSETS, 'fonts');
fs.mkdirSync(OUT, { recursive: true });

/* Google serves woff2 only to a browser user agent; anything else gets ttf. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

async function fetchFont(family, weights, fileName) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&display=swap`, { headers: { 'user-agent': UA } })).text();
  /* Take the latin block: the videos are English, and the other subsets are only unicode-range fallbacks. */
  const block = css.split('/* latin */').pop();
  const url = block.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1];
  if (!url) throw new Error(`no latin face for ${family}`);
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(OUT, fileName), bytes);
  console.log(`${fileName}  ${bytes.length} bytes`);
}

await fetchFont('Inter', '400;600;700;800;900', 'Inter-400.woff2');
await fetchFont('Sora', '600;700;800', 'Sora-600.woff2');
console.log('fonts written to', OUT);
