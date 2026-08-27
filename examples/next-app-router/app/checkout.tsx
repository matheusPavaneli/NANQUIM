'use client';

import { PixCheckout } from '@abcheckout/react';
import { abacatePay } from '@abcheckout/provider-abacatepay';
import { useMemo } from 'react';

export function Checkout() {
  const provider = useMemo(() => abacatePay(), []);

  return (
    <PixCheckout
      provider={provider}
      locale="pt-BR"
      charge={{ amount: 12_990, currency: 'BRL' }}
      createSession={({ signal, idempotencyKey }) =>
        fetch('/api/checkout', {
          method: 'POST',
          signal,
          headers: { 'idempotency-key': idempotencyKey },
        }).then((response) => {
          if (!response.ok) throw new Error(`createSession: ${response.status}`);
          return response.json();
        })
      }
      getStatus={({ signal, session }) =>
        fetch(`/api/checkout/${session.sessionId}/status`, { signal }).then((response) => {
          if (!response.ok) throw new Error(`getStatus: ${response.status}`);
          return response.json();
        })
      }
      onPaymentIndicated={({ sessionId }) => {
        void fetch(`/api/orders/confirm?session=${sessionId}`, { method: 'POST' });
      }}
    />
  );
}
