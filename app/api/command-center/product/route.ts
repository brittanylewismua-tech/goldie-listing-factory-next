import {NextResponse} from 'next/server';
import {env} from 'cloudflare:workers';
import {requireFeatureApi} from '@/app/require-feature';
import {decryptPrintifyToken} from '@/app/api/printify/token-crypto';
import {printifyCall} from '@/app/printify-call';
import {cachedJson} from '@/app/api/static-cache';

export async function GET(request:Request){
  const access=await requireFeatureApi('marketWatch');
  if(!access.ok)return access.response;
  const value=new URL(request.url).searchParams.get('product')??'';
  const id=(value.match(/\/(?:editor|products)\/([a-f\d]{20,32})(?:[/?#]|$)/i)?.[1]??value).trim();
  if(!/^[a-f\d]{20,32}$/i.test(id))return NextResponse.json({error:'Paste a saved Printify product link or product ID.'},{status:400});
  const e=env as unknown as {DB:D1Database;PRINTIFY_TOKEN_KEY:string};
  const saved=await e.DB.prepare('SELECT encrypted_token FROM printify_connections WHERE user_id=?').bind(access.user.userId).first<{encrypted_token:string}>();
  if(!saved)return NextResponse.json({error:'Connect Printify in Connections first.'},{status:400});
  try{
    const token=await decryptPrintifyToken(saved.encrypted_token,e.PRINTIFY_TOKEN_KEY);
    const get=async<T,>(path:string):Promise<T>=>{
      const response=await printifyCall(`https://api.printify.com/v1${path}`,{headers:{Authorization:`Bearer ${token}`,'User-Agent':'Goldie-Command-Center'},signal:AbortSignal.timeout(15000)},{feature:'finance',userId:access.user.userId});
      if(!response.ok)throw new Error(`Printify could not load this product (${response.status}). Try again shortly.`);
      return response.json() as Promise<T>;
    };
    const shops=await get<Array<{id:number;title:string}>>('/shops.json');
    const requested=Number(new URL(request.url).searchParams.get('shop'));
    if(!requested && shops.length!==1)return NextResponse.json({shops:shops.map(s=>({id:s.id,title:s.title}))});
    const shop=shops.find(s=>s.id===(requested||shops[0]?.id));
    if(!shop)return NextResponse.json({error:'Choose one of your connected Printify shops.'},{status:400});
    const p=await get<{id:string;title:string;blueprint_id:number;print_provider_id:number;variants:Array<{id:number;title:string;cost?:number;price:number;is_enabled:boolean}>}>(`/shops/${shop.id}/products/${id}.json`);
    const shipping=await cachedJson<{profiles?:Array<{variant_ids:number[];countries:string[];first_item:{cost:number;currency:string};additional_items?:{cost:number;currency:string}}>}>('printify-catalog',`/catalog/blueprints/${p.blueprint_id}/print_providers/${p.print_provider_id}/shipping.json`,86400,()=>get(`/catalog/blueprints/${p.blueprint_id}/print_providers/${p.print_provider_id}/shipping.json`));
    return NextResponse.json({title:p.title,productId:p.id,shop:shop.title,asOf:new Date().toISOString(),
      variants:p.variants.filter(v=>v.is_enabled).map(v=>({id:v.id,title:v.title,productionMinor:Number.isFinite(v.cost)?v.cost:null,priceMinor:v.price})),shipping:shipping.profiles??[],
      note:'Confirm the product cost currency against Printify before using it. Shipping is a catalog quote; final order tax, extra print areas and discounts can change costs.'});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Printify could not be reached.'},{status:502});}
}
