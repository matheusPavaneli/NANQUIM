import { createMemorySeenStore, handleWebhook } from '@abcheckout/server';

export const runtime = 'nodejs';

const seen = createMemorySeenStore();

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (secret === undefined) return new Response('missing secret', { status: 500 });

  const rawBody = await request.text();
  const timestampHeader = request.headers.get('x-timestamp');

  const result = await handleWebhook({
    rawBody,
    signature: request.headers.get('x-signature') ?? '',
    secret,
    ...(timestampHeader === null ? {} : { timestamp: Number(timestampHeader) }),
    store: seen,
  });

  if (result.status === 400) {
    console.warn(JSON.stringify({ event: 'webhook.rejected', reason: result.reason }));
    return new Response('bad request', { status: 400 });
  }

  if (!result.duplicate && result.event.data.status.toUpperCase() === 'PAID') {
    console.log(JSON.stringify({ event: 'charge.paid', id: result.event.data.id }));
  }

  return new Response('ok');
}
