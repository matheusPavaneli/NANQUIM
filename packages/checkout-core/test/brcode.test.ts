import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crc16, isValidBrCode, parseBrCode } from '../src/brcode.ts';

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
  tlv('62', tlv('05', 'ABC123DEMO')) +
  '6304';
const payload = body + crc16(body);

test('crc16 matches the CCITT-FALSE reference vector', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('a well-formed payload validates offline', () => {
  assert.equal(isValidBrCode(payload), true);
});

test('one flipped character fails the checksum', () => {
  const tampered = payload.replace('129.90', '129.91');
  assert.equal(isValidBrCode(tampered), false);
});

test('a truncated payload fails rather than half-parsing', () => {
  assert.equal(isValidBrCode(payload.slice(0, -6)), false);
  assert.equal(parseBrCode(payload.slice(0, -6)), null);
});

test('the fields a support ticket needs are readable without a network call', () => {
  const fields = parseBrCode(payload);
  assert.ok(fields);
  assert.equal(fields.name, 'LOJA EXEMPLO LTDA');
  assert.equal(fields.amount, '129.90');
  assert.equal(fields.txid, 'ABC123DEMO');
  assert.equal(fields.crcValid, true);
});

test('a payload that is not TLV-shaped returns null instead of guessing', () => {
  assert.equal(parseBrCode('not a br code at all'), null);
});
