# `@nanquim/core`

Zero runtime dependencies. ESM plus an IIFE build for CDN use. Everything below is exported from
the package root unless noted.

```ts
import { createCheckout, pix } from '@nanquim/core';
```

## `createCheckout(options)`

Creates a checkout handle. Does not touch the DOM until you call `mount`, and does not make a
request until you call `start`.

```ts
function createCheckout(options: CheckoutOptions): CheckoutHandle;
```

### `CheckoutOptions`

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `provider` | `PaymentProvider` | — | **required.** [Contract](/reference/provider) |
| `createSession` | `(ctx: RequestContext) => Promise<unknown>` | — | **required.** Calls *your* backend |
| `getStatus` | `(ctx: StatusContext) => Promise<unknown>` | — | Omit only if the provider implements `subscribe` |
| `locale` | `'pt-BR'` or `'en'` | `'pt-BR'` | `Intl` formatting only — see [Localization](/guide/i18n#what-locale-actually-does) |
| `messages` | `MessageCatalog` | `ptBR` | Complete catalog; replaces, does not merge |
| `charge` | `{ amount: number; currency: string }` | — | Turns the promised price into an invariant |
| `pollInterval` | `number` (ms) | `3000` | Backoff ceiling is `max(pollInterval, 30_000)` |
| `degradeAfter` | `number` | `3` | Consecutive failed reads before the surface says "could not confirm" |
| `onPaymentIndicated` | `(e) => void` | — | A hint. **Not** a confirmation |
| `onDegraded` | `(e) => void` | — | Four reasons, all yours to fix |
| `onError` | `(error: CheckoutError) => void` | — | [Error codes](/reference/errors) |
| `onStateChange` | `(state: CheckoutState) => void` | — | Same stream as `subscribe` |

### `RequestContext` / `StatusContext`

```ts
interface RequestContext {
  readonly signal: AbortSignal;      // pass to fetch; aborted on restart/unmount
  readonly idempotencyKey: string;   // CSPRNG; reused across a retry after failure
}

interface StatusContext extends RequestContext {
  readonly session: Session;
}
```

### `onDegraded` reasons

| Reason | Meaning | What to do |
| --- | --- | --- |
| `expiry-unanchored` | The session had no `createdAt`, so the countdown uses the absolute `expiresAt` and a skewed device clock can misread it | Send `createdAt` |
| `status-unavailable` | No `getStatus` and no `provider.subscribe` — nothing will ever update the surface | Wire one of them |
| `no-shadow-dom` | The engine has no `attachShadow`; styles are no longer isolated | Accept, or block the browser |
| `qr-encode` | The payload could not be encoded as a QR; the copy-and-paste code still renders | Check the BR Code length |

## `CheckoutHandle`

```ts
interface CheckoutHandle {
  mount(target: Element | string): void;
  unmount(): void;
  start(): Promise<void>;
  refresh(): Promise<void>;
  getState(): CheckoutState;
  subscribe(listener: (state: CheckoutState) => void): () => void;
  destroy(): void;
}
```

- **`mount`** — accepts an element or a selector. Attaches a shadow root, adopts the stylesheet,
  renders the skeleton synchronously. Throws `unsupported_environment` with no `document`, with a
  selector that matches nothing, or on a destroyed handle. Mounting the same element twice is a
  no-op; mounting a different one unmounts first.
- **`start`** — creates the charge. A no-op while a create is in flight, or when the state is
  already `awaiting` or `paid` — a stray call must not throw away a live code or reopen a paid
  charge. From `expired` or `failed` it starts a new attempt.
- **`refresh`** — one immediate status read, with a 10 s timeout. Only acts in `awaiting`.
- **`subscribe`** — returns an unsubscribe function. Fires on every state *change*, not on
  re-renders.
- **`destroy`** — aborts in-flight requests, stops the poller, removes the document listeners,
  unmounts. The handle cannot be reused afterwards.

## `CheckoutState`

A discriminated union — illegal states are unrepresentable, and `session` only exists where a
session exists.

```ts
type CheckoutState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'awaiting'; session: Session; deadline: number;
      lastCheckedAt: number | null; failures: number; checking: boolean }
  | { status: 'expired'; session: Session; deadline: number; expiredAt: number }
  | { status: 'paid'; session: Session; paidAt: number; endToEndId?: string }
  | { status: 'failed'; error: CheckoutError };
```

Transitions are in [the state graph](/statechart).

## `Session` and `StatusReport`

```ts
interface Session {
  readonly sessionId: string;
  readonly brCode: string;          // EMV payload; checksum validated on normalize
  readonly brCodeBase64?: string;   // used only if the SDK's own encoder fails
  readonly amount: number;          // integer, minor units
  readonly currency: string;
  readonly expiresAt: number;       // epoch ms
  readonly expiresInMs?: number;    // duration — present when the PSP sent createdAt
  readonly status: PaymentStatus;   // 'pending' | 'paid' | 'expired' | 'refused'
}

interface StatusReport {
  readonly status: PaymentStatus;
  readonly endToEndId?: string;
  readonly paidAt?: number;
  readonly providerCode?: string;
}
```

## Providers

```ts
function pix(): PaymentProvider;                    // canonical shape, no PSP assumptions
function normalizeCanonicalSession(raw: unknown): Session;
function normalizeCanonicalStatus(raw: unknown): StatusReport;
function toPaymentStatus(value: unknown, fallback?: PaymentStatus): PaymentStatus;
```

`pix()` expects the [canonical session payload](/guide/backend#the-session-payload). For a PSP
whose shape differs, write a provider — see [the provider contract](/reference/provider).

## BR Code utilities

```ts
function isValidBrCode(payload: string): boolean;   // structure + CRC16
function parseBrCode(payload: string): BrCodeFields;
function crc16(input: string): number;
```

Useful on the server too: validate before you hand a payload to a customer.

## QR encoder

```ts
function encode(payload: string): QrCode;           // byte mode, EC level M
function toSvgPath(code: QrCode): { d: string; extent: number };
```

Roughly 3 kB of the budget, against ~30 kB for a general-purpose library that also does kanji
mode and PNG output.

## Lower-level exports

For wrapper authors and tests. Not on the CDN global.

```ts
// pure state machine
const initialState: CheckoutState;
function transition(state: CheckoutState, event: CheckoutEvent): CheckoutState;
function isPollable(state: CheckoutState): boolean;
function isDegraded(state: CheckoutState, threshold: number): boolean;

// state -> view model, no DOM involved
function present(state: CheckoutState, options: PresentOptions): ViewModel;

// transport primitives
function backoff(attempt: number, options: BackoffOptions, random?: () => number): number;
function createPoller(options: PollerOptions): Poller;

// formatting and copy
function money(minorUnits: number, currency: string, locale: Locale): string;
function clock(epochMs: number, locale: Locale): string;
function remaining(deadline: number, now: number, issuedAt?: number): Remaining;
function minutesSince(from: number, to: number): number;
function messagesFor(locale?: Locale, override?: Messages): Messages;

// the stylesheet, as a string
const styles: string;
```

`present` is the seam that makes the surface testable without a browser: it maps a state to a
`ViewModel` of labels, tones and controls, and `view.ts` does nothing but apply it to the DOM.

## Subpath exports

| Specifier | Contents |
| --- | --- |
| `@nanquim/core` | Everything above |
| `@nanquim/core/locales/en` | The English `Messages` catalog (default and named export) |
| `@nanquim/core/styles` | `styles` alone, for a custom renderer |
