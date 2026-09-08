function providerReason(raw:string){
  const text=String(raw||"").trim();
  if(!text)return"";
  try{
    const parsed=JSON.parse(text) as {message?:unknown;error?:unknown;errors?:{reason?:unknown}};
    const reason=parsed.errors?.reason??parsed.message??parsed.error;
    return typeof reason==="string"?reason.replace(/[<>]/g,"").trim().slice(0,180):"";
  }catch{return""}
}

export function printifyDraftChangeError(status:number,raw=""){
  if(status===404)return"This Printify draft no longer exists. Remove this saved batch from Batch History and start a new batch from the saved product.";
  if(status===401||status===403)return"Printify would not allow this draft to be changed. Reconnect Printify and try again.";
  if(status===429)return"Printify is busy right now. Wait a moment and try this change again.";
  const reason=providerReason(raw);
  if(status===400)return reason?`Printify could not save this change: ${reason}`:"Printify could not save this change. Review the product choices and try again.";
  return status>=500?"Printify could not save this change because its service is temporarily unavailable. Try again in a moment.":"Printify could not save this change. Try again.";
}
