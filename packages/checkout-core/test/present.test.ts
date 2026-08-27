import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messagesFor } from '../src/i18n.ts';
import { type PresentOptions, present } from '../src/present.ts';
import { CheckoutError, type CheckoutState, type Session } from '../src/types.ts';

const NOW = Date.UTC(2026, 7, 27, 17, 32, 10);
const messages = messagesFor('pt-BR');

const session: Session = {
  sessionId: 'sess_1',
  brCode: '00020126...6304ABCD',
  amount: 12990,
  currency: 'BRL',
  expiresAt: NOW + 9 * 60_000 + 47_000,
  status: 'pending',
};

const options: PresentOptions = {
  messages,
  locale: 'pt-BR' as const,
  now: NOW,
  copied: false,
  degradeAfter: 3,
  issuedAt: NOW - 5 * 60_000 - 13_000,
};

const view = (state: CheckoutState, extra: Partial<PresentOptions> = {}) =>
  present(state, { ...options, ...extra });

test('creating shows the amount it already knows, and a skeleton in the arriving order', () => {
  const model = view({ status: 'creating' }, { charge: { amount: 12990, currency: 'BRL' } });
  assert.equal(model.machine.kind, 'skeleton');
  assert.match(model.amount, /129,90/);
  assert.equal(model.life.fill, 1);
  assert.equal(model.control, null);
  assert.equal(model.note, messages.noteCreating);
});

test('awaiting is monochrome, counts down, and leads with the payload', () => {
  const model = view({
    status: 'awaiting',
    session,
    lastCheckedAt: NOW,
    failures: 0,
    checking: false,
  });
  assert.equal(model.due, 'vence em 09:47');
  assert.equal(model.statusTone, 'ink');
  assert.equal(model.icon, 'none');
  assert.equal(model.machine.kind, 'code');
  assert.equal(model.control, null, 'no manual control while the automatic read is working');
  assert.equal(model.meta?.label, 'Verificado');
  assert.ok(model.life.fill > 0.6 && model.life.fill < 0.7);
});

test('the copied control is the inverse of itself, not a toast', () => {
  const model = view(
    { status: 'awaiting', session, lastCheckedAt: NOW, failures: 0, checking: false },
    { copied: true },
  );
  assert.equal(model.machine.kind, 'code');
  if (model.machine.kind !== 'code') return;
  assert.equal(model.machine.copy.fill, 1);
  assert.equal(model.machine.copy.filledLabel, 'Código copiado');
  assert.equal(model.announce, 'Código copiado');
});

test('the degraded read blames the connection, keeps the code, and never claims failure', () => {
  const model = view({
    status: 'awaiting',
    session,
    lastCheckedAt: NOW - 3 * 60_000,
    failures: 3,
    checking: true,
  });
  assert.equal(model.statusText, 'Sem confirmação do servidor');
  assert.equal(model.statusTone, 'danger');
  assert.equal(model.icon, 'alert', 'danger is never carried by colour alone');
  assert.equal(
    model.machine.kind,
    'code',
    'the code is still valid, so the machine does not change',
  );
  assert.equal(model.note, messages.noteDegraded);
  assert.ok(!/falh|não foi pago/i.test(model.note));
  assert.equal(model.control?.action, 'check');
  assert.equal(model.control?.busy, true, 'a server read has no progress, so it is indeterminate');
  assert.equal(model.control?.fill, 0);
  assert.equal(model.controlFirst, true);
  assert.equal(model.meta?.label, 'Última confirmação');
  assert.match(model.meta?.value ?? '', /^14:29:10 .+ 3 min$/u);
});

test('expired drains the rule, spends the amount and explains before it acts', () => {
  const model = view({ status: 'expired', session, expiredAt: session.expiresAt });
  assert.equal(model.life.fill, 0);
  assert.equal(model.amountTone, 'spent');
  assert.equal(model.machine.kind, 'notice');
  assert.equal(model.controlFirst, false);
  assert.equal(model.control?.label, 'Gerar novo código');
  assert.match(model.note, /nada foi cobrado/);
});

test('paid is the one moment with chroma, and it carries the machine receipt', () => {
  const model = view({
    status: 'paid',
    session,
    paidAt: NOW + 56_000,
    endToEndId: 'E1234567820260827143241a9c3f7b2',
  });
  assert.equal(model.life.tone, 'ok');
  assert.equal(model.life.fill, 1);
  assert.equal(model.amountTone, 'ok');
  assert.equal(model.icon, 'check');
  assert.equal(model.machine.kind, 'notice');
  if (model.machine.kind !== 'notice') return;
  assert.equal(model.machine.value, 'E1234567820260827143241a9c3f7b2');
  assert.equal(model.control, null, 'there is nothing left to do here');
});

test('a creation failure shows the provider refusal instead of hiding it', () => {
  const error = new CheckoutError('provider_refused', 'refused', {
    providerCode: 'INVALID_PIX_KEY',
  });
  const model = view({ status: 'failed', error });
  assert.equal(model.machine.kind, 'notice');
  if (model.machine.kind !== 'notice') return;
  assert.equal(model.machine.label, 'Recusa do provedor');
  assert.equal(model.machine.value, 'INVALID_PIX_KEY');
  assert.match(model.note, /nada foi cobrado/);
  assert.equal(model.control?.label, 'Tentar de novo');
});

test('every failure state says what happened, what to do and that nothing was charged', () => {
  const states: CheckoutState[] = [
    { status: 'expired', session, expiredAt: session.expiresAt },
    { status: 'failed', error: new CheckoutError('session_create_failed', 'x') },
  ];
  for (const state of states) {
    const model = view(state);
    assert.match(model.note, /nada foi cobrado/, `${state.status} must say nothing was charged`);
    assert.ok(model.control, `${state.status} must offer a way out`);
    assert.ok(!/ops|algo deu errado/i.test(model.note));
  }
});

test('an unknown locale falls back to the language the charge is denominated in', () => {
  const model = present(
    { status: 'awaiting', session, lastCheckedAt: null, failures: 0, checking: false },
    { ...options, messages: messagesFor(undefined) },
  );
  assert.equal(model.statusText, 'Aguardando pagamento');
  assert.equal(model.meta, null, 'nothing is claimed to be verified before the first read');
});
