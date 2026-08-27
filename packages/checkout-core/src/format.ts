import type { Locale } from './types.ts';

export function money(minorUnits: number, currency: string, locale: Locale): string {
  const value = minorUnits / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function clock(epochMs: number, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(epochMs));
  } catch {
    return new Date(epochMs).toISOString().slice(11, 19);
  }
}

export interface Remaining {
  readonly ms: number;
  readonly text: string;
  readonly fraction: number;
  readonly expired: boolean;
}

export function remaining(expiresAt: number, now: number, issuedAt?: number): Remaining {
  const ms = Math.max(0, expiresAt - now);
  const total = Math.max(1, expiresAt - (issuedAt ?? expiresAt - 15 * 60_000));
  const seconds = Math.ceil(ms / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return {
    ms,
    text: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    fraction: Math.min(1, Math.max(0, ms / total)),
    expired: ms === 0,
  };
}

export const minutesSince = (then: number, now: number): number =>
  Math.max(0, Math.floor((now - then) / 60_000));
