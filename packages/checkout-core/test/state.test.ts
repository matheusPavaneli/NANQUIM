import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initialState, transition } from '../src/state.ts';
import { CheckoutError, type CheckoutState, type Session } from '../src/types.ts';

const NOW = 1_700_000_000_000;

const session = (overrides: Partial<Session> = {}): Session => ({
  sessionId: 'sess_1',
  brCode: '00020126...6304ABCD',
  amount: 12990,
  currency: 'BRL',
  expiresAt: NOW + 15 * 60_000,
  status: 'pending',
  ...overrides,
});

const awaiting = (overrides: Partial<Extract<CheckoutState, { status: 'awaiting' }>> = {}) => {
  const created = transition(
    { status: 'creating' },
    { type: 'created', session: session(), now: NOW },
  );
  assert.equal(created.status, 'awaiting');
  return { ...created, ...overrides } as CheckoutState;
};

test('the graph starts idle and only creating leads anywhere', () => {
  assert.equal(initialState.status, 'idle');
  assert.equal(transition(initialState, { type: 'start' }).status, 'creating');
});

test('a charge that arrives alive lands in awaiting with nothing checked yet', () => {
  const state = transition(
    { status: 'creating' },
    { type: 'created', session: session(), now: NOW },
  );
  assert.equal(state.status, 'awaiting');
  if (state.status !== 'awaiting') return;
  assert.equal(state.lastCheckedAt, null);
  assert.equal(state.failures, 0);
  assert.equal(state.checking, false);
});

test('a charge that arrives already over is expired, not awaiting', () => {
  const dead = session({ expiresAt: NOW - 1 });
  const state = transition({ status: 'creating' }, { type: 'created', session: dead, now: NOW });
  assert.equal(state.status, 'expired');
});

test('a charge that arrives already paid skips the wait', () => {
  const done = session({ status: 'paid' });
  const state = transition({ status: 'creating' }, { type: 'created', session: done, now: NOW });
  assert.equal(state.status, 'paid');
});

test('start never throws away a live code', () => {
  const state = awaiting();
  assert.equal(transition(state, { type: 'start' }), state);
});

test('a failed read never becomes a failed payment', () => {
  let state = awaiting();
  for (let i = 0; i < 10; i += 1) state = transition(state, { type: 'checkFailed', now: NOW });
  assert.equal(state.status, 'awaiting');
  if (state.status !== 'awaiting') return;
  assert.equal(state.failures, 10);
  assert.equal(state.checking, false);
});

test('a successful read clears the failure streak and records when it happened', () => {
  const state = transition(transition(awaiting(), { type: 'checkFailed', now: NOW }), {
    type: 'checked',
    report: { status: 'pending' },
    now: NOW + 1000,
  });
  assert.equal(state.status, 'awaiting');
  if (state.status !== 'awaiting') return;
  assert.equal(state.failures, 0);
  assert.equal(state.lastCheckedAt, NOW + 1000);
});

test('a Pix that lands after the deadline is paid, not expired', () => {
  const late = NOW + 16 * 60_000;
  const state = transition(awaiting(), {
    type: 'checked',
    report: { status: 'paid', endToEndId: 'E123', paidAt: late },
    now: late,
  });
  assert.equal(state.status, 'paid');
  if (state.status !== 'paid') return;
  assert.equal(state.endToEndId, 'E123');
  assert.equal(state.paidAt, late);
});

test('a pending read after the deadline settles as expired', () => {
  const late = NOW + 16 * 60_000;
  const state = transition(awaiting(), {
    type: 'checked',
    report: { status: 'pending' },
    now: late,
  });
  assert.equal(state.status, 'expired');
});

test('the tick expires the charge exactly at the deadline and never before', () => {
  const state = awaiting();
  assert.equal(transition(state, { type: 'tick', now: NOW + 15 * 60_000 - 1 }).status, 'awaiting');
  assert.equal(transition(state, { type: 'tick', now: NOW + 15 * 60_000 }).status, 'expired');
});

test('creation failure is a failure to create, and it keeps the provider code', () => {
  const error = new CheckoutError('provider_refused', 'refused', {
    providerCode: 'INVALID_PIX_KEY',
  });
  const state = transition({ status: 'creating' }, { type: 'createFailed', error });
  assert.equal(state.status, 'failed');
  if (state.status !== 'failed') return;
  assert.equal(state.error.providerCode, 'INVALID_PIX_KEY');
  assert.equal(transition(state, { type: 'start' }).status, 'creating');
});

test('events that do not apply to the current state leave it untouched', () => {
  const paid = transition(awaiting(), { type: 'checked', report: { status: 'paid' }, now: NOW });
  assert.equal(transition(paid, { type: 'checkFailed', now: NOW }), paid);
  assert.equal(transition(paid, { type: 'tick', now: NOW + 1e9 }), paid);
  assert.equal(transition(paid, { type: 'start' }), paid);
});
