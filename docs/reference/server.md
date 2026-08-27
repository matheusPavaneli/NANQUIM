# `@nanquim/server`

Node-only, Node 24+. One dependency (`zod`), re-exported so your route handlers do not need their
own copy. This package is where a payment becomes true.

```ts
import { handleWebhook, verifyWebhook, sign, createMemorySeenStore } from '@nanquim/server';
import { idempotencyKey } from '@nanquim/server/verify';
```

## `handleWebhook(options)`

The whole receiver: verify, parse, validate, claim, process, answer.

```ts
const result = await handleWebhook({
  rawBody,                              // the EXACT bytes; never a re-serialized object
  signature: request.headers.get('x-signature') ?? '',
  timestamp: Number(request.headers.get('x-timestamp')),
  secret: process.env.WEBHOOK_SIGNING_SECRET!,
  store: seen,
  process: async (event) => {
    if (event.data.status.toUpperCase() === 'PAID') await creditOrder(event.data.id);
  },
});
```

::: warning These header names are an example, not a standard
There is no cross-PSP convention for webhook headers. `x-signature` / `x-timestamp` is what the
SDK's own [`sign`](#sign-rawbody-secret-timestamp) produces, which is what the tests and the
example app use. For a real PSP, read its docs and adapt — see
[AbacatePay's scheme](/reference/provider#the-webhook-is-a-different-scheme-read-this-before-wiring-it)
for a worked bridge, including base64 digests and `requireTimestamp: false`.
:::

### Result

```ts
type HandleResult =
  | { status: 200; event: WebhookEvent; duplicate: boolean }
  | { status: 400; reason: 'signature' | 'timestamp' | 'malformed' | 'schema' }
  | { status: 500; reason: 'handler'; cause: unknown };
```

Map them straight onto the response, and do not collapse `500` into `200` — the `500` is what
makes the PSP retry.

::: danger Log the reason, never the body
A `400` means someone sent you an unverifiable payload. Log `reason` and a request id. Do not log
`rawBody`, the signature, or the secret.
:::

### Ordering, and why it matters

1. **Signature first.** Verification happens before `JSON.parse`, so an unauthenticated sender
   never reaches your parser.
2. **Then the timestamp window.** Actually checked inside verification, before the digest
   comparison.
3. **Then the schema.** A verified payload that does not match `webhookEventSchema` is still a
   `400` — a valid signature over garbage is a PSP bug, not a reason to guess.
4. **Then the claim.** `store.claim(event.id)` is atomic; a duplicate returns
   `{ status: 200, duplicate: true }` without running your callback.
5. **Then your handler.** If it throws, the claim is **released** and the result is `500`, so the
   retry is processed instead of being swallowed as a duplicate.

`store` and `process` are typed as a pair: pass both, or neither. With neither, `handleWebhook`
verifies and validates and hands you the event, and idempotency is your problem.

## `verifyWebhook(options)`

The primitive, if you want to own the rest.

```ts
function verifyWebhook(options: {
  rawBody: string | Uint8Array;
  signature: string;                 // hex, with or without a 'sha256=' prefix
  secret: string;
  timestamp?: number;                // seconds since epoch
  toleranceSeconds?: number;         // default 300
  requireTimestamp?: boolean;        // default true
  now?: number;                      // injectable for tests
}): { ok: true } | { ok: false; reason: 'signature' | 'timestamp' | 'malformed' };
```

- **Constant time.** The digest comparison is `timingSafeEqual`, and lengths are compared first
  so the call cannot throw.
- **The replay window is on by default.** A delivery with no `timestamp` is rejected as
  `timestamp` unless you explicitly pass `requireTimestamp: false`. That opt-out exists for a PSP
  that provably does not send one, and it costs you replay protection — document the decision
  where you make it.
- **The signed message.** With a timestamp, the HMAC covers `` `${timestamp}.${rawBody}` ``;
  without one, just `rawBody`. Match your PSP's scheme.
- **`rawBody` must be raw.** Re-serializing the parsed object changes key order and whitespace and
  the signature will never match. In Next.js, `await request.text()` before anything else.

## `sign(rawBody, secret, timestamp?)`

The same construction, for tests and for fixtures:

```ts
const body = JSON.stringify({ id: 'evt_1', event: 'billing.paid', data: { id: 'ch_1', status: 'PAID' } });
const ts = Math.floor(Date.now() / 1000);
const signature = sign(body, secret, ts);
```

## `SeenStore`

```ts
interface SeenStore {
  claim(id: string): Promise<boolean> | boolean;   // true = first time; false = already seen
  release(id: string): Promise<void> | void;
}
```

Two methods, so any durable store can back it. A Redis implementation is `SET key 1 NX EX 86400`
for `claim` and `DEL` for `release`.

```ts
function createMemorySeenStore(limit = 10_000): SeenStore;
```

::: warning Memory store is for tests
It does not survive a cold start and is not shared between instances, so it cannot make a webhook
idempotent in production. The reference integration refuses to boot without
`WEBHOOK_SEEN_REDIS_URL` and `WEBHOOK_SEEN_REDIS_TOKEN` when `NODE_ENV=production`.
:::

A claim is not a database transaction. Your `process` callback should still be idempotent on its
own terms — claim protects against duplicate *deliveries*, not against a crash between crediting
and committing.

## `webhookEventSchema`

```ts
const webhookEventSchema = z.object({
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

type WebhookEvent = z.infer<typeof webhookEventSchema>;
```

Deliberately narrow: these are the fields the SDK's contract depends on. Extend it with
`.extend()` for PSP-specific fields you need, and keep the strictness.

`z` is re-exported (`import { z } from '@nanquim/server'`) so your route schemas share one zod
instance with the package.

## `idempotencyKey()`

```ts
import { idempotencyKey } from '@nanquim/server/verify';
```

`randomUUID()` from `node:crypto`. It is the *fallback* for a create route called without an
`idempotency-key` header — the normal path is the key the SDK generated in the browser. See
[Idempotency](/guide/backend#idempotency).
