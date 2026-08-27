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

export interface HandleBaseOptions extends Omit<VerifyOptions, 'rawBody'> {
  readonly rawBody: string;
}

export type HandleOptions = HandleBaseOptions &
  (
    | { readonly store?: undefined; readonly process?: undefined }
    | {
        readonly store: SeenStore;
        readonly process: (event: WebhookEvent) => Promise<void> | void;
      }
  );

export type HandleResult =
  | { readonly status: 200; readonly event: WebhookEvent; readonly duplicate: boolean }
  | { readonly status: 400; readonly reason: string }
  | { readonly status: 500; readonly reason: 'handler'; readonly cause: unknown };

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
  const event = result.data;

  const { store, process: handler } = options;
  if (store === undefined || handler === undefined) {
    return { status: 200, event, duplicate: false };
  }

  const claimed = await store.claim(event.id);
  if (!claimed) return { status: 200, event, duplicate: true };

  try {
    await handler(event);
  } catch (cause) {
    await store.release(event.id);
    return { status: 500, reason: 'handler', cause };
  }

  return { status: 200, event, duplicate: false };
}

export { z };
