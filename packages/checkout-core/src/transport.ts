export interface BackoffOptions {
  readonly base: number;
  readonly max: number;
  readonly factor?: number;
  readonly jitter?: number;
}

export function backoff(attempt: number, options: BackoffOptions, random = Math.random): number {
  const factor = options.factor ?? 1.8;
  const jitter = options.jitter ?? 0.3;
  const raw = Math.min(options.max, options.base * factor ** Math.max(0, attempt));
  return Math.round(raw * (1 - jitter * random()));
}

export interface Timers {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export interface PollerOptions {
  run(signal: AbortSignal): Promise<void>;
  shouldContinue(): boolean;
  interval: number;
  maxInterval: number;
  timeout: number;
  timers?: Timers;
  random?: () => number;
}

export interface Poller {
  start(): void;
  poke(): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

const defaultTimers: Timers = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms) as unknown as number,
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle);
  },
};

export function createPoller(options: PollerOptions): Poller {
  const timers = options.timers ?? defaultTimers;
  const random = options.random ?? Math.random;

  let handle: number | null = null;
  let controller: AbortController | null = null;
  let failures = 0;
  let paused = false;
  let stopped = false;
  let running = false;

  const clear = (): void => {
    if (handle !== null) {
      timers.clearTimeout(handle);
      handle = null;
    }
  };

  const schedule = (delay: number): void => {
    clear();
    if (stopped || paused) return;
    handle = timers.setTimeout(tick, delay);
  };

  function tick(): void {
    handle = null;
    if (stopped || paused || running) return;
    if (!options.shouldContinue()) {
      stop();
      return;
    }
    running = true;
    const local = new AbortController();
    controller = local;
    const timeoutHandle = timers.setTimeout(() => local.abort(), options.timeout);

    options
      .run(local.signal)
      .then(
        () => {
          failures = 0;
        },
        () => {
          failures += 1;
        },
      )
      .finally(() => {
        timers.clearTimeout(timeoutHandle);
        running = false;
        if (controller === local) controller = null;
        if (stopped) return;
        const delay =
          failures === 0
            ? options.interval
            : backoff(failures - 1, { base: options.interval, max: options.maxInterval }, random);
        schedule(delay);
      });
  }

  function stop(): void {
    stopped = true;
    clear();
    controller?.abort();
    controller = null;
  }

  return {
    start(): void {
      if (stopped || handle !== null || running) return;
      schedule(0);
    },
    poke(): void {
      if (stopped || running) return;
      failures = 0;
      schedule(0);
    },
    pause(): void {
      paused = true;
      clear();
    },
    resume(): void {
      if (stopped || !paused) return;
      paused = false;
      schedule(0);
    },
    stop,
  };
}
