const VISION_ENDPOINT = "https://fal.run/openrouter/router/vision";
export const MAX_VISION_OUTPUT_TOKENS = 8192;

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
  // Provider-reported cost is only known after a response, not a reservation.
  // Never log artwork, prompts, tokens/credentials, user identities or output.
  if (response.ok) {
    try {
      const payload = await response.clone().json() as { usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number } };
      const usage = payload.usage;
      if (usage && Number.isFinite(usage.cost) && Number(usage.cost) >= 0) {
        console.info(JSON.stringify({ event: "paid_ai_usage", provider: "fal", model: "google/gemini-2.5-flash",
          cost_usd: usage.cost,
          input_tokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
          output_tokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null }));
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
