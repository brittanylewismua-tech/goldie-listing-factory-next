export async function runBounded<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>, onComplete?: (result: R) => void | Promise<void>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Concurrency limit must be a positive integer.");
  let nextIndex = 0;
  const results: R[] = new Array(items.length);
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await task(items[index]);
      results[index] = result;
      /* D881 · Optional by contract now. It was required, invoked unguarded, and
         one caller in seven omitted it - the finished-cost approval - so that
         gate threw on every press and no seller could ever release it. */
      if (onComplete) await onComplete(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
