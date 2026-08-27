import { CheckoutError, type CheckoutState, type Session, type StatusReport } from './types.ts';

export type CheckoutEvent =
  | { type: 'start' }
  | { type: 'created'; session: Session; deadline: number; now: number }
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

const expired = (session: Session, deadline: number): CheckoutState => ({
  status: 'expired',
  session,
  deadline,
  expiredAt: deadline,
});

const refused = (report: StatusReport): CheckoutState => ({
  status: 'failed',
  error: new CheckoutError('provider_refused', 'the provider cancelled the charge', {
    ...(report.providerCode === undefined ? {} : { providerCode: report.providerCode }),
  }),
});

const settle = (session: Session, deadline: number, now: number): CheckoutState =>
  now >= deadline
    ? expired(session, deadline)
    : { status: 'awaiting', session, deadline, lastCheckedAt: null, failures: 0, checking: false };

export function transition(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  switch (event.type) {
    case 'start':
      return state.status === 'awaiting' || state.status === 'paid'
        ? state
        : { status: 'creating' };

    case 'created': {
      if (state.status !== 'creating') return state;
      const { session, deadline, now } = event;
      if (session.status === 'paid') {
        return paid(session, now, { status: 'paid' });
      }
      if (session.status === 'refused') {
        return state;
      }
      if (session.status === 'expired') {
        return expired(session, deadline);
      }
      return settle(session, deadline, now);
    }

    case 'createFailed':
      return state.status === 'creating' ? { status: 'failed', error: event.error } : state;

    case 'checkStarted':
      return state.status === 'awaiting' ? { ...state, checking: true } : state;

    case 'checked': {
      if (state.status !== 'awaiting') return state;
      const { report, now } = event;
      if (report.status === 'paid') return paid(state.session, now, report);
      if (report.status === 'refused') return refused(report);
      if (report.status === 'expired' || now >= state.deadline) {
        return expired(state.session, state.deadline);
      }
      return { ...state, lastCheckedAt: now, failures: 0, checking: false };
    }

    case 'checkFailed':
      return state.status === 'awaiting'
        ? { ...state, failures: state.failures + 1, checking: false }
        : state;

    case 'tick':
      return state.status === 'awaiting' && event.now >= state.deadline
        ? expired(state.session, state.deadline)
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
