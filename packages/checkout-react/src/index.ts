import {
  type CheckoutHandle,
  type CheckoutOptions,
  type CheckoutState,
  createCheckout,
  type StatusContext,
} from '@abcheckout/core';
import type { ReactElement } from 'react';
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

export interface UsePixCheckout {
  readonly state: CheckoutState;
  readonly checkout: CheckoutHandle;
  readonly containerRef: (node: HTMLElement | null) => void;
}

export function usePixCheckout(options: CheckoutOptions): UsePixCheckout {
  const latest = useRef(options);
  latest.current = options;

  // biome-ignore lint/correctness/useExhaustiveDependencies: handle must outlive the caller options object
  const checkout = useMemo(
    () =>
      createCheckout({
        ...options,
        createSession: (context) => latest.current.createSession(context),
        ...(options.getStatus === undefined
          ? {}
          : {
              getStatus: (context: StatusContext) => {
                const read = latest.current.getStatus;
                if (read === undefined) {
                  return Promise.reject(new Error('getStatus was removed after mount'));
                }
                return read(context);
              },
            }),
        onPaymentIndicated: (event) => latest.current.onPaymentIndicated?.(event),
        onDegraded: (event) => latest.current.onDegraded?.(event),
        onError: (error) => latest.current.onError?.(error),
      }),
    [options.provider],
  );

  const state = useSyncExternalStore(
    useCallback((onChange: () => void) => checkout.subscribe(onChange), [checkout]),
    () => checkout.getState(),
    () => checkout.getState(),
  );

  const containerRef = useCallback(
    (node: HTMLElement | null) => {
      if (node === null) checkout.unmount();
      else checkout.mount(node);
    },
    [checkout],
  );

  useEffect(() => {
    void checkout.start();
    return () => {
      checkout.unmount();
    };
  }, [checkout]);

  return { state, checkout, containerRef };
}

export interface PixCheckoutProps extends CheckoutOptions {
  readonly className?: string;
}

export function PixCheckout({ className, ...options }: PixCheckoutProps): ReactElement {
  const { containerRef } = usePixCheckout(options);
  return createElement('div', {
    ref: containerRef,
    ...(className === undefined ? {} : { className }),
  });
}

export type { CheckoutHandle, CheckoutOptions, CheckoutState } from '@abcheckout/core';
