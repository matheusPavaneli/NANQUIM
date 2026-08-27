import { createMemorySeenStore, type SeenStore } from '@nanquim/server';

function createRedisSeenStore(url: string, token: string, ttlSeconds: number): SeenStore {
  const call = async (command: readonly string[]): Promise<unknown> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`seen store returned ${response.status}`);
    return (await response.json()) as unknown;
  };

  return {
    claim: async (id) => {
      const raw = await call(['SET', `webhook:${id}`, '1', 'NX', 'EX', String(ttlSeconds)]);
      const result = (raw as { result?: unknown }).result;
      return result !== null && result !== undefined;
    },
    release: async (id) => {
      await call(['DEL', `webhook:${id}`]);
    },
  };
}

export function resolveSeenStore(): SeenStore {
  const url = process.env.WEBHOOK_SEEN_REDIS_URL;
  const token = process.env.WEBHOOK_SEEN_REDIS_TOKEN;
  if (url !== undefined && token !== undefined) {
    return createRedisSeenStore(url, token, 60 * 60 * 24 * 7);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'WEBHOOK_SEEN_REDIS_URL and WEBHOOK_SEEN_REDIS_TOKEN are required in production: the in-memory store does not survive a cold start and is not shared between instances, so it cannot make a webhook idempotent',
    );
  }
  return createMemorySeenStore();
}
