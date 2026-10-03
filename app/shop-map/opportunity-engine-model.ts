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
export const decode=(value:string)=>String(value||"")
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

/* ───────────── Design reads: what is printed on each listing photo ───────────── */

export type DesignRead = {
  listingId:number;
  name:string;              // short name a seller would use for the design
  wording:string;           // exact printed text, "" when none
  credit:string|null;       // a person or source credited in the design
  lettering:"typewriter"|"serif"|"sans"|"script"|"handwritten"|"display"|"none";
  art:"none"|"floral"|"animal"|"figure"|"symbol"|"pattern"|"other";
  textLed:boolean;
  garment:string;           // garment colour as seen
  ink:string[];             // main print colours
};

const LETTERING=["typewriter","serif","sans","script","handwritten","display","none"] as const;
const ART=["none","floral","animal","figure","symbol","pattern","other"] as const;

export const DESIGN_READ_PROMPT=`You are looking at the main photo of an Etsy listing for a printed product.
Describe ONLY the printed design, not the model, background or garment cut.
Return one JSON object and nothing else:
{"name":"","wording":"","credit":null,"lettering":"","art":"","textLed":true,"garment":"","ink":[]}
name: 2 to 6 words a seller would call this design. Use the main printed words if there are any, else the main image.
wording: the exact printed text, line breaks as spaces. "" if no text.
credit: the person or source the design credits (for example "Cher" from "- Cher"), else null.
lettering: one of typewriter, serif, sans, script, handwritten, display, none.
art: one of none, floral, animal, figure, symbol, pattern, other.
textLed: true when the words carry the design and any art is small.
garment: the product colour in one word.
ink: up to 3 main print colours, one word each.`;

/** Accept only a complete read; a half-read design must not be shown as measured. */
export function parseDesignRead(listingId:number,text:string):DesignRead|null{
  const start=text.indexOf("{"),end=text.lastIndexOf("}");
  if(start<0||end<=start)return null;
  let raw:Record<string,unknown>;
  try{raw=JSON.parse(text.slice(start,end+1)) as Record<string,unknown>}catch{return null}
  const name=String(raw.name??"").trim();
  const lettering=String(raw.lettering??"").toLowerCase() as DesignRead["lettering"];
  const art=String(raw.art??"").toLowerCase() as DesignRead["art"];
  if(!name||!LETTERING.includes(lettering)||!ART.includes(art)||typeof raw.textLed!=="boolean")return null;
  const credit=raw.credit==null||String(raw.credit).trim()===""||/^null$/i.test(String(raw.credit))?null:String(raw.credit).trim().slice(0,60);
  return {listingId,name:name.slice(0,60),wording:String(raw.wording??"").trim().slice(0,240),credit,lettering,art,
    textLed:raw.textLed,garment:String(raw.garment??"").toLowerCase().slice(0,20),
    ink:Array.isArray(raw.ink)?raw.ink.slice(0,3).map(value=>String(value).toLowerCase().slice(0,20)):[]};
}

export type StyleTrait={key:string;label:string;units:number;designs:number;listingIds:number[]};
export type StyleBreakdown={analysedUnits:number;totalUnits:number;analysedListings:number;traits:StyleTrait[]};

const LETTER_LABEL:Record<string,string>={typewriter:"Typewriter lettering",serif:"Serif lettering",sans:"Plain sans lettering",
  script:"Script lettering",handwritten:"Handwritten lettering",display:"Bold display lettering"};
const ART_LABEL:Record<string,string>={floral:"Floral art",animal:"Animal art",figure:"Figure or face art",symbol:"Symbol art",pattern:"Pattern art",other:"Other art"};

function traitsOf(read:DesignRead):Array<[string,string]>{
  const out:Array<[string,string]>=[];
  if(read.credit)out.push(["credit","Quote credited to a named person"]);
  if(read.lettering!=="none")out.push(["letter:"+read.lettering,LETTER_LABEL[read.lettering]]);
  out.push(read.textLed?["textLed","Words lead the design"]:["artLed","Art leads the design"]);
  if(read.art!=="none")out.push(["art:"+read.art,ART_LABEL[read.art]]);
  if(read.garment)out.push(["garment:"+read.garment,`On a ${read.garment} product`]);
  return out;
}

/** Units sold in 12 months by design trait, over the listings that have been read. */
export function styleBreakdown(year:YearSale[],reads:Map<number,DesignRead>):StyleBreakdown{
  const traits=new Map<string,StyleTrait>();
  let analysedUnits=0,totalUnits=0,analysedListings=0;
  for(const sale of year){
    const units=Number(sale.sales||0);totalUnits+=units;
    const read=reads.get(sale.listingId);if(!read||!units)continue;
    analysedUnits+=units;analysedListings++;
    for(const [key,label] of traitsOf(read)){
      const row=traits.get(key)??{key,label,units:0,designs:0,listingIds:[]};
      row.units+=units;row.designs++;row.listingIds.push(sale.listingId);traits.set(key,row);
    }
  }
  return {analysedUnits,totalUnits,analysedListings,
    traits:[...traits.values()].filter(row=>row.designs>=1).sort((a,b)=>b.units-a.units||b.designs-a.designs).slice(0,6)};
}

/* ───────────── Ranked next moves for the whole shop ───────────── */

export type NextMove={id:string;group:"quick"|"new"|"hold";tag:string;title:string;why:string;
  evidence:Array<[string,string]>;listingIds:number[];proof:{left:{h:string;lines:string[];quote?:string};right:{h:string;steps:string[];caution?:string}};
  action:{label:string;href:string}};

const fmt=(value:number)=>value.toLocaleString("en-US");

export function reviewThemes(reviews:OwnReview[]){
  const count=(re:RegExp)=>reviews.filter(review=>re.test(review.review));
  const quality=count(/quality|soft|material|fabric|thick/i),shipping=count(/fast|quick|arriv|ship/i),fit=count(SIZE),
    print=count(/print|vibrant|fade|crack|wash/i),gift=count(GIFT),low=reviews.filter(review=>review.rating<=3);
  const average=reviews.length?reviews.reduce((a,b)=>a+b.rating,0)/reviews.length:null;
  const quote=(rows:OwnReview[])=>{const pick=rows.filter(row=>row.rating>=4).map(row=>decode(row.review)).find(text=>text.length>=20&&text.length<=140);return pick??null};
  return {count:reviews.length,average,five:reviews.filter(review=>review.rating===5).length,
    themes:[{label:"Quality and fabric",n:quality.length,quote:quote(quality)},{label:"Shipping speed",n:shipping.length,quote:quote(shipping)},
      {label:"Size and fit",n:fit.length,quote:quote(fit)},{label:"Print look",n:print.length,quote:quote(print)},
      {label:"Bought as a gift",n:gift.length,quote:quote(gift)}].filter(row=>row.n>0).sort((a,b)=>b.n-a.n),
    low:low.length,fitRows:fit,giftRows:gift};
}

export function buildNextMoves(input:{top:TopRow[];catalog:CatalogListing[];year:YearSale[];reviews:OwnReview[];
  reads:Map<number,DesignRead>;days:number;month:number}):NextMove[]{
  const {top,catalog,year,reviews,reads,days,month}=input;
  const sold=new Map<number,number>();
  for(const sale of year)sold.set(sale.listingId,(sold.get(sale.listingId)??0)+Number(sale.sales||0));
  const total=[...sold.values()].reduce((a,b)=>a+b,0);
  const name=(id:number,title:string)=>reads.get(id)?.name??shortName(title);
  const moves:NextMove[]=[];
  const factory="/listing-factory?step=setup";

  const rising=top.filter(row=>row.basis==="sales"&&row.unitsPeriod>=2&&row.unitsYear-row.unitsPeriod<=1&&(row.views??0)>0&&(row.views??0)<2000)[0];
  if(rising)moves.push({id:"rising",group:"quick",tag:"Rising",title:`Give ${name(rising.listingId,rising.title)} more exposure`,
    why:`It is speeding up. ${rising.unitsPeriod} of its ${rising.unitsYear} sales this year came in the last ${days} days, from a listing few shoppers see.`,
    evidence:[[String(rising.unitsPeriod),`sales in ${days} days`],[fmt(rising.views??0),"views, all time"],[fmt(rising.favorites??0),"favorites"]],
    listingIds:[rising.listingId],
    proof:{left:{h:"What we see",lines:[`It sells from very little traffic: ${rising.unitsYear} ${rising.unitsYear===1?"sale":"sales"} from ${fmt(rising.views??0)} views.`,
      reads.get(rising.listingId)?`The design: ${describe(reads.get(rising.listingId)!)}.`:"The design has not been read yet."]},
      right:{h:"Do this",steps:["Move it into your first shop section.","Add a second photo on a different product colour.","Check back in 30 days to see whether views and sales rose."]}},
    action:{label:"Open on Etsy",href:`https://www.etsy.com/listing/${rising.listingId}`}});

  const wanted=catalog.filter(row=>row.state==="active"&&!sold.get(row.listingId)&&(row.favorites??0)>=150)
    .sort((a,b)=>(b.favorites??0)-(a.favorites??0)).slice(0,4);
  if(wanted.length){const lead=wanted[0];
    moves.push({id:"wake",group:"quick",tag:"Wake up",title:wanted.length>1?"Your most-favorited listings stopped selling":`${name(lead.listingId,lead.title)} stopped selling`,
      why:`${name(lead.listingId,lead.title)} has ${fmt(lead.favorites??0)} favorites${lead.views?` and ${fmt(lead.views)} views`:""}, and no sales in 12 months.`,
      evidence:[[fmt(lead.favorites??0),"favorites"],[lead.views?fmt(lead.views):"—","views"],["0","sales in 12 months"],[String(wanted.length),"listings like this"]],
      listingIds:wanted.map(row=>row.listingId),
      proof:{left:{h:"Favorited, not bought",lines:wanted.map(row=>`${name(row.listingId,row.title)}: ${fmt(row.favorites??0)} favorites, 0 sold`)},
        right:{h:"Check in this order",steps:["Is the price above what your current sellers sell at?","Are all sizes and colours in stock and turned on?","Is the first photo several years old?","Send an Etsy offer to the shoppers who favorited it."]}},
      action:{label:"Open on Etsy",href:`https://www.etsy.com/listing/${lead.listingId}`}});}

  // Make more: the design trait with the strongest buyer response.
  const style=styleBreakdown(year,reads);
  const credit=style.traits.find(row=>row.key==="credit");
  const best=credit&&credit.designs>=2&&credit.units/Math.max(1,style.analysedUnits)>=0.3?credit
    :style.traits.find(row=>row.key.startsWith("letter:")&&row.designs>=2&&row.units/Math.max(1,style.analysedUnits)>=0.4);
  if(best){
    const sameButUnsold=catalog.filter(row=>row.state==="active"&&!sold.get(row.listingId)&&(row.favorites??0)>=100)
      .filter(row=>{const read=reads.get(row.listingId);return read&&traitsOf(read).some(([key])=>key===best.key)});
    const lines=best.listingIds.slice(0,4).map(id=>{const read=reads.get(id)!;return `${read.name}${read.credit?`, credited to ${read.credit}`:""}: ${sold.get(id)} sold`});
    const unsoldLine=sameButUnsold.length?[`${sameButUnsold.length} other ${sameButUnsold.length===1?"design":"designs"} with this trait sold nothing this year, so look at what else the sellers share.`]:[];
    moves.push({id:"make",group:"new",tag:"Make more",title:best.key==="credit"?"Write more quotes credited to a named person":`Make more designs in ${best.label.toLowerCase()}`,
      why:`${best.label}: ${best.units} of the ${style.analysedUnits} units your read designs sold this year, across ${best.designs} designs.`,
      evidence:[[`${best.units} of ${style.analysedUnits}`,"units this year"],[String(best.designs),"designs"]],
      listingIds:[...best.listingIds.slice(0,3),...sameButUnsold.slice(0,2).map(row=>row.listingId)],
      proof:{left:{h:"Designs with this trait",lines:[...lines,...unsoldLine]},
        right:{h:"Before you make them",caution:best.key==="credit"?"Quotes from real people can carry rights. Run each line through Trademark Check and prefer public-domain or original lines.":undefined,
          steps:["Write 5 new designs that keep this trait and change the message.","Use the same product and colours as your best seller for the first photo.","Publish them as one batch so you can compare them in 30 days."]}},
      action:{label:"Start a batch in Listing Factory",href:factory}});
  }

  const themes=reviewThemes(reviews);
  if(themes.fitRows.length>=3){
    const leaders=top.filter(row=>row.basis==="sales").slice(0,3);
    moves.push({id:"fit",group:"quick",tag:"Fix",title:`Add a size guide to your top ${leaders.length} listings`,
      why:`Fit comes up in ${themes.fitRows.length} of your ${themes.count} recent reviews. Clear size information stops wrong-size orders before they happen.`,
      evidence:[[`${themes.fitRows.length} of ${themes.count}`,"reviews mention size or fit"],[String(leaders.length),"listings to update"]],
      listingIds:leaders.map(row=>row.listingId),
      proof:{left:{h:"What buyers wrote",lines:themes.fitRows.slice(0,3).map(row=>`“${decode(row.review).slice(0,120)}”`)},
        right:{h:"Do this",steps:["Add a size chart as the third photo.","Add one line on fit to the description.","Watch new reviews for fewer fit mentions."]}},
      action:{label:"Open Listing Factory",href:factory}});
  }
  if(themes.giftRows.length>=3&&month>=9&&month<=12){
    const leaders=top.filter(row=>row.basis==="sales").slice(0,3);
    moves.push({id:"gift",group:"quick",tag:"Season",title:"Get your best sellers ready for gift season",
      why:`${themes.giftRows.length} buyers say they bought as a gift, and the holiday rush is starting. Small changes to your top listings reach most of your buyers.`,
      evidence:[[String(themes.giftRows.length),"reviews mention a gift"],[String(leaders.length),"listings to update"]],
      listingIds:leaders.map(row=>row.listingId),
      proof:{left:{h:"What buyers wrote",lines:themes.giftRows.slice(0,3).map(row=>`“${decode(row.review).slice(0,120)}”`)},
        right:{h:"Do this",steps:["Add a gift or packaging photo.","Use gift wording in titles where it fits the design.","Post your last order date for holiday delivery."]}},
      action:{label:"Open Listing Factory",href:factory}});
  }

  const off=catalog.filter(row=>row.state!=="active"&&row.state!=="draft"&&(row.favorites??0)>=150)
    .sort((a,b)=>(b.favorites??0)-(a.favorites??0)).slice(0,4);
  if(off.length){const lead=off[0];
    moves.push({id:"off",group:"hold",tag:"Check first",title:"Turned off, but shoppers still want them",
      why:`${shortName(lead.title)} is ${lead.state.replace("_"," ")} with ${fmt(lead.favorites??0)} favorites. Some listings are turned off on purpose, so check the reason before restoring one.`,
      evidence:[[fmt(lead.favorites??0),"favorites"],[String(off.length),"listings like this"]],listingIds:off.map(row=>row.listingId),
      proof:{left:{h:"Not for sale right now",lines:off.map(row=>`${shortName(row.title)}: ${row.state.replace("_"," ")}, ${fmt(row.favorites??0)} favorites`)},
        right:{h:"Do this",steps:["Check why it was turned off.","Run the phrase through Trademark Check.","If it is clear, restore one as a 30-day test."]}},
      action:{label:"Open Trademark Check",href:"/trademark"}});}

  const weak=familyStats(catalog,year).filter(row=>row.active>=5&&total>=10&&row.unitsYear/total<0.06);
  if(weak.length){const strong=familyStats(catalog,year)[0];
    moves.push({id:"hold",group:"hold",tag:"Hold off",title:`Hold off on new ${weak.map(row=>familyName(row.family)).join(" and ")}`,
      why:`${weak.map(row=>{const label=familyName(row.family);return `${label[0].toUpperCase()+label.slice(1)}: ${row.active} active, ${row.unitsYear} sold`}).join(". ")} in 12 months.${strong?` ${familyName(strong.family)[0].toUpperCase()+familyName(strong.family).slice(1)} sold ${strong.unitsYear} of ${total}.`:""}`,
      evidence:weak.map(row=>[`${row.unitsYear} of ${total}`,`units were ${familyName(row.family)}`] as [string,string]),listingIds:[],
      proof:{left:{h:"Sales by product type, 12 months",lines:familyStats(catalog,year).filter(row=>row.active>0).slice(0,5).map(row=>`${familyName(row.family)}: ${row.active} active, ${row.unitsYear} units`)},
        right:{h:"Do this",steps:["Put new design time where buyers already buy.","Leave the existing listings up; they cost nothing to keep.","Recheck after the holidays."]}},
      action:{label:"See sold listings",href:"/shop-map?tab=sold"}});}
  return moves;
}

export function describe(read:DesignRead){
  const parts=[read.lettering!=="none"?`${read.lettering} lettering`:"",read.art!=="none"?`${read.art} art`:"",read.ink.length?`${read.ink.join(" and ")} ink`:"",read.garment?`on ${read.garment}`:""].filter(Boolean);
  return parts.join(", ");
}
