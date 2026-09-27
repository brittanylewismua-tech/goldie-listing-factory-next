import {listingPhoto,listingPrice,type EtsyDisplayListing} from './etsy-listing-display';
import type {SavedCompetitor} from './market-collection';
export function competitorSnapshot(row:EtsyDisplayListing,now:number):SavedCompetitor{return {
 tags:row.tags,listingId:Number(row.listing_id),title:String(row.title??''),imageUrl:listingPhoto(row),etsyUrl:`https://www.etsy.com/listing/${row.listing_id}`,
 priceCents:listingPrice(row),currency:row.price?.currency_code??'USD',favorites:row.num_favorers??null,views:row.views??null,
 createdAt:row.original_creation_timestamp??null,listedAt:row.creation_timestamp??row.created_timestamp??null,
 ageDays:row.original_creation_timestamp?Math.max(0,Math.floor((now-row.original_creation_timestamp)/86400)):null,
 reviewsOnThisListing:null,displayFresh:true,intervals:0};}
