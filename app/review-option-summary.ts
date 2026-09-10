type ReviewVariant={id?:number;title?:string;isEnabled:boolean};

export function reviewOptionSummary(isApparel:boolean,variants:ReviewVariant[],selectedIds:number[]=[]){
  const chosenIds=new Set(selectedIds);
  const chosen=variants.filter(variant=>variant.isEnabled&&(!chosenIds.size||variant.id===undefined||chosenIds.has(variant.id)));
  const count=selectedIds.length||chosen.length;
  if(!count)return "Choose product options";
  if(isApparel&&chosen.length===count){
    const axes=chosen.map(variant=>String(variant.title||"").split(/\s*\/\s*/).map(value=>value.trim()).filter(Boolean));
    if(axes.length&&axes.every(parts=>parts.length>=2)){
      const colors=new Set(axes.map(parts=>parts[0]));
      const sizes=new Set(axes.map(parts=>parts.at(-1)!));
      if(colors.size*sizes.size===count)return `${colors.size} ${colors.size===1?"color":"colors"} × ${sizes.size} ${sizes.size===1?"size":"sizes"}`;
    }
  }
  return `${count} product ${count===1?"option":"options"} selected`;
}
