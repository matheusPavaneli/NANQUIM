import { idempotencyKey } from '@nanquim/server/verify';

import { grantCookie, hasGrantSecret } from './grant';
import { providerSessionSchema, unwrapProvider } from './shape';

export const runtime = 'nodejs';

const CHARGE = { amount: 12_990, expiresIn: 900, description: 'Plano Anual — Loja Exemplo' };

export async function POST(request: Request): Promise<Response> {
  const key = process.env.ABACATEPAY_API_KEY;
  if (key === undefined) return Response.json({ error: 'missing key' }, { status: 500 });
  if (!hasGrantSecret()) return Response.json({ error: 'missing grant secret' }, { status: 500 });

  const response = await fetch('https://api.abacatepay.com/v1/pixQrCode/create', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'idempotency-key': request.headers.get('idempotency-key') ?? idempotencyKey(),
    },
    body: JSON.stringify(CHARGE),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return Response.json({ error: 'PROVIDER_UNAVAILABLE' }, { status: 502 });
  }

  const parsed = providerSessionSchema.safeParse(unwrapProvider(await response.json()));
  if (!parsed.success) {
    return Response.json({ error: 'PROVIDER_UNREADABLE' }, { status: 502 });
  }
  if (parsed.data.amount !== CHARGE.amount) {
    return Response.json({ error: 'AMOUNT_MISMATCH' }, { status: 502 });
  }

  return Response.json(parsed.data, {
    headers: {
      'set-cookie': grantCookie(parsed.data.id, CHARGE.expiresIn),
      'cache-control': 'no-store',
    },
  });
}
