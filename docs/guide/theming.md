# Theming

The surface lives in a Shadow DOM, so the merchant's stylesheet cannot reach it and its styles
cannot leak out. That isolation is the point — and it means theming is a **published contract**,
not a selector war. Sixteen custom properties, set on the host element, inherit through the
shadow boundary.

## The tokens

```css
#checkout {
  /* rhythm */
  --abc-u: 6px;                  /* every spacing value is a multiple of this */
  --abc-radius: var(--abc-u);
  --abc-control: calc(var(--abc-u) * 8);   /* control height */

  /* surfaces */
  --abc-paper: oklch(97.5% 0.006 184);     /* card background */
  --abc-recess: oklch(94% 0.006 184);      /* inset areas */
  --abc-hair: oklch(87% 0.006 184);        /* subtle divider */
  --abc-rule: oklch(62% 0.006 184);        /* border */

  /* ink */
  --abc-ink: oklch(19% 0.0096 184);
  --abc-muted: oklch(42% 0.0072 184);
  --abc-ok: oklch(51% 0.09 184);           /* paid */
  --abc-danger: oklch(48% 0.16 25);        /* expired / failed */

  /* payload block */
  --abc-code-bg: transparent;
  --abc-code-ink: var(--abc-ink);

  /* type & motion */
  --abc-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --abc-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --abc-ease: cubic-bezier(0.2, 0, 0, 1);
}
```

Set only what you need; each falls back to the value above.

## Dark mode

The host reads `data-theme="dark"` and swaps the palette itself:

```html
<div id="checkout" data-theme="dark"></div>
```

Or drive it from your own theme state. Overriding tokens on the host beats the built-in dark
palette, so a fully custom dark theme is a matter of setting the same properties under your own
selector.

## Sizing

The host is `container-type: inline-size` with `max-inline-size: calc(var(--abc-u) * 76)` — the
layout responds to the **container**, not the viewport, so the surface behaves the same in a
narrow sidebar as at 320 px. Widen or narrow it by overriding `max-inline-size` on the host.

## What you cannot restyle

Internal class names are not a public API. There is no `::part()` surface today, deliberately: an
exported part is a promise about internal structure, and the structure still moves. If a token
you need is missing, that is a gap worth reporting — a new custom property is cheap, a leaked
selector is forever.

## When there is no Shadow DOM

On an engine without `attachShadow`, the SDK renders into a `.abc-root` container with `:host`
rewritten to that class, and reports:

```ts
onDegraded: ({ reason }) => {
  if (reason === 'no-shadow-dom') { /* styles are no longer isolated */ }
}
```

Everything still works; the isolation guarantee does not hold, so a page with aggressive global
CSS may bleed in.
