// Short-lived coordination and result reuse, not a monetary spending cap.
// Only hashes and provider responses are stored; never input images or prompts.
export const VISION_CACHE_SCHEMA = `CREATE TABLE IF NOT EXISTS ai_vision_requests (
  request_key TEXT PRIMARY KEY NOT NULL,
  lease_id TEXT NOT NULL,
  response_json TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_vision_requests_expiry ON ai_vision_requests(expires_at);`;
export const CLAIM_VISION_REQUEST = `INSERT INTO ai_vision_requests(request_key,lease_id,expires_at)
VALUES(?,?,?) ON CONFLICT(request_key) DO UPDATE SET lease_id=excluded.lease_id,
response_json=NULL,expires_at=excluded.expires_at WHERE ai_vision_requests.expires_at<=?`;
const LEASE_MS=180_000, RESULT_MS=86_400_000, WAIT_MS=40_000;
type Row={lease_id:string;response_json:string|null;expires_at:number};
type Options={now?:()=>number;sleep?:(ms:number)=>Promise<void>};

export async function visionRequestKey(owner:string,input:string,body:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(["vision-v1",owner,input,body])));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}

/** Concurrent duplicates wait for the same result. A crashed worker's lease
 * expires so a customer is not blocked permanently. The lease is deliberately
 * longer than the provider timeout; it cannot guarantee provider exactly-once
 * billing after an ambiguous failure. Cache/storage failure preserves the
 * existing request path rather than taking AI offline during a launch. */
export function cachedVisionFetch(owner:string,db:D1Database,provider:(input:string,init:RequestInit)=>Promise<Response>,options:Options={}){
  const now=options.now||Date.now;
  const sleep=options.sleep||((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  return async(input:string,init:RequestInit):Promise<Response>=>{
    if(typeof init.body!=="string")return provider(input,init);
    const key=await visionRequestKey(owner,input,init.body),lease=crypto.randomUUID(),started=now();
    let claimed=false;
    try{
      // Expire only this disposable result cache, in bounded batches.
      await db.prepare("DELETE FROM ai_vision_requests WHERE request_key IN (SELECT request_key FROM ai_vision_requests WHERE expires_at<=? LIMIT 100)").bind(started).run();
      while(true){
        const claim=await db.prepare(CLAIM_VISION_REQUEST).bind(key,lease,now()+LEASE_MS,now()).run();
        if(Number(claim.meta.changes)>0){claimed=true;break;}
        const row=await db.prepare("SELECT lease_id,response_json,expires_at FROM ai_vision_requests WHERE request_key=?").bind(key).first<Row>();
        if(row?.response_json&&row.expires_at>now())return new Response(row.response_json,{headers:{"Content-Type":"application/json","X-Goldie-AI-Reused":"true"}});
        if(now()-started>=WAIT_MS)return new Response(JSON.stringify({detail:"This design is still being prepared. Please try again in a moment."}),{status:503,headers:{"Content-Type":"application/json","Retry-After":"5"}});
        await sleep(1000);
      }
    }catch{
      console.warn(JSON.stringify({event:"ai_result_cache_unavailable"}));
      return provider(input,init);
    }
    try{
      const signal=init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(90_000)]):AbortSignal.timeout(90_000);
      const response=await provider(input,{...init,signal});
      if(response.ok){
        let text="";try{text=await response.clone().text();}catch{/* Do not discard a paid response for cache failure. */}
        // Only replay well-formed provider results, never an HTML error page.
        let valid=false;try{
          const output=JSON.parse(text).output;
          const match=typeof output==="string"?output.match(/\{[\s\S]*\}/):null;
          const details=match?JSON.parse(match[0]):null;
          valid=typeof details?.category==="string"&&Boolean(details.category.trim());
        }catch{/* not cacheable */}
        if(valid&&text.length<=262144){
          try{await db.prepare("UPDATE ai_vision_requests SET response_json=?,expires_at=? WHERE request_key=? AND lease_id=?").bind(text,now()+RESULT_MS,key,lease).run();claimed=false;}catch{/* Return the successful response even if its cache write fails. */}
        }
      }
      return response;
    }finally{
      if(claimed)try{await db.prepare("DELETE FROM ai_vision_requests WHERE request_key=? AND lease_id=?").bind(key,lease).run();}catch{/* Lease expiry allows recovery. */}
    }
  };
}
