import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { etsyConnection, etsyFetch } from "../client";
import { cachedJson, TAXONOMY_TTL_SECONDS } from "../../static-cache";
import { drinkwareCategoryScore } from "@/app/etsy-category-score";

type TaxonomyNode={id:number;name:string;children?:TaxonomyNode[]};
type PossibleValue={value_id:number;name:string};
type Property={property_id:number;display_name?:string;name?:string;is_required?:boolean;is_multivalued?:boolean;max_values_allowed?:number;possible_values?:PossibleValue[]};
type Requested={category?:string;attributes?:Record<string,string>;optional?:Record<string,string>;taxonomyId?:number;includeCategories?:boolean;product?:{blueprintTitle?:string;brand?:string;model?:string}};
const words=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(word=>word.length>2));
function flatten(nodes:TaxonomyNode[],parents:string[]=[]):Array<{id:number;name:string;path:string;leaf:boolean}>{return nodes.flatMap(node=>{const path=[...parents,node.name];return [{id:node.id,name:node.name,path:path.join(" › "),leaf:!node.children?.length},...flatten(node.children||[],path)]})}
function score(left:string,right:string){const target=words(left),candidate=words(right);return [...candidate].filter(word=>target.has(word)).length*10+(left.toLowerCase()===right.toLowerCase()?100:0)}
function productCategoryScore(product:Requested["product"],path:string){
  const facts=`${product?.blueprintTitle||""} ${product?.brand||""} ${product?.model||""}`.toLowerCase(),candidate=path.toLowerCase(),leaf=candidate.split("›").at(-1)?.trim()||candidate;
  const childProduct=/\b(baby|infant|toddler|youth|boys?|girls?|kids?|children)\b/.test(facts),childCategory=/\b(baby|babies|infant|toddler|youth|boys?|girls?|kids?|children)\b/.test(candidate),adultCategory=/\b(gender[- ]neutral adult|unisex|adult)\b/.test(candidate),audienceScore=childProduct?(childCategory?1500:-7000):(childCategory?-10000:adultCategory?1000:0);
  if(/poster|art print|canvas/.test(facts))return candidate.includes("art & collectibles › prints ›")?5000:candidate.includes("wall")?800:-5000;
  if(/t-?shirt|\btee\b|garment-dyed/.test(facts)){
    const exactLeaf=/\b(t-?shirts?|tees?)\b/.test(leaf),wrongGarment=/dress shirts?|button[- ]downs?|tank tops?|crop tops?|sweatshirts?|hoodies?/.test(leaf);
    if(!exactLeaf||wrongGarment)return -10000;
    return 7000+audienceScore;
  }
  if(/sweatshirt|crewneck|hoodie/.test(facts)){
    const wantsHoodie=/hoodie/.test(facts),exactLeaf=wantsHoodie?/hoodies?/.test(leaf):/sweatshirts?|crewnecks?/.test(leaf),wrongGarment=/t-?shirts?|tees?|dress shirts?|button[- ]downs?/.test(leaf);
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

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to load Etsy listing options."},{status:401});
  try{
    const body=await request.json() as Requested,connection=await etsyConnection(user.userId),categories=await cachedJson("etsy-taxonomy","/nodes",TAXONOMY_TTL_SECONDS,async()=>{
      /* D656 · The whole tree came down on every call - once per design - and
         was flattened again each time before any design could be prepared. It
         is the same tree for every Etsy seller, so the FLATTENED form is what
         gets cached: the download and the walk both stop repeating. */
      const tree=await etsyFetch<{results?:TaxonomyNode[]}>("/seller-taxonomy/nodes",connection.token);
      return flatten(tree.results||[]).filter(node=>node.leaf);
    }),selected=body.taxonomyId?categories.find(node=>node.id===body.taxonomyId):categories.map(node=>{const productScore=productCategoryScore(body.product,node.path),aiScore=score(body.category||"",node.name)+score(body.category||"",node.path);return {...node,score:productScore+(productScore===0?aiScore:0)}}).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path))[0];
    if(!selected)return NextResponse.json({error:"Etsy did not return a matching category."},{status:404});
    const payload=await cachedJson("etsy-taxonomy",`/nodes/${selected.id}/properties`,TAXONOMY_TTL_SECONDS,()=>etsyFetch<{results?:Property[]}>(`/seller-taxonomy/nodes/${selected.id}/properties`,connection.token)),requested={...(body.attributes||{}),...(body.optional||{})},entries=Object.entries(requested);
    const properties=(payload.results||[]).filter(property=>property.is_required||property.possible_values?.length).map(property=>{const label=property.display_name||property.name||`Property ${property.property_id}`,requestedValue=entries.map(([key,value])=>({key,value,score:score(key,label)})).sort((a,b)=>b.score-a.score)[0],suggested=requestedValue?.score>0?requestedValue.value:"",choice=(property.possible_values||[]).map(value=>({...value,score:score(suggested,value.name)})).sort((a,b)=>b.score-a.score)[0];return {propertyId:property.property_id,label,required:Boolean(property.is_required),multiple:Boolean(property.is_multivalued),maxValues:Number(property.max_values_allowed||1),possibleValues:property.possible_values||[],valueId:choice?.score>0?choice.value_id:null,value:choice?.score>0?choice.name:suggested}});
    /* D658 · D656 stopped the taxonomy being FETCHED per design, but the route
       still serialised the whole flattened category list back to the browser
       every time - 262KB measured, per design, into a single piece of client
       state that every design overwrites with the identical array. Ten designs
       shipped 2.6MB and parsed it ten times to end up where design one already
       was. Sent when the browser says it does not have them yet. */
    return NextResponse.json({...(body.includeCategories?{categories:categories.map(({id,path})=>({id,path}))}:{}),selected:{id:selected.id,path:selected.path},properties});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Etsy listing options could not be loaded."},{status:500})}
}
