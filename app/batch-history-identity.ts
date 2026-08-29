export type BundleIdentityState={
  activeBundle?:{name?:string};
  activeRecipe?:{name?:string};
  bundleIndex?:number;
  bundleRecipes?:unknown[];
};

export function bundleHistoryIdentity(state:BundleIdentityState){
  const total=(state.bundleRecipes||[]).length;
  if(total<2)return null;
  const bundleName=String(state.activeBundle?.name||"").trim()||`${total}-product bundle`;
  const productName=String(state.activeRecipe?.name||"").trim();
  const index=Number(state.bundleIndex);
  const position=Number.isFinite(index)&&index>=0&&index<total?`${index+1} of ${total}`:`1 of ${total}`;
  return {displayName:bundleName,productTitle:productName?`${productName} · product ${position}`:`${total} products`};
}
