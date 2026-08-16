import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { etsyConnection, etsyFetch } from "../client";

type TaxonomyNode={id:number;name:string;children?:TaxonomyNode[]};
type PossibleValue={value_id:number;name:string};
type Property={property_id:number;display_name?:string;name?:string;is_required?:boolean;is_multivalued?:boolean;max_values_allowed?:number;possible_values?:PossibleValue[]};
type Requested={category?:string;attributes?:Record<string,string>;optional?:Record<string,string>;taxonomyId?:number};
const words=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(word=>word.length>2));
function flatten(nodes:TaxonomyNode[],parents:string[]=[]):Array<{id:number;name:string;path:string;leaf:boolean}>{return nodes.flatMap(node=>{const path=[...parents,node.name];return [{id:node.id,name:node.name,path:path.join(" › "),leaf:!node.children?.length},...flatten(node.children||[],path)]})}
function score(left:string,right:string){const target=words(left),candidate=words(right);return [...candidate].filter(word=>target.has(word)).length*10+(left.toLowerCase()===right.toLowerCase()?100:0)}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to load Etsy listing options."},{status:401});
  try{
    const body=await request.json() as Requested,connection=await etsyConnection(user.userId),tree=await etsyFetch<{results?:TaxonomyNode[]}>("/seller-taxonomy/nodes",connection.token),categories=flatten(tree.results||[]).filter(node=>node.leaf),selected=body.taxonomyId?categories.find(node=>node.id===body.taxonomyId):categories.map(node=>({...node,score:score(body.category||"",node.name)+score(body.category||"",node.path)})).sort((a,b)=>b.score-a.score)[0];
    if(!selected)return NextResponse.json({error:"Etsy did not return a matching category."},{status:404});
    const payload=await etsyFetch<{results?:Property[]}>(`/seller-taxonomy/nodes/${selected.id}/properties`,connection.token),requested={...(body.attributes||{}),...(body.optional||{})},entries=Object.entries(requested);
    const properties=(payload.results||[]).filter(property=>property.is_required||property.possible_values?.length).map(property=>{const label=property.display_name||property.name||`Property ${property.property_id}`,requestedValue=entries.map(([key,value])=>({key,value,score:score(key,label)})).sort((a,b)=>b.score-a.score)[0],suggested=requestedValue?.score>0?requestedValue.value:"",choice=(property.possible_values||[]).map(value=>({...value,score:score(suggested,value.name)})).sort((a,b)=>b.score-a.score)[0];return {propertyId:property.property_id,label,required:Boolean(property.is_required),multiple:Boolean(property.is_multivalued),maxValues:Number(property.max_values_allowed||1),possibleValues:property.possible_values||[],valueId:choice?.score>0?choice.value_id:null,value:choice?.score>0?choice.name:suggested}});
    return NextResponse.json({categories:categories.map(({id,path})=>({id,path})),selected:{id:selected.id,path:selected.path},properties});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Etsy listing options could not be loaded."},{status:500})}
}
