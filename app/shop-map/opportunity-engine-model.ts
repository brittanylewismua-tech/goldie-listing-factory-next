/*
  Opportunity Engine model.

  The engine teaches one habit: follow the votes your customers already cast.
  Purchases in the selected period rank the listings. When fewer than ten
  listings sold, the remaining places go to active listings ranked by
  favorites, and each of those is labelled as a favorites rank so it is never
  mistaken for a sale.

  Everything here is a pure function of data the shop-map routes already
  return. Nothing is invented: a move only appears when a number or a review
  supports it, and each move carries that evidence.
*/

export type PeriodListing = {
  listingId:number; title:string; imageUrl:string|null; state:string;
  unitsPurchased:number; productRevenueMinor:number; share:number; lastPurchasedAt:number|null;
};
export type CatalogListing = {
  listingId:number; title:string; state:string; family:string;
  favorites:number|null; views:number|null; imageUrl:string|null;
};
export type YearSale = { listingId:number; sales:number; revenueMinor?:number };
export type OwnReview = { listingId:number; rating:number; review:string; createdAt:number };
export type Direction = {
  listingId:number; kind:string; targetFormat:string|null; whyNow:string; catalogCoverage:string;
};

export type RankBasis = "sales"|"favorites";
export type TopRow = {
  rank:number; basis:RankBasis; listingId:number; title:string; imageUrl:string|null; state:string; family:string;
  unitsPeriod:number; revenuePeriodMinor:number; share:number; lastPurchasedAt:number|null;
  unitsYear:number; favorites:number|null; views:number|null;
};
export type Move = { kind:"expose"|"convert"|"fit"|"gift"|"expand"|"check"|"model"|"keep"; title:string; detail:string; evidence:string };
export type ListingRead = {
  headline:string; moves:Move[]; missing:string[];
  reviews:{count:number; average:number|null; quote:string|null; quoteRating:number|null};
};

const TOP=10;
const decode=(value:string)=>String(value||"")
  .replace(/&#39;|&#039;|&apos;/g,"'").replace(/&quot;/g,"\"").replace(/&amp;/g,"&")
  .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();

/** Short display name: the part of an Etsy title before the keyword run. */
export function shortName(title:string){
  const clean=decode(title).split(/[|,–—]/)[0].trim();
  const words=clean.split(" ");
  return words.length>7?words.slice(0,7).join(" ")+"…":clean;
}

export function familyName(family:string){
  const key=String(family||"").toLowerCase();
  const names:Record<string,string>={tee:"tees",crewneck:"crewnecks",sweatshirt:"sweatshirts",hoodie:"hoodies",tank:"tanks",
    mug:"mugs",sticker:"stickers",phonecase:"phone cases",poster:"posters",print:"prints",tote:"totes",hat:"hats"};
  return names[key]??(key?key+"s":"other products");
}

/**
 * Top ten listings. Sales first, in the order the purchase ranking already
 * uses (units, then most recent purchase). Empty places are filled with
 * active listings by favorites, then views.
 */
export function buildTopTen(period:PeriodListing[],catalog:CatalogListing[],year:YearSale[]):TopRow[]{
  const byId=new Map(catalog.map(row=>[row.listingId,row]));
  const yearUnits=new Map<number,number>();
  for(const sale of year)yearUnits.set(sale.listingId,(yearUnits.get(sale.listingId)??0)+Number(sale.sales||0));
  const rows:TopRow[]=[];
  for(const sale of period.filter(row=>row.unitsPurchased>0)){
    if(rows.length>=TOP)break;
    const own=byId.get(sale.listingId);
    rows.push({rank:rows.length+1,basis:"sales",listingId:sale.listingId,title:sale.title||own?.title||"Listing",
      imageUrl:sale.imageUrl??own?.imageUrl??null,state:own?.state??sale.state,family:own?.family??"",
      unitsPeriod:sale.unitsPurchased,revenuePeriodMinor:sale.productRevenueMinor,share:sale.share,lastPurchasedAt:sale.lastPurchasedAt,
      unitsYear:Math.max(yearUnits.get(sale.listingId)??0,sale.unitsPurchased),favorites:own?.favorites??null,views:own?.views??null});
  }
  if(rows.length<TOP){
    const taken=new Set(rows.map(row=>row.listingId));
    const fill=catalog.filter(row=>row.state==="active"&&!taken.has(row.listingId))
      .sort((a,b)=>(b.favorites??-1)-(a.favorites??-1)||(b.views??-1)-(a.views??-1)||a.listingId-b.listingId)
      .slice(0,TOP-rows.length);
    for(const own of fill)rows.push({rank:rows.length+1,basis:"favorites",listingId:own.listingId,title:own.title,imageUrl:own.imageUrl,
      state:own.state,family:own.family,unitsPeriod:0,revenuePeriodMinor:0,share:0,lastPurchasedAt:null,
      unitsYear:yearUnits.get(own.listingId)??0,favorites:own.favorites,views:own.views});
  }
  return rows;
}

const SIZE=/\b(size|sizing|fit|fits|runs (small|large|big)|too (small|big|large|tight)|loose|oversized)\b/i;
const GIFT=/\bgift|bought (this|it|one) for|for my (wife|daughter|mom|mother|sister|friend|husband|son|girlfriend|boyfriend)\b/i;

export type FamilyStat={family:string;active:number;unitsYear:number};
export function familyStats(catalog:CatalogListing[],year:YearSale[]):FamilyStat[]{
  const fam=new Map(catalog.map(row=>[row.listingId,row.family||""]));
  const stats=new Map<string,FamilyStat>();
  const get=(family:string)=>{let row=stats.get(family);if(!row){row={family,active:0,unitsYear:0};stats.set(family,row)}return row};
  for(const row of catalog)if(row.state==="active")get(row.family||"").active++;
  for(const sale of year)get(fam.get(sale.listingId)??"").unitsYear+=Number(sale.sales||0);
  return [...stats.values()].filter(row=>row.family).sort((a,b)=>b.unitsYear-a.unitsYear||b.active-a.active);
}

/** What this listing's evidence supports, in priority order. */
export function readListing(row:TopRow,ctx:{days:number;reviews:OwnReview[];directions:Direction[];families:FamilyStat[];totalYearUnits:number;month:number}):ListingRead{
  const own=ctx.reviews.filter(review=>review.listingId===row.listingId);
  const average=own.length?own.reduce((sum,review)=>sum+Number(review.rating||0),0)/own.length:null;
  const quoted=own.filter(review=>review.rating>=4&&decode(review.review).length>=24).sort((a,b)=>b.createdAt-a.createdAt)[0];
  const quote=quoted?decode(quoted.review):null;
  const fitReviews=own.filter(review=>SIZE.test(review.review)).length;
  const giftReviews=own.filter(review=>GIFT.test(review.review)).length;
  const fav=row.favorites??0, views=row.views??0, days=ctx.days;
  const rising=row.basis==="sales"&&row.unitsPeriod>=2&&row.unitsYear-row.unitsPeriod<=1;

  let headline:string;
  if(row.basis==="favorites")headline=row.unitsYear>0
    ?`Bought ${row.unitsYear} ${row.unitsYear===1?"time":"times"} this year, not in the last ${days} days.`
    :fav>=100?`Wanted, not bought: ${fav.toLocaleString("en-US")} favorites and no sales in 12 months.`
    :`Here by favorites until more listings sell.`;
  else if(rising)headline=`Picking up: ${row.unitsPeriod} of its ${row.unitsYear} sales this year came in the last ${days} days.`;
  else if(row.rank===1)headline=`Your customers' top pick for the last ${days} days.`;
  else if(row.unitsYear>=5)headline=`A steady seller: ${row.unitsYear} sold in the last 12 months.`;
  else headline=`${row.unitsPeriod} sold in the last ${days} days.`;

  const moves:Move[]=[];
  if(rising&&views>0&&views<2000)moves.push({kind:"expose",title:"Give it more exposure",
    detail:"Move it into your first shop section and add a second photo, so more of the shoppers who buy it can find it.",
    evidence:`${row.unitsPeriod} sales from ${views.toLocaleString("en-US")} views, all time`});
  if(fav>=300&&row.unitsYear*150<fav)moves.push({kind:"convert",title:"Turn favorites into sales",
    detail:"Send an Etsy offer to shoppers who favorited it, then check that the price matches your sellers and every size is in stock.",
    evidence:`${fav.toLocaleString("en-US")} favorites, ${row.unitsYear} sold in 12 months`});
  if(fitReviews>0)moves.push({kind:"fit",title:"Add a size guide",
    detail:"Put a size chart in the photos and one line on fit in the description.",
    evidence:`${fitReviews} of ${own.length} reviews on this listing mention size or fit`});
  if(giftReviews>0&&ctx.month>=9&&ctx.month<=12)moves.push({kind:"gift",title:"Get it gift-ready",
    detail:"Add a gift or packaging photo and your last order date for holiday delivery.",
    evidence:`${giftReviews} ${giftReviews===1?"review says":"reviews say"} it was bought as a gift`});
  const direction=ctx.directions.find(item=>item.listingId===row.listingId&&item.targetFormat&&(item.kind==="test"||item.kind==="check-first"));
  if(direction&&row.basis==="sales"){
    const target=String(direction.targetFormat).toLowerCase();
    const fam=ctx.families.find(item=>item.family===target||familyName(item.family)===familyName(target));
    const weak=fam&&fam.active>=3&&ctx.totalYearUnits>0&&fam.unitsYear/ctx.totalYearUnits<0.1;
    moves.push(weak
      ?{kind:"check",title:`Hold the ${familyName(target)} version`,
        detail:`Your ${familyName(target)} have not been selling, so a new one is a weak bet. Put the time into new designs in this format instead.`,
        evidence:`${fam!.active} ${familyName(target)} active, ${fam!.unitsYear} of ${ctx.totalYearUnits} units this year`}
      :{kind:"expand",title:`Offer it as ${/^[aeiou]/.test(target)?"an":"a"} ${target}`,detail:direction.whyNow,evidence:direction.catalogCoverage});
  }
  if(row.basis==="sales"&&row.rank<=3)moves.push({kind:"model",title:"Make your next design from this one",
    detail:"Keep what buyers chose here: the product, the colors and the kind of wording. Change the message.",
    evidence:`Rank ${row.rank} of your top ${TOP} by units sold`});
  if(!moves.length)moves.push({kind:"keep",title:"Keep it live and in stock",
    detail:"Nothing here needs changing yet. Check back after the next few sales.",evidence:`${row.unitsPeriod} sold in the last ${days} days`});

  const missing:string[]=[];
  if(!own.length)missing.push("No reviews yet, so buyers have no social proof on this listing.");
  if(row.basis==="sales"&&views>0&&views<1000)missing.push(`Few shoppers see it: ${views.toLocaleString("en-US")} views, all time.`);
  if(row.basis==="favorites"&&row.unitsYear===0)missing.push("No sales in the last 12 months.");
  if(row.state!=="active")missing.push(`This listing is ${row.state.replace("_"," ")}, so new buyers cannot purchase it.`);

  return {headline,moves:moves.slice(0,3),missing,
    reviews:{count:own.length,average,quote,quoteRating:quoted?.rating??null}};
}

export type ShopMove = {id:string;tag:string;title:string;detail:string;listings:CatalogListing[];evidence:string[]};

/** Whole-shop moves. Each appears only when the shop's own data supports it. */
export function shopMoves(catalog:CatalogListing[],year:YearSale[],reviews:OwnReview[],topIds:Set<number>):ShopMove[]{
  const sold=new Map<number,number>();
  for(const sale of year)sold.set(sale.listingId,(sold.get(sale.listingId)??0)+Number(sale.sales||0));
  const total=[...sold.values()].reduce((a,b)=>a+b,0);
  const moves:ShopMove[]=[];
  const wanted=catalog.filter(row=>row.state==="active"&&!sold.get(row.listingId)&&(row.favorites??0)>=150&&!topIds.has(row.listingId))
    .sort((a,b)=>(b.favorites??0)-(a.favorites??0)).slice(0,4);
  if(wanted.length)moves.push({id:"wanted",tag:"Wake up",title:"Favorited listings that stopped selling",
    detail:"Shoppers saved these and then stopped buying. Check price, stock and the first photo, and send an offer to the shoppers who favorited them.",
    listings:wanted,evidence:wanted.map(row=>`${shortName(row.title)}: ${(row.favorites??0).toLocaleString("en-US")} favorites, 0 sold in 12 months`)});
  const off=catalog.filter(row=>row.state!=="active"&&row.state!=="draft"&&(row.favorites??0)>=150)
    .sort((a,b)=>(b.favorites??0)-(a.favorites??0)).slice(0,4);
  if(off.length)moves.push({id:"off",tag:"Check first",title:"Turned off, but shoppers still want them",
    detail:"These are not for sale right now. Some may have been turned off on purpose, so check the reason and the phrase before restoring one as a test.",
    listings:off,evidence:off.map(row=>`${shortName(row.title)}: ${row.state.replace("_"," ")}, ${(row.favorites??0).toLocaleString("en-US")} favorites`)});
  const weak=familyStats(catalog,year).filter(row=>row.active>=5&&total>=10&&row.unitsYear/total<0.06);
  if(weak.length)moves.push({id:"hold",tag:"Hold off",title:`Hold off on new ${weak.map(row=>familyName(row.family)).join(" and ")}`,
    detail:"These product types have many listings and few sales. Leave the existing ones up and put new design time where buyers are already buying.",
    listings:[],evidence:weak.map(row=>`${familyName(row.family)}: ${row.active} active, ${row.unitsYear} of ${total} units in 12 months`)});
  if(reviews.length>=10){
    const count=(re:RegExp)=>reviews.filter(review=>re.test(review.review)).length;
    const fit=count(SIZE),gift=count(GIFT),low=reviews.filter(review=>review.rating<=3).length;
    const lines=[`${fit} mention size or fit`,`${gift} mention a gift`,`${low} are 3 stars or lower`];
    moves.push({id:"reviews",tag:"Buyers",title:"What your buyers keep saying",
      detail:"Fit questions are the easiest to fix: a size chart photo and one line on fit in the description.",
      listings:[],evidence:[`${reviews.length} recent reviews, average ${(reviews.reduce((a,b)=>a+b.rating,0)/reviews.length).toFixed(1)} stars`,...lines]});
  }
  return moves;
}
