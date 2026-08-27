import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crc16 } from '../src/brcode.ts';
import { normalizeCanonicalSession } from '../src/provider.ts';

const tlv = (tag: string, value: string): string =>
  `${tag}${String(value.length).padStart(2, '0')}${value}`;

const body =
  tlv('00', '01') +
  tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', 'pagamentos@exemplo.com.br')) +
  tlv('52', '0000') +
  tlv('53', '986') +
  tlv('54', '129.90') +
  tlv('58', 'BR') +
  tlv('59', 'LOJA EXEMPLO LTDA') +
  tlv('60', 'SAO PAULO') +
  '6304';
const brCode = body + crc16(body);

const NOW = 1_700_000_000_000;

const raw = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  sessionId: 'sess_1',
  brCode,
  amount: 12_990,
  currency: 'BRL',
  expiresAt: NOW + 15 * 60_000,
  status: 'pending',
  ...overrides,
});

test('a session that carries createdAt yields a duration the client can trust', () => {
  const session = normalizeCanonicalSession({ ...raw(), createdAt: NOW });
  assert.equal(session.expiresInMs, 15 * 60_000);
});

test('an explicit expiresInMs wins over the derived one', () => {
  const session = normalizeCanonicalSession({
    ...raw(),
    createdAt: NOW,
    expiresInMs: 10 * 60_000,
  });
  assert.equal(session.expiresInMs, 10 * 60_000);
});

test('without createdAt there is no duration to trust, so the absolute instant stands', () => {
  const session = normalizeCanonicalSession(raw());
  assert.equal(session.expiresInMs, undefined);
  assert.equal(session.expiresAt, NOW + 15 * 60_000);
});

test('a createdAt after the expiry is ignored rather than producing a negative window', () => {
  const session = normalizeCanonicalSession({ ...raw(), createdAt: NOW + 20 * 60_000 });
  assert.equal(session.expiresInMs, undefined);
});
