export type CheckoutStatus = 'idle' | 'creating' | 'awaiting' | 'expired' | 'paid' | 'failed';

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'refused';

export type Locale = 'pt-BR' | 'en';

export type MessageCatalog = import('./i18n.ts').Messages;

export interface Session {
  readonly sessionId: string;
  readonly brCode: string;
  readonly brCodeBase64?: string;
  readonly amount: number;
  readonly currency: string;
  readonly expiresAt: number;
  readonly status: PaymentStatus;
}

export interface StatusReport {
  readonly status: PaymentStatus;
  readonly endToEndId?: string;
  readonly paidAt?: number;
  readonly providerCode?: string;
}

export type CheckoutErrorCode =
  | 'session_create_failed'
  | 'session_invalid'
  | 'status_unavailable'
  | 'provider_refused'
  | 'qr_unavailable'
  | 'unsupported_environment';

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  readonly providerCode: string | undefined;

  constructor(
    code: CheckoutErrorCode,
    message: string,
    options?: { cause?: unknown; providerCode?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CheckoutError';
    this.code = code;
    this.providerCode = options?.providerCode;
  }
}

export interface PaymentProvider {
  readonly id: string;
  normalizeSession(raw: unknown): Session;
  normalizeStatus(raw: unknown): StatusReport;
  subscribe?(session: Session, onReport: (report: StatusReport) => void): () => void;
}

export interface RequestContext {
  readonly signal: AbortSignal;
  readonly idempotencyKey: string;
}

export interface StatusContext extends RequestContext {
  readonly session: Session;
}

export interface CheckoutOptions {
  createSession(context: RequestContext): Promise<unknown>;
  getStatus?(context: StatusContext): Promise<unknown>;
  provider: PaymentProvider;
  locale?: Locale;
  messages?: MessageCatalog;
  charge?: { readonly amount: number; readonly currency: string };
  pollInterval?: number;
  degradeAfter?: number;
  onPaymentIndicated?(event: { sessionId: string; endToEndId?: string }): void;
  onDegraded?(event: { reason: 'no-shadow-dom' | 'qr-encode' | 'status-unavailable' }): void;
  onError?(error: CheckoutError): void;
  onStateChange?(state: CheckoutState): void;
}

export type CheckoutState =
  | { readonly status: 'idle' }
  | { readonly status: 'creating' }
  | {
      readonly status: 'awaiting';
      readonly session: Session;
      readonly lastCheckedAt: number | null;
      readonly failures: number;
      readonly checking: boolean;
    }
  | { readonly status: 'expired'; readonly session: Session; readonly expiredAt: number }
  | {
      readonly status: 'paid';
      readonly session: Session;
      readonly paidAt: number;
      readonly endToEndId?: string;
    }
  | { readonly status: 'failed'; readonly error: CheckoutError };

export interface CheckoutHandle {
  mount(target: Element | string): void;
  unmount(): void;
  start(): Promise<void>;
  refresh(): Promise<void>;
  getState(): CheckoutState;
  subscribe(listener: (state: CheckoutState) => void): () => void;
  destroy(): void;
}
