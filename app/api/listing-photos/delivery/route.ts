import {NextResponse} from 'next/server';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {unpackDraftMedia} from '@/app/draft-media-storage';
import {orderedPackagePhotos} from '@/app/listing-photo-package';
import {deliveryEnv,deliveryStatus,readDelivery,readSourceImage,prepareEtsyImage,deliveryMessage,type DeliveryRow} from './service';
const publicRow=(row:DeliveryRow)=>({id:row.id,productId:row.product_id,status:row.status,error:row.error?deliveryMessage(row.error):null,photoCount:JSON.parse(row.photos_json).length,updatedAt:row.updated_at,expiresAt:row.expires_at,listingId:row.state_json?JSON.parse(row.state_json).listingId:null});
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'Sign in to view photo delivery.'},{status:401});
 const ids=[...new Set(new URL(request.url).searchParams.getAll('productId'))];if(!ids.length||ids.length>100)return NextResponse.json({deliveries:[]});
 const rows=await deliveryEnv().DB.prepare(`SELECT * FROM photo_deliveries WHERE user_id=? AND product_id IN (${ids.map(()=>'?').join(',')}) ORDER BY created_at DESC`).bind(user.userId,...ids).all<DeliveryRow>();
 const seen=new Set<string>();return NextResponse.json({deliveries:rows.results.filter(r=>{if(seen.has(r.product_id))return false;seen.add(r.product_id);return true}).map(publicRow)},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'Sign in to prepare photo delivery.'},{status:401});
 const runtime=deliveryEnv();let id='';
 try{
  const body=await request.json() as {productId?:string;printifyImageIndices?:number[]};
  const productId=String(body.productId||'');if(!productId||!Array.isArray(body.printifyImageIndices))return NextResponse.json({error:'Choose a listing and its photos first.'},{status:400});
  const owned=await runtime.DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,productId).first<{response_json:string}>();
  if(!owned)return NextResponse.json({error:'This listing does not belong to your account.'},{status:403});
  const draft=await unpackDraftMedia(owned.response_json,user.userId,runtime.ARTWORK) as {id:string;shopId:number;printifyImages?:string[]};
  if(!Number.isSafeInteger(draft.shopId)||draft.shopId<=0)return NextResponse.json({error:'The original Printify shop could not be verified.'},{status:409});
  const shop=await runtime.DB.prepare('SELECT shop_id FROM etsy_connections WHERE user_id=? AND is_active=1').bind(user.userId).first<{shop_id:number}>();
  if(!shop)return NextResponse.json({error:'Connect Etsy before preparing photo delivery.'},{status:409});
  const prefix=`etsy-listing-images/${user.userId}/${productId}/`,objects=await runtime.ARTWORK.list({prefix,limit:100});
  if(objects.truncated)throw Error('Too many stored photos. Remove unused photos before preparing delivery.');
  const order=await runtime.ARTWORK.get(`${prefix}order.json`);
  const images=(draft.printifyImages||[]).filter(Boolean);
  if(body.printifyImageIndices.some(i=>!Number.isInteger(i)||i<0||!images[i]))throw Error('A selected photo is no longer available. Refresh this listing.');
  const photos=orderedPackagePhotos(images,body.printifyImageIndices,objects.objects,prefix,order?JSON.parse(await order.text()):[]);
  if(!photos.length||photos.length>20)return NextResponse.json({error:'Choose between 1 and 20 photos per listing.'},{status:409});
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({shop:shop.shop_id,photos:photos.map(p=>({...p,etag:objects.objects.find(o=>o.key===p.key)?.etag}))}))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  await runtime.DB.prepare("UPDATE photo_deliveries SET status='failed',error='Photo preparation was interrupted. Prepare delivery again.',updated_at=? WHERE user_id=? AND product_id=? AND status='preparing' AND created_at<?").bind(Date.now(),user.userId,productId,Date.now()-600000).run();
  const latest=await runtime.DB.prepare('SELECT * FROM photo_deliveries WHERE user_id=? AND product_id=? ORDER BY created_at DESC LIMIT 1').bind(user.userId,productId).first<DeliveryRow>();
  if(latest){
    if(latest.state_json&&JSON.parse(latest.state_json).pending)return NextResponse.json({error:'The previous delivery has an unconfirmed Etsy change. Contact support before sending another photo set.',delivery:publicRow(latest)},{status:409});
    if(latest.fingerprint===fingerprint&&['waiting','delivering','completed'].includes(latest.status)){
      if(latest.status==='waiting'){try{await runtime.PHOTO_DELIVERY.create({id:latest.id,params:{id:latest.id,owner:user.userId}})}catch{/* A durable instance with this identity may already exist. GET status remains authoritative. */}}
      return NextResponse.json({delivery:publicRow(latest)});
    }
    if(['preparing','waiting','delivering'].includes(latest.status))return NextResponse.json({error:'A photo set is already scheduled. Cancel the waiting delivery before changing that set.',delivery:publicRow(latest)},{status:409});
  }
  id=crypto.randomUUID();const now=Date.now();
  await runtime.DB.prepare("INSERT INTO photo_deliveries(id,user_id,product_id,printify_shop_id,etsy_shop_id,fingerprint,status,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,'preparing',?,?,?)").bind(id,user.userId,productId,draft.shopId,shop.shop_id,fingerprint,now,now,now+86400000).run();
  const snapshot:Array<{key:string;type:string}>=[];let total=0;
  for(const [index,photo] of photos.entries()){
    let data:{bytes:Uint8Array;type:string};
    if(photo.src)data=await readSourceImage(photo.src);
    else{const object=await runtime.ARTWORK.get(photo.key!);if(!object)throw Error('A selected photo disappeared. Prepare delivery again.');if(object.size>20*1024*1024)throw Error('Each photo must be 20 MB or smaller.');data={bytes:new Uint8Array(await object.arrayBuffer()),type:object.httpMetadata?.contentType||'image/jpeg'}}
    if(!['image/png','image/jpeg','image/webp'].includes(data.type))throw Error('Choose PNG, JPG or WEBP photos.');
    data=await prepareEtsyImage(data);
    total+=data.bytes.length;if(total>90*1024*1024)throw Error('This photo set is too large. Keep the total below 90 MB.');
    const key=`photo-delivery/${user.userId}/${id}/selected/${index+1}`;await runtime.ARTWORK.put(key,data.bytes,{httpMetadata:{contentType:data.type}});snapshot.push({key,type:data.type});
  }
  await runtime.DB.prepare("UPDATE photo_deliveries SET status='waiting',photos_json=?,updated_at=? WHERE id=? AND user_id=?").bind(JSON.stringify(snapshot),Date.now(),id,user.userId).run();
  try{await runtime.PHOTO_DELIVERY.create({id,params:{id,owner:user.userId}})}catch{throw Error('Automatic delivery could not start. Your photos are saved; try preparing delivery again.')}
  return NextResponse.json({delivery:publicRow((await readDelivery(id,user.userId))!)});
 }catch(error){
  if(id){const row=await readDelivery(id,user.userId);if(row?.status==='preparing'){const unfinished=await runtime.ARTWORK.list({prefix:`photo-delivery/${user.userId}/${id}/selected/`,limit:25});for(const object of unfinished.objects)await runtime.ARTWORK.delete(object.key)}if(row&&['preparing','waiting'].includes(row.status))await deliveryStatus(id,user.userId,'failed',error instanceof Error?error.message:'Photo preparation failed.')}
  return NextResponse.json({error:deliveryMessage(error instanceof Error?error.message:'Photo delivery could not be prepared.')},{status:409});
 }
}
export async function DELETE(request:Request){
 const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'Sign in to cancel photo delivery.'},{status:401});
 const id=new URL(request.url).searchParams.get('id')||'';
 // Atomic transition: a delivery that has started editing cannot be canceled underneath a write.
 const result=await deliveryEnv().DB.prepare("UPDATE photo_deliveries SET status='canceled',error=NULL,updated_at=? WHERE id=? AND user_id=? AND status='waiting' AND state_json IS NULL").bind(Date.now(),id,user.userId).run();
 return result.meta.changes?NextResponse.json({ok:true}):NextResponse.json({error:'Delivery has already started or finished. Refresh its status.'},{status:409});
}
