/*
  "sales" is Shop Map asking for `transactions_r` against ONE saved
  connection. It is deliberately its own intent, because unlike the other two
  it must not change which shop the Listing Factory publishes to.
*/
export type EtsyConnectIntent="connect"|"add"|"sales";

export function etsyOauthState(intent:EtsyConnectIntent,nonce:string){
  if(!nonce)return "";
  return `${intent}_${nonce}`;
}

export function etsyOauthIntent(state:string):EtsyConnectIntent{
  if(state.startsWith("add_"))return "add";
  if(state.startsWith("sales_"))return "sales";
  return "connect";
}

/* The authorised Etsy account owns a different shop than the one this
   authorisation was started for. Both saved connections are left alone. */
export function wrongEtsyAccountMessage(intended:string){
  return `That Etsy account does not own ${intended}. Nothing was changed. Sign out of Etsy, sign into the account that owns ${intended}, then try again.`;
}

export function sameEtsyShopMessage(shopName:string){
  return `${shopName} is already connected. Etsy reused the account currently signed in. Sign out of Etsy, sign into the account that owns the other shop, then choose Connect that shop.`;
}
