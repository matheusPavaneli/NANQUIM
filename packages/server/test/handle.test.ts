import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemorySeenStore, handleWebhook, sign } from '../src/index.ts';

const secret = 'whsec_exemplo';
const NOW = 1_800_000_000_000;
const timestamp = Math.floor(NOW / 1000);

const body = (id = 'evt_1'): string =>
  JSON.stringify({ id, event: 'billing.paid', data: { id: 'p1', status: 'PAID', amount: 12_990 } });

const deliver = (
  rawBody: string,
  store?: ReturnType<typeof createMemorySeenStore>,
  handler?: (event: unknown) => Promise<void> | void,
) =>
  store === undefined
    ? handleWebhook({
        rawBody,
        signature: sign(rawBody, secret, timestamp),
        secret,
        timestamp,
        now: NOW,
      })
    : handleWebhook({
        rawBody,
        signature: sign(rawBody, secret, timestamp),
        secret,
        timestamp,
        now: NOW,
        store,
        process: handler ?? (() => undefined),
      });

test('a verified event reaches the handler exactly once', async () => {
  const store = createMemorySeenStore();
  const processed: string[] = [];
  const handler = (event: unknown): void => {
    processed.push((event as { id: string }).id);
  };

  const first = await deliver(body(), store, handler);
  const second = await deliver(body(), store, handler);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  if (first.status !== 200 || second.status !== 200) return;
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.deepEqual(processed, ['evt_1']);
});

test('a handler that throws releases the claim, so the retry is not swallowed', async () => {
  const store = createMemorySeenStore();
  let attempts = 0;
  const handler = (): void => {
    attempts += 1;
    if (attempts === 1) throw new Error('the database was down');
  };

  const failed = await deliver(body(), store, handler);
  assert.equal(failed.status, 500);
  if (failed.status !== 500) return;
  assert.equal(failed.reason, 'handler');

  const retry = await deliver(body(), store, handler);
  assert.equal(retry.status, 200);
  if (retry.status !== 200) return;
  assert.equal(retry.duplicate, false);
  assert.equal(attempts, 2);
});

test('two concurrent deliveries of one event credit it once', async () => {
  const store = createMemorySeenStore();
  let credits = 0;
  const handler = async (): Promise<void> => {
    await Promise.resolve();
    credits += 1;
  };

  const results = await Promise.all([
    deliver(body(), store, handler),
    deliver(body(), store, handler),
  ]);

  assert.equal(credits, 1);
  assert.deepEqual(
    results.map((result) => (result.status === 200 ? result.duplicate : result.status)),
    [false, true],
  );
});

test('an unsigned or unparseable delivery never reaches the handler', async () => {
  const store = createMemorySeenStore();
  let calls = 0;
  const handler = (): void => {
    calls += 1;
  };

  const forged = await handleWebhook({
    rawBody: body(),
    signature: sign(body(), 'whsec_outro', timestamp),
    secret,
    timestamp,
    now: NOW,
    store,
    process: handler,
  });
  const garbage = await deliver('{not json', store, handler);
  const offSchema = await deliver(JSON.stringify({ id: 'evt_2' }), store, handler);

  assert.equal(forged.status, 400);
  assert.equal(garbage.status, 400);
  assert.equal(offSchema.status, 400);
  assert.equal(calls, 0);
});
