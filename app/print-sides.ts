export type PrintPlaceholder={position?:string|null;populated?:boolean};
export type SideInput=string|PrintPlaceholder|null|undefined;

const LABEL_POSITION=/neck|label|collar|inner|tag/i;
const normalise=(value:unknown)=>String(value??"").trim();

export function isLabelPosition(position?:string|null){return LABEL_POSITION.test(normalise(position))}

function sideRank(position:string){
  if(/front|chest/i.test(position))return 0;
  if(/wrap|around/i.test(position))return 1;
  if(/back/i.test(position))return 2;
  if(/sleeve|arm|cuff/i.test(position))return 3;
  return 4;
}

export function orderedPrintSides(inputs:SideInput[]|null|undefined){
  const sides=new Map<string,{position:string;populated:boolean}>();
  for(const input of inputs||[]){
    const position=normalise(typeof input==="string"?input:input?.position);
    if(!position||isLabelPosition(position))continue;
    const populated=typeof input==="string"?true:input?.populated!==false;
    const key=position.toLocaleLowerCase();
    const current=sides.get(key);
    if(current)current.populated=current.populated||populated;
    else sides.set(key,{position,populated});
  }
  const compare=(left:{position:string},right:{position:string})=>sideRank(left.position)-sideRank(right.position)||left.position.localeCompare(right.position);
  return [...sides.values()].sort((left,right)=>Number(right.populated)-Number(left.populated)||compare(left,right)).map(side=>side.position);
}

export function primaryPrintSide(inputs:SideInput[]|null|undefined){return orderedPrintSides(inputs)[0]||null}

export function printSideLabel(position?:string|null){
  const value=normalise(position);
  if(!value)return "Print area";
  if(/left.*(?:sleeve|arm|cuff)|(?:sleeve|arm|cuff).*left/i.test(value))return "Left sleeve";
  if(/right.*(?:sleeve|arm|cuff)|(?:sleeve|arm|cuff).*right/i.test(value))return "Right sleeve";
  if(/wrap|around/i.test(value))return "Wrap";
  if(/front|chest/i.test(value))return "Front";
  if(/back/i.test(value))return "Back";
  const words=value.replace(/[_-]+/g," ").replace(/\s+/g," ").trim().toLocaleLowerCase();
  return words.charAt(0).toLocaleUpperCase()+words.slice(1);
}

export function productNoun(...parts:Array<string|null|undefined>){
  const value=parts.filter(Boolean).join(" ").toLocaleLowerCase();
  if(/\b(?:mug|cup)s?\b/.test(value))return "mug";
  if(/\b(?:phone\s*)?cases?\b/.test(value))return "case";
  if(/\b(?:tote|bag)s?\b/.test(value))return "bag";
  if(/\b(?:poster|canvas|paper|wall\s+art|art\s+print)s?\b/.test(value))return "print";
  if(/\bmouse\s*pads?\b/.test(value))return "mousepad";
  if(/\b(?:shirt|tee|t-?shirt|hoodie|sweatshirt|sweater|crewneck|tank|garment)s?\b/.test(value))return "garment";
  return "item";
}

export function colorNoun(...parts:Array<string|null|undefined>){return `${productNoun(...parts)} color`}
