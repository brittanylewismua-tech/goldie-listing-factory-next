/** Mark only an unfinished, owned job; never discard transfer/photo receipts or overwrite success. */
export async function markDeliveryInterrupted(db:D1Database,id:string,owner:string,report:(event:{area:string;message:string;userId:string;context:{deliveryId:string}})=>Promise<unknown>){
 const message='Automatic checking stopped after repeated service failures. Your confirmed work is saved. Use Verify last change to check this same draft; do not create another batch.';
 const result=await db.prepare("UPDATE photo_deliveries SET status='needs_attention',error=?,updated_at=? WHERE id=? AND user_id=? AND status IN ('waiting','delivering')").bind(message,Date.now(),id,owner).run();
 if(result.meta.changes)await report({area:'etsy-draft-workflow',message,userId:owner,context:{deliveryId:id}});
 return Boolean(result.meta.changes);
}
