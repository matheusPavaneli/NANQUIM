import type { Control, Machine, ViewModel } from './present.ts';
import { encode, toSvgPath } from './qr/encode.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS: Record<'alert' | 'check', string> = {
  alert: 'M8 2 14.5 13.5h-13z M8 6.25v3.5 M8 11.5v.5',
  check: 'M2.5 8.5 6.5 12.5 13.5 4',
};

export interface ViewCallbacks {
  onCopy(): void;
  onRetry(): void;
  onCheck(): void;
}

export interface View {
  render(model: ViewModel): void;
  announce(text: string): void;
  destroy(): void;
}

interface ControlNodes {
  readonly button: HTMLButtonElement;
  readonly label: HTMLElement;
  readonly filledLabel: HTMLElement;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  return node;
};

function makeControl(onActivate: () => void): ControlNodes {
  const button = el('button', 'abc-btn');
  button.type = 'button';
  const label = el('span', 'abc-btn-label');
  const fill = el('span', 'abc-btn-fill');
  fill.setAttribute('aria-hidden', 'true');
  const filledLabel = el('span', 'abc-btn-label');
  fill.append(filledLabel);
  button.append(label, fill);
  button.addEventListener('click', onActivate);
  return { button, label, filledLabel };
}

function applyControl(nodes: ControlNodes, control: Control): void {
  const { button, label, filledLabel } = nodes;
  button.className = `abc-btn is-${control.kind}${control.busy ? ' is-busy' : ''}${
    control.action === 'copy' ? ' is-copy' : ''
  }`;
  button.style.setProperty('--fill', String(control.fill));
  button.toggleAttribute('aria-busy', control.busy);
  if (label.textContent !== control.label) label.textContent = control.label;
  if (filledLabel.textContent !== control.filledLabel)
    filledLabel.textContent = control.filledLabel;
}

function qrElement(payload: string): SVGSVGElement | null {
  let path: { d: string; extent: number };
  try {
    path = toSvgPath(encode(payload), 0);
  } catch {
    return null;
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'abc-qr');
  svg.setAttribute('viewBox', `0 0 ${path.extent} ${path.extent}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path.d);
  shape.setAttribute('fill', 'currentColor');
  svg.append(shape);
  return svg;
}

export interface ViewOptions {
  readonly callbacks: ViewCallbacks;
  readonly onQrUnavailable?: () => void;
}

export function createView(root: ParentNode & Node, options: ViewOptions): View {
  const { callbacks } = options;

  const sheet = el('div', 'abc-sheet');

  const life = el('div', 'abc-life');
  life.setAttribute('aria-hidden', 'true');

  const head = el('div', 'abc-head');
  const headLine = el('div', 'abc-head-line');
  const eyebrow = el('p', 'abc-eyebrow');
  const due = el('p', 'abc-due');
  headLine.append(eyebrow, due);
  const amount = el('p', 'abc-amount');
  const status = el('p', 'abc-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const mark = el('span', 'abc-mark');
  const statusText = el('span');
  status.append(mark, statusText);
  head.append(headLine, amount, status);

  const machine = el('div', 'abc-machine');

  const foot = el('div', 'abc-foot');
  const controls = el('div', 'abc-controls');
  const note = el('p', 'abc-note');
  const meta = el('p', 'abc-meta');
  const metaLabel = el('span', 'abc-label');
  const metaValue = el('span', 'abc-meta-value');
  meta.append(metaLabel, metaValue);

  const live = el('p', 'abc-visually-hidden');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  sheet.append(life, head, machine, foot, live);
  root.append(sheet);

  sheet.setAttribute('part', 'sheet');
  life.setAttribute('part', 'life');
  amount.setAttribute('part', 'amount');
  status.setAttribute('part', 'status');

  const copy = makeControl(callbacks.onCopy);
  copy.button.setAttribute('part', 'copy');

  const action = makeControl(() => {
    if (currentAction === 'retry') callbacks.onRetry();
    else callbacks.onCheck();
  });
  action.button.setAttribute('part', 'action');
  let currentAction: Control['action'] = 'retry';

  let machineKind: Machine['kind'] | null = null;
  let renderedPayload: string | null = null;
  let footKey: string | null = null;

  const payloadValue = el('code', 'abc-payload-value');
  const payloadLabel = el('p', 'abc-label');
  const payloadBlock = el('div', 'abc-payload');
  payloadBlock.append(payloadLabel, payloadValue);
  payloadValue.setAttribute('part', 'payload');
  const codeBlock = el('div', 'abc-code');
  const noticeBlock = el('div', 'abc-notice');
  const noticeLabel = el('p', 'abc-label');
  const noticeValue = el('code', 'abc-notice-value');
  noticeBlock.append(noticeLabel, noticeValue);

  function renderMachine(model: Machine, qrAlt: string): void {
    if (machineKind !== model.kind) {
      machineKind = model.kind;
      renderedPayload = null;
      if (model.kind === 'skeleton') {
        const qr = el('div', 'abc-skel abc-skel-qr');
        const wrap = el('div', 'abc-code');
        wrap.append(qr);
        const lines = el('div', 'abc-payload');
        lines.append(
          el('div', 'abc-skel abc-skel-label'),
          el('div', 'abc-skel abc-skel-line'),
          el('div', 'abc-skel abc-skel-line is-short'),
        );
        machine.replaceChildren(wrap, lines, el('div', 'abc-skel abc-skel-control is-copy'));
      } else if (model.kind === 'code') {
        machine.replaceChildren(codeBlock, payloadBlock, copy.button);
      } else {
        machine.replaceChildren(noticeBlock);
      }
    }

    if (model.kind === 'code') {
      if (renderedPayload !== model.payload) {
        renderedPayload = model.payload;
        const svg = qrElement(model.payload);
        if (svg === null) {
          options.onQrUnavailable?.();
          if (model.fallbackImage === undefined) {
            codeBlock.replaceChildren();
          } else {
            const img = el('img', 'abc-qr-img');
            img.src = model.fallbackImage;
            img.alt = qrAlt;
            codeBlock.replaceChildren(img);
          }
        } else {
          svg.setAttribute('aria-label', qrAlt);
          codeBlock.replaceChildren(svg);
        }
        payloadValue.textContent = model.payload;
      }
      payloadLabel.textContent = model.payloadLabel;
      applyControl(copy, model.copy);
    } else if (model.kind === 'notice') {
      noticeBlock.className = `abc-notice${model.tone === 'ok' ? ' is-ok' : ''}`;
      noticeLabel.textContent = model.label;
      noticeValue.textContent = model.value;
    }
  }

  function renderFoot(model: ViewModel): void {
    const order = model.controlFirst ? 'control-first' : 'note-first';
    const hasControl = model.control !== null;
    const hasMeta = model.meta !== null;
    const key = `${order}|${hasControl}|${hasMeta}`;
    if (footKey !== key) {
      footKey = key;
      const children: Element[] = [];
      if (hasControl && model.controlFirst) children.push(controls);
      children.push(note);
      if (hasControl && !model.controlFirst) children.push(controls);
      if (hasMeta) children.push(meta);
      foot.replaceChildren(...children);
    }
    if (model.control !== null) {
      currentAction = model.control.action;
      applyControl(action, model.control);
      if (action.button.parentNode !== controls) controls.replaceChildren(action.button);
    }
    if (model.meta !== null) {
      metaLabel.textContent = model.meta.label;
      metaValue.textContent = model.meta.value;
    }
    if (note.textContent !== model.note) note.textContent = model.note;
  }

  return {
    render(model: ViewModel): void {
      life.className = `abc-life${model.life.tone === 'ok' ? ' is-ok' : ''}`;
      life.style.setProperty('--fill', model.life.fill.toFixed(4));

      eyebrow.textContent = model.eyebrow;
      due.textContent = model.due ?? '';
      due.hidden = model.due === null;
      amount.className = `abc-amount${model.amountTone === 'ink' ? '' : ` is-${model.amountTone}`}`;
      if (amount.textContent !== model.amount) amount.textContent = model.amount;

      status.className = `abc-status${model.statusTone === 'ink' ? '' : ` is-${model.statusTone}`}`;
      if (statusText.textContent !== model.statusText) statusText.textContent = model.statusText;
      if (model.icon === 'none') {
        mark.replaceChildren();
        mark.hidden = true;
      } else {
        mark.hidden = false;
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('width', '13');
        svg.setAttribute('height', '13');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', model.icon === 'check' ? '2' : '1.6');
        const shape = document.createElementNS(SVG_NS, 'path');
        shape.setAttribute('d', ICONS[model.icon]);
        svg.append(shape);
        mark.replaceChildren(svg);
      }

      renderMachine(model.machine, model.qrAlt);
      renderFoot(model);
    },

    announce(text: string): void {
      live.textContent = '';
      live.textContent = text;
    },

    destroy(): void {
      copy.button.replaceWith(copy.button.cloneNode(false));
      action.button.replaceWith(action.button.cloneNode(false));
      sheet.remove();
    },
  };
}
