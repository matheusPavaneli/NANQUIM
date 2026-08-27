import { z } from 'zod';

import { type SeenStore, type VerifyOptions, verifyWebhook } from './verify.ts';

export {
  createMemorySeenStore,
  idempotencyKey,
  type SeenStore,
  sign,
  type VerifyOptions,
  type VerifyResult,
  verifyWebhook,
} from './verify.ts';

export const webhookEventSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  data: z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    amount: z.number().int().nonnegative().optional(),
    endToEndId: z.string().optional(),
    paidAt: z.union([z.string(), z.number()]).optional(),
  }),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export interface HandleOptions extends Omit<VerifyOptions, 'rawBody'> {
  readonly rawBody: string;
  readonly store?: SeenStore;
}

export type HandleResult =
  | { readonly status: 200; readonly event: WebhookEvent; readonly duplicate: boolean }
  | { readonly status: 400; readonly reason: string };

export async function handleWebhook(options: HandleOptions): Promise<HandleResult> {
  const verified = verifyWebhook(options);
  if (!verified.ok) return { status: 400, reason: verified.reason };

  let parsed: unknown;
  try {
    parsed = JSON.parse(options.rawBody);
  } catch {
    return { status: 400, reason: 'malformed' };
  }

  const result = webhookEventSchema.safeParse(parsed);
  if (!result.success) return { status: 400, reason: 'schema' };

  const store = options.store;
  if (store === undefined) return { status: 200, event: result.data, duplicate: false };
  const duplicate = await store.has(result.data.id);
  if (!duplicate) await store.add(result.data.id);
  return { status: 200, event: result.data, duplicate };
}

export { z };
