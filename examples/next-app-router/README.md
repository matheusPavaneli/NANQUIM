# examples/next-app-router

The real integration path: from `pnpm install` to the first Pix paid in sandbox, in under 25
lines of merchant code.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

The PSP key lives in `.env.local`, on the server, and nowhere else.

- `app/api/checkout/route.ts` — creates the charge at the PSP with the server key and passes
  through the `Idempotency-Key` the SDK generated.
- `app/api/checkout/[id]/status/route.ts` — the read the SDK performs with backoff.
- `app/api/webhooks/abacatepay/route.ts` — **where "paid" becomes true**: constant-time HMAC, a
  replay window, and an event processed exactly once.
- `app/checkout.tsx` — the entire client: one component and two calls to the routes above.
