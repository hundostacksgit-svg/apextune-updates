/*
 * The licence server, for real, on 127.0.0.1: server/worker.js under Node,
 * with the stand-in database, Square and mail the tests use. The Windows
 * check runs the whole tune against this, so the script meets the same code
 * a buyer's PC meets rather than a stand-in of it. At start it issues one
 * Tune key for a stand-in order (as the key page would after a payment) and
 * writes it where asked, so the check has a key that was really issued.
 * It listens on the loopback address only and must never be reachable from
 * anywhere else.
 *
 *   node tools/worker-serve.mjs --port 8787 --key-file C:\path\ci-key.txt
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { payments, installFetch, makeEnv } = await import(path.join(root, 'tools/worker-standin.mjs'));
const worker = (await import(path.join(root, 'server/worker.js'))).default;

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const port = Number(arg('--port', '8787'));
const keyFile = arg('--key-file', '');

installFetch({ strict: false });
// The two-secret setup: Square on, no mailer, no webhook, no owner token.
const env = makeEnv({ GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined, __connect: undefined, SQUARE_WEBHOOK_SIGNATURE_KEY: undefined, SQUARE_WEBHOOK_URL: undefined, TUNE_ADMIN_TOKEN: undefined });
payments['ORDER-CI-1'] = { cents: 1999, email: 'ci@example.test' };

const origin = `http://127.0.0.1:${port}`;
async function call(pathname, body) {
  const r = await worker.fetch(new Request(origin + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const issued = await call('/v1/tune/issue', { product: 'tune', order: 'ORDER-CI-1' });
if (!issued.data.key) { console.error('could not issue the check key:', issued.status, JSON.stringify(issued.data)); process.exit(1); }
if (keyFile) fs.writeFileSync(keyFile, issued.data.key);

const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const headers = { 'cf-connecting-ip': req.socket.remoteAddress || '127.0.0.1' };
  for (const k of ['content-type', 'origin', 'accept']) if (req.headers[k]) headers[k] = req.headers[k];
  let out;
  try {
    out = await worker.fetch(new Request(origin + req.url, { method: req.method, headers, ...(req.method === 'POST' ? { body } : {}) }), env);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String((err && err.message) || err) }));
    return;
  }
  const h = {}; out.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(out.status, h);
  res.end(Buffer.from(await out.arrayBuffer()));
});
server.listen(port, '127.0.0.1', () => console.log(`licence server (the real Worker code) on ${origin}; key ${issued.data.key}`));
