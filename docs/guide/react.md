# React

`@nanquim/react` is 585 B: a hook and a component. It owns the handle's lifetime and nothing
else — every option is the core's.

## Component

```tsx
import { PixCheckout } from '@nanquim/react';
import { pix } from '@nanquim/core';

export function Checkout() {
  return (
    <PixCheckout
      className="checkout-slot"
      provider={pix()}
      charge={{ amount: 12_990, currency: 'BRL' }}
      createSession={({ signal, idempotencyKey }) =>
        fetch('/api/checkout', {
          method: 'POST',
          signal,
          headers: { 'idempotency-key': idempotencyKey },
        }).then((r) => r.json())
      }
      getStatus={({ signal, session }) =>
        fetch(`/api/checkout/${session.sessionId}/status`, { signal }).then((r) => r.json())
      }
      onPaymentIndicated={({ sessionId }) => router.push(`/order/${sessionId}`)}
    />
  );
}
```

The component renders a single `<div>` and mounts the core into it. Reserve its height in CSS —
see [Quickstart step 1](/guide/quickstart#_1-reserve-the-container-s-height).

## Hook

When you need the state — a custom header, a progress bar, an analytics hook on your own side:

```tsx
import { usePixCheckout } from '@nanquim/react';

const { state, checkout, containerRef } = usePixCheckout(options);

return (
  <>
    {state.status === 'awaiting' && <p>Waiting for payment…</p>}
    {state.status === 'paid' && <Receipt endToEndId={state.endToEndId} />}
    <div ref={containerRef} className="checkout-slot" />
  </>
);
```

`state` comes from `useSyncExternalStore`, so it is concurrent-safe and identical on server and
client renders (both read `checkout.getState()`).

## Lifecycle rules

- **`provider` identity is the remount key.** The handle is memoized on `options.provider`; pass a
  stable reference (`const provider = useMemo(() => pix(), [])` or a module constant) unless you
  actually want a new charge.
- **Callbacks are read through a ref.** `createSession`, `getStatus`, `onPaymentIndicated`,
  `onDegraded` and `onError` may be inline arrow functions — they are always called at their
  latest version and never cause a remount.
- **`start()` runs on mount, `destroy()` on unmount.** Unmounting aborts in-flight requests, stops
  the poller and removes the listeners. A remount creates a fresh handle.
- **Removing `getStatus` after mount** rejects with `getStatus was removed after mount` rather
  than silently going quiet.

## Server rendering

The component is a client component — it touches `document` on mount. In the App Router, mark the
file `'use client'` and create the session from a server route (see
[the backend contract](/guide/backend)). `examples/next-app-router` is the reference.

## Other frameworks

There is no Vue or Svelte wrapper yet. The core is framework-free: `mount`, `unmount`, `start`,
`subscribe`, `destroy` is the entire surface a wrapper needs, and this one is 60 lines. See
[`CheckoutHandle`](/reference/core#checkouthandle).
