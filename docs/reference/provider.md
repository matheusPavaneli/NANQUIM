# Provider contract

A provider is the seam between a PSP's payload shape and the SDK's canonical types. It is the
cheapest expansion axis in the product: ~900 B, three members, no networking.

```ts
interface PaymentProvider {
  readonly id: string;
  normalizeSession(raw: unknown): Session;
  normalizeStatus(raw: unknown): StatusReport;
  subscribe?(session: Session, onReport: (report: StatusReport) => void): () => void;
}
```

## The one rule

**A provider does no I/O.** It never opens a connection, never holds a credential, never knows a
URL. It receives whatever your `createSession` resolved with and returns a validated `Session`.
The merchant's backend does the networking; the provider does the shape.

This is why swapping PSPs does not touch the surface, and why a provider is safe to run in the
browser at all.

## `normalizeSession`

Turn `unknown` into a `Session`, or throw a `CheckoutError`. Validate everything — this payload
came over the network and is about to be drawn as a payable code.

```ts
import { CheckoutError, isValidBrCode, type Session } from '@nanquim/core';

export function normalizeSession(raw: unknown): Session {
  const data = unwrap(raw);

  const brCode = requireString(data.brCode, 'brCode');
  if (!isValidBrCode(brCode)) {
    throw new CheckoutError('session_invalid', 'the BR Code checksum does not match');
  }

  const amount = data.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new CheckoutError('session_invalid', 'no integer amount');
  }

  const expiresAt = instant(data.expiresAt, 'expiresAt');
  const createdAt = optionalInstant(data.createdAt);

  return {
    sessionId: requireString(data.id, 'id'),
    brCode,
    amount,
    currency: 'BRL',
    expiresAt,
    // the duration, when the PSP told us when the charge was born
    ...(createdAt !== undefined && expiresAt > createdAt
      ? { expiresInMs: expiresAt - createdAt }
      : {}),
    status: mapStatus(data.status),
  };
}
```

### `expiresInMs` is the whole clock-skew defence

If the PSP sends a creation timestamp, compute the *duration* and put it in `expiresInMs`. The
SDK then counts down from the moment the response arrived, which is immune to a device clock that
is twenty minutes off. Omit it and the SDK falls back to the absolute `expiresAt` and reports
`onDegraded({ reason: 'expiry-unanchored' })`.

Never emit `expiresInMs` when `createdAt >= expiresAt` — a negative or zero window would render a
dead code.

## `normalizeStatus`

```ts
export function normalizeStatus(raw: unknown): StatusReport {
  const data = unwrap(raw);
  return {
    status: mapStatus(data.status),
    ...(typeof data.endToEndId === 'string' ? { endToEndId: data.endToEndId } : {}),
    ...(data.paidAt === undefined ? {} : { paidAt: instant(data.paidAt, 'paidAt') }),
  };
}
```

### Mapping statuses

Four canonical values, and the mapping is a policy decision, not a lookup:

| Canonical | Meaning | Typical PSP values |
| --- | --- | --- |
| `pending` | Still payable | `PENDING`, `WAITING`, `CREATED` |
| `paid` | The PSP says it settled | `PAID`, `APPROVED`, `COMPLETED` |
| `expired` | The window closed | `EXPIRED` |
| `refused` | The charge was taken away | `CANCELLED`, `REFUNDED`, `CHARGEBACK` |

Default to `pending` for anything unrecognised. An unknown status must never resolve to `paid`,
and must never resolve to `expired` — both remove a payable code from the payer's screen.

`toPaymentStatus(value, fallback)` from the core does exactly this for lowercase canonical values.

## Envelopes and provider errors

Most PSPs wrap their payload. Unwrap it, and turn a provider-level error into a
`provider_refused` that carries the PSP's own code:

```ts
if (envelope.error != null) {
  throw new CheckoutError('provider_refused', 'AbacatePay refused the charge', {
    providerCode: typeof envelope.error === 'string' ? envelope.error : 'PROVIDER_ERROR',
  });
}
```

`providerCode` reaches your `onError` handler, so your logs keep the PSP's vocabulary while the
surface keeps ours.

## `subscribe`

Optional. Implement it when the PSP can push — a WebSocket your backend proxies, an SSE stream, a
BroadcastChannel fed by a service worker.

```ts
subscribe(session, onReport) {
  const source = new EventSource(`/api/checkout/${session.sessionId}/stream`);
  source.addEventListener('status', (e) =>
    onReport(normalizeStatus(JSON.parse(e.data))),
  );
  return () => source.close();
}
```

The return value must tear the subscription down; the SDK calls it on every exit from `awaiting`
and on `destroy`.

With `subscribe` present *and* `getStatus` provided, both run: push is the fast path, polling is
the backstop. With `subscribe` present and `getStatus` omitted, no polling happens at all — and
no `status-unavailable` degradation is reported.

## The built-in providers

| Provider | Package | Expects |
| --- | --- | --- |
| `pix()` | `@nanquim/core` | The [canonical payload](/guide/backend#the-session-payload). Use it when your backend already normalizes |
| `abacatePay()` | `@nanquim/abacatepay` | AbacatePay's `{ data, error }` envelope, `brCode`/`brCodeBase64`, uppercase statuses |

```ts
import { abacatePay } from '@nanquim/abacatepay';

createCheckout({ provider: abacatePay(), /* … */ });
```

The package also exports `normalizeSession` and `normalizeStatus` directly, so the same
normalization can run on your server against the raw PSP response.

## AbacatePay, as its own API documents it

Everything in this section was checked against [AbacatePay's API
reference](https://docs.abacatepay.com/api-reference/criar-qrcode-pix). The SDK never calls these
endpoints — your backend does — but the provider's normalization is written against exactly these
shapes.

### Creating the charge

`POST https://api.abacatepay.com/v1/pixQrCode/create`, with `Authorization: Bearer <api-key>`.

| Body field | Type | Required | Note |
| --- | --- | --- | --- |
| `amount` | number | yes | **in cents** |
| `expiresIn` | number | no | seconds |
| `description` | string | no | max 37 chars, shown in the payer's bank app |
| `customer` | object | no | `name`, `cellphone`, `email`, `taxId` — all four, or none |
| `metadata` | object | no | free-form |

The response is the `{ data, error }` envelope. Inside `data`: `id`, `amount`, `status`, `devMode`,
`brCode`, `brCodeBase64`, `platformFee`, `createdAt`, `updatedAt`, `expiresAt` (ISO 8601).

### Polling the charge

`GET https://api.abacatepay.com/v1/pixQrCode/check?id=<id>`, same bearer header, same envelope,
returning at least `status` and `expiresAt`.

::: warning `endToEndId` and `paidAt` are not documented on this endpoint
`normalizeStatus` reads both when present and omits them when absent, so nothing breaks either
way — but do not build a receipt that assumes the polling response carries them. The webhook is
where settlement detail belongs.
:::

### The status enum

`PENDING`, `EXPIRED`, `CANCELLED`, `PAID`, `REFUNDED` — the five the provider documents, and the
five the mapping covers:

| AbacatePay | SDK `PaymentStatus` |
| --- | --- |
| `PENDING` | `pending` |
| `PAID` | `paid` |
| `EXPIRED` | `expired` |
| `CANCELLED` | `refused` |
| `REFUNDED` | `refused` |

Anything else falls back to `pending` rather than throwing: an unknown status is a reason to keep
waiting on the webhook, not a reason to break the payer's screen.

### `expiresInMs` is derived, not sent

AbacatePay returns the absolute `expiresAt`, and `expiresIn` is a *request* field. When `createdAt`
is present and later than `expiresAt` would allow, `normalizeSession` derives
`expiresInMs = expiresAt - createdAt` so the countdown can be drawn without trusting the device
clock. When `createdAt` is absent, the field is simply omitted. See
[the unanchored-expiry signal](/architecture/security#the-clock).

### The webhook is a different scheme — read this before wiring it

AbacatePay authenticates webhooks its own way, and it is **not** the scheme
[`verifyWebhook`](/reference/server#verifywebhook-options) implements by default:

| | AbacatePay | `@nanquim/server` default |
| --- | --- | --- |
| Shared secret | `?webhookSecret=…` on the URL you register | `secret` option |
| Signature | `X-Webhook-Signature`, HMAC-SHA256 over the **raw body**, **base64** | hex, optionally over `timestamp.body` |
| Timestamp | none documented | required unless `requireTimestamp: false` |
| Envelope | `{ id, event, apiVersion, devMode, data }`, events like `checkout.completed` | `{ id, event, data }` per `webhookEventSchema` |

So bridge the two explicitly — compare the query secret yourself, convert the digest, and turn the
timestamp requirement off:

```ts
import { timingSafeEqual } from 'node:crypto';
import { handleWebhook } from '@nanquim/server';

const url = new URL(request.url);
const sent = Buffer.from(url.searchParams.get('webhookSecret') ?? '');
const want = Buffer.from(process.env.ABACATEPAY_WEBHOOK_SECRET!);
if (sent.length !== want.length || !timingSafeEqual(sent, want)) {
  return new Response(null, { status: 401 });
}

const base64 = request.headers.get('x-webhook-signature') ?? '';

const result = await handleWebhook({
  rawBody: await request.text(),           // the exact bytes, never a re-serialized object
  signature: Buffer.from(base64, 'base64').toString('hex'),
  requireTimestamp: false,                 // AbacatePay documents no timestamp header
  secret: process.env.ABACATEPAY_WEBHOOK_SIGNING_KEY!,
  store: seen,
  process: async (event) => { /* … */ },
});
```

::: danger Confirm the signing key before you rely on the signature
AbacatePay's own sample verifies with an account-level key it labels a *public* key, and the
documented payload carries `apiVersion: 2` with event names (`checkout.completed`) that differ from
the shape `webhookEventSchema` validates. Read
[AbacatePay's webhook page](https://docs.abacatepay.com/pages/webhooks) against your own account
before shipping, and treat the query-parameter secret as the check you must not skip.
:::

## Checklist for a new provider

- [ ] No `fetch`, no credentials, no URLs in the package.
- [ ] `isValidBrCode` on the payload before returning a `Session`.
- [ ] `amount` asserted as a non-negative integer in minor units.
- [ ] `expiresInMs` emitted whenever a creation timestamp exists, and only when positive.
- [ ] Unknown statuses fall back to `pending`.
- [ ] Provider errors become `provider_refused` with a `providerCode`.
- [ ] Tests against real captured payloads, including a malformed one per field.
- [ ] `size-limit` entry in the package manifest — 3 kB is the standing budget.
