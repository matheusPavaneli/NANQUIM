# `@nanquim/react`

585 B gzipped. Peer dependencies: `@nanquim/core` and React 18 or newer. Everything a
`CheckoutOptions` accepts, this package accepts.

```ts
import { PixCheckout, usePixCheckout } from '@nanquim/react';
```

## `<PixCheckout />`

```ts
interface PixCheckoutProps extends CheckoutOptions {
  readonly className?: string;
}

function PixCheckout(props: PixCheckoutProps): ReactElement;
```

Renders a single `<div>` carrying `className`, and mounts the core into it. There is no other
DOM. Reserve the div's height in CSS — see
[Quickstart](/guide/quickstart#_1-reserve-the-container-s-height).

## `usePixCheckout(options)`

```ts
interface UsePixCheckout {
  readonly state: CheckoutState;
  readonly checkout: CheckoutHandle;
  readonly containerRef: (node: HTMLElement | null) => void;
}

function usePixCheckout(options: CheckoutOptions): UsePixCheckout;
```

- **`state`** — read through `useSyncExternalStore`, so it is concurrent-safe and returns the same
  snapshot on the server and the client.
- **`checkout`** — the full [`CheckoutHandle`](/reference/core#checkouthandle), for
  `refresh()` on a button of your own or `start()` after a form step.
- **`containerRef`** — a callback ref. Attach it to any element; passing `null` unmounts.

## Lifecycle

| Event | What happens |
| --- | --- |
| First render | The handle is created (`useMemo`), keyed on `options.provider` |
| Ref attached | `checkout.mount(node)` |
| Effect run | `checkout.start()` |
| Ref detached | `checkout.unmount()` |
| Unmount | `checkout.destroy()`, then a fresh handle on the next mount |

### `provider` identity is the remount key

```ts
// stable — one charge
const provider = useMemo(() => pix(), []);

// unstable — a new handle, and a new charge, on every render
<PixCheckout provider={pix()} … />
```

Use a module constant or a memo. This is the only prop whose identity matters.

### Callbacks may be inline

`createSession`, `getStatus`, `onPaymentIndicated`, `onDegraded` and `onError` are read through a
ref at call time, so an inline arrow function is fine and never causes a remount. The value called
is always the latest render's.

One consequence worth knowing: removing `getStatus` after mount does not stop the poller, it makes
the read reject with `getStatus was removed after mount`. Keep the prop stable in shape.

## Server rendering

The component touches `document` on mount, so it is a client component. In the Next.js App Router:

```tsx
'use client';

import { PixCheckout } from '@nanquim/react';
```

Create the session from a server route — `examples/next-app-router` is the reference
implementation, including the signed grant cookie on the status endpoint.

## Re-exports

`CheckoutHandle`, `CheckoutOptions` and `CheckoutState` are re-exported from the core, so a
typical integration imports types from one place.
