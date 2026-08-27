import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clock, money } from '../src/format.ts';

test('sem Intl, o valor ainda aparece — nunca um espaco em branco', () => {
  const real = globalThis.Intl;
  try {
    // @ts-expect-error — deliberately removing a platform global for the duration of the test
    globalThis.Intl = undefined;
    assert.equal(money(12_990, 'BRL', 'pt-BR'), 'BRL 129.90');
    assert.match(clock(Date.UTC(2026, 7, 27, 17, 32, 10), 'pt-BR'), /^\d\d:\d\d:\d\d$/);
  } finally {
    globalThis.Intl = real;
  }
});

test('uma moeda desconhecida nao derruba a superficie', () => {
  assert.match(money(12_990, 'XXX', 'pt-BR'), /129/);
});
