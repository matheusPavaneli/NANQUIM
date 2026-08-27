
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brCode } from '../../design/qr.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const PORT = Number(process.env.PORT ?? 4321);

const PAYS_AFTER_MS = Number(process.env.PAYS_AFTER_MS ?? 12_000);
const LIFETIME_MS = Number(process.env.LIFETIME_MS ?? 15 * 60_000);

const charges = new Map();
const byIdempotencyKey = new Map();

const knobs = (url) => ({
  fail: url.searchParams.get('fail') === '1',
  huge: url.searchParams.get('huge') === '1',
  ttl: Number(url.searchParams.get('ttl') ?? LIFETIME_MS),
  paysAfter: Number(url.searchParams.get('paysAfter') ?? PAYS_AFTER_MS),
});

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const createCharge = (idempotencyKey, options) => {
  const existing = byIdempotencyKey.get(idempotencyKey);
  if (existing !== undefined) return charges.get(existing);

  const id = `chg_${randomUUID().slice(0, 8)}`;
  const charge = {
    sessionId: id,
    brCode: brCode({
      key: 'pagamentos@exemplo.com.br',
      name: options.huge ? 'LOJA EXEMPLO LTDA '.repeat(60).slice(0, 900) : 'LOJA EXEMPLO LTDA',
      city: 'SAO PAULO',
      amount: '129.90',
      txid: id.replace(/[^A-Za-z0-9]/g, '').slice(0, 25).toUpperCase(),
    }),
    brCodeBase64: options.huge
      ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      : undefined,
    amount: 12_990,
    currency: 'BRL',
    createdAt: Date.now(),
    expiresAt: Date.now() + options.ttl,
    paysAfter: options.paysAfter,
    status: 'pending',
  };
  charges.set(id, charge);
  if (idempotencyKey) byIdempotencyKey.set(idempotencyKey, id);
  return charge;
};

const statusOf = (charge) => {
  if (charge.status === 'paid') return charge;
  if (charge.paysAfter > 0 && Date.now() - charge.createdAt >= charge.paysAfter) {
    charge.status = 'paid';
    charge.paidAt = Date.now();
    charge.endToEndId = `E${Date.now()}${randomUUID().replace(/-/g, '').slice(0, 11)}`;
  } else if (Date.now() >= charge.expiresAt) {
    charge.status = 'expired';
  }
  return charge;
};

const files = {
  '/': ['examples/vanilla-cdn/index.html', 'text/html; charset=utf-8'],
  '/abcheckout.global.js': ['packages/checkout-core/dist/abcheckout.global.js', 'text/javascript'],
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/api/checkout') {
    const options = knobs(url);
    if (options.fail) {
      json(res, 502, { error: 'PROVIDER_UNAVAILABLE' });
      return;
    }
    const charge = createCharge(req.headers['idempotency-key'], options);
    json(res, 200, {
      sessionId: charge.sessionId,
      brCode: charge.brCode,
      amount: charge.amount,
      currency: charge.currency,
      createdAt: charge.createdAt,
      expiresAt: charge.expiresAt,
      status: charge.status,
      brCodeBase64: charge.brCodeBase64,
    });
    return;
  }

  const status = url.pathname.match(/^\/api\/checkout\/([^/]+)\/status$/);
  if (req.method === 'GET' && status !== null) {
    const charge = charges.get(status[1]);
    if (charge === undefined) {
      json(res, 404, { error: 'unknown charge' });
      return;
    }
    const current = statusOf(charge);
    json(res, 200, {
      status: current.status,
      endToEndId: current.endToEndId,
      paidAt: current.paidAt,
    });
    return;
  }

  const file = files[url.pathname];
  if (file !== undefined) {
    try {
      const body = await readFile(join(root, file[0]));
      res.writeHead(200, { 'content-type': file[1], 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('build the packages first: pnpm build');
    }
    return;
  }

  res.writeHead(404).end('not found');
}).listen(PORT, () => {
  console.log(`merchant mock on http://localhost:${PORT}`);
});
