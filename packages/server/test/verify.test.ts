import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemorySeenStore, sign, verifyWebhook } from '../src/verify.ts';

const secret = 'whsec_exemplo';
const body = JSON.stringify({
  id: 'evt_1',
  event: 'billing.paid',
  data: { id: 'p1', status: 'PAID' },
});
const NOW = 1_800_000_000_000;
const timestamp = Math.floor(NOW / 1000);

test('a correctly signed body passes', () => {
  const result = verifyWebhook({
    rawBody: body,
    signature: sign(body, secret, timestamp),
    secret,
    timestamp,
    now: NOW,
  });
  assert.deepEqual(result, { ok: true });
});

test('the signature covers the body, so one changed cent fails', () => {
  const signature = sign(body, secret, timestamp);
  const tampered = body.replace('PAID', 'paid');
  const result = verifyWebhook({ rawBody: tampered, signature, secret, timestamp, now: NOW });
  assert.deepEqual(result, { ok: false, reason: 'signature' });
});

test('a captured request cannot be replayed after the window closes', () => {
  const signature = sign(body, secret, timestamp);
  const result = verifyWebhook({
    rawBody: body,
    signature,
    secret,
    timestamp,
    now: NOW + 10 * 60_000,
  });
  assert.deepEqual(result, { ok: false, reason: 'timestamp' });
});

test('the timestamp is signed too, so moving it invalidates the signature', () => {
  const signature = sign(body, secret, timestamp);
  const result = verifyWebhook({
    rawBody: body,
    signature,
    secret,
    timestamp: timestamp + 30,
    now: NOW + 30_000,
  });
  assert.deepEqual(result, { ok: false, reason: 'signature' });
});

test('the wrong secret fails, and a garbage header is malformed rather than an exception', () => {
  assert.deepEqual(
    verifyWebhook({
      rawBody: body,
      signature: sign(body, 'whsec_outro', timestamp),
      secret,
      timestamp,
      now: NOW,
    }),
    { ok: false, reason: 'signature' },
  );
  assert.deepEqual(
    verifyWebhook({ rawBody: body, signature: 'not-hex!!', secret, timestamp, now: NOW }),
    { ok: false, reason: 'malformed' },
  );
  assert.deepEqual(verifyWebhook({ rawBody: body, signature: '', secret, now: NOW }), {
    ok: false,
    reason: 'malformed',
  });
});

test('a sha256= prefix is tolerated, because providers disagree about it', () => {
  const signature = `sha256=${sign(body, secret)}`;
  assert.deepEqual(verifyWebhook({ rawBody: body, signature, secret, now: NOW }), { ok: true });
});

test('an event is only processed once, because duplicate delivery costs real money', async () => {
  const store = createMemorySeenStore();
  assert.equal(await store.has('evt_1'), false);
  await store.add('evt_1');
  assert.equal(await store.has('evt_1'), true);
});
