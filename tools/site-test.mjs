/*
 * The site, in a browser, before it publishes.
 *
 * Serves the repository over HTTP and drives every Tune page in Chromium at
 * desktop and phone width: no script error, no console error, no sideways
 * scroll. Then the parts that take money or hand out keys, against stand-in
 * answers: the buy buttons close while no licence server is configured and
 * while the server says it cannot reach Square, and open when it can; the
 * key page shows three keys for a Squad order, one for a Tune order, shows
 * them again on a return visit, and takes the receipt number; the owner
 * page says when the server is not switched on.
 *
 *   node tools/site-test.mjs          (playwright resolved from node_modules,
 *                                      or PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { failed++; console.log('  FAIL ' + m); };
const expect = (c, m) => (c ? ok(m) : bad(m));

async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const t of tries) { try { return await import(t); } catch { /* next */ } }
  throw new Error('playwright is not installed: npm install --no-save playwright && npx playwright install chromium');
}

const port = 8140 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { const r = await fetch(`${base}/studio/`); if (r.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 200)); }

const { chromium } = await loadPlaywright();
const { makeKey, pretty } = await import(pathToFileURL(path.join(root, 'studio/assets/tunekey.js')).href);
// A machine with its own Chromium (the build machine's, or a dev box) names it in PW_CHROMIUM; otherwise Playwright's own.
const browser = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 160)));
  // The browser logs every non-2xx or aborted fetch as a console error; those are the answers being tested, not faults.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  return errs;
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

try {
  console.log('The site, in a browser');

  /* 1. Every page, two widths. */
  for (const p of ['', 'pricing/', 'download/', 'trust/', 'changelog/', 'what-it-touches/', 'terms/', 'activate/', 'admin/', 'account/']) {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errs = watch(page);
      const resp = await page.goto(`${base}/studio/${p}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const title = await page.title();
      expect(resp.status() === 200 && title && !errs.length && !(await overflow(page)), `studio/${p || 'index'} at ${width}px: loads, no errors, no sideways scroll${errs.length ? ' (' + errs.join('; ') + ')' : ''}`);
      // Every link on the page that points into this site must land: the file exists, and the anchor is on it.
      if (width === 1280) {
        const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')))]);
        const broken = [];
        for (const h of hrefs) {
          if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(h)) continue;
          const u = new URL(h, page.url());
          if (u.origin !== new URL(base).origin) continue;
          // The target is checked on disk, not fetched: every page is a static file, and Node's fetch
          // trips an internal assertion when dozens of small responses are opened and left unread.
          let html = '';
          if (u.pathname === new URL(page.url()).pathname) html = await page.content();
          else {
            let f = path.join(root, decodeURIComponent(u.pathname));
            if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
            if (!fs.existsSync(f)) { broken.push(h); continue; }
            if (u.hash) html = fs.readFileSync(f, 'utf8');
          }
          if (u.hash && !new RegExp(`id=["']${u.hash.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html)) broken.push(h);
        }
        expect(!broken.length, `studio/${p || 'index'}: every link into the site lands (${hrefs.length} checked)${broken.length ? ': broken ' + broken.join(', ') : ''}`);
      }
      await page.close();
    }
  }

  /* 1b. Accessibility: WCAG A and AA rules from axe-core over the same pages, at phone width. Skipped, and said so, when axe is not installed. */
  {
    const axePath = path.join(root, 'node_modules/axe-core/axe.min.js');
    if (!fs.existsSync(axePath)) ok('axe-core is not installed here, so the accessibility pass is skipped (the publish check installs it)');
    else {
      const axe = fs.readFileSync(axePath, 'utf8');
      // The published report of the build machine's run is a page every buyer opens; it is scanned too, once the check has published one.
      const pages = ['', 'pricing/', 'download/', 'trust/', 'changelog/', 'what-it-touches/', 'terms/', 'activate/', 'admin/'];
      if (fs.existsSync(path.join(root, 'studio/assets/ci-report.html'))) pages.push('assets/ci-report.html');
      // Every site page is scanned in both themes (the sun button switches the whole palette); the report has one look, so it is scanned once.
      for (const p of pages) {
        for (const theme of p.startsWith('assets/') ? ['dark'] : ['dark', 'light']) {
          const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
          await page.goto(`${base}/studio/${p}`, { waitUntil: 'networkidle' });
          if (theme === 'light') {
            // The page fades between palettes; the fade is switched off first so the scan sees the finished light colours, not a blend.
            await page.addStyleTag({ content: '*{transition:none!important}' });
            await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
          }
          await page.addScriptTag({ content: axe });
          const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }));
          const found = res.violations.map((v) => `${v.id} x${v.nodes.length} (${v.nodes[0].target[0]})`);
          expect(!found.length, `studio/${p || 'index'} (${theme}): no WCAG A or AA violation${found.length ? ': ' + found.join('; ') : ''}`);
          await page.close();
        }
      }
    }
  }

  /* 2. The buy buttons and the key desk. */
  const closedNow = async (page) => page.evaluate(() => [...document.querySelectorAll('[data-buy]')].map((a) => a.classList.contains('is-closed')));
  {
    const page = await browser.newPage(); const errs = watch(page);
    await page.goto(`${base}/studio/pricing/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    const cfg = await (await fetch(`${base}/tune/config.json`)).json();
    const c = await closedNow(page);
    if (!cfg.api) expect(c.length >= 2 && c.every(Boolean), 'with no licence server configured, every buy button is closed');
    else ok(`a licence server is configured (${cfg.api}); the closed state is checked with a stand-in below`);
    await page.route('**/tune/config.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ api: `${base}/fakeapi`, version: '0', sha256: 'x' }) }));
    await page.route('**/fakeapi/v1/health', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, square: true }) }));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    expect((await closedNow(page)).every((x) => !x), 'with a server that can reach Square, every buy button is open');
    await page.unroute('**/fakeapi/v1/health');
    await page.route('**/fakeapi/v1/health', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, square: false }) }));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    expect((await closedNow(page)).every(Boolean), 'with a server that cannot reach Square, every buy button is closed');
    await page.unroute('**/fakeapi/v1/health');
    await page.route('**/fakeapi/v1/health', (r) => r.abort());
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    expect((await closedNow(page)).every((x) => !x), 'with a server that cannot be reached from the browser, the buttons stay open');
    expect(!errs.length, `pricing page: no errors through all of that${errs.length ? ' (' + errs.join('; ') + ')' : ''}`);
    await page.close();
  }

  /* 3. The key page. */
  {
    const keys = [1, 2, 3].map(() => pretty(makeKey('tune')));
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } }); const errs = watch(page);
    await page.route('**/tune/config.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ api: `${base}/fakeapi`, version: '0', sha256: 'x' }) }));
    await page.route('**/fakeapi/v1/health', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, square: true, mail: true }) }));
    await page.route('**/fakeapi/v1/tune/check', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, product: 'squad', seats: 1, used: 0 }) }));
    let asked = [];
    await page.route('**/fakeapi/v1/tune/issue', async (r) => { const b = r.request().postDataJSON(); asked.push(b); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ key: keys[0], keys, product: 'squad', seats: 1, verified: true, emailed: true, ...(b.resend ? { resent: true, sentTo: 'b***@example.test' } : {}) }) }); });
    await page.goto(`${base}/studio/activate/?e=studio&orderId=ORDER-TEST-1`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    const boxes = await page.evaluate(() => [...document.querySelectorAll('.keybox')].map((k) => k.textContent.replace(/\s+/g, ' ').trim()));
    expect(boxes.length === 3 && boxes[0].includes(keys[0]) && boxes[2].includes(keys[2]), 'a Squad order shows its three keys');
    expect(asked.length === 1 && asked[0].product === 'squad' && asked[0].order === 'ORDER-TEST-1', 'the page asked the server once, for that order, as Squad (?e=studio)');
    expect(await page.evaluate(() => document.querySelector('.cmd code')?.dataset.text?.includes("$env:OMNIDX_KEY='" )), 'the paste line carries the first key');
    expect(await page.evaluate(() => !!document.querySelector('#act-move-key')), 'the move form offers a choice of key');
    expect(!(await overflow(page)), 'three keys fit a phone without sideways scroll');
    await page.click('#act-resend'); await page.waitForTimeout(400);
    expect(asked.some((a) => a.resend === true && a.order === 'ORDER-TEST-1') && (await page.evaluate(() => /Sent again to b\*\*\*@example\.test/.test(document.querySelector('#act-mail-out')?.textContent || ''))), '"Send it again" asks the server for that order and shows where the keys went');
    await page.goto(`${base}/studio/activate/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.querySelectorAll('.keybox').length === 3 && /again/.test(document.querySelector('h1')?.textContent || '')), 'a return visit shows the three keys again without asking the server');
    await page.unroute('**/fakeapi/v1/tune/issue');
    await page.route('**/fakeapi/v1/tune/issue', (r) => { asked.push(r.request().postDataJSON()); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ key: keys[0], keys: [keys[0]], product: 'tune', seats: 1, verified: true, emailed: false }) }); });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${base}/studio/activate/?e=creator&orderId=ORDER-TEST-2`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.querySelectorAll('.keybox').length === 1 && /one PC/.test(document.querySelector('.act-sub')?.textContent || '')), 'a Tune order shows one key');
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${base}/studio/activate/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    await page.fill('#act-order', '#AB12'); await page.click('[data-pick="tune"]'); await page.waitForTimeout(300);
    expect(await page.evaluate(() => /email address you paid with/.test(document.querySelector('#act-err')?.textContent || '') && document.querySelectorAll('.keybox').length === 0), 'a receipt number without the email is stopped on the page');
    await page.fill('#act-email', 'buyer@example.test'); await page.click('[data-pick="tune"]'); await page.waitForTimeout(500);
    expect(asked.some((a) => a.order === '#AB12' && a.email === 'buyer@example.test') && (await page.evaluate(() => document.querySelectorAll('.keybox').length === 1)), 'the receipt-number form asks the server with the number and the email, and shows the key');
    await page.unroute('**/fakeapi/v1/tune/issue');
    await page.route('**/fakeapi/v1/tune/issue', (r) => r.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ error: 'Square does not show a completed payment for that order reference.' }) }));
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${base}/studio/activate/?e=creator&orderId=ORDER-NOPE`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    expect(await page.evaluate(() => /Square does not show/.test(document.body.textContent) && document.querySelectorAll('.keybox').length === 0), "a refusal from the server is shown in the server's words, with no key");
    expect(!errs.length, `key page: no errors through all of that${errs.length ? ' (' + errs.join('; ') + ')' : ''}`);
    await page.close();
  }

  /* 3b. The buyer's path against the real licence server code: the Worker runs in this process, with the
        stand-in Square and Gmail the offline test uses, and the page is the real page. Nothing here is a fake answer. */
  {
    const { db, mails, payments, refunds, fakeConnect, installFetch, makeEnv } = await import(pathToFileURL(path.join(root, 'tools/worker-standin.mjs')).href);
    const worker = (await import(pathToFileURL(path.join(root, 'server/worker.js')).href)).default;
    const nodeFetch = globalThis.fetch;
    installFetch({ strict: false });
    // The two-secret setup the guide describes: Square on, no mailer, no webhook.
    const env = makeEnv({ GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined, __connect: undefined, SQUARE_WEBHOOK_SIGNATURE_KEY: undefined, SQUARE_WEBHOOK_URL: undefined });
    payments['ORDER-LIVE-1'] = { cents: 1999, email: 'live@example.test' };
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } }); const errs = watch(page);
    await page.route('**/tune/config.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ api: `${base}/liveapi`, version: '0', sha256: 'x' }) }));
    await page.route('**/liveapi/**', async (r) => {
      const q = r.request();
      const u = new URL(q.url()); u.pathname = u.pathname.replace(/^\/liveapi/, '');
      const h = q.headers(); const headers = {};
      for (const k of ['content-type', 'origin', 'accept']) if (h[k]) headers[k] = h[k];
      const init = { method: q.method(), headers };
      if (q.method() === 'POST') init.body = q.postData() || '';
      const res = await worker.fetch(new Request(u.toString(), init), env);
      const out = {}; res.headers.forEach((v, k) => { out[k] = v; });
      await r.fulfill({ status: res.status, headers: out, body: await res.text() });
    });
    const liveKey = /TUNE-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/;
    const landing = `${base}/studio/activate/?e=creator&orderId=ORDER-LIVE-1`;
    await page.goto(landing, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.keybox')].map((b) => b.textContent));
    const row = db.tune_keys.find((k) => k.order_ref === 'ORDER-LIVE-1');
    const prettyRow = row ? `TUNE-${row.key.slice(4, 8)}-${row.key.slice(8, 12)}-${row.key.slice(12, 16)}-${row.key.slice(16, 20)}` : '';
    expect(shown.length === 1 && liveKey.test(shown[0]) && row && shown[0].includes(prettyRow) && row.verified === 1 && row.email === 'live@example.test', 'landing from Square, the page shows the one key the server minted for that order, confirmed with Square');
    expect(await page.evaluate(() => document.querySelector('#act-mail')?.hidden === true), 'with no mailer the page says nothing about email');
    expect(!errs.length, `no page errors on the live key page${errs.length ? ': ' + errs.join(' | ') : ''}`);
    // Switch mail on (the optional Gmail secrets) and come back: the email line appears and a resend goes out through the fake Gmail.
    env.GMAIL_USER = 'owner@gmail.test'; env.GMAIL_APP_PASSWORD = 'app-pass'; env.__connect = fakeConnect;
    await page.goto(landing, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    expect(await page.evaluate(() => document.querySelector('#act-mail')?.hidden === false && /checkout email/.test(document.querySelector('#act-resend')?.textContent || '')), 'with Gmail on the page offers to send the key to the checkout email');
    const n = mails.length;
    await page.click('#act-resend'); await page.waitForTimeout(600);
    expect(mails.length === n + 1 && mails[n].to[0] === 'live@example.test' && mails[n].via === 'gmail' && liveKey.test(mails[n].text) && await page.evaluate(() => /Sent again to l\*\*\*@example\.test/.test(document.querySelector('#act-mail-out')?.textContent || '')), 'the resend leaves through Gmail, to the address Square holds, carrying the key, and the page says so with the address masked');
    // A refund in Square, seen by the hourly look: the page says so and the buyer is told.
    refunds['ORDER-LIVE-1'] = { paid: 1999, back: 1999 };
    db.tune_keys.filter((k) => k.order_ref === 'ORDER-LIVE-1').forEach((k) => { k.refund_checked_at = Date.now() - 2 * 3600_000; });
    const m = mails.length;
    await page.evaluate(() => localStorage.clear());
    await page.goto(landing, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    expect(await page.evaluate(() => /refunded/.test(document.querySelector('.note.bad')?.textContent || '') && document.querySelectorAll('.keybox').length === 0), 'after a refund the page shows no key and says the order was refunded');
    expect(mails.length === m + 1 && mails[m].to[0] === 'live@example.test' && /no longer work/.test(mails[m].text), 'and the buyer is emailed that the key no longer works');
    await page.close();
    globalThis.fetch = nodeFetch;
  }

  /* 4. The owner page. */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } }); const errs = watch(page);
    await page.route('**/tune/config.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ api: '', version: '0', sha256: 'x' }) }));
    await page.goto(`${base}/studio/admin/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    expect(await page.evaluate(() => /not switched on/.test(document.querySelector('#own-health')?.textContent || '')), 'the owner page says the licence server is not switched on');
    await page.fill('#own-token', 'x'); await page.fill('#own-ref', 'ORDER-1'); await page.click('[data-act="lookup"]'); await page.waitForTimeout(300);
    expect(await page.evaluate(() => /not switched on/.test(document.querySelector('#own-out')?.textContent || '')), 'and a lookup says the same instead of failing silently');
    // With a server answering, the recent-orders list and a lookup render.
    await page.unroute('**/tune/config.json*');
    await page.route('**/tune/config.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ api: `${base}/fakeapi`, version: '0', sha256: 'x' }) }));
    await page.route('**/fakeapi/v1/health', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, square: true, squareWebhook: true, mail: true, owner: true, build: 'abc1234', deployed: '2026-09-23T21:00Z' }) }));
    const adminAsked = [];
    await page.route('**/fakeapi/v1/tune/admin', (r) => {
      const b = r.request().postDataJSON(); adminAsked.push(b.action);
      if (b.token !== 'owner-x') return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Wrong token.' }) });
      if (b.action === 'summary') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, sentTo: 'owner@example.test', week: { orders: 1, paidCents: 1999, refundedOrders: 0, refundedCents: 0, tune: 1, squad: 0, unsent: 0 }, all: { orders: 2, paidCents: 5998, refundedOrders: 0, refundedCents: 0, tune: 1, squad: 1, unsent: 0 }, keys: 4, pcs: 2 }) });
      if (b.action === 'resend-unsent') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, orders: 2, sent: [{ order: 'ORDER-B', email: 'x***@example.test' }], failed: [{ order: 'ORDER-C', email: 'y***@example.test' }] }) });
      if (b.action === 'mail-test') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, sentTo: b.email || 'owner@example.test', from: 'OmniDx Tune <keys@omnidx.net>' }) });
      if (b.action === 'recent') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, totals: { orders: 2, paidCents: 3999, refundedOrders: 1, refundedCents: 1999, keys: 4 }, orders: [
        { order: 'ORDER-A', receipt: 'AB12', product: 'squad', email: 'a@example.test', paidCents: 3999, createdAt: Date.now(), emailedAt: Date.now(), keys: 3, off: 0 },
        { order: 'ORDER-B', receipt: null, product: 'tune', email: null, paidCents: 1999, createdAt: Date.now(), emailedAt: null, keys: 1, off: 1 },
      ] }) });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, order: 'ORDER-A', receipt: 'AB12', email: 'a@example.test', paidCents: 3999, createdAt: Date.now(), emailedAt: Date.now(), keys: [{ key: 'TUNE-AAAA-BBBB-CCCC-DDDD', product: 'squad', pcs: 1, revoked: false }] }) });
    });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    expect(await page.evaluate(() => /Owner token: on/.test(document.querySelector('#own-health')?.textContent || '') && /build abc1234, deployed 2026-09-23 21:00 UTC/.test(document.querySelector('#own-health')?.textContent || '')), 'with a server answering, the status line reads on for every part and names the deploy');
    await page.fill('#own-token', 'owner-x'); await page.click('[data-act="recent"]'); await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.querySelectorAll('#own-out .own-key').length === 2 && /not emailed/.test(document.querySelector('#own-out').textContent) && /2 orders · \$39\.99 kept · 1 refunded \(\$19\.99\)/.test(document.querySelector('#own-out').textContent)), 'recent orders shows the totals since the first sale, lists two orders and flags the one not emailed');
    await page.fill('#own-ref', 'ORDER-A'); await page.click('[data-act="lookup"]'); await page.waitForTimeout(400);
    expect(await page.evaluate(() => /#AB12/.test(document.querySelector('#own-out').textContent) && document.querySelectorAll('#own-out .own-key').length === 1), 'a lookup shows the order, its receipt number and its key');
    await page.click('[data-act="revoke"]'); await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.querySelector('[data-act="revoke"]').textContent === 'Press again to confirm') && !adminAsked.includes('revoke'), 'switching an order off asks for a second press and sends nothing yet');
    await page.click('[data-act="revoke"]'); await page.waitForTimeout(400);
    expect(adminAsked.includes('revoke') && (await page.evaluate(() => document.querySelector('[data-act="revoke"]').textContent === 'Switch the order off' && /switched off/.test(document.querySelector('#own-out').textContent))), 'the second press sends it and the button reads as before');
    await page.fill('#own-ref', ''); await page.click('[data-act="resend-unsent"]'); await page.waitForTimeout(400);
    expect(await page.evaluate(() => /1 of 2 unsent orders sent; 1 refused/.test(document.querySelector('#own-out').textContent) && /ORDER-C/.test(document.querySelector('#own-out').textContent)), 'sending every unsent order reports what went and what Resend refused');
    await page.click('[data-act="summary"]'); await page.waitForTimeout(400);
    expect(await page.evaluate(() => /Sent to owner@example\.test\. Last seven days: 1 order, \$19\.99 kept, 0 refunded\. Since the first sale: 2 orders, \$59\.98 kept, 4 keys on 2 PCs\./.test(document.querySelector('#own-out').textContent)), 'the week, emailed on demand, is summarised on the page');
    await page.click('[data-act="mail-test"]'); await page.waitForTimeout(400);
    expect(await page.evaluate(() => /went to owner@example\.test from OmniDx Tune/.test(document.querySelector('#own-out').textContent)), 'a test email needs no order and says where it went');
    await page.fill('#own-ref', 'ORDER-A'); await page.fill('#own-token', 'wrong'); await page.click('[data-act="lookup"]'); await page.waitForTimeout(400);
    expect(await page.evaluate(() => /Wrong token/.test(document.querySelector('#own-out').textContent)), 'a wrong token shows the refusal in the server\'s words');
    expect(!errs.length, 'owner page: no errors');
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `${failed} problem(s)` : 'all good');
process.exit(failed ? 1 : 0);
