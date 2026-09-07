/** Preserve the initiating app host without allowing arbitrary OAuth redirects. */
export function oauthReturnOrigin(candidate:string,configured:string){
 const fallback=new URL(configured).origin;
 try{const url=new URL(candidate),base=new URL(fallback);
  if(url.origin===fallback)return fallback;
  if(url.protocol==='https:'&&['thegoldiesuite.com','www.thegoldiesuite.com'].includes(base.hostname)&&['thegoldiesuite.com','www.thegoldiesuite.com'].includes(url.hostname)&&!url.port)return url.origin;
 }catch{}
 return fallback;
}
