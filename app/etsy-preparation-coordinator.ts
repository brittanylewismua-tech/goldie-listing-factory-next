/** One paid request per draft in flight; independent baseline promises per product batch. */
export function etsyPreparationCoordinator<Baseline, Result>() {
  const requests = new Map<string, Map<string, Promise<Result>>>();
  const baselines = new Map<string, Promise<Baseline>>();
  return {
    pending(scope: string) { return Boolean(requests.get(scope)?.size); },
    run(scope: string, draftId: string, work: () => Promise<Result>): Promise<Result> {
      let group = requests.get(scope);
      if (!group) { group = new Map(); requests.set(scope, group); }
      const existing = group.get(draftId);
      if (existing) return existing;
      // Defer work until the promise is registered, including synchronous re-entry.
      const promise = Promise.resolve().then(work).finally(() => {
        group!.delete(draftId);
        if (!group!.size) requests.delete(scope);
      });
      group.set(draftId, promise);
      return promise;
    },
    baseline(scope: string, establish: () => Promise<Baseline>): Promise<Baseline> {
      const existing = baselines.get(scope);
      if (existing) return existing;
      const promise = Promise.resolve().then(establish).catch(error => {
        if (baselines.get(scope) === promise) baselines.delete(scope);
        throw error;
      });
      baselines.set(scope, promise);
      return promise;
    },
  };
}
