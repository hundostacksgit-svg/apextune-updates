/*
 * Capacitor wants everything it ships under one `www` directory. The editor
 * lives at ../app and shares ../assets with the website, so this copies both
 * into www/ with the relative paths intact.
 *
 * Run before every `cap sync`; `npm run sync` does both.
 */

import { cp, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const www = path.join(here, 'www');

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });

// The editor expects ../assets and ../../icons to sit above it, so the layout
// inside www mirrors the repository rather than flattening it.
await cp(path.join(here, '..', 'app'), path.join(www, 'app'), { recursive: true });
await cp(path.join(here, '..', 'assets'), path.join(www, 'assets'), { recursive: true });
await cp(path.join(here, '..', '..', 'icons'), path.join(www, 'icons'), { recursive: true });

// Capacitor loads www/index.html; send it straight into the editor.
await writeFile(path.join(www, 'index.html'), `<!doctype html>
<meta charset="utf-8">
<title>OmniDx Studio</title>
<meta http-equiv="refresh" content="0; url=./app/">
<a href="./app/">Open OmniDx Studio</a>
`);

// The service worker is pointless inside a native shell — the files are already
// local — and a stale cache there is a genuinely confusing bug to chase.
await rm(path.join(www, 'app', 'sw.js'), { force: true });

console.log('www/ built from ../app, ../assets and ../../icons');
