import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CheckoutError } from '@abcheckout/core';
import { brCode } from '../../../design/qr.mjs';
import { abacatePay, normalizeSession, normalizeStatus } from '../src/index.ts';

const payload: string = brCode({
  key: 'pagamentos@exemplo.com.br',
  name: 'LOJA EXEMPLO LTDA',
  city: 'SAO PAULO',
  amount: '129.90',
  txid: 'ABC123DEMO',
});

const response = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: 'pix_char_123',
    amount: 12_990,
    status: 'PENDING',
    devMode: true,
    brCode: payload,
    brCodeBase64: 'data:image/png;base64,iVBORw0KGgo=',
    expiresAt: '2026-08-27T17:47:00.000Z',
    ...overrides,
  },
  error: null,
});

test('the provider envelope is unwrapped into the SDK shape', () => {
  const session = normalizeSession(response());
  assert.equal(session.sessionId, 'pix_char_123');
  assert.equal(session.amount, 12_990, 'centavos are carried end to end, never a float');
  assert.equal(session.currency, 'BRL');
  assert.equal(session.status, 'pending');
  assert.equal(session.expiresAt, Date.parse('2026-08-27T17:47:00.000Z'));
  assert.equal(session.brCodeBase64, 'data:image/png;base64,iVBORw0KGgo=');
});

test('the PSP status vocabulary maps onto the four states the surface draws', () => {
  for (const [given, expected] of [
    ['PENDING', 'pending'],
    ['PAID', 'paid'],
    ['EXPIRED', 'expired'],
    ['CANCELLED', 'refused'],
    ['REFUNDED', 'refused'],
    ['SOMETHING_NEW', 'pending'],
  ] as const) {
    assert.equal(normalizeStatus({ data: { status: given } }).status, expected);
  }
});

test('a populated error is a refusal that keeps the provider code', () => {
  try {
    normalizeSession({ data: null, error: 'INVALID_PIX_KEY' });
    assert.fail('should have thrown');
  } catch (error) {
    if (!(error instanceof CheckoutError)) throw error;
    assert.equal(error.code, 'provider_refused');
    assert.equal(error.providerCode, 'INVALID_PIX_KEY');
  }
});

test('a BR Code that fails its own checksum is rejected before anyone is asked to pay it', () => {
  assert.throws(
    () => normalizeSession(response({ brCode: `${payload.slice(0, -1)}0` })),
    (error: unknown) => error instanceof CheckoutError && error.code === 'session_invalid',
  );
});

test('missing fields fail loudly instead of producing a half-built charge', () => {
  assert.throws(() => normalizeSession(response({ id: '' })), CheckoutError);
  assert.throws(() => normalizeSession(response({ amount: 129.9 })), CheckoutError);
  assert.throws(() => normalizeSession(response({ expiresAt: 'not a date' })), CheckoutError);
});

test('the adapter is a normalizer and nothing else', () => {
  const provider = abacatePay();
  assert.equal(provider.id, 'abacatepay');
  assert.equal(typeof provider.normalizeSession, 'function');
  assert.equal(provider.subscribe, undefined, 'no realtime, so the core polls with backoff');
});

test('a createdAt from the PSP becomes a duration, so a skewed device still counts down', () => {
  const session = normalizeSession(
    response({
      createdAt: '2026-01-01T12:00:00.000Z',
      expiresAt: '2026-01-01T12:15:00.000Z',
    }),
  );
  assert.equal(session.expiresInMs, 15 * 60_000);
});

test('without a createdAt the adapter does not invent a duration', () => {
  assert.equal(normalizeSession(response()).expiresInMs, undefined);
});
