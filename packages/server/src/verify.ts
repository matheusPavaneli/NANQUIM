import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface VerifyOptions {
  readonly rawBody: string | Uint8Array;
  readonly signature: string;
  readonly secret: string;
  readonly timestamp?: number;
  readonly toleranceSeconds?: number;
  readonly now?: number;
}

export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'signature' | 'timestamp' | 'malformed' };

const hex = (value: string): Buffer | null => {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '');
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) return null;
  return Buffer.from(clean, 'hex');
};

export function verifyWebhook(options: VerifyOptions): VerifyResult {
  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.now ?? Date.now();

  if (options.timestamp !== undefined) {
    const skew = Math.abs(now / 1000 - options.timestamp);
    if (!Number.isFinite(skew) || skew > tolerance) return { ok: false, reason: 'timestamp' };
  }

  const provided = hex(options.signature);
  if (provided === null) return { ok: false, reason: 'malformed' };

  const body =
    typeof options.rawBody === 'string'
      ? Buffer.from(options.rawBody, 'utf8')
      : Buffer.from(options.rawBody);
  const signed =
    options.timestamp === undefined
      ? body
      : Buffer.concat([Buffer.from(`${options.timestamp}.`), body]);
  const expected = createHmac('sha256', options.secret).update(signed).digest();

  if (provided.length !== expected.length) return { ok: false, reason: 'signature' };
  return timingSafeEqual(provided, expected) ? { ok: true } : { ok: false, reason: 'signature' };
}

export const sign = (rawBody: string, secret: string, timestamp?: number): string =>
  createHmac('sha256', secret)
    .update(timestamp === undefined ? rawBody : `${timestamp}.${rawBody}`)
    .digest('hex');

export interface SeenStore {
  has(id: string): Promise<boolean> | boolean;
  add(id: string): Promise<void> | void;
}

export function createMemorySeenStore(limit = 10_000): SeenStore {
  const seen = new Set<string>();
  return {
    has: (id) => seen.has(id),
    add: (id) => {
      if (seen.size >= limit) {
        const oldest = seen.values().next();
        if (!oldest.done) seen.delete(oldest.value);
      }
      seen.add(id);
    },
  };
}

export const idempotencyKey = (): string => randomUUID();
