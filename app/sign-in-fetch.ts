/** Bound only email-link requests; never change session refresh or OAuth traffic. */
export function createSignInFetch(fetcher:typeof fetch=fetch,timeoutMs=30000):typeof fetch{
 return (input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(new URL(url).pathname!=='/auth/v1/otp')return fetcher(input,init);
  const original=init?.signal||(input instanceof Request?input.signal:undefined);
  return fetcher(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(original?[original]:[])])});
 };
}
