export function selectedPriceGroup<T extends {key:string}>(groups:T[],preferredKey:string){
  const found=groups.findIndex(group=>group.key===preferredKey);
  const index=found<0?0:found;
  return {group:groups[index],index};
}
