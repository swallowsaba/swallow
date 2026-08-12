/**
 * Limit how many async tasks run at once. Returns a `run` function that queues
 * tasks and resolves/rejects with their result, never exceeding `concurrency`
 * in flight. Used to cap parallel RAW decodes.
 */
export function createLimiter(concurrency: number): <T>(task: () => Promise<T>) => Promise<T> {
  const limit = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= limit) return;
    const job = queue.shift();
    if (!job) return;
    active += 1;
    job();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
  };
}
