import { createHmac, timingSafeEqual } from 'node:crypto';

export const GRANT_COOKIE = 'abc_grant';

const secret = (): string => {
  const value = process.env.CHECKOUT_GRANT_SECRET;
  if (value === undefined || value.length < 32) {
    throw new Error('CHECKOUT_GRANT_SECRET must be set to at least 32 characters');
  }
  return value;
};

const sign = (id: string): string => createHmac('sha256', secret()).update(id).digest('hex');

export const issueGrant = (id: string): string => `${id}.${sign(id)}`;

export function grantAllows(cookie: string | undefined, id: string): boolean {
  if (cookie === undefined) return false;
  const separator = cookie.lastIndexOf('.');
  if (separator <= 0) return false;
  if (cookie.slice(0, separator) !== id) return false;
  const provided = Buffer.from(cookie.slice(separator + 1), 'hex');
  const expected = Buffer.from(sign(id), 'hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export const hasGrantSecret = (): boolean => {
  const value = process.env.CHECKOUT_GRANT_SECRET;
  return value !== undefined && value.length >= 32;
};

export const grantCookie = (id: string, maxAgeSeconds: number): string => {
  const attributes = [
    `${GRANT_COOKIE}=${issueGrant(id)}`,
    'Path=/api/checkout',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
};

export const readGrant = (request: Request): string | undefined => {
  const header = request.headers.get('cookie');
  if (header === null) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === GRANT_COOKIE) return rest.join('=');
  }
  return undefined;
};
