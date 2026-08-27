# Budget & testing

A payment surface is a guest on someone else's page. Its size is not a vanity metric — it is
latency on the page where a purchase either completes or does not.

## The measured budget

`size-limit` is a merge gate, not a report. These numbers come from the build.

| Package | Measured (gz) | Limit |
| --- | ---: | ---: |
| `checkout-core` (ESM) | 12.14 kB | 12.5 kB |
| `checkout-core` (IIFE / CDN) | 12.24 kB | 12.5 kB |
| `provider-abacatepay` | 920 B | 3 kB |
| `checkout-react` | 585 B | 2 kB |

Runtime dependencies reaching the browser: **zero**. Third-party requests: **zero**.

### Where the budget moved, and why

The core budget was 12 kB until the security pass. The CSPRNG-only idempotency key, the amount
invariant, the skew-free deadline and the `refused` branch cost 330 B gzipped, and the limit moved
to 12.5 kB deliberately. None of them is optional in a payment surface, and the alternative was to
keep a number and drop a guarantee.

### What was refused on budget

| Rejected | Cost | What replaced it |
| --- | --- | --- |
| A general QR library | ~30 kB | Own encoder: byte mode, EC M, ~3 kB |
| XState | ~15 kB | A pure `transition()` of ~60 lines, plus [the state graph](/statechart) as documentation |
| A CSS-in-JS runtime | ~10 kB | One template literal, minified at build, adopted as a constructed stylesheet |
| A date library | ~6 kB | `Intl` and arithmetic on epoch milliseconds |

The pattern: every dependency that was rejected had its *documentation value* replaced explicitly,
not dropped.

## The test layers

```
node:test         pure logic — state machine, QR, BR Code, format, verify, providers
                  no DOM, no network, always runs

Playwright        the surface: mount, copy, countdown, retry, expiry
(e2e/surface)     real browser, real Shadow DOM

Playwright        the ship audit: budgets, not behaviours
(e2e/audit)       Core Web Vitals, axe-core, geometry, state matrix, fallbacks

design/           geometric assertions on the static fixture, no browser harness
check-layout.mjs
```

```bash
pnpm test           # node:test — pure logic, always runs
pnpm typecheck      # strict + noUncheckedIndexedAccess, four projects
pnpm size           # the byte gate
pnpm e2e            # Playwright: surface + ship audit, Chromium
pnpm lint           # biome
pnpm design:layout  # fixture geometry, no browser
```

## The ship audit

`pnpm e2e` prints its own numbers as `METRIC` lines, so a regression is visible in a CI log
without opening a report:

- **Core Web Vitals** on the integrated page — CLS measured with and without the container
  reservation (0.0021 against 0.0193, which is the whole argument for
  [requirement 1](/guide/quickstart#_1-reserve-the-container-s-height)).
- **WCAG 2.2 AA** through axe-core, on every state, not just the happy one.
- **Geometry at five widths**, including 320 px and 200 % browser zoom.
- **The full state matrix** driven in a real browser: idle, creating, awaiting, degraded, expired,
  paid, failed, refused.
- **Every promised fallback exercised**: no Shadow DOM, no clipboard, no QR encoder, no
  JavaScript.

That last line is the one that matters. A fallback nobody runs is a fallback nobody has.

## Type discipline

- `strict` plus `noUncheckedIndexedAccess`.
- No `any` and no non-null assertions in source.
- Discriminated unions over boolean-and-string pairs, so illegal states cannot be constructed.
- zod at the untrusted borders — the webhook body and the PSP status payload.

## Publishing checks

`publint` and `@arethetypeswrong/cli` run against the built packages: ESM-only, correct
`exports` maps, `.d.mts` beside every `.mjs`, no CJS shim pretending to work.

## What is out of the slice, on purpose

Cards (cross-origin iframe and PCI scope — version 2 of the isolation architecture), boleto,
subscriptions, Vue and Svelte wrappers, simultaneous multi-provider, and telemetry of any kind.
