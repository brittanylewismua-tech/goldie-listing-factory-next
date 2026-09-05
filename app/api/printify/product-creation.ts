import { retryAfterMilliseconds } from "./retry-after.ts";
const PRINTIFY_API = "https://api.printify.com/v1";

/** A POST may have committed even when its response was lost. Never replay it. */
export class UncertainProductCreation extends Error {
  constructor() {
    super("Printify has not confirmed the result yet. This draft must be checked before another creation is attempted.");
    this.name = "UncertainProductCreation";
  }
}

export class RejectedProductCreation extends Error { constructor(message:string){ super(message); this.name="RejectedProductCreation"; } }

export function isImageNotReady(status: number, detail: string) {
  return status === 400 && (/Provided images do not exist/i.test(detail) || /["']?code["']?\s*:\s*8253/i.test(detail));
}

export async function createProductWithImageRetries<T>(options: {
  path: string;
  token: string;
  body: string | (() => string);
  fetcher?: typeof fetch;
  sleeper?: (milliseconds: number) => Promise<void>;
  onRetry?: (attempt: number, status: number, detail: string) => Promise<void>;
  onImageNotReady?: (attempt: number, detail: string) => Promise<void>;
  onBeforeCreate?:()=>Promise<void>;
  reconcile?: () => Promise<T | null>;
}): Promise<T> {
  async function reconcileOrStop(): Promise<T> {
    const existing=await options.reconcile?.().catch(()=>null);
    if(existing)return existing;
    throw new UncertainProductCreation();
  }
  /* D613 - the ladder existed for a genuine propagation race: Printify can
     briefly report 8253 while a valid upload settles. It is the wrong shape for a
     deterministic payload error.

     Measured: a stale inherited label image ID produced 8253 on all seven
     attempts, four runs in a row, 125 seconds each. Nothing about the seventh
     attempt was more likely to succeed than the first. Meanwhile Printify asks
     that failed requests stay under 5% of an integration's traffic, and we spent
     dozens of failures learning nothing.

     So: one controlled re-upload, then one more attempt. If the SAME image error
     comes back after the artwork has been replaced, the payload is wrong and no
     amount of waiting fixes it. Explicit rate-limit rejections can be retried;
     lost responses and server faults must be reconciled, not replayed. */
  const waits = [3000, 7000, 15000, 20000, 30000, 45000];
  const IMAGE_ERROR_LIMIT = 2;
  let imageErrors = 0;
  const fetcher = options.fetcher ?? fetch;
  const sleeper = options.sleeper ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    let response: Response;
    await options.onBeforeCreate?.();
    try {
      response = await fetcher(`${PRINTIFY_API}${options.path}`, {
        method: "POST",
        signal: AbortSignal.timeout(45000),
        headers: { Authorization: `Bearer ${options.token}`, "User-Agent": "Goldie-Listing-Factory", "Content-Type": "application/json" },
        body: typeof options.body === "function" ? options.body() : options.body,
      });
    } catch {
      return reconcileOrStop();
    }
    if (response.ok) {
      try { const result=await response.json() as T; const id=(result as {id?:unknown}|null)?.id; if(typeof id!=="string"||!id) return reconcileOrStop(); return result; }
      catch { return reconcileOrStop(); }
    }
    // A gateway/server error does not prove the upstream POST was rolled back.
    if (response.status >= 500) {
      await response.body?.cancel().catch(() => undefined);
      return reconcileOrStop();
    }
    const detail = await response.text().catch(() => "");
    if (isImageNotReady(response.status, detail)) imageErrors += 1;
    /* A repeated image error after the re-upload is a payload fault, not a race. */
    if (imageErrors >= IMAGE_ERROR_LIMIT) {
      throw new RejectedProductCreation("Printify rejected the images in this draft twice, including after Goldie re-uploaded the artwork. The request itself is wrong, so Goldie stopped instead of retrying. Nothing was created.");
    }
    const retryable = isImageNotReady(response.status, detail) || response.status === 429;
    if (retryable && attempt < waits.length) {
      await options.onRetry?.(attempt + 1, response.status, detail);
      if (isImageNotReady(response.status, detail)) await options.onImageNotReady?.(imageErrors, detail);
      await sleeper(retryAfterMilliseconds(response.headers.get("retry-after"), waits[attempt]));
      continue;
    }
    if (isImageNotReady(response.status, detail)) throw new RejectedProductCreation("Printify did not finish registering this image within one minute. Retry this design when the batch finishes.");
    if (response.status === 429) throw new RejectedProductCreation("Printify is taking longer than expected. Retry this design when the batch finishes.");
    if (response.status >= 500) throw new RejectedProductCreation("Printify remained temporarily unavailable after Goldie retried automatically.");
    if (response.status === 401 || response.status === 403) throw new RejectedProductCreation(`Printify rejected the saved connection (HTTP ${response.status}). Reconnect with a new token that has all scopes enabled.`);
    throw new RejectedProductCreation(`Printify returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  throw new RejectedProductCreation("Printify could not create this draft.");
}
