import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brCode, encode as encodeReference } from '../../../design/qr.mjs';
import { encode, toSvgPath } from '../src/qr/encode.ts';

const payload: string = brCode({
  key: 'pagamentos@exemplo.com.br',
  name: 'LOJA EXEMPLO LTDA',
  city: 'SAO PAULO',
  amount: '129.90',
  txid: 'ABC123DEMO',
});

test('a Pix payload lands on the version the sheet is measured for', () => {
  const code = encode(payload);
  assert.equal(code.size, code.version * 4 + 17);
  assert.equal(code.size, 49, 'the sheet reserves 49 modules plus a 4-module quiet zone');
});

test('the port agrees with the fixture encoder, module for module', () => {
  const mine = encode(payload);
  const reference = encodeReference(payload) as { size: number; modules: number[][] };
  assert.equal(mine.size, reference.size);
  for (let r = 0; r < mine.size; r += 1) {
    for (let c = 0; c < mine.size; c += 1) {
      assert.equal(
        mine.modules[r * mine.size + c],
        reference.modules[r]?.[c],
        `module ${r},${c} differs`,
      );
    }
  }
});

test('the finder patterns are where a scanner looks for them', () => {
  const { size, modules } = encode(payload);
  const at = (r: number, c: number): number => modules[r * size + c] ?? 0;
  for (const [row, col] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ] as const) {
    assert.equal(at(row, col), 1);
    assert.equal(at(row + 1, col + 1), 0);
    assert.equal(at(row + 3, col + 3), 1);
  }
});

test('encoding is deterministic — the same charge renders the same code', () => {
  assert.deepEqual(encode(payload).modules, encode(payload).modules);
});

test('the path carries no quiet zone of its own: the sheet provides it', () => {
  const code = encode(payload);
  const { extent, d } = toSvgPath(code, 0);
  assert.equal(extent, code.size);
  assert.ok(d.startsWith('M'));
  assert.equal(toSvgPath(code, 4).extent, code.size + 8);
});

test('a payload past the supported ceiling throws instead of rendering something unscannable', () => {
  assert.throws(() => encode('x'.repeat(900)), RangeError);
});

test('encoding a charge stays well inside one frame', () => {
  const started = performance.now();
  encode(payload);
  assert.ok(performance.now() - started < 50, 'encode must not become a long task');
});
