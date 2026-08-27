import type { CheckoutError, CheckoutState, Session, StatusReport } from './types.ts';

export type CheckoutEvent =
  | { type: 'start' }
  | { type: 'created'; session: Session; now: number }
  | { type: 'createFailed'; error: CheckoutError }
  | { type: 'checkStarted' }
  | { type: 'checked'; report: StatusReport; now: number }
  | { type: 'checkFailed'; now: number }
  | { type: 'tick'; now: number };

export const initialState: CheckoutState = { status: 'idle' };

const paid = (session: Session, now: number, report: StatusReport): CheckoutState => ({
  status: 'paid',
  session,
  paidAt: report.paidAt ?? now,
  ...(report.endToEndId === undefined ? {} : { endToEndId: report.endToEndId }),
});

const settle = (session: Session, now: number): CheckoutState =>
  now >= session.expiresAt
    ? { status: 'expired', session, expiredAt: session.expiresAt }
    : { status: 'awaiting', session, lastCheckedAt: null, failures: 0, checking: false };

export function transition(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  switch (event.type) {
    case 'start':
      return state.status === 'awaiting' || state.status === 'paid'
        ? state
        : { status: 'creating' };

    case 'created': {
      if (state.status !== 'creating') return state;
      const { session, now } = event;
      if (session.status === 'paid') {
        return paid(session, now, { status: 'paid' });
      }
      if (session.status === 'refused') {
        return state;
      }
      if (session.status === 'expired') {
        return { status: 'expired', session, expiredAt: session.expiresAt };
      }
      return settle(session, now);
    }

    case 'createFailed':
      return state.status === 'creating' ? { status: 'failed', error: event.error } : state;

    case 'checkStarted':
      return state.status === 'awaiting' ? { ...state, checking: true } : state;

    case 'checked': {
      if (state.status !== 'awaiting') return state;
      const { report, now } = event;
      if (report.status === 'paid') return paid(state.session, now, report);
      if (report.status === 'expired' || now >= state.session.expiresAt) {
        return { status: 'expired', session: state.session, expiredAt: state.session.expiresAt };
      }
      return { ...state, lastCheckedAt: now, failures: 0, checking: false };
    }

    case 'checkFailed':
      return state.status === 'awaiting'
        ? { ...state, failures: state.failures + 1, checking: false }
        : state;

    case 'tick':
      return state.status === 'awaiting' && event.now >= state.session.expiresAt
        ? { status: 'expired', session: state.session, expiredAt: state.session.expiresAt }
        : state;

    default: {
      const never: never = event;
      return never;
    }
  }
}

export const isDegraded = (state: CheckoutState, threshold: number): boolean =>
  state.status === 'awaiting' && state.failures >= threshold;

export const isPollable = (state: CheckoutState): boolean => state.status === 'awaiting';
