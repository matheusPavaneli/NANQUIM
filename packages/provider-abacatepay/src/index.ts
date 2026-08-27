import {
  CheckoutError,
  isValidBrCode,
  type PaymentProvider,
  type PaymentStatus,
  type Session,
  type StatusReport,
} from '@nanquim/core';

interface Envelope {
  readonly data?: unknown;
  readonly error?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function unwrap(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) throw new CheckoutError('session_invalid', 'the response is not an object');
  const envelope = raw as Envelope;
  if (envelope.error !== undefined && envelope.error !== null) {
    const code = typeof envelope.error === 'string' ? envelope.error : 'PROVIDER_ERROR';
    throw new CheckoutError('provider_refused', 'AbacatePay refused the charge', {
      providerCode: code,
    });
  }
  const data = envelope.data === undefined ? raw : envelope.data;
  if (!isRecord(data)) throw new CheckoutError('session_invalid', 'the response has no data');
  return data;
}

const STATUS: Record<string, PaymentStatus> = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  CANCELLED: 'refused',
  REFUNDED: 'refused',
};

const mapStatus = (value: unknown): PaymentStatus =>
  STATUS[String(value).toUpperCase()] ?? 'pending';

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CheckoutError('session_invalid', `AbacatePay returned no "${field}"`);
  }
  return value;
};

const instant = (value: unknown, field: string): number => {
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new CheckoutError('session_invalid', `AbacatePay returned an unreadable "${field}"`);
  }
  return parsed;
};

const optionalInstant = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function normalizeSession(raw: unknown): Session {
  const data = unwrap(raw);
  const brCode = requireString(data.brCode, 'brCode');
  if (!isValidBrCode(brCode)) {
    throw new CheckoutError('session_invalid', 'the BR Code checksum does not match');
  }
  const image = typeof data.brCodeBase64 === 'string' ? data.brCodeBase64 : undefined;
  const amount = data.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new CheckoutError('session_invalid', 'AbacatePay returned no integer amount');
  }
  const expiresAt = instant(data.expiresAt, 'expiresAt');
  const createdAt = optionalInstant(data.createdAt);
  const expiresInMs =
    createdAt !== undefined && expiresAt > createdAt ? expiresAt - createdAt : undefined;
  return {
    sessionId: requireString(data.id, 'id'),
    brCode,
    ...(image === undefined ? {} : { brCodeBase64: image }),
    amount,
    currency: 'BRL',
    expiresAt,
    ...(expiresInMs === undefined ? {} : { expiresInMs }),
    status: mapStatus(data.status),
  };
}

export function normalizeStatus(raw: unknown): StatusReport {
  const data = unwrap(raw);
  const endToEndId = typeof data.endToEndId === 'string' ? data.endToEndId : undefined;
  const paidAt = data.paidAt === undefined ? undefined : instant(data.paidAt, 'paidAt');
  return {
    status: mapStatus(data.status),
    ...(endToEndId === undefined ? {} : { endToEndId }),
    ...(paidAt === undefined ? {} : { paidAt }),
  };
}

export const abacatePay = (): PaymentProvider => ({
  id: 'abacatepay',
  normalizeSession,
  normalizeStatus,
});

export default abacatePay;
