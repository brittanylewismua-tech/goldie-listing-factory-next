/*
  Votes: the first page of the Opportunity Engine.

  "Customers vote with their purchases and their favorites." Every number on
  the page comes from data the shop-map routes already return: the period's
  purchases, the catalog (favorites, views), twelve months of sales, the
  shop's 200 most recent reviews and the design reads of listing photos.

  Nothing here recommends what to make. Brittany's rule for this page: report
  what buyers did and said, in plain words, and leave the judgment to the
  seller (the Build page is where moves live). A line that cannot be backed by
  a count is left out rather than softened.
*/
import {decode,familyName,shortName,type CatalogListing,type DesignRead,type OwnReview,type TopRow,type YearSale} from "./opportunity-engine-model.ts";

export type Tone="green"|"pink"|"gray"|"amber";
export type ListingReviews={count:number;average:number|null;quote:string|null};

export function reviewsFor(listingId:number,reviews:OwnReview[]):ListingReviews{
  const own=reviews.filter(review=>review.listingId===listingId);
  const average=own.length?own.reduce((sum,review)=>sum+Number(review.rating||0),0)/own.length:null;
  const quote=own.filter(review=>review.rating>=4).sort((a,b)=>b.createdAt-a.createdAt)
    .map(review=>decode(review.review)).find(text=>text.length>=12&&text.length<=160)??null;
  return {count:own.length,average,quote};
}

/** Favorites per view. Null when views are unknown, never a guessed zero. */
export const saveRate=(row:{favorites:number|null;views:number|null})=>
  row.views&&row.views>0&&row.favorites!=null?row.favorites/row.views:null;

/* A save rate counts as high from 13%: on this shop's data that is the top
   third of the top ten, and it is the point the design highlights in pink. */
export const HIGH_SAVE_RATE=0.13;

export type ListingBadge={label:string;tone:Tone}|null;

/** One short label per listing, the strongest fact first. */
export function listingBadge(row:TopRow,top:TopRow[],reviews:OwnReview[]):ListingBadge{
  if(row.basis==="favorites")return {label:"Ranked by favorites",tone:"gray"};
  const own=reviewsFor(row.listingId,reviews);
  const bestYear=Math.max(...top.filter(item=>item.basis==="sales").map(item=>item.unitsYear));
  const rated=top.map(item=>({id:item.listingId,r:reviewsFor(item.listingId,reviews)})).filter(item=>item.r.count>=3&&item.r.average!=null);
  const lowest=rated.length>=3?rated.sort((a,b)=>(a.r.average??5)-(b.r.average??5))[0]:null;
  if(row.unitsYear===bestYear&&row.unitsYear>=5)return {label:"Best seller this year",tone:"pink"};
  if(row.unitsPeriod>=2&&row.unitsYear-row.unitsPeriod<=1)return {label:"Rising",tone:"green"};
  if(lowest&&lowest.id===row.listingId&&(own.average??5)<4.5)return {label:"Lowest rating",tone:"amber"};
  if(row.unitsYear===row.unitsPeriod)return {label:"New this period",tone:"green"};
  if(row.unitsYear>=5)return {label:"Steady seller",tone:"gray"};
  return null;
}

const plural=(n:number,one:string,many=one+"s")=>`${n.toLocaleString("en-US")} ${n===1?one:many}`;

/** The sentence under the listing name: what the votes say about this one. */
export function listingWhy(row:TopRow,top:TopRow[],reviews:OwnReview[],days:number):string{
  if(row.basis==="favorites")return row.unitsYear>0
    ?`Sold ${plural(row.unitsYear,"time")} this year, not in the last ${days} days. Shoppers keep saving it.`
    :`${(row.favorites??0).toLocaleString("en-US")} shoppers saved it to their favorites.`;
  const own=reviewsFor(row.listingId,reviews);
  const mostReviewed=top.reduce((best,item)=>{const n=reviewsFor(item.listingId,reviews).count;return n>best.n?{id:item.listingId,n}:best},{id:0,n:0});
  const bestYear=Math.max(...top.filter(item=>item.basis==="sales").map(item=>item.unitsYear));
  if(row.unitsPeriod>=2&&row.unitsYear-row.unitsPeriod<=1){
    const all=row.unitsYear===row.unitsPeriod?`All ${row.unitsPeriod}`:`${row.unitsPeriod} of the ${row.unitsYear}`;
    return `${all} of its sales this year came in the last ${days} days${row.views&&row.views<2000?`, from only ${row.views.toLocaleString("en-US")} views`:""}.`;
  }
  if(row.unitsYear===bestYear&&row.unitsYear>=5)return "Your best seller this year, and still selling.";
  if(mostReviewed.id===row.listingId&&own.count>=5)return "Your most-reviewed listing. Customers keep coming back to it.";
  if(row.unitsYear===row.unitsPeriod)return `Its only ${row.unitsYear===1?"sale":"sales"} this year came in the last ${days} days.`;
  return `${plural(row.unitsPeriod,"sale")} in the last ${days} days, ${row.unitsYear} in the last 12 months.`;
}

/* ───────────── Your winning formula ───────────── */

export type FormulaCard={key:string;label:string;share:number;recent:number|null;trend:"up"|"down"|"flat"|null;listingIds:number[]};

function traitKeys(read:DesignRead):Array<[string,string]>{
  const out:Array<[string,string]>=[];
  if(read.credit)out.push(["credit","A quote credited to a named person"]);
  if(read.garment)out.push(["garment:"+read.garment,`Printed on a ${read.garment} product`]);
  out.push(read.textLed?["textLed","Words lead the design"]:["artLed","Art leads the design"]);
  if(read.art!=="none")out.push(["art:"+read.art,{floral:"Floral art",animal:"Animal art",figure:"Figure or face art",symbol:"Symbol art",pattern:"Pattern art",other:"Other art"}[read.art]]);
  return out;
}

/**
 * What the designs buyers chose have in common: share of 12-month units per
 * trait, and the same share over the selected period ("lately"). Only read
 * designs count, so the denominator is the units of read designs.
 */
export function winningFormula(year:YearSale[],period:Array<{listingId:number;unitsPurchased:number}>,reads:Map<number,DesignRead>,catalog:CatalogListing[]):{cards:FormulaCard[];units:number}{
  const family=new Map(catalog.map(row=>[row.listingId,row.family]));
  const tally=(rows:Array<[number,number]>)=>{
    const by=new Map<string,{label:string;units:number;ids:number[]}>();let total=0;
    for(const [id,units] of rows){const read=reads.get(id);if(!read||!units)continue;total+=units;
      for(const [key,raw] of traitKeys(read)){
        const fam=family.get(id);
        const label=key.startsWith("garment:")?`Printed on a ${read.garment} ${fam?familyName(fam).replace(/s$/,""):"product"}`:raw;
        const row=by.get(key)??{label,units:0,ids:[]};row.units+=units;row.ids.push(id);by.set(key,row);}}
    return {by,total};
  };
  const yearUnits=new Map<number,number>();
  for(const sale of year)yearUnits.set(sale.listingId,(yearUnits.get(sale.listingId)??0)+Number(sale.sales||0));
  const yr=tally([...yearUnits.entries()]);
  const lately=tally(period.map(row=>[row.listingId,row.unitsPurchased] as [number,number]));
  if(yr.total<5)return {cards:[],units:yr.total};
  /* One card per kind of trait, strongest first, so the four cards say four
     different things instead of four garment colours. */
  const kinds=["credit","garment:","textLed|artLed","art:"];
  const cards:FormulaCard[]=[];
  for(const kind of kinds){
    const options=[...yr.by.entries()].filter(([key])=>kind.split("|").some(prefix=>key===prefix||key.startsWith(prefix)&&prefix.endsWith(":")))
      .sort((a,b)=>b[1].units-a[1].units);
    const pick=options[0];if(!pick||pick[1].ids.length<1)continue;
    const [key,row]=pick;const share=row.units/yr.total;
    const recentRow=lately.by.get(key);const recent=lately.total>=3?(recentRow?.units??0)/lately.total:null;
    const trend=recent==null?null:recent-share>=0.08?"up":share-recent>=0.08?"down":"flat";
    const ids=[...new Set(row.ids)].sort((a,b)=>(yearUnits.get(b)??0)-(yearUnits.get(a)??0));
    cards.push({key,label:row.label,share,recent,trend,listingIds:ids.slice(0,3)});
  }
  return {cards,units:yr.total};
}

/* ───────────── The products they choose / Saved, not bought ───────────── */

export type ProductRow={family:string;label:string;sold:number;listed:number};
export function productsChosen(catalog:CatalogListing[],year:YearSale[]):{rows:ProductRow[];total:number}{
  const fam=new Map(catalog.map(row=>[row.listingId,row.family||""]));
  const stats=new Map<string,ProductRow>();
  const get=(family:string)=>{let row=stats.get(family);if(!row){const label=familyName(family);row={family,label:label[0].toUpperCase()+label.slice(1),sold:0,listed:0};stats.set(family,row)}return row};
  let total=0;
  for(const row of catalog)if(row.state==="active"&&row.family)get(row.family).listed++;
  for(const sale of year){const units=Number(sale.sales||0);total+=units;const family=fam.get(sale.listingId);if(family)get(family).sold+=units;}
  return {rows:[...stats.values()].filter(row=>row.listed>0||row.sold>0).sort((a,b)=>b.sold-a.sold||b.listed-a.listed).slice(0,4),total};
}

export function savedNotBought(catalog:CatalogListing[],year:YearSale[],exclude:Set<number>):CatalogListing[]{
  const sold=new Set(year.filter(sale=>Number(sale.sales||0)>0).map(sale=>sale.listingId));
  return catalog.filter(row=>row.state==="active"&&!sold.has(row.listingId)&&!exclude.has(row.listingId)&&(row.favorites??0)>=100)
    .sort((a,b)=>(b.favorites??0)-(a.favorites??0)).slice(0,4);
}

/* ───────────── What buyers tell you ───────────── */

type Count={label:string;n:number};
export type BuyerSignals={
  count:number;
  whoFor:Count[];
  wear:{work:number;campus:number;march:number;quote:string|null};
  when:{gift:number;birthday:number;holiday:number;quote:string|null};
  back:{n:number;quotes:string[]};
};

const WHO:Array<[string,RegExp]>=[
  ["Friends",/\b(my|a|for (a|my)) (best )?friend'?s?\b|\bbestie\b|\bbff\b/i],
  ["Daughters",/\bdaughters?\b/i],
  ["Sisters",/\bsisters?\b/i],
  ["Moms",/\b(my|for) (mom|mother|mum)\b/i],
  ["Men in their life",/\b(husband|boyfriend|hubby|dad|father|son|brother|grandson)\b|\bmen in my life\b/i],
  ["Wives and partners",/\b(my|for) (wife|girlfriend|partner)\b/i],
];
const WORK=/\b(wore|wear|wearing) (it|this|this shirt|it) to work\b|\bto work\b|\bat work\b|\bmy (job|office|coworkers?|co-workers?)\b/i;
const CAMPUS=/\bcollege\b|\bcampus\b|\buniversity\b|\bdorm\b/i;
const MARCH=/\bmarch(es|ed|ing)?\b|\bprotest|\brally\b|\bvot(e|ing)\b|\belection\b/i;
const GIFT=/\bgift|\bpresent\b|\b(bought|got|ordered) (this|it|one|these|them) for\b|\bfor my (wife|daughter|mom|mother|sister|friend|husband|son|girlfriend|boyfriend|niece|aunt|grandma|bestie)\b/i;
const BIRTHDAY=/\bbirthday\b|\bbday\b/i;
const HOLIDAY=/\bchristmas\b|\bmother'?s day\b|\bvalentine|\bholiday\b|\bhanukkah\b/i;
const BACK=/(order|buy|purchase|shop) (from (this shop|you|them) )?again|business again|be back|be ordering|order more|ordering more|buy more|buying more|will be buying|come back|from this shop again|another one|bought another|ordered another|second (one|shirt|time)|2nd time|third (shirt|one|time|purchase)|my third/i;

const sentence=(text:string,max=150)=>{const clean=decode(text);if(clean.length<=max)return clean;
  const cut=clean.slice(0,max);const stop=Math.max(cut.lastIndexOf(". "),cut.lastIndexOf("! "));return stop>40?cut.slice(0,stop+1):cut.replace(/\s+\S*$/,"")+"…"};

/** Plain counts from the shop's own reviews. One review counts once per question. */
export function buyerSignals(reviews:OwnReview[]):BuyerSignals{
  const text=reviews.map(review=>({...review,t:decode(review.review)}));
  const pick=(rows:typeof text,re?:RegExp)=>{const row=rows.filter(item=>item.rating>=4).sort((a,b)=>b.createdAt-a.createdAt)
    .find(item=>item.t.length>=20&&item.t.length<=240);if(!row)return null;
    if(!re)return sentence(row.t);const at=row.t.search(re);const from=Math.max(0,row.t.lastIndexOf(".",at)+1);return sentence(row.t.slice(from).trim())};
  const work=text.filter(item=>WORK.test(item.t)),campus=text.filter(item=>CAMPUS.test(item.t)),march=text.filter(item=>MARCH.test(item.t));
  const gift=text.filter(item=>GIFT.test(item.t)),birthday=text.filter(item=>BIRTHDAY.test(item.t)),holiday=text.filter(item=>HOLIDAY.test(item.t));
  const back=text.filter(item=>BACK.test(item.t));
  const giftBirthday=text.filter(item=>BIRTHDAY.test(item.t)&&(GIFT.test(item.t)||BACK.test(item.t)));
  return {count:reviews.length,
    whoFor:WHO.map(([label,re])=>({label,n:text.filter(item=>re.test(item.t)).length})).filter(row=>row.n>0).sort((a,b)=>b.n-a.n).slice(0,4),
    wear:{work:work.length,campus:campus.length,march:march.length,quote:pick(work,WORK)??pick(march,MARCH)},
    when:{gift:gift.length,birthday:birthday.length,holiday:holiday.length,quote:pick(giftBirthday)??pick(gift,GIFT)},
    back:{n:back.length,quotes:back.filter(item=>item.rating>=4).sort((a,b)=>b.createdAt-a.createdAt)
      .map(item=>{const at=item.t.search(BACK);const from=Math.max(0,item.t.lastIndexOf(".",at)+1);return sentence(item.t.slice(from).trim(),120)})
      .filter(line=>line.length>=12).slice(0,2)}};
}

/** "Your tees get worn to work, to campus and to marches." Only places with a count. */
export function wearLine(signals:BuyerSignals,product:string){
  const places=[signals.wear.work?"to work":"",signals.wear.campus?"to campus":"",signals.wear.march?"to marches":""].filter(Boolean);
  if(!places.length)return null;
  const list=places.length===1?places[0]:places.slice(0,-1).join(", ")+" and "+places[places.length-1];
  return `Your ${product} get worn ${list}.`;
}

export function whenLine(signals:BuyerSignals){
  const {gift,birthday,holiday}=signals.when;
  if(!gift&&!birthday)return null;
  const occasion=birthday>holiday?" A birthday is the occasion named most.":holiday>birthday?" Holidays are the occasion named most.":"";
  return `${gift} of ${signals.count} reviews mention a gift.${occasion}`;
}

export function backLine(signals:BuyerSignals){
  if(!signals.back.n||!signals.count)return null;
  const every=Math.round(signals.count/signals.back.n);
  return every<=1?"Most of your reviewers say they will come back.":`That’s about 1 in every ${every} reviewers.`;
}

export const nameOf=(reads:Map<number,DesignRead>,id:number,title:string)=>reads.get(id)?.name??shortName(title);
