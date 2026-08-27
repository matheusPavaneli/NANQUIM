import assert from 'node:assert/strict';
import { test } from 'node:test';
import { money, remaining } from '../src/format.ts';
import { backoff, createPoller, type Timers } from '../src/transport.ts';

test('backoff grows, is capped, and never lands on the same instant twice', () => {
  const options = { base: 3000, max: 30_000 };
  assert.equal(
    backoff(0, options, () => 0),
    3000,
  );
  assert.equal(
    backoff(1, options, () => 0),
    5400,
  );
  assert.equal(
    backoff(20, options, () => 0),
    30_000,
    'the ceiling holds',
  );
  const jittered = backoff(20, options, () => 1);
  assert.ok(jittered >= 21_000 && jittered <= 30_000, 'jitter only ever subtracts');
});

function fakeTimers(): Timers & { advance(ms: number): Promise<void>; pending(): number } {
  let now = 0;
  let nextId = 1;
  const queue = new Map<number, { at: number; handler: () => void }>();
  return {
    setTimeout(handler, ms) {
      const id = nextId++;
      queue.set(id, { at: now + ms, handler });
      return id;
    },
    clearTimeout(handle) {
      queue.delete(handle);
    },
    pending: () => queue.size,
    async advance(ms) {
      const target = now + ms;
      let guard = 0;
      for (;;) {
        const due = [...queue.entries()]
          .filter(([, entry]) => entry.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        guard += 1;
        if (!due || guard > 1000) break;
        queue.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].handler();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = target;
    },
  };
}

test('the poller reads on a schedule and stops when there is nothing left to ask', async () => {
  const timers = fakeTimers();
  let reads = 0;
  let alive = true;
  const poller = createPoller({
    run: async () => {
      reads += 1;
    },
    shouldContinue: () => alive,
    interval: 3000,
    maxInterval: 30_000,
    timeout: 10_000,
    timers,
    random: () => 0,
  });

  poller.start();
  await timers.advance(0);
  assert.equal(reads, 1);
  await timers.advance(3000);
  assert.equal(reads, 2);

  alive = false;
  await timers.advance(3000);
  assert.equal(reads, 2, 'a dead charge is not polled');
  assert.equal(timers.pending(), 0, 'and nothing is left scheduled');
});

test('a hidden tab is not polled, and coming back reads immediately', async () => {
  const timers = fakeTimers();
  let reads = 0;
  const poller = createPoller({
    run: async () => {
      reads += 1;
    },
    shouldContinue: () => true,
    interval: 3000,
    maxInterval: 30_000,
    timeout: 10_000,
    timers,
    random: () => 0,
  });

  poller.start();
  await timers.advance(0);
  poller.pause();
  await timers.advance(60_000);
  assert.equal(reads, 1, 'a throttled tab is not a person waiting');
  poller.resume();
  await timers.advance(0);
  assert.equal(reads, 2);
  poller.stop();
});

test('failures back off instead of hammering the provider', async () => {
  const timers = fakeTimers();
  const at: number[] = [];
  let elapsed = 0;
  const poller = createPoller({
    run: async () => {
      at.push(elapsed);
      throw new Error('5xx');
    },
    shouldContinue: () => true,
    interval: 3000,
    maxInterval: 30_000,
    timeout: 10_000,
    timers,
    random: () => 0,
  });

  poller.start();
  await timers.advance(0);
  for (const step of [3000, 5400, 9720]) {
    elapsed += step;
    await timers.advance(step);
  }
  assert.deepEqual(at, [0, 3000, 8400, 18_120]);
  poller.stop();
});

test('money is formatted from minor units, never from a float', () => {
  assert.match(money(12990, 'BRL', 'pt-BR'), /129,90/);
  assert.match(money(5, 'BRL', 'pt-BR'), /0,05/);
});

test('the deadline is recomputed from expiresAt, so a throttled tab cannot drift', () => {
  const issued = 1_000_000;
  const expires = issued + 15 * 60_000;
  assert.equal(remaining(expires, issued, issued).text, '15:00');
  assert.equal(remaining(expires, issued + 5 * 60_000, issued).fraction, 2 / 3);
  const over = remaining(expires, expires + 60_000, issued);
  assert.equal(over.text, '00:00');
  assert.equal(over.expired, true);
  assert.equal(over.fraction, 0);
});
