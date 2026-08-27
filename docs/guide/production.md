# Production checklist

Everything here is verifiable before launch. Items marked **required** are the ones whose absence
produces a silent failure — a shifted layout, a leaked charge, a double credit.

## Frontend

- [ ] **required** Container height reserved in CSS at every breakpoint you support.
      ([why](/guide/quickstart#_1-reserve-the-container-s-height))
- [ ] **required** `<noscript>` fallback rendering the BR Code as selectable text.
- [ ] `charge` passed to `createCheckout`, so a mismatched amount fails loudly.
- [ ] `onError` wired to your error reporter, keyed on `error.code`.
- [ ] `onDegraded` wired to a log you actually read — all four reasons mean *you* have work to do.
- [ ] Core bundle pinned to a version, or self-hosted.
- [ ] CSP allows only your own origin in `connect-src`.

## Backend

- [ ] **required** PSP key read from the environment on the server. Never shipped to the client.
- [ ] **required** `idempotency-key` header from `createSession` forwarded to the PSP, or used as
      the key of your own charge table. ([why](/guide/backend#idempotency))
- [ ] **required** Status endpoint proves the caller owns the session, and answers `404` — not
      `403` — when it does not.
- [ ] **required** PSP payloads whitelisted through a schema before reaching the browser.
- [ ] `createdAt` present in the session payload, so expiry survives a skewed device clock.
- [ ] `cache-control: no-store` on both routes.
- [ ] Outbound PSP calls wrapped in `AbortSignal.timeout()`.

## Webhook

- [ ] **required** Signature verified with `verifyWebhook` / `handleWebhook` before any parsing.
- [ ] **required** Timestamp header passed through. Leave `requireTimestamp` at its default;
      only set it to `false` for a PSP that provably does not send one.
- [ ] **required** A `SeenStore` that survives a cold start and is shared across instances —
      Redis, Postgres, anything durable. `createMemorySeenStore` is for tests and single-process
      development only, and the reference implementation refuses to boot with it in production.
- [ ] The `process` callback is idempotent on its own terms anyway. A claim is not a transaction.
- [ ] `500` returned on handler failure, so the PSP retries. Never swallow into `200`.
- [ ] Webhook secret rotated through an env var, not a constant.

## Operations

- [ ] `pollInterval` sized against your PSP's rate limit, not left at 3 s by default if that is
      too fast for your plan.
- [ ] Alert on `session_create_failed` rate, not on individual errors.
- [ ] Alert on webhook `400`s — a sustained rate means a secret mismatch or a forged sender.
- [ ] Dashboard for `duplicate: true` results; a rising rate means retries, not fraud, but a
      *flat zero* usually means the store is not working.

## Accessibility & performance

- [ ] `pnpm e2e` green on the integrated page, not just on the fixture.
- [ ] CLS measured on the real checkout page under a throttled connection.
- [ ] Keyboard-only run through the flow: create, copy, wait, expire, retry.
- [ ] 200 % browser zoom and a 320 px viewport both usable.

## Things that are not on this list on purpose

Telemetry endpoints, analytics beacons, session replay, and any third-party script on the
checkout page. The SDK makes zero third-party requests; adding one back is the merchant's
decision and the merchant's risk.
