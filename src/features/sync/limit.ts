/**
 * Minimal FIFO concurrency limiter. Wrap each unit of work: `limit(() => work())`.
 * At most `concurrency` wrapped functions run at the same time; the rest wait in order.
 */
export function createLimiter(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const pump = (): void => {
    while (active < concurrency && queue.length > 0) {
      const start = queue.shift();
      start?.();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active++;
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      });
      pump();
    });
}
