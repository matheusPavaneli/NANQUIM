# Errors

Every failure the SDK raises is a `CheckoutError` with a stable `code`. Branch on the code, never
on the message — messages are copy and may change.

```ts
class CheckoutError extends Error {
  readonly name = 'CheckoutError';
  readonly code: CheckoutErrorCode;
  readonly providerCode: string | undefined;   // the PSP's own code, when there is one
  // `cause` is preserved whenever one exists
}
```

```ts
onError: (error) => {
  report(error.code, { providerCode: error.providerCode, cause: error.cause });
}
```

## The codes

### `session_create_failed`

`createSession` rejected, or resolved with something the provider could not read. The state
becomes `failed` and the surface offers a retry.

The original failure is on `error.cause` — a `TypeError` from `fetch` (network down), an
`AbortError` (the payer navigated), a thrown response error from your own code.

**Usually yours:** a `502` from your create route, a PSP timeout, a missing API key.

### `session_invalid`

The payload reached the provider but failed validation: a missing `sessionId`, a non-integer
amount, an unparseable `expiresAt`, or a BR Code whose CRC16 does not match.

**Always a contract break.** The SDK refuses to draw a payment code it could not fully validate —
a wrong checksum means a payer would scan something that no bank will accept.

### `status_unavailable`

A status read failed after `refresh()`, or `getStatus` was never provided while the poller needed
it. A failed read does **not** move the state to `failed`: `failures` increments, the state stays
`awaiting`, and after `degradeAfter` consecutive failures the surface says it *could not confirm*
— never that the payment failed.

**Usually transient.** Alert on the rate, not the event.

### `provider_refused`

The PSP took the charge away — refused at creation, or reported `CANCELLED` / `REFUNDED` on a
later read. This one *does* end the wait: leaving a payable code on screen for a cancelled charge
is worse than an error.

`providerCode` carries the PSP's own string.

### `amount_mismatch`

The created charge disagrees with the `charge` the page promised, in amount or in currency.

Raised only when you pass `charge` — and that is exactly why you should. The alternative is a
surface that silently draws a price nobody agreed to.

**Always a bug**, in your create route or in the PSP call it makes.

### `qr_unavailable`

The payload could not be encoded as a QR code. The copy-and-paste code still renders, and the
surface stays usable; `onDegraded({ reason: 'qr-encode' })` fires too.

**Rare.** Usually a BR Code longer than the encoder's capacity — check what your PSP returned.

### `unsupported_environment`

The SDK cannot run here:

- No cryptographic random source (`crypto.randomUUID` and `crypto.getRandomValues` both absent).
  The SDK throws rather than fall back to `Math.random()` for an idempotency key.
- `mount()` called with no `document`, with a selector matching nothing, or on a destroyed handle.

**Thrown, not reported.** It is a programming or environment error, not a payment outcome.

## What is *not* an error

| Situation | Where it surfaces | Why |
| --- | --- | --- |
| A status read failed once | `failures` on the state | A read that did not answer says nothing about the payment |
| The code expired | state `expired` | An outcome, not a fault |
| No `createdAt` in the session | `onDegraded('expiry-unanchored')` | Only the integrator can fix it; the payer has no action |
| No Shadow DOM in the engine | `onDegraded('no-shadow-dom')` | Everything works; only isolation is lost |
| A payment landed after the deadline | state `paid` | The SPI settles in seconds but confirmation can lag |

## Handling pattern

```ts
onError: (error) => {
  switch (error.code) {
    case 'amount_mismatch':
    case 'session_invalid':
      // contract break — page the on-call, this is not the payer's problem
      alertOncall(error);
      break;

    case 'provider_refused':
      // terminal for this charge; offer a different method
      showAlternativeMethods(error.providerCode);
      break;

    case 'session_create_failed':
    case 'status_unavailable':
      // transient; the surface already offers the retry
      metrics.increment(`checkout.${error.code}`);
      break;

    case 'qr_unavailable':
    case 'unsupported_environment':
      metrics.increment(`checkout.${error.code}`);
      break;
  }
};
```
