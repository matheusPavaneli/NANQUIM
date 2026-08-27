import { handleWebhook } from '@nanquim/server';

import { resolveSeenStore } from './seen-store';

export const runtime = 'nodejs';

const seen = resolveSeenStore();

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
    process: async (event) => {
      if (event.data.status.toUpperCase() !== 'PAID') return;
      await Promise.resolve();
      console.log(JSON.stringify({ event: 'charge.paid', id: event.data.id }));
    },
  });

  if (result.status === 400) {
    console.warn(JSON.stringify({ event: 'webhook.rejected', reason: result.reason }));
    return new Response('bad request', { status: 400 });
  }

  if (result.status === 500) {
    console.error(JSON.stringify({ event: 'webhook.handler_failed', id: 'unknown' }));
    return new Response('retry later', { status: 500 });
  }

  return new Response('ok');
}
