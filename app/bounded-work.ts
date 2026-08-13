export async function runBounded<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>, onComplete: (result: R) => void | Promise<void>) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Concurrency limit must be a positive integer.");
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await task(items[index]);
      await onComplete(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}
