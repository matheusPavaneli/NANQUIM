# examples/next-app-router

The real integration path: from `pnpm install` to the first Pix paid in sandbox, in under 25
lines of merchant code.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

The PSP key lives in `.env.local`, on the server, and nowhere else.

- `app/api/checkout/route.ts` — creates the charge at the PSP with the server key, passes through
  the `Idempotency-Key` the SDK generated, refuses a charge whose amount is not the one this route
  asked for, and answers with the whitelisted fields only.
- `app/api/checkout/[id]/status/route.ts` — the read the SDK performs with backoff. It answers
  `404` unless the caller carries the grant cookie for that exact charge, so a charge id is not a
  bearer token for anyone who guesses it.
- `app/api/checkout/grant.ts` — the ownership proof: an HMAC over the charge id, in an `HttpOnly`
  cookie. Stateless, so it works on the first request after a cold start.
- `app/api/webhooks/abacatepay/route.ts` — **where "paid" becomes true**: constant-time HMAC, a
  replay window, and an event credited exactly once.
- `app/api/webhooks/abacatepay/seen-store.ts` — the idempotency store. In development it is the
  in-memory one; in production it requires a Redis REST endpoint, because a `Set` in a serverless
  process dies on a cold start and is not shared between instances, which makes it useless as an
  idempotency guard.
- `app/checkout.tsx` — the entire client: one component and two calls to the routes above.

## Environment

| Variable | Why |
| --- | --- |
| `ABACATEPAY_API_KEY` | Server-side PSP credential. Never reaches the browser. |
| `ABACATEPAY_WEBHOOK_SECRET` | Verifies the webhook signature. |
| `CHECKOUT_GRANT_SECRET` | Signs the ownership cookie. 32 characters or more. |
| `WEBHOOK_SEEN_REDIS_URL` | Idempotency store. Required in production. |
| `WEBHOOK_SEEN_REDIS_TOKEN` | Bearer token for the store above. |
