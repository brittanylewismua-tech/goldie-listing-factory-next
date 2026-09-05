/** Never shorten a provider's cooldown. Accept both HTTP Retry-After forms. */
export class RetryDraftLater extends Error {
  readonly milliseconds:number;
  constructor(milliseconds:number){super("Waiting for the provider's retry window.");this.milliseconds=milliseconds;this.name="RetryDraftLater";}
}
/** Long waits belong to the durable scheduler, not a live Worker invocation. */
export async function waitForDraftRetry(milliseconds:number){
  if(milliseconds>30000)throw new RetryDraftLater(milliseconds);
  await new Promise(resolve=>setTimeout(resolve,milliseconds));
}
export function retryAfterMilliseconds(value: string | null, fallback: number, now = Date.now()): number {
  if (!value?.trim()) return fallback;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1000;
    return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : fallback;
  }
  const date = Date.parse(trimmed);
  return Number.isFinite(date) && date > now ? date - now : fallback;
}
