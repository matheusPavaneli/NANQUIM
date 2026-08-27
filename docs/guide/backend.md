# The backend contract

The SDK is a client of *your* server. Everything on this page is work you own; none of it can be
moved into the browser without giving up the guarantee it exists to provide.

## The three endpoints

| Endpoint | Called by | Must |
| --- | --- | --- |
| `POST /api/checkout` | `createSession` | Hold the PSP key, honour `idempotency-key`, return a canonical session |
| `GET /api/checkout/:id/status` | `getStatus` | Prove the caller owns the session, whitelist the payload |
| `POST /api/webhooks/:psp` | the PSP | Verify HMAC, claim the event id, credit exactly once |

## The session payload

`createSession` may return anything your provider can normalize. With the built-in
[`pix()`](/reference/core#pix) provider, the canonical shape is:

```ts
{
  sessionId: string;      // required, non-empty
  brCode: string;         // required, EMV payload — checksum is validated
  brCodeBase64?: string;  // optional pre-rendered image; the SDK draws its own QR if absent
  amount: number;         // required, integer, minor units (12_990 = R$ 129,90)
  currency: string;       // required, e.g. 'BRL'
  expiresAt: number | string;  // required, epoch ms or anything Date.parse understands
  createdAt?: number | string; // STRONGLY recommended — see below
  status: 'pending' | 'paid' | 'expired' | 'refused';
}
```

Anything that fails those checks raises
[`session_invalid`](/reference/errors#session-invalid) — the surface refuses to draw a payment
code it could not fully validate.

### Always send `createdAt`

The SDK measures expiry with the **local clock**. When `createdAt` is present it keeps the
*duration* (`expiresAt − createdAt`) and counts down from the instant the response arrived, so a
device whose clock is twenty minutes off still sees the real remaining time.

Without `createdAt` there is no trustworthy duration, the absolute `expiresAt` stands, and the
SDK reports it once:

```ts
onDegraded: ({ reason }) => {
  if (reason === 'expiry-unanchored') {
    // your backend dropped createdAt — a skewed device may see a dead code
  }
}
```

Only the integrator can fix this, and the payer has no action to take, so it is surfaced to you
rather than to the screen.

## Idempotency

`createSession` receives `idempotencyKey`, generated **in the browser** by the SDK:

- Source is `crypto.randomUUID()`, falling back to `crypto.getRandomValues()` assembled into a
  v4 UUID. With neither, the SDK throws
  [`unsupported_environment`](/reference/errors#unsupported-environment) — it never degrades to
  `Math.random()`.
- A fresh key is minted per attempt, **except** when the previous attempt ended in `failed`. A
  retry after an error reuses the same key, because that is precisely the case where the charge
  may already exist.

The SDK does not deduplicate anything. Your route must either forward the key to a PSP that
honours it, or key its own charge table on it. The reference route does the former:

```ts
'idempotency-key': request.headers.get('idempotency-key') ?? idempotencyKey(),
```

The fallback exists so a direct curl still works; it is not the normal path.

## The status endpoint must prove ownership

A session id is a bearer of information about a payment. Answering `GET /status/:id` for anyone
who can guess an id leaks charge state.

The reference integration issues a signed grant cookie when the session is created and checks it
before answering:

```ts
// grant.ts — HMAC over the session id, compared in constant time
export const grantCookie = (id: string, maxAgeSeconds: number): string =>
  [
    `abc_grant=${issueGrant(id)}`,
    'Path=/api/checkout',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');

// status route
if (!grantAllows(readGrant(request), id)) {
  return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
}
```

`404`, not `403`: a wrong grant must not confirm that the id exists.

## Whitelist the PSP payload

Never forward a provider response as-is. The reference status route parses it with zod and
returns only the fields the client needs:

```ts
const parsed = providerStatusSchema.safeParse(unwrapProvider(await response.json()));
if (!parsed.success) return Response.json({ error: 'STATUS_UNAVAILABLE' }, { status: 502 });
return Response.json(parsed.data, { headers: { 'cache-control': 'no-store' } });
```

## Timeouts and cancellation

Both callbacks receive an `AbortSignal`. Pass it through to `fetch` — the SDK aborts a status
read after 10 s, and aborts an in-flight create when the payer restarts. On your side, wrap the
outbound PSP call in `AbortSignal.timeout(10_000)` so a hanging PSP does not hold a connection.

## Polling budget

Defaults: 3 s interval, exponential backoff (factor 1.8) with 30 % jitter up to 30 s after
failures, paused while the tab is hidden or the browser is offline, resumed on return, and
stopped hard at the deadline. Raise `pollInterval` if your rate limit is tighter; the SDK never
polls faster than you configure.

If your PSP supports push, implement
[`PaymentProvider.subscribe`](/reference/provider#subscribe) and the polling loop becomes a
backstop rather than the mechanism.
