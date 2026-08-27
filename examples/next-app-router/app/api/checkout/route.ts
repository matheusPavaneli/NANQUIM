import { idempotencyKey } from '@abcheckout/server/verify';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const key = process.env.ABACATEPAY_API_KEY;
  if (key === undefined) return Response.json({ error: 'missing key' }, { status: 500 });

  const response = await fetch('https://api.abacatepay.com/v1/pixQrCode/create', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'idempotency-key': request.headers.get('idempotency-key') ?? idempotencyKey(),
    },
    body: JSON.stringify({
      amount: 12_990,
      expiresIn: 900,
      description: 'Plano Anual — Loja Exemplo',
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return Response.json({ error: 'PROVIDER_UNAVAILABLE' }, { status: 502 });
  }

  return Response.json(await response.json());
}
