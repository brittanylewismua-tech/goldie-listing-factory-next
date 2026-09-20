import {NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {etsyConnection,etsyFetch} from '../client';
import {validProductionPartners,type EtsyProductionPartner} from '../production-partner';
import {getDb} from '@/db';
import {sellerPreferences} from '@/db/schema';

type SavedPreferences=Record<string,unknown>&{etsyProductionPartners?:Record<string,number>};
const readPreferences=(value?:string|null):SavedPreferences=>{try{return JSON.parse(value||'{}') as SavedPreferences}catch{return{}}};

export async function GET(){
 const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'Sign in to load Etsy production partners.'},{status:401});
 try{
  const connection=await etsyConnection(user.userId),payload=await etsyFetch<{results?:EtsyProductionPartner[]}>(`/shops/${connection.shopId}/production-partners`,connection.token),partners=validProductionPartners(payload);
  const [row]=await getDb().select().from(sellerPreferences).where(eq(sellerPreferences.userId,user.userId)).limit(1);
  const saved=Number(readPreferences(row?.pricingJson).etsyProductionPartners?.[String(connection.shopId)])||0,exact=partners.filter(partner=>partner.partner_name?.trim().toLowerCase()==='printify');
  const selectedId=partners.some(partner=>Number(partner.production_partner_id)===saved)?saved:exact.length===1?Number(exact[0].production_partner_id):partners.length===1?Number(partners[0].production_partner_id):0;
  return NextResponse.json({shopId:connection.shopId,partners:partners.map(partner=>({id:Number(partner.production_partner_id),name:partner.partner_name?.trim()||'Production partner',location:partner.location?.trim()||''})),selectedId});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Etsy production partners could not be loaded.'},{status:409})}
}

export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'Sign in to save the Etsy production partner.'},{status:401});
 try{
  const id=Number((await request.json() as {id?:number}).id),connection=await etsyConnection(user.userId),payload=await etsyFetch<{results?:EtsyProductionPartner[]}>(`/shops/${connection.shopId}/production-partners`,connection.token),partners=validProductionPartners(payload);
  if(!partners.some(partner=>Number(partner.production_partner_id)===id))throw Error('That production partner is no longer available in this Etsy shop.');
  const [row]=await getDb().select().from(sellerPreferences).where(eq(sellerPreferences.userId,user.userId)).limit(1),existing=readPreferences(row?.pricingJson),next={...existing,etsyProductionPartners:{...(existing.etsyProductionPartners||{}),[String(connection.shopId)]:id}};
  await getDb().insert(sellerPreferences).values({userId:user.userId,pricingJson:JSON.stringify(next)}).onConflictDoUpdate({target:sellerPreferences.userId,set:{pricingJson:JSON.stringify(next)}});
  return NextResponse.json({ok:true,id});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'The production partner could not be saved.'},{status:409})}
}
