const PRINTIFY_API = "https://api.printify.com/v1";

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
}): Promise<T> {
  const waits = [2000, 4000, 7000, 10000, 15000, 20000];
  const fetcher = options.fetcher ?? fetch;
  const sleeper = options.sleeper ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(`${PRINTIFY_API}${options.path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.token}`, "User-Agent": "Goldie-Listing-Factory", "Content-Type": "application/json" },
        body: typeof options.body === "function" ? options.body() : options.body,
      });
    } catch {
      if (attempt < waits.length) { await options.onRetry?.(attempt + 1, 0, "Network interruption"); await sleeper(waits[attempt]); continue; }
      throw new Error("The connection to Printify was interrupted after Goldie retried automatically.");
    }
    if (response.ok) return response.json() as Promise<T>;
    const detail = await response.text().catch(() => "");
    const retryable = isImageNotReady(response.status, detail) || response.status === 429 || response.status >= 500;
    if (retryable && attempt < waits.length) {
      await options.onRetry?.(attempt + 1, response.status, detail);
      if (isImageNotReady(response.status, detail)) await options.onImageNotReady?.(attempt + 1, detail);
      const requestedWait = Number(response.headers.get("retry-after"));
      await sleeper(Number.isFinite(requestedWait) && requestedWait > 0 ? Math.min(requestedWait * 1000, 20000) : waits[attempt]);
      continue;
    }
    if (isImageNotReady(response.status, detail)) throw new Error("Printify did not finish registering this image within one minute. Retry this design when the batch finishes.");
    if (response.status === 429) throw new Error("Printify is taking longer than expected. Retry this design when the batch finishes.");
    if (response.status >= 500) throw new Error("Printify remained temporarily unavailable after Goldie retried automatically.");
    if (response.status === 401 || response.status === 403) throw new Error(`Printify rejected the saved connection (HTTP ${response.status}). Reconnect with a new token that has all scopes enabled.`);
    throw new Error(`Printify returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  throw new Error("Printify could not create this draft.");
}
