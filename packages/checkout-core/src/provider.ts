import { isValidBrCode } from './brcode.ts';
import {
  CheckoutError,
  type PaymentProvider,
  type PaymentStatus,
  type Session,
  type StatusReport,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const str = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CheckoutError('session_invalid', `"${field}" must be a non-empty string`);
  }
  return value;
};

const int = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new CheckoutError('session_invalid', `"${field}" must be an amount in minor units`);
  }
  return value;
};

const instant = (value: unknown, field: string): number => {
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new CheckoutError('session_invalid', `"${field}" is not a date`);
  }
  return parsed;
};

const STATUS: Record<string, PaymentStatus> = {
  pending: 'pending',
  paid: 'paid',
  expired: 'expired',
  refused: 'refused',
};

export const toPaymentStatus = (
  value: unknown,
  fallback: PaymentStatus = 'pending',
): PaymentStatus => STATUS[String(value).toLowerCase()] ?? fallback;

const expiryWindow = (
  declared: unknown,
  createdAt: unknown,
  expiresAt: number,
): number | undefined => {
  if (typeof declared === 'number' && declared > 0) return declared;
  if (createdAt === undefined || createdAt === null) return undefined;
  const created = typeof createdAt === 'number' ? createdAt : Date.parse(String(createdAt));
  return created < expiresAt ? expiresAt - created : undefined;
};

export function normalizeCanonicalSession(raw: unknown): Session {
  if (!isRecord(raw)) throw new CheckoutError('session_invalid', 'the session is not an object');
  const brCode = str(raw.brCode, 'brCode');
  if (!isValidBrCode(brCode)) {
    throw new CheckoutError('session_invalid', 'the BR Code checksum does not match');
  }
  const base64 = typeof raw.brCodeBase64 === 'string' ? raw.brCodeBase64 : undefined;
  const expiresAt = instant(raw.expiresAt, 'expiresAt');
  const expiresInMs = expiryWindow(raw.expiresInMs, raw.createdAt, expiresAt);
  return {
    sessionId: str(raw.sessionId ?? raw.id, 'sessionId'),
    brCode,
    ...(base64 === undefined ? {} : { brCodeBase64: base64 }),
    amount: int(raw.amount, 'amount'),
    currency: typeof raw.currency === 'string' ? raw.currency : 'BRL',
    expiresAt,
    ...(expiresInMs === undefined ? {} : { expiresInMs }),
    status: toPaymentStatus(raw.status),
  };
}

export function normalizeCanonicalStatus(raw: unknown): StatusReport {
  if (!isRecord(raw)) throw new CheckoutError('status_unavailable', 'the status is not an object');
  const endToEndId = typeof raw.endToEndId === 'string' ? raw.endToEndId : undefined;
  const providerCode = typeof raw.providerCode === 'string' ? raw.providerCode : undefined;
  const paidAt = raw.paidAt === undefined ? undefined : instant(raw.paidAt, 'paidAt');
  return {
    status: toPaymentStatus(raw.status),
    ...(endToEndId === undefined ? {} : { endToEndId }),
    ...(providerCode === undefined ? {} : { providerCode }),
    ...(paidAt === undefined ? {} : { paidAt }),
  };
}

export const pix = (): PaymentProvider => ({
  id: 'pix',
  normalizeSession: normalizeCanonicalSession,
  normalizeStatus: normalizeCanonicalStatus,
});
