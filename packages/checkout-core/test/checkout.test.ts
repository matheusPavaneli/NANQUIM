import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCheckout } from '../src/checkout.ts';
import { CheckoutError, type PaymentProvider, type Session } from '../src/types.ts';

const NOW = Date.now();

const session = (overrides: Partial<Session> = {}): Session => ({
  sessionId: 'sess_1',
  brCode: '00020126...6304ABCD',
  amount: 12_990,
  currency: 'BRL',
  expiresAt: NOW + 15 * 60_000,
  status: 'pending',
  ...overrides,
});

const provider = (subject: Session): PaymentProvider => ({
  id: 'fake',
  normalizeSession: () => subject,
  normalizeStatus: () => ({ status: 'pending' }),
});

test('a charge created for another amount is refused instead of drawn', async () => {
  const errors: CheckoutError[] = [];
  const checkout = createCheckout({
    createSession: () => Promise.resolve({}),
    provider: provider(session({ amount: 100 })),
    charge: { amount: 12_990, currency: 'BRL' },
    onError: (error) => errors.push(error),
  });

  await checkout.start();

  assert.equal(checkout.getState().status, 'failed');
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.code, 'amount_mismatch');
});

test('a charge created in another currency is refused too', async () => {
  const errors: CheckoutError[] = [];
  const checkout = createCheckout({
    createSession: () => Promise.resolve({}),
    provider: provider(session({ currency: 'USD' })),
    charge: { amount: 12_990, currency: 'BRL' },
    onError: (error) => errors.push(error),
  });

  await checkout.start();

  assert.equal(errors[0]?.code, 'amount_mismatch');
});

test('a charge that matches the promised price is accepted', async () => {
  const checkout = createCheckout({
    createSession: () => Promise.resolve({}),
    provider: provider(session()),
    charge: { amount: 12_990, currency: 'BRL' },
  });

  await checkout.start();

  assert.equal(checkout.getState().status, 'awaiting');
  checkout.destroy();
});

test('the idempotency key is a cryptographic uuid, never a Math.random string', async () => {
  const keys: string[] = [];
  const checkout = createCheckout({
    createSession: (context) => {
      keys.push(context.idempotencyKey);
      return Promise.resolve({});
    },
    provider: provider(session()),
  });

  await checkout.start();

  assert.match(
    keys[0] ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  checkout.destroy();
});

test('an environment with no random source fails closed instead of guessing a key', () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    assert.throws(
      () =>
        createCheckout({
          createSession: () => Promise.resolve({}),
          provider: provider(session()),
        }),
      (error: unknown) =>
        error instanceof CheckoutError && error.code === 'unsupported_environment',
    );
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
  }
});

test('getRandomValues alone is enough to build a v4 key', async () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues: (target: Uint8Array) => original.getRandomValues(target) },
    configurable: true,
  });
  const keys: string[] = [];
  try {
    const checkout = createCheckout({
      createSession: (context) => {
        keys.push(context.idempotencyKey);
        return Promise.resolve({});
      },
      provider: provider(session()),
    });
    await checkout.start();
    checkout.destroy();
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
  }
  assert.match(
    keys[0] ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
