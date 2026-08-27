---
layout: home

hero:
  name: NANQUIM
  text: Pix checkout you mount, not iframe
  tagline: A drop-in payment surface that runs on the merchant's own domain, inside a Shadow DOM, with zero runtime dependencies in the browser and zero requests beyond the merchant's own backend.
  actions:
    - theme: brand
      text: Quickstart
      link: /guide/quickstart
    - theme: alt
      text: API reference
      link: /reference/core
    - theme: alt
      text: Security model
      link: /architecture/security

features:
  - title: 12.14 kB, zero dependencies
    details: The whole surface — QR encoder, state machine, transport, styles, pt-BR and en copy — gzipped, with size-limit as a merge gate. Nothing third-party reaches the payer's browser.
  - title: No credential in the bundle
    details: The SDK takes functions, not API keys. createSession and getStatus call the merchant's own backend, which holds the PSP key and never exposes it.
  - title: No onSuccess, by design
    details: The browser cannot confirm a payment. The public event is onPaymentIndicated; the truth is the signed webhook, verified with constant-time HMAC and a replay window.
  - title: Isolated both ways
    details: Shadow DOM keeps the merchant's CSS out and the SDK's CSS in. Customization is a documented set of --abc-* custom properties, not a selector war.
  - title: Provider-agnostic
    details: A provider is three functions that normalize a payload. Swapping PSPs is swapping a 900 B package, not rewriting the surface.
  - title: Audited on every run
    details: Core Web Vitals, WCAG 2.2 AA via axe-core, geometry at 320 px and 200 % zoom, the full state matrix driven in a real browser, and every promised fallback exercised.
---

## The whole integration

```ts
import { createCheckout, pix } from '@nanquim/core';

const checkout = createCheckout({
  provider: pix(),
  locale: 'pt-BR',
  charge: { amount: 12_990, currency: 'BRL' },

  createSession: ({ signal, idempotencyKey }) =>
    fetch('/api/checkout', {
      method: 'POST',
      signal,
      headers: { 'idempotency-key': idempotencyKey },
    }).then((r) => r.json()),

  getStatus: ({ signal, session }) =>
    fetch(`/api/checkout/${session.sessionId}/status`, { signal }).then((r) => r.json()),

  onPaymentIndicated: ({ sessionId }) => confirmOnServer(sessionId),
});

checkout.mount('#checkout');
checkout.start();
```

Two lines of that snippet are the product's whole security posture: the SDK receives *functions*
that call the merchant's own backend, and the payment callback is named so it cannot be mistaken
for a confirmation.

## The packages

| Package | What it is | Budget (gz) |
| --- | --- | ---: |
| [`@nanquim/core`](/reference/core) | Vanilla surface: state machine, transport, QR, mount | 12.14 kB |
| [`@nanquim/react`](/reference/react) | Hook + component over the core | 585 B |
| [`@nanquim/abacatepay`](/reference/provider) | Normalizes one PSP's payloads. Does no networking | 920 B |
| [`@nanquim/server`](/reference/server) | Node: webhook HMAC, idempotency, schemas | server-side |

::: info NANQUIM is the project; `@nanquim/*` is the npm scope
The repository and this documentation site are **NANQUIM**. The published packages keep the
`@nanquim/*` scope, so every import in these pages is copy-pasteable as written.
:::

## Where to go next

- Integrating for the first time → [Quickstart](/guide/quickstart), then [the backend contract](/guide/backend).
- Deciding whether to adopt it → [Security model](/architecture/security) and [Budget & testing](/architecture/budget).
- Adding a PSP → [Provider contract](/reference/provider).
- Something is behaving oddly → [Errors](/reference/errors) and [the state graph](/statechart).
