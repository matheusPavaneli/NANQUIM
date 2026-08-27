# NANQUIM — embeddable Pix checkout SDK, provider-agnostic

A drop-in Pix payment surface that runs **on the merchant's own domain**, inside a Shadow DOM,
with zero runtime dependencies in the browser and zero requests beyond the merchant's own PSP.

The Brazilian market ships backend SDKs in 5–7 languages and stops at the browser. The fourth
exit — a component the developer mounts on their own page without writing 800 lines of QR,
copy-and-paste, countdown, polling, errors and accessibility — is what lives here.

```
packages/                 directory → published name
  checkout-core/          @nanquim/core        vanilla, zero runtime deps: state machine, transport, mount
  checkout-react/         @nanquim/react       thin wrapper: hook + component
  provider-abacatepay/    @nanquim/abacatepay  implements PaymentProvider (normalizes only; no networking)
  server/                 @nanquim/server      webhook HMAC verification, idempotency, schemas (Node)
examples/
  vanilla-cdn/            <script> + <div>: proof the core needs no bundler
  next-app-router/        the real path: a server route creates the session, the client mounts
design/                   the visual fixture and the geometric layout assertions
docs/                     the documentation site (VitePress), deployed to GitHub Pages
docs/statechart.md        the state graph
```

The project is **NANQUIM**; the packages publish under the `@nanquim/*` npm scope, so every
import below is copy-pasteable as written. Full documentation:
<https://matheuspavaneli.github.io/NANQUIM/>

## The whole integration

```ts
import { createCheckout, pix } from '@nanquim/core';

const checkout = createCheckout({
  provider: pix(),
  locale: 'pt-BR',
  charge: { amount: 12_990, currency: 'BRL' },

  createSession: ({ signal, idempotencyKey }) =>
    fetch('/api/checkout', { method: 'POST', signal, headers: { 'idempotency-key': idempotencyKey } })
      .then((r) => r.json()),

  getStatus: ({ signal, session }) =>
    fetch(`/api/checkout/${session.sessionId}/status`, { signal }).then((r) => r.json()),

  onPaymentIndicated: ({ sessionId }) => confirmOnServer(sessionId),
});

checkout.mount('#checkout');
checkout.start();
```

The merchant calls their OWN backend: no credential ever reaches the browser.
`onPaymentIndicated` is named so it cannot be mistaken for a confirmation — the truth is the
signed webhook.

React:

```tsx
import { PixCheckout } from '@nanquim/react';
import { pix } from '@nanquim/core';

<PixCheckout provider={pix()} createSession={createSession} getStatus={readStatus} />;
```

## The decisions that carry the product

| Decision | Where it lives |
| --- | --- |
| The browser is never the source of truth — there is no `onSuccess` | `src/types.ts`, `docs/statechart.md` |
| Secrets never in the bundle: the SDK takes functions, not credentials | `CheckoutOptions.createSession` |
| Isolation both ways: Shadow DOM + `--abc-*` custom properties | `src/checkout.ts`, `src/styles.ts` |
| Polling that does not burn the rate limit: backoff with jitter, pause on a hidden tab, hard stop at the deadline | `src/transport.ts` |
| Expiry measured with the local clock, so a skewed device is not shown a dead code | `src/provider.ts`, `src/state.ts` |
| A backend that drops `createdAt` is told, in development, instead of failing on a customer's clock | `CheckoutOptions.onDegraded` |
| The promised price is an invariant: a charge for another amount fails `amount_mismatch` | `src/checkout.ts` |
| Illegal states unrepresentable: discriminated union + a pure `transition()` | `src/state.ts` |
| Idempotency: a double click does not create two charges, and the key comes from a CSPRNG or not at all | `src/checkout.ts` |
| Our own QR (byte mode, EC M) instead of 30 kB of generic library | `src/qr/encode.ts` |
| The payment truth: constant-time HMAC + a replay window that cannot be off by accident | `packages/server/src/verify.ts` |
| Exactly-once crediting: claim the event id, process, keep the claim only on success | `packages/server/src/index.ts` |
| The status endpoint proves ownership before it answers, and the PSP payload is whitelisted | `examples/next-app-router/app/api/checkout/` |

## Two integration requirements

Both exist because the surface is a guest, and both are verified in `e2e/audit.spec.ts`.

**1. Reserve the container's height.** The SDK renders the skeleton synchronously on mount, but
the mount happens after the first paint. Without the reservation the merchant's page grows and
the CLS is the merchant's:

```css
#checkout { min-block-size: 620px; }
@media (min-width: 560px) { #checkout { min-block-size: 420px; } }
```

Measured: **0.0021 CLS with the reservation, 0.0193 without it**.

**2. Deliver the BR Code in `<noscript>`.** If JS is disabled or the SDK fails to load, there is
no SDK — the page still has to say how to pay, with the payload as selectable text. In an
integration where the charge is created on the server (see `examples/next-app-router`) the
payload is already there to be rendered.

## Budget, measured

`size-limit` is the gate; the numbers below come from the build, not from an estimate.

| Package | Measured (gz) | Limit |
| --- | ---: | ---: |
| `checkout-core` (ESM) | 12.14 kB | 12.5 kB |
| `checkout-core` (IIFE / CDN) | 12.24 kB | 12.5 kB |
| `provider-abacatepay` | 920 B | 3 kB |
| `checkout-react` | 585 B | 2 kB |

The core budget was 12 kB until the security pass that added the CSPRNG-only idempotency key, the
amount invariant, the skew-free deadline and the `refused` branch. Those cost 330 B gzipped and
the budget moved to 12.5 kB, deliberately: none of them is optional in a payment surface, and the
alternative was to keep a number and drop a guarantee.

Runtime dependencies in what reaches the browser: **zero**. Third-party requests: **zero**
beyond the merchant's own backend.

## Running

```bash
pnpm install
pnpm build          # tsdown → ESM + IIFE + .d.ts
pnpm test           # node:test — pure logic, always runs
pnpm size           # the byte gate
pnpm typecheck      # strict + noUncheckedIndexedAccess
pnpm e2e            # Playwright: the surface and the ship audit, on Chromium
node examples/vanilla-cdn/server.mjs   # http://localhost:4321
```

The vanilla example starts a fake merchant backend: it holds the "PSP key", creates the charge
with a BR Code that is valid in structure and checksum over a fictional key, and marks it paid
after 12 seconds (`PAYS_AFTER_MS=0` to leave it pending).

## Audit

`pnpm e2e` is the ship audit, and it prints its own numbers as `METRIC` lines: Core Web Vitals,
WCAG 2.2 AA via axe-core, geometry at 5 widths including 320 px and 200 % zoom, the state matrix
driven in the browser, and every promised fallback actually exercised. `pnpm design:layout`
asserts the fixture's geometry on its own, without a browser harness.

## What is out of the slice, on purpose

Cards (they pull in a cross-origin iframe and PCI scope — that is version 2 of the isolation
architecture), boleto, subscriptions, Vue/Svelte wrappers, simultaneous multi-provider, and
telemetry of any kind: a guest script on a payment page that phones home is disqualifying.
