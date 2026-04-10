export type PollerOptions = {
  times: number;
  intervalMs: number;
  signal?: AbortSignal;
  shouldStop?: (index: number) => boolean;
};

export async function runPoller<T>(
  options: PollerOptions,
  runOnce: (index: number) => Promise<T | null>,
): Promise<T | null> {
  for (let i = 0; i < options.times; i++) {
    if (options.signal?.aborted || options.shouldStop?.(i)) return null;
    const found = await runOnce(i);
    if (found !== null) return found;
    if (i < options.times - 1) await sleep(options.intervalMs, options.signal);
  }
  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
  if (signal.aborted) return Promise.resolve();
  const activeSignal = signal;
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    const onAbort = () => done();

    function done() {
      clearTimeout(timer);
      activeSignal.removeEventListener("abort", onAbort);
      resolve();
    }

    activeSignal.addEventListener("abort", onAbort, { once: true });
  });
}
