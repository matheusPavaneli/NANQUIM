import { remaining } from './format.ts';
import { messagesFor } from './i18n.ts';
import { present } from './present.ts';
import { type CheckoutEvent, initialState, transition } from './state.ts';
import { styles } from './styles.ts';
import { createPoller, type Poller } from './transport.ts';
import {
  CheckoutError,
  type CheckoutHandle,
  type CheckoutOptions,
  type CheckoutState,
  type Locale,
  type Session,
} from './types.ts';
import { createView, type View } from './view.ts';

const COPIED_MS = 2400;
const ANNOUNCE_AT = [300, 60];

const uuid = (): string => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
    let out = '';
    for (let i = 0; i < 16; i += 1) {
      out += `${i === 4 || i === 6 || i === 8 || i === 10 ? '-' : ''}${((bytes[i] as number) + 0x100).toString(16).slice(1)}`;
    }
    return out;
  }
  throw new CheckoutError('unsupported_environment', 'no cryptographic random source');
};

const resolveTarget = (target: Element | string): Element => {
  if (typeof target !== 'string') return target;
  const found = document.querySelector(target);
  if (found === null) {
    throw new CheckoutError('unsupported_environment', `no element matches "${target}"`);
  }
  return found;
};

export function createCheckout(options: CheckoutOptions): CheckoutHandle {
  const locale: Locale = options.locale ?? 'pt-BR';
  const messages = messagesFor(locale, options.messages);
  const degradeAfter = options.degradeAfter ?? 3;
  const interval = options.pollInterval ?? 3000;

  let state: CheckoutState = initialState;
  let view: View | null = null;
  let host: HTMLElement | null = null;
  let container: Element | null = null;
  let poller: Poller | null = null;
  let unsubscribeProvider: (() => void) | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;
  let createController: AbortController | null = null;
  let attemptKey = uuid();
  let copied = false;
  let issuedAt: number | undefined;
  let creating = false;
  let announced = new Set<number>();
  let destroyed = false;
  const listeners = new Set<(next: CheckoutState) => void>();

  const emitError = (error: CheckoutError): void => {
    options.onError?.(error);
  };

  const render = (): void => {
    if (view === null) return;
    view.render(
      present(state, {
        messages,
        locale,
        now: Date.now(),
        copied,
        degradeAfter,
        ...(options.charge === undefined ? {} : { charge: options.charge }),
        ...(issuedAt === undefined ? {} : { issuedAt }),
      }),
    );
  };

  function dispatch(event: CheckoutEvent): void {
    const next = transition(state, event);
    if (next === state) {
      render();
      return;
    }
    const previous = state;
    state = next;

    if (next.status === 'awaiting' && previous.status !== 'awaiting') {
      startWatching(next.session, next.deadline);
    }
    if (next.status !== 'awaiting') stopWatching();

    if (next.status === 'paid' && previous.status !== 'paid') {
      options.onPaymentIndicated?.({
        sessionId: next.session.sessionId,
        ...(next.endToEndId === undefined ? {} : { endToEndId: next.endToEndId }),
      });
    }

    render();
    for (const listener of listeners) listener(next);
    options.onStateChange?.(next);
  }

  async function readStatus(session: Session, signal: AbortSignal): Promise<void> {
    const getStatus = options.getStatus;
    if (getStatus === undefined) throw new CheckoutError('status_unavailable', 'no getStatus');
    dispatch({ type: 'checkStarted' });
    const raw = await getStatus({ signal, idempotencyKey: attemptKey, session });
    const report = options.provider.normalizeStatus(raw);
    dispatch({ type: 'checked', report, now: Date.now() });
  }

  function startWatching(session: Session, until: number): void {
    stopWatching();
    if (destroyed) return;

    const subscribe = options.provider.subscribe;
    if (subscribe !== undefined) {
      unsubscribeProvider = subscribe(session, (report) => {
        dispatch({ type: 'checked', report, now: Date.now() });
      });
    }

    if (options.getStatus === undefined) {
      if (subscribe === undefined) options.onDegraded?.({ reason: 'status-unavailable' });
    } else {
      poller = createPoller({
        run: async (signal) => {
          try {
            await readStatus(session, signal);
          } catch (cause) {
            if (!signal.aborted) dispatch({ type: 'checkFailed', now: Date.now() });
            throw cause;
          }
        },
        shouldContinue: () => state.status === 'awaiting' && Date.now() < until,
        interval,
        maxInterval: Math.max(interval, 30_000),
        timeout: 10_000,
      });
      poller.start();
    }

    ticker = setInterval(() => {
      const now = Date.now();
      dispatch({ type: 'tick', now });
      if (state.status === 'awaiting') {
        const left = remaining(until, now, issuedAt);
        const seconds = Math.ceil(left.ms / 1000);
        for (const threshold of ANNOUNCE_AT) {
          if (seconds <= threshold && !announced.has(threshold)) {
            announced.add(threshold);
            view?.announce(messages.remainingAnnounce(left.text));
          }
        }
        render();
      }
    }, 1000);
  }

  function stopWatching(): void {
    poller?.stop();
    poller = null;
    unsubscribeProvider?.();
    unsubscribeProvider = null;
    if (ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  async function start(): Promise<void> {
    if (creating || destroyed) return;
    if (state.status === 'awaiting' || state.status === 'paid') return;

    creating = true;
    if (state.status !== 'failed') attemptKey = uuid();
    announced = new Set();
    createController?.abort();
    const controller = new AbortController();
    createController = controller;
    dispatch({ type: 'start' });

    try {
      const raw = await options.createSession({
        signal: controller.signal,
        idempotencyKey: attemptKey,
      });
      const session = options.provider.normalizeSession(raw);
      const charge = options.charge;
      if (
        charge !== undefined &&
        (session.amount !== charge.amount || session.currency !== charge.currency)
      ) {
        throw new CheckoutError('amount_mismatch', 'the charge is not for the promised amount');
      }
      issuedAt = Date.now();
      const span = session.expiresInMs;
      dispatch({
        type: 'created',
        session,
        deadline: span === undefined ? session.expiresAt : issuedAt + span,
        now: issuedAt,
      });
      if (session.status === 'refused') {
        const error = new CheckoutError('provider_refused', 'the provider refused the charge');
        dispatch({ type: 'createFailed', error });
        emitError(error);
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      const error =
        cause instanceof CheckoutError
          ? cause
          : new CheckoutError('session_create_failed', 'could not create the charge', { cause });
      dispatch({ type: 'createFailed', error });
      emitError(error);
    } finally {
      creating = false;
      if (createController === controller) createController = null;
    }
  }

  async function refresh(): Promise<void> {
    if (state.status !== 'awaiting') return;
    const session = state.session;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      await readStatus(session, controller.signal);
    } catch (cause) {
      dispatch({ type: 'checkFailed', now: Date.now() });
      emitError(new CheckoutError('status_unavailable', 'could not read the status', { cause }));
    } finally {
      clearTimeout(timeout);
    }
  }

  async function copyPayload(): Promise<void> {
    if (state.status !== 'awaiting') return;
    const payload = state.session.brCode;
    if (copiedTimer !== null) clearTimeout(copiedTimer);
    try {
      await navigator.clipboard.writeText(payload);
      copied = true;
      view?.announce(messages.copied);
    } catch {
      copied = false;
      view?.announce(messages.copyManual);
    }
    render();
    copiedTimer = setTimeout(() => {
      copied = false;
      copiedTimer = null;
      render();
    }, COPIED_MS);
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') poller?.pause();
    else poller?.resume();
  };
  const onOnline = (): void => poller?.resume();
  const onOffline = (): void => poller?.pause();

  const hasDom = typeof document !== 'undefined';
  function attachListeners(): void {
    if (!hasDom) return;
    document.addEventListener('visibilitychange', onVisibility);
    globalThis.addEventListener('online', onOnline);
    globalThis.addEventListener('offline', onOffline);
  }
  function detachListeners(): void {
    if (!hasDom) return;
    document.removeEventListener('visibilitychange', onVisibility);
    globalThis.removeEventListener('online', onOnline);
    globalThis.removeEventListener('offline', onOffline);
  }

  function mount(target: Element | string): void {
    if (typeof document === 'undefined') {
      throw new CheckoutError('unsupported_environment', 'mount requires a document');
    }
    if (destroyed)
      throw new CheckoutError('unsupported_environment', 'this checkout was destroyed');
    const next = resolveTarget(target);
    if (view !== null && container === next) return;
    if (view !== null) unmount();
    container = next;

    const element = document.createElement('div');
    host = element;
    let mountPoint: ParentNode & Node = element;

    if (typeof element.attachShadow === 'function') {
      const shadow = element.attachShadow({ mode: 'open' });
      if ('adoptedStyleSheets' in shadow && typeof CSSStyleSheet === 'function') {
        try {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(styles);
          shadow.adoptedStyleSheets = [sheet];
        } catch {
          const tag = document.createElement('style');
          tag.textContent = styles;
          shadow.append(tag);
        }
      } else {
        const tag = document.createElement('style');
        tag.textContent = styles;
        shadow.append(tag);
      }
      mountPoint = shadow;
    } else {
      const tag = document.createElement('style');
      tag.textContent = styles.replaceAll(':host', '.abc-root');
      element.append(tag);
      element.classList.add('abc-root');
      options.onDegraded?.({ reason: 'no-shadow-dom' });
    }

    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', messages.group);
    element.lang = locale;
    next.append(element);

    view = createView(mountPoint, {
      callbacks: {
        onCopy: () => {
          void copyPayload();
        },
        onRetry: () => {
          void start();
        },
        onCheck: () => {
          void refresh();
        },
      },
      onQrUnavailable: () => options.onDegraded?.({ reason: 'qr-encode' }),
    });

    attachListeners();
    render();
    if (state.status === 'awaiting') startWatching(state.session, state.deadline);
  }

  function unmount(): void {
    createController?.abort();
    createController = null;
    creating = false;
    detachListeners();
    stopWatching();
    if (copiedTimer !== null) {
      clearTimeout(copiedTimer);
      copiedTimer = null;
    }
    view?.destroy();
    view = null;
    host?.remove();
    host = null;
    container = null;
  }

  return {
    mount,
    unmount,
    start,
    refresh,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      destroyed = true;
      createController?.abort();
      createController = null;
      unmount();
      listeners.clear();
    },
  };
}
