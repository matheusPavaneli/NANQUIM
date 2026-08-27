# CDN / no bundler

The core ships an IIFE build (12.24 kB gz) that needs no bundler, no module loader and no build
step. This exists as proof that the core has no framework in it — and as the fastest path for a
merchant on a template store or a legacy stack.

```html
<div id="checkout"></div>
<script src="https://unpkg.com/@nanquim/core/dist/nanquim.global.js"></script>
<script>
  const checkout = Nanquim.createCheckout({
    provider: Nanquim.pix(),
    locale: 'pt-BR',
    charge: { amount: 12990, currency: 'BRL' },
    createSession: ({ signal, idempotencyKey }) =>
      fetch('/api/checkout', {
        method: 'POST',
        signal,
        headers: { 'idempotency-key': idempotencyKey },
      }).then((r) => r.json()),
    getStatus: ({ signal, session }) =>
      fetch('/api/checkout/' + session.sessionId + '/status', { signal }).then((r) => r.json()),
  });

  checkout.mount('#checkout');
  checkout.start();
</script>
```

The IIFE build exposes `window.Nanquim` with exactly what an integration needs:
`createCheckout`, `pix`, `isValidBrCode` and `parseBrCode`. The rest of the ESM surface — the
state machine, the presenter, the transport primitives — is deliberately not on the global; it is
there for wrapper authors, who have a bundler.

## Pin the version

`unpkg.com/@nanquim/core` resolves to the latest release. On a payment page, pin it:

```html
<script src="https://unpkg.com/@nanquim/core@0.1.0/dist/nanquim.global.js"></script>
```

Better still, serve the file from your own origin — it is one file, it has no dependencies, and
then your CSP does not need a third-party script source at all.

## Content Security Policy

The SDK needs:

- `script-src` for wherever you serve the bundle (`'self'` if you host it).
- `connect-src` for your own backend only. It makes no other request.
- `img-src data:` **only** if your backend sends `brCodeBase64`. When the SDK draws its own QR it
  emits inline SVG paths, which need nothing.
- `style-src` only if your CSP forbids inline styles *and* the browser lacks
  `adoptedStyleSheets`. The SDK adopts a constructed stylesheet where it can and falls back to a
  `<style>` element inside the shadow root otherwise.

## The examples server

`examples/vanilla-cdn/server.mjs` runs a fake merchant backend on `http://localhost:4321`, so the
whole flow — create, poll, expire, pay — can be exercised without a PSP account.
