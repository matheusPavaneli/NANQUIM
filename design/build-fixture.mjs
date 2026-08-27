import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brCode, encode, toSvgPath } from './qr.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const PAYLOAD = brCode({
  key: 'pagamentos@exemplo.com.br',
  name: 'LOJA EXEMPLO LTDA',
  city: 'SAO PAULO',
  amount: '129.90',
  txid: 'ABC123DEMO',
});

const CODE = encode(PAYLOAD);

function qrSvg() {
  const { d, extent } = toSvgPath(CODE, 0);
  return `<svg class="abc-qr" viewBox="0 0 ${extent} ${extent}" role="img" aria-label="QR code do Pix" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet"><path d="${d}" fill="currentColor"/></svg>`;
}

const COPY_LABEL = 'Copiar código';

const ICON = {
  alert:
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.25v3.5M8 11.5v.5"/></svg>',
  check:
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 8.5 6.5 12.5 13.5 4"/></svg>',
};

const life = (fill, tone = '') =>
  `\n      <div class="abc-life${tone ? ` is-${tone}` : ''}" style="--fill: ${fill}" aria-hidden="true"></div>`;

const button = ({ label, filled = label, kind = 'primary', fill = 0, busy = false, extra = '' }) =>
  `<button class="abc-btn is-${kind}${busy ? ' is-busy' : ''}${extra ? ` ${extra}` : ''}" type="button" style="--fill: ${fill}"${busy ? ' aria-busy="true"' : ''}>` +
  `<span class="abc-btn-label">${label}</span>` +
  `<span class="abc-btn-fill" aria-hidden="true"><span class="abc-btn-label">${filled}</span></span>` +
  `</button>`;

const head = ({ due = '', amountTone = '', status, statusTone = '', icon = '' }) => `
      <div class="abc-head">
        <div class="abc-head-line">
          <p class="abc-eyebrow">Cobrança Pix</p>
          ${due ? `<p class="abc-due">${due}</p>` : ''}
        </div>
        <p class="abc-amount${amountTone ? ` is-${amountTone}` : ''}">R$&nbsp;129,90</p>
        <p class="abc-status${statusTone ? ` is-${statusTone}` : ''}" role="status" aria-live="polite">
          ${icon ? `<span class="abc-mark">${ICON[icon]}</span>` : ''}${status}
        </p>
      </div>`;

const machine = (inner) => `
      <div class="abc-machine">${inner}
      </div>`;

const codeBlock = ({ copied = false } = {}) =>
  machine(`
        <div class="abc-code">${qrSvg()}</div>
        <div class="abc-payload">
          <p class="abc-label">Pix Copia e Cola</p>
          <code class="abc-payload-value">${PAYLOAD}</code>
        </div>
        ${button({
          label: COPY_LABEL,
          filled: copied ? 'Código copiado' : COPY_LABEL,
          fill: copied ? 1 : 0,
          extra: 'is-copy',
        })}`);

const notice = (label, value, tone = '') =>
  machine(`
        <div class="abc-notice${tone ? ` is-${tone}` : ''}">
          <p class="abc-label">${label}</p>
          <code class="abc-notice-value">${value}</code>
        </div>`);

const skeleton = () =>
  machine(`
        <div class="abc-code"><div class="abc-skel abc-skel-qr"></div></div>
        <div class="abc-payload">
          <div class="abc-skel abc-skel-label"></div>
          <div class="abc-skel abc-skel-line"></div>
          <div class="abc-skel abc-skel-line is-short"></div>
        </div>
        <div class="abc-skel abc-skel-control is-copy"></div>`);

const foot = (inner) => `
      <div class="abc-foot">${inner}
      </div>`;

const controls = (inner) => `
        <div class="abc-controls">${inner}</div>`;

const note = (text) => `
        <p class="abc-note">${text}</p>`;

const meta = (label, value) => `
        <p class="abc-meta"><span class="abc-label">${label}</span><span class="abc-meta-value">${value}</span></p>`;

const STATES = [
  {
    id: 'creating',
    caption:
      'creating — the skeleton has the exact proportion of what arrives; the amount is already known',
    html:
      life(1) +
      head({ status: 'Gerando o código' }) +
      skeleton() +
      foot(note('Isso costuma levar 1 a 2 segundos.')),
  },
  {
    id: 'awaiting',
    caption:
      'awaiting — the default state. The code is the largest object on screen, and there is no chroma.',
    html:
      life(0.65) +
      head({
        due: 'vence em <time datetime="PT9M47S">09:47</time>',
        status: 'Aguardando pagamento',
      }) +
      codeBlock() +
      foot(
        note('Abra o app do seu banco, escolha Pix&nbsp;› Pix Copia e Cola e cole o código.') +
          meta('Verificado', '<time datetime="14:32:10">14:32:10</time>'),
      ),
  },
  {
    id: 'copied',
    caption: 'copied — the control turns inside out: the ink is consumed from left to right',
    html:
      life(0.63) +
      head({
        due: 'vence em <time datetime="PT9M28S">09:28</time>',
        status: 'Aguardando pagamento',
      }) +
      codeBlock({ copied: true }) +
      foot(
        note('Abra o app do seu banco, escolha Pix&nbsp;› Pix Copia e Cola e cole o código.') +
          meta('Verificado', '<time datetime="14:32:29">14:32:29</time>'),
      ),
  },
  {
    id: 'awaiting-degraded',
    caption: 'awaiting degraded — the problem is on the reader side; the code is still valid',
    html:
      life(0.53) +
      head({
        due: 'vence em <time datetime="PT8M02S">08:02</time>',
        status: 'Sem confirmação do servidor',
        statusTone: 'danger',
        icon: 'alert',
      }) +
      codeBlock() +
      foot(
        controls(button({ label: 'Verificando…', kind: 'secondary', busy: true })) +
          note('Se você já pagou, o pagamento não se perde — seguimos tentando.') +
          meta('Última confirmação', '<time datetime="14:29:55">14:29:55</time> · há 3&nbsp;min'),
      ),
  },
  {
    id: 'expired',
    caption: 'expired — the edge has been entirely consumed and there is nothing left to scan',
    html:
      life(0) +
      head({
        amountTone: 'spent',
        status: 'Expirada',
        statusTone: 'danger',
        icon: 'alert',
      }) +
      notice('Situação do código', 'EXPIRADO ÀS 14:32:00') +
      foot(
        note('Códigos Pix valem 15 minutos. Gere um novo para continuar — nada foi cobrado.') +
          controls(button({ label: 'Gerar novo código' })),
      ),
  },
  {
    id: 'paid',
    caption: 'paid — the only moment with chroma, and the full edge is the whole charge fulfilled',
    html:
      life(1, 'ok') +
      head({
        due: 'pago às <time datetime="14:33:06">14:33:06</time>',
        amountTone: 'ok',
        status: 'Concluída',
        statusTone: 'ok',
        icon: 'check',
      }) +
      notice('ID da transação', 'E1234567820260827143241a9c3f7b2', 'ok') +
      foot(note('Recebemos a confirmação do seu Pix. Nada mais é preciso fazer aqui.')),
  },
  {
    id: 'failed',
    caption:
      'failed — a failure to create the charge, not to pay it; the provider reason stays in sight',
    html:
      life(0) +
      head({
        amountTone: 'spent',
        status: 'Não foi possível gerar',
        statusTone: 'danger',
        icon: 'alert',
      }) +
      notice('Recusa do provedor', 'INVALID_PIX_KEY') +
      foot(
        note('O provedor recusou a cobrança. Tente de novo — nada foi cobrado.') +
          controls(button({ label: 'Tentar de novo' })),
      ),
  },
];

const panel = ({ id, caption, html }, wide = false) => `
  <figure class="case${wide ? ' is-wide' : ''}">
    <figcaption class="case-caption"><code>${id}</code> · ${caption.split('—')[1].trim()}</figcaption>
    <div class="abc" lang="pt-BR" role="group" aria-label="Pagamento via Pix">
      <div class="abc-sheet">${html}
      </div>
    </div>
  </figure>`;

const CSS = `
*, *::before, *::after { box-sizing: border-box; }

:root {
  color-scheme: light dark;

  --abc-u: 6px;

  --abc-paper:  oklch(97.5% 0.006  184);
  --abc-recess: oklch(94%   0.006  184);
  --abc-ink:    oklch(19%   0.0096 184);
  --abc-muted:  oklch(42%   0.0072 184);
  --abc-hair:   oklch(87%   0.006  184);
  --abc-rule:   oklch(62%   0.006  184);
  --abc-ok:     oklch(51%   0.09   184);
  --abc-danger: oklch(48%   0.16    25);

  --abc-code-bg: transparent;
  --abc-code-ink: var(--abc-ink);

  --abc-control: calc(var(--abc-u) * 8);
  --abc-radius: var(--abc-u);
  --abc-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --abc-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --abc-ease: cubic-bezier(0.2, 0, 0, 1);
}

[data-theme="dark"] {
  --abc-paper:  oklch(15% 0.008  184);
  --abc-recess: oklch(20% 0.008  184);
  --abc-ink:    oklch(94% 0.0128 184);
  --abc-muted:  oklch(72% 0.0096 184);
  --abc-hair:   oklch(32% 0.008  184);
  --abc-rule:   oklch(50% 0.008  184);
  --abc-ok:     oklch(68% 0.12   184);
  --abc-danger: oklch(70% 0.14    25);

  --abc-code-bg: oklch(97.5% 0.006 184);
  --abc-code-ink: oklch(19% 0.0096 184);
}

.abc {
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
.abc-head-line { display: flex; justify-content: space-between; align-items: baseline; gap: calc(var(--abc-u) * 2); }

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
  margin: calc(var(--abc-u) * 1) 0 0;
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
.abc-qr {
  display: block;
  inline-size: 100%;
  max-inline-size: calc(var(--abc-u) * 49);
  block-size: auto;
  aspect-ratio: 1;
  color: currentColor;
}

.abc-payload {
  display: grid;
  gap: calc(var(--abc-u) * 0.5);
}
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
  0%   { clip-path: inset(0 100% 0 0); }
  50%  { clip-path: inset(0 0 0 0); }
  100% { clip-path: inset(0 0 0 100%); }
}
.abc-btn.is-busy .abc-btn-fill { animation: abc-sweep 1400ms var(--abc-ease) infinite; }

.abc-btn.is-primary { background: var(--abc-ink); color: var(--abc-paper); border: 1px solid var(--abc-ink); }
.abc-btn.is-primary .abc-btn-fill { background: var(--abc-paper); color: var(--abc-ink); }
.abc-btn.is-secondary { background: var(--abc-recess); color: var(--abc-ink); border: 1px solid var(--abc-rule); }
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

.abc :is(button, a, [tabindex]):focus-visible {
  outline: 2px solid var(--abc-ink);
  outline-offset: 3px;
}

.abc-skel { background: var(--abc-recess); inline-size: 100%; }
.abc-skel-qr { max-inline-size: calc(var(--abc-u) * 49); aspect-ratio: 1; }
.abc-skel-label { block-size: 11px; max-inline-size: 14ch; }
.abc-skel-line { block-size: 12.5px; }
.abc-skel-line.is-short { max-inline-size: 62%; }
.abc-skel-control { block-size: var(--abc-control); border-radius: var(--abc-radius); }

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
  .abc *, .abc *::before { transition-duration: 120ms !important; animation: none !important; }
  .abc-btn.is-busy .abc-btn-fill { clip-path: inset(0 100% 0 0); }
}
@media (prefers-contrast: more) {
  .abc { border-color: var(--abc-ink); }
  .abc-eyebrow, .abc-label, .abc-note, .abc-due, .abc-status, .abc-meta-value, .abc-payload-value { color: var(--abc-ink); }
}

body { margin: 0; font-family: var(--abc-font); }
.sheet { padding: 40px clamp(12px, 4vw, 32px) 72px; background: #ffffff; color: #14181a; }
.sheet.is-dim { background: #0b0f0e; color: #e2eeec; }
.sheet-head { max-inline-size: 62ch; margin-block-end: 36px; }
.sheet h1 { font-size: 22px; line-height: 1.25; margin: 0 0 8px; letter-spacing: -0.02em; font-weight: 600; }
.sheet p.note { margin: 0; font-size: 14px; line-height: 1.6; opacity: 0.7; text-wrap: pretty; }
.cases {
  display: grid;
  gap: 40px;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 456px));
  align-items: start;
}
.case { margin: 0; display: grid; gap: 10px; }
.case.is-wide { grid-column: 1 / -1; }
.case.is-wide .abc { max-inline-size: 720px; }
.case-caption { font-size: 12px; line-height: 1.5; opacity: 0.6; }
.case-caption code { font-family: var(--abc-mono); font-size: 12px; opacity: 1; }
`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pix drop-in surface — state matrix</title>
<style>${CSS}</style>
</head>
<body>
  <section class="sheet">
    <header class="sheet-head">
      <h1>Pix drop-in surface — state matrix</h1>
      <p class="note">A design fixture, on a merchant's white. One idea only: a quantity is drawn
      as a filled length — the deadline consumes the sheet's top edge, and the control turns itself
      inside out as it acts. The sheet is the code's own substrate: dark print on light, no panel
      inside a panel. The QR and the copy-and-paste text are an example BR Code, valid in structure
      and checksum, issued for a fictional key — it is not a real charge. Amount, times and ID are
      illustrative.</p>
    </header>
    <div class="cases">
      ${STATES.map((s) => panel(s)).join('\n')}
      ${panel(STATES[1], true)}
    </div>
  </section>

  <section class="sheet is-dim" data-theme="dark">
    <header class="sheet-head">
      <h1>Dark host — the sheet becomes the ink, and the code gets its paper back</h1>
      <p class="note">The inversion is not an alternative theme: a bank app reader handles an
      inverted code unreliably, so on a dark host the code is the only thing that stays paper.
      Everything else swaps ends along the same ramp.</p>
    </header>
    <div class="cases">
      ${[STATES[1], STATES[5], STATES[4]].map((s) => panel(s)).join('\n')}
      ${panel(STATES[1], true)}
    </div>
  </section>
</body>
</html>
`;

writeFileSync(join(here, 'states.html'), page);
console.log('design/states.html written');
