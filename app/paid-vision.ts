const VISION_ENDPOINT = "https://fal.run/openrouter/router/vision";
export const MAX_VISION_OUTPUT_TOKENS = 8192;

/*
  THE RECORDER IS INJECTED, NOT IMPORTED.

  This module is loaded directly by the test runner, so it cannot reach for a
  path alias or for cloudflare:workers. The worker wires the real store in at
  startup; if nothing wires it, usage is dropped loudly rather than silently,
  because an unmetered paid call is the exact failure this was built to end.
*/
export type FalUsageEntry =
  { model: string; cost: number; inputTokens: number; outputTokens: number };
let falUsageRecorder: ((entry: FalUsageEntry) => Promise<void>) | null = null;
export function setFalUsageRecorder(
  recorder: ((entry: FalUsageEntry) => Promise<void>) | undefined,
) {
  falUsageRecorder = recorder ?? null;
}

/** Bound paid output/search work; retain the original response for callers.
 * This is per-call protection and telemetry, NOT a monthly spending cap.
 */
export async function boundedVisionFetch(input: string, init: RequestInit, fetcher: typeof fetch = fetch, wait: (ms:number,signal:AbortSignal)=>Promise<void> = waitForRetry): Promise<Response> {
  if (input !== VISION_ENDPOINT || typeof init.body !== "string") throw new Error("Unsupported vision request.");
  const body = JSON.parse(init.body);
  const signal=AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(90000)]);
  const requestBody=JSON.stringify({
    ...body,
    max_tokens: MAX_VISION_OUTPUT_TOKENS,
    enable_web_search: false,
  });
  let response:Response;
  for(let attempt=0;;attempt++){
    signal.throwIfAborted();
    response=await fetcher(input,{...init,body:requestBody,signal});
    // Retry only a definite capacity rejection, never an ambiguous paid failure.
    if(response.status!==429||attempt>=2)break;
    const header=response.headers.get("Retry-After");
    const parsed=header?(Number.isFinite(Number(header))?Number(header)*1000:Date.parse(header)-Date.now()):1000*(attempt+1);
    const delay=Math.max(0,Number.isFinite(parsed)?parsed:1000*(attempt+1));
    if(delay>10000)break;
    await response.body?.cancel();
    await wait(delay,signal);
  }
  /*
    FAL'S OWN USAGE BLOCK, STORED RATHER THAN LOGGED.

    This previously went to console.info and nowhere else, which meant the
    busiest paid feature in the product had no spend that could be queried,
    attributed to a member, or capped. A number you cannot query is a number
    you do not have.

    Storage failure never turns a completed paid response into a retry: the
    call has already been billed, and losing the telemetry is cheaper than
    paying for it twice.
  */
  if (response.ok) {
    try {
      const payload = await response.clone().json() as { usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number } };
      const usage = payload.usage;
      if (usage && Number.isFinite(usage.cost) && Number(usage.cost) >= 0) {
        if (!falUsageRecorder)
          console.error(JSON.stringify({ event: "fal_usage_recorder_not_wired" }));
        await falUsageRecorder?.({
          model: "google/gemini-2.5-flash",
          cost: Number(usage.cost),
          inputTokens: Number.isFinite(usage.prompt_tokens) ? Number(usage.prompt_tokens) : 0,
          outputTokens: Number.isFinite(usage.completion_tokens) ? Number(usage.completion_tokens) : 0,
        });
      }
    } catch { /* Telemetry must not turn a completed provider response into a retry. */ }
  }
  return response;
}

function waitForRetry(ms:number,signal:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    const timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},ms);
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    signal.addEventListener("abort",abort,{once:true});
  });
}
