/** Keep authentication return destinations on this site after URL normalization. */
export function safeReturnPath(value:string|undefined|null,fallback='/listing-factory'):string{
 if(!value?.startsWith('/')||value.startsWith('//'))return fallback;
 try{
  const url=new URL(value,'https://goldie.invalid');
  if(url.origin!=='https://goldie.invalid')return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
 }catch{return fallback}
}
