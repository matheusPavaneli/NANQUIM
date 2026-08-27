import { clock, minutesSince, money, remaining } from './format.ts';
import type { Messages } from './i18n.ts';
import type { CheckoutState, CheckoutStatus, Locale } from './types.ts';

export type Tone = 'ink' | 'ok' | 'danger' | 'spent';

export interface Control {
  readonly action: 'copy' | 'retry' | 'check';
  readonly label: string;
  readonly filledLabel: string;
  readonly kind: 'primary' | 'secondary';
  readonly busy: boolean;
  readonly fill: number;
}

export type Machine =
  | { readonly kind: 'skeleton' }
  | {
      readonly kind: 'code';
      readonly payload: string;
      readonly payloadLabel: string;
      readonly fallbackImage?: string;
      readonly copy: Control;
    }
  | {
      readonly kind: 'notice';
      readonly label: string;
      readonly value: string;
      readonly tone: Tone;
    };

export interface ViewModel {
  readonly status: CheckoutStatus;
  readonly group: string;
  readonly eyebrow: string;
  readonly due: string | null;
  readonly amount: string;
  readonly amountTone: Tone;
  readonly statusText: string;
  readonly statusTone: Tone;
  readonly icon: 'none' | 'alert' | 'check';
  readonly life: { readonly fill: number; readonly tone: Tone };
  readonly machine: Machine;
  readonly note: string;
  readonly control: Control | null;
  readonly controlFirst: boolean;
  readonly meta: { readonly label: string; readonly value: string } | null;
  readonly announce: string;
  readonly qrAlt: string;
}

export interface PresentOptions {
  readonly messages: Messages;
  readonly locale: Locale;
  readonly now: number;
  readonly charge?: { readonly amount: number; readonly currency: string };
  readonly copied: boolean;
  readonly degradeAfter: number;
  readonly issuedAt?: number;
}

const copyControl = (m: Messages, copied: boolean): Control => ({
  action: 'copy',
  label: m.copy,
  filledLabel: copied ? m.copied : m.copy,
  kind: 'primary',
  busy: false,
  fill: copied ? 1 : 0,
});

export function present(state: CheckoutState, options: PresentOptions): ViewModel {
  const m = options.messages;
  const amountOf = (minor: number, currency: string): string =>
    money(minor, currency, options.locale);
  const placeholderAmount = options.charge
    ? amountOf(options.charge.amount, options.charge.currency)
    : '';

  const base = {
    status: state.status,
    group: m.group,
    eyebrow: m.eyebrow,
    qrAlt: m.qrAlt,
    controlFirst: false,
  } as const;

  switch (state.status) {
    case 'idle':
    case 'creating':
      return {
        ...base,
        due: null,
        amount: placeholderAmount,
        amountTone: 'ink',
        statusText: m.statusCreating,
        statusTone: 'ink',
        icon: 'none',
        life: { fill: 1, tone: 'ink' },
        machine: { kind: 'skeleton' },
        note: m.noteCreating,
        control: null,
        meta: null,
        announce: m.statusCreating,
      };

    case 'awaiting': {
      const left = remaining(state.deadline, options.now, options.issuedAt);
      const degraded = state.failures >= options.degradeAfter;
      const machine: Machine = {
        kind: 'code',
        payload: state.session.brCode,
        payloadLabel: m.payloadLabel,
        ...(state.session.brCodeBase64 === undefined
          ? {}
          : { fallbackImage: state.session.brCodeBase64 }),
        copy: copyControl(m, options.copied),
      };
      const meta =
        state.lastCheckedAt === null
          ? null
          : degraded
            ? {
                label: m.lastCheckedLabel,
                value: `${clock(state.lastCheckedAt, options.locale)} · ${m.ago(
                  minutesSince(state.lastCheckedAt, options.now),
                )}`,
              }
            : { label: m.checkedLabel, value: clock(state.lastCheckedAt, options.locale) };
      return {
        ...base,
        due: m.dueIn(left.text),
        amount: amountOf(state.session.amount, state.session.currency),
        amountTone: 'ink',
        statusText: degraded ? m.statusDegraded : m.statusAwaiting,
        statusTone: degraded ? 'danger' : 'ink',
        icon: degraded ? 'alert' : 'none',
        life: { fill: left.fraction, tone: 'ink' },
        machine,
        note: degraded ? m.noteDegraded : m.noteAwaiting,
        control: degraded
          ? {
              action: 'check',
              label: state.checking ? m.checking : m.checkNow,
              filledLabel: state.checking ? m.checking : m.checkNow,
              kind: 'secondary',
              busy: state.checking,
              fill: 0,
            }
          : null,
        controlFirst: degraded,
        meta,
        announce: options.copied ? m.copied : degraded ? m.statusDegraded : m.statusAwaiting,
      };
    }

    case 'expired':
      return {
        ...base,
        due: null,
        amount: amountOf(state.session.amount, state.session.currency),
        amountTone: 'spent',
        statusText: m.statusExpired,
        statusTone: 'danger',
        icon: 'alert',
        life: { fill: 0, tone: 'ink' },
        machine: {
          kind: 'notice',
          label: m.codeStatusLabel,
          value: m.expiredAtValue(clock(state.expiredAt, options.locale)),
          tone: 'ink',
        },
        note: m.noteExpired,
        control: {
          action: 'retry',
          label: m.newCode,
          filledLabel: m.newCode,
          kind: 'primary',
          busy: false,
          fill: 0,
        },
        meta: null,
        announce: `${m.statusExpired}. ${m.noteExpired}`,
      };

    case 'paid':
      return {
        ...base,
        due: m.paidAt(clock(state.paidAt, options.locale)),
        amount: amountOf(state.session.amount, state.session.currency),
        amountTone: 'ok',
        statusText: m.statusPaid,
        statusTone: 'ok',
        icon: 'check',
        life: { fill: 1, tone: 'ok' },
        machine: {
          kind: 'notice',
          label: m.e2eLabel,
          value: state.endToEndId ?? state.session.sessionId,
          tone: 'ok',
        },
        note: m.notePaid,
        control: null,
        meta: null,
        announce: `${m.statusPaid}. ${m.notePaid}`,
      };

    case 'failed':
      return {
        ...base,
        due: null,
        amount: placeholderAmount,
        amountTone: 'spent',
        statusText: m.statusFailed,
        statusTone: 'danger',
        icon: 'alert',
        life: { fill: 0, tone: 'ink' },
        machine: {
          kind: 'notice',
          label: m.refusalLabel,
          value: state.error.providerCode ?? state.error.code.toUpperCase(),
          tone: 'ink',
        },
        note: m.noteFailed,
        control: {
          action: 'retry',
          label: m.tryAgain,
          filledLabel: m.tryAgain,
          kind: 'primary',
          busy: false,
          fill: 0,
        },
        meta: null,
        announce: `${m.statusFailed}. ${m.noteFailed}`,
      };

    default: {
      const never: never = state;
      return never;
    }
  }
}
