export const styles = `
*, *::before, *::after { box-sizing: border-box; }

:host {
  --abc-u: 6px;
  --abc-paper: oklch(97.5% 0.006 184);
  --abc-recess: oklch(94% 0.006 184);
  --abc-ink: oklch(19% 0.0096 184);
  --abc-muted: oklch(42% 0.0072 184);
  --abc-hair: oklch(87% 0.006 184);
  --abc-rule: oklch(62% 0.006 184);
  --abc-ok: oklch(51% 0.09 184);
  --abc-danger: oklch(48% 0.16 25);
  --abc-code-bg: transparent;
  --abc-code-ink: var(--abc-ink);
  --abc-control: calc(var(--abc-u) * 8);
  --abc-radius: var(--abc-u);
  --abc-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --abc-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --abc-ease: cubic-bezier(0.2, 0, 0, 1);

  box-sizing: border-box;
  display: block;
  container-type: inline-size;
  max-inline-size: calc(var(--abc-u) * 76);
  inline-size: 100%;
  padding: calc(var(--abc-u) * 4);
  font-family: var(--abc-font);
  font-size: 15px;
  line-height: 1.55;
  color: var(--abc-ink);
  background: var(--abc-paper);
  border: 1px solid var(--abc-rule);
  border-radius: 0;
  text-align: start;
  -webkit-font-smoothing: antialiased;
}

:host([data-theme="dark"]) {
  --abc-paper: oklch(15% 0.008 184);
  --abc-recess: oklch(20% 0.008 184);
  --abc-ink: oklch(94% 0.0128 184);
  --abc-muted: oklch(72% 0.0096 184);
  --abc-hair: oklch(32% 0.008 184);
  --abc-rule: oklch(50% 0.008 184);
  --abc-ok: oklch(68% 0.12 184);
  --abc-danger: oklch(70% 0.14 25);
  --abc-code-bg: oklch(97.5% 0.006 184);
  --abc-code-ink: oklch(19% 0.0096 184);
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --abc-paper: oklch(15% 0.008 184);
    --abc-recess: oklch(20% 0.008 184);
    --abc-ink: oklch(94% 0.0128 184);
    --abc-muted: oklch(72% 0.0096 184);
    --abc-hair: oklch(32% 0.008 184);
    --abc-rule: oklch(50% 0.008 184);
    --abc-ok: oklch(68% 0.12 184);
    --abc-danger: oklch(70% 0.14 25);
    --abc-code-bg: oklch(97.5% 0.006 184);
    --abc-code-ink: oklch(19% 0.0096 184);
  }
}

.abc-sheet { display: grid; }

.abc-life {
  grid-column: 1 / -1;
  margin: calc(var(--abc-u) * -4) calc(var(--abc-u) * -4) 0;
  block-size: 3px;
  background: var(--abc-hair);
}
.abc-life::before {
  content: "";
  display: block;
  block-size: 100%;
  background: var(--abc-ink);
  clip-path: inset(0 calc(100% - var(--fill, 0) * 100%) 0 0);
  transition: clip-path 260ms linear;
}
.abc-life.is-ok::before { background: var(--abc-ok); }

.abc-head { margin-block-start: calc(var(--abc-u) * 4); }
.abc-head-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: calc(var(--abc-u) * 2);
}

.abc-label, .abc-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--abc-muted);
}
.abc-due {
  margin: 0;
  font-family: var(--abc-mono);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--abc-muted);
}

.abc-amount {
  margin: var(--abc-u) 0 0;
  font-size: 30px;
  line-height: 1.1;
  font-weight: 560;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  transition: color 200ms var(--abc-ease);
}
.abc-amount.is-ok { color: var(--abc-ok); }
.abc-amount.is-spent { color: var(--abc-muted); }

.abc-status {
  display: flex;
  align-items: center;
  gap: var(--abc-u);
  margin: calc(var(--abc-u) * 0.5) 0 0;
  font-size: 15px;
  color: var(--abc-ink);
  transition: color 120ms var(--abc-ease);
}
.abc-mark { display: inline-flex; flex: none; }
.abc-status.is-ok { color: var(--abc-ok); }
.abc-status.is-danger { color: var(--abc-danger); }

.abc-machine {
  display: grid;
  gap: calc(var(--abc-u) * 4);
  margin-block-start: calc(var(--abc-u) * 5);
}
.abc-machine .abc-payload { order: -2; }
.abc-machine .is-copy { order: -1; }
.abc-foot > :first-child { margin-block-start: calc(var(--abc-u) * 4); }

.abc-code {
  display: grid;
  justify-items: center;
  padding-inline: calc(100% * 4 / 57);
  padding-block: calc(100% * 4 / 57);
  background: var(--abc-code-bg);
  color: var(--abc-code-ink);
}
.abc-qr, .abc-qr-img {
  display: block;
  inline-size: 100%;
  max-inline-size: calc(var(--abc-u) * 49);
  block-size: auto;
  aspect-ratio: 1;
  color: currentColor;
}

.abc-payload { display: grid; gap: calc(var(--abc-u) * 0.5); }
.abc-payload-value {
  font-family: var(--abc-mono);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--abc-muted);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.abc-notice {
  display: grid;
  gap: calc(var(--abc-u) * 0.5);
  padding: calc(var(--abc-u) * 3);
  background: var(--abc-recess);
}
.abc-notice-value {
  font-family: var(--abc-mono);
  font-size: 15px;
  line-height: 1.5;
  color: var(--abc-ink);
  overflow-wrap: anywhere;
}
.abc-notice.is-ok .abc-notice-value { color: var(--abc-ok); }

.abc-controls {
  display: grid;
  gap: calc(var(--abc-u) * 2);
  margin-block-start: calc(var(--abc-u) * 4);
}

.abc-btn {
  position: relative;
  overflow: hidden;
  display: grid;
  min-block-size: var(--abc-control);
  padding: 0;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.005em;
  border-radius: var(--abc-radius);
  cursor: pointer;
}
.abc-btn-label {
  grid-area: 1 / 1;
  align-self: center;
  padding-inline: calc(var(--abc-u) * 3);
  text-align: center;
}
.abc-btn-fill {
  position: absolute;
  inset: 0;
  display: grid;
  clip-path: inset(0 calc(100% - var(--fill, 0) * 100%) 0 0);
  transition: clip-path 260ms linear;
}
.abc-btn-fill .abc-btn-label { grid-area: 1 / 1; }
@keyframes abc-sweep {
  0% { clip-path: inset(0 100% 0 0); }
  50% { clip-path: inset(0 0 0 0); }
  100% { clip-path: inset(0 0 0 100%); }
}
.abc-btn.is-busy .abc-btn-fill { animation: abc-sweep 1400ms var(--abc-ease) infinite; }

.abc-btn.is-primary {
  background: var(--abc-ink);
  color: var(--abc-paper);
  border: 1px solid var(--abc-ink);
}
.abc-btn.is-primary .abc-btn-fill { background: var(--abc-paper); color: var(--abc-ink); }
.abc-btn.is-secondary {
  background: var(--abc-recess);
  color: var(--abc-ink);
  border: 1px solid var(--abc-rule);
}
.abc-btn.is-secondary .abc-btn-fill { background: var(--abc-ink); color: var(--abc-paper); }
.abc-btn.is-primary:hover { background: color-mix(in oklab, var(--abc-paper) 12%, var(--abc-ink)); }
.abc-btn.is-secondary:hover { border-color: var(--abc-ink); }

.abc-note {
  margin: calc(var(--abc-u) * 4) 0 0;
  max-inline-size: 44ch;
  font-size: 15px;
  color: var(--abc-ink);
  text-wrap: pretty;
}

.abc-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: calc(var(--abc-u) * 2);
  margin: calc(var(--abc-u) * 3) 0 0;
  padding-block-start: calc(var(--abc-u) * 2);
  border-block-start: 1px solid var(--abc-hair);
}
.abc-meta-value {
  font-family: var(--abc-mono);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--abc-muted);
  text-align: end;
}

:where(button, a, [tabindex]):focus-visible {
  outline: 2px solid var(--abc-ink);
  outline-offset: 3px;
}

.abc-skel { background: var(--abc-recess); inline-size: 100%; }
.abc-skel-qr { max-inline-size: calc(var(--abc-u) * 49); aspect-ratio: 1; }
.abc-skel-label { block-size: 11px; max-inline-size: 14ch; }
.abc-skel-line { block-size: 12.5px; }
.abc-skel-line.is-short { max-inline-size: 62%; }
.abc-skel-control { block-size: var(--abc-control); border-radius: var(--abc-radius); }

.abc-visually-hidden {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@container (min-width: 520px) {
  .abc-sheet {
    grid-template-columns: 1fr calc(var(--abc-u) * 57);
    column-gap: calc(var(--abc-u) * 6);
    grid-template-rows: auto auto 1fr;
  }
  .abc-life { grid-row: 1; }
  .abc-head { grid-column: 1; grid-row: 2; }
  .abc-foot { grid-column: 1; grid-row: 3; align-self: start; }
  .abc-machine {
    grid-column: 2;
    grid-row: 2 / -1;
    align-self: start;
    margin-block-start: calc(var(--abc-u) * 4);
  }
  .abc-machine .abc-payload, .abc-machine .is-copy { order: 0; }
  .abc-payload-value { -webkit-line-clamp: 4; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before { transition-duration: 120ms !important; animation: none !important; }
  .abc-btn.is-busy .abc-btn-fill { clip-path: inset(0 100% 0 0); }
}
@media (prefers-contrast: more) {
  :host { border-color: var(--abc-ink); }
  .abc-eyebrow, .abc-label, .abc-note, .abc-due, .abc-status, .abc-meta-value, .abc-payload-value {
    color: var(--abc-ink);
  }
  .abc-code { --abc-code-bg: #ffffff; --abc-code-ink: #000000; background: #ffffff; }
}
@media (forced-colors: active) {
  .abc-btn-fill { display: none; }
  .abc-life { forced-color-adjust: none; }
}
`;

export default styles;
