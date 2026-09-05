export function drinkwareCategoryScore(productFacts:string,path:string):number|null{
  const facts=productFacts.toLowerCase(),candidate=path.toLowerCase(),leaf=candidate.split("›").at(-1)?.trim()||candidate;
  const fallback=/(drinkware|barware)/.test(leaf)?1200:-5000;
  if(/\bmug\b|\bcup\b/.test(facts)&&!/tumbler/.test(facts))return /\bmugs?\b/.test(leaf)?7000:fallback;
  if(/tumbler/.test(facts))return /\btumblers?\b/.test(leaf)?7000:fallback;
  if(/wine glass/.test(facts))return /wine glasses?/.test(leaf)?7000:fallback;
  if(/water bottle/.test(facts))return /water bottles?/.test(leaf)?7000:fallback;
  return null;
}

const words=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(word=>word.length>2));
function score(left:string,right:string){const target=words(left),candidate=words(right);return [...candidate].filter(word=>target.has(word)).length*10+(left.toLowerCase()===right.toLowerCase()?100:0)}
export function productCategoryScore(product:{blueprintTitle?:string;brand?:string;model?:string}|undefined,path:string){
  const facts=`${product?.blueprintTitle||""} ${product?.brand||""} ${product?.model||""}`.toLowerCase(),candidate=path.toLowerCase(),leaf=candidate.split("›").at(-1)?.trim()||candidate;
  const childProduct=/\b(baby|infant|toddler|youth|boys?|girls?|kids?|children)\b/.test(facts),childCategory=/\b(baby|babies|infant|toddler|youth|boys?|girls?|kids?|children)\b/.test(candidate),adultCategory=/\b(gender[- ]neutral adult|unisex|adult)\b/.test(candidate),audienceScore=childProduct?(childCategory?1500:-7000):(childCategory?-10000:adultCategory?1000:0);
  if(/poster|art print|canvas/.test(facts))return candidate.includes("art & collectibles › prints ›")?5000:candidate.includes("wall")?800:-5000;
  if(/\b(t[ -]?shirts?|tees?)\b/.test(facts)){
    const exactLeaf=/\b(t-?shirts?|tees?)\b/.test(leaf),wrongGarment=/dress shirts?|button[- ]downs?|tank tops?|crop tops?|sweatshirts?|hoodies?/.test(leaf);
    if(!exactLeaf||wrongGarment)return -10000;
    return 7000+audienceScore;
  }
  if(/\b(sweatshirts?|crewnecks?|hoodies?|hooded)\b/.test(facts)){
    const wantsHoodie=/\b(hoodies?|hooded)\b/.test(facts),exactLeaf=wantsHoodie?/\bhoodies?\b/.test(leaf):/\b(sweatshirts?|crewnecks?)\b/.test(leaf),wrongGarment=/\b(t[ -]?shirts?|tees?|dress shirts?|button[- ]downs?)\b/.test(leaf);
    if(!exactLeaf||wrongGarment)return -10000;
    return 7000+audienceScore;
  }
  if(/tank top/.test(facts))return /tank tops?/.test(leaf)?7000+audienceScore:-10000;
  if(/onesie|bodysuit/.test(facts))return /bodysuits?|one-pieces?/.test(leaf)?7000+audienceScore:-10000;
  /* D935 - "mug" and "tumbler" used one broad family score. Every leaf in
     that family received the same 5000 points, so alphabetical path order sent
     a live 11 oz mug to Craft Supplies > Equipment > Tumblers and invented a
     required Craft type field. Prefer the exact physical product first; broad
     drinkware categories are only the fallback. */
  const drinkwareScore=drinkwareCategoryScore(facts,path);if(drinkwareScore!==null)return drinkwareScore;
  if(/tote/.test(facts))return candidate.includes("bags & purses")&&/totes?/.test(leaf)?5000:candidate.includes("bags & purses")?800:-5000;
  if(/backpack/.test(facts))return /backpacks?/.test(leaf)?6000:candidate.includes("bags & purses")?800:-5000;
  if(/bag/.test(facts))return candidate.includes("bags & purses")?1000:-3000;
  if(/notebook|journal/.test(facts))return /notebooks?|journals?/.test(leaf)?6000:candidate.includes("paper")?800:-5000;
  if(/sticker|decal/.test(facts))return /stickers?|decals?/.test(leaf)?6000:-5000;
  if(/phone case/.test(facts))return /phone cases?/.test(leaf)?6000:candidate.includes("electronics")?800:-5000;
  if(/pillow|cushion/.test(facts))return /pillows?|cushions?/.test(leaf)?6000:candidate.includes("home")?800:-5000;
  if(/blanket|throw/.test(facts))return /blankets?|throws?/.test(leaf)?6000:candidate.includes("home")?800:-5000;
  if(/hat|cap|beanie/.test(facts))return /(hats?|caps?|beanies?)/.test(leaf)?6000+audienceScore:-5000;
  if(/sock/.test(facts))return /socks?/.test(leaf)?6000+audienceScore:-5000;
  if(/ornament/.test(facts))return /ornaments?/.test(leaf)?6000:-5000;
  if(/candle/.test(facts))return /candles?/.test(leaf)?6000:-5000;
  if(/magnet/.test(facts))return /magnets?/.test(leaf)?6000:-5000;
  if(/mouse ?pad|desk ?mat/.test(facts))return /(mouse ?pads?|desk ?mats?)/.test(leaf)?6000:-5000;
  if(/puzzle/.test(facts))return /puzzles?/.test(leaf)?6000:-5000;
  return score(facts,path)*20;
}
