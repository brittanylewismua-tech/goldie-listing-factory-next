import { env } from "cloudflare:workers";
import { etsyConnection, etsyFetch } from "./client";

type Listing={listing_id:number;shop_id:number;title?:string};
type DraftData={id:string;batchId?:string;title?:string;tags?:string[];description?:string;etsyDetails?:{taxonomyId?:number;attributes?:Record<string,string>}};

export async function finishEtsyListing(userId:string,draft:DraftData,listingId:number){
  const connection=await etsyConnection(userId);
  const listing=await etsyFetch<Listing>(`/listings/${listingId}`,connection.token);
  if(Number(listing.shop_id)!==Number(connection.shopId))throw new Error("Etsy returned a listing from a different shop. Goldie stopped without editing it.");
  const body=new URLSearchParams();
  if(draft.title?.trim())body.set("title",draft.title.trim().slice(0,140));
  if(draft.description?.trim())body.set("description",draft.description.trim());
  for(const tag of (draft.tags||[]).map(value=>value.trim()).filter(Boolean).slice(0,13))body.append("tags",tag.slice(0,20));
  if(Number(draft.etsyDetails?.taxonomyId)>0)body.set("taxonomy_id",String(draft.etsyDetails!.taxonomyId));
  await etsyFetch(`/shops/${connection.shopId}/listings/${listingId}`,connection.token,{method:"PATCH",body});
  await env.DB.prepare("INSERT INTO etsy_listing_links (printify_product_id,user_id,batch_id,etsy_listing_id,status,last_error,updated_at) VALUES (?,?,?,?, 'finished',NULL,CURRENT_TIMESTAMP) ON CONFLICT(printify_product_id) DO UPDATE SET etsy_listing_id=excluded.etsy_listing_id,status='finished',last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(draft.id,userId,draft.batchId||"",listingId).run();
  return {listingId,shopId:connection.shopId,url:`https://www.etsy.com/listing/${listingId}`};
}
