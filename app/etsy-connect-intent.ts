export type EtsyConnectIntent="connect"|"add";

export function etsyOauthState(intent:EtsyConnectIntent,nonce:string){
  if(!nonce)return "";
  return `${intent}_${nonce}`;
}

export function etsyOauthIntent(state:string):EtsyConnectIntent{
  return state.startsWith("add_")?"add":"connect";
}

export function sameEtsyShopMessage(shopName:string){
  return `${shopName} is already connected. Etsy reused the account currently signed in. Sign out of Etsy, sign into the account that owns the other shop, then choose Connect that shop.`;
}
