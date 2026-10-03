/*
  Votes from the shop's own orders and reviews, beyond units sold.

  Every figure is a count over stored rows. When a source has not been
  synced yet the section says so; nothing is estimated to fill a gap.

  BUYER PRIVACY (decided by Brittany, 3 Oct 2026): from an order we keep a
  one-way buyer code (HMAC of the Etsy buyer id, so the same buyer can be
  recognised again but never identified), the state/region and country,
  whether it was marked as a gift and whether it carried a gift message.
  Never a name, address, email or the message text.
*/

export type OrderSignal={receiptId:number;buyerKey:string|null;country:string|null;region:string|null;
  isGift:boolean;giftMessage:boolean;createdAt:number};
export type SaleVariation={transactionId:number;receiptId:number;listingId:number;quantity:number;
  variations:Array<{name:string;value:string}>;soldAt:number};
export type ReviewPhoto={transactionId:number;listingId:number|null;rating:number|null;imageUrl:string;createdAt:number};
export type Snapshot={listingId:number;day:string;favorites:number};
export type YearSaleRow={listingId:number;quantity:number;soldAt:number};

const DAY=86_400;

/* "Primary color", "Colour", "Shirt Color" → Color; "Sizes", "Size (Unisex)" → Size. */
export function optionName(raw:string){
  const name=String(raw||"").trim();
  if(/colou?r/i.test(name))return "Color";
  if(/size/i.test(name))return "Size";
  if(/style|type|fit/i.test(name))return "Style";
  return name?name[0].toUpperCase()+name.slice(1):"Option";
}
/* Some shops put two choices in one option ("Black / L"); split them so each is counted. */
const SIZE_VALUE=/^(xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl|small|medium|large|x-large|xx-large|youth.*|toddler.*|\d{1,2}(\.\d)?)$/i;
export function splitVariations(rows:Array<{name:string;value:string}>){
  const out:Array<{name:string;value:string}>=[];
  for(const row of rows){
    const name=optionName(row.name);const value=String(row.value||"").trim();if(!value)continue;
    const parts=value.split(/\s*[/|]\s*/).filter(Boolean);
    if(parts.length===2&&parts.some(p=>SIZE_VALUE.test(p))&&parts.some(p=>!SIZE_VALUE.test(p))){
      for(const part of parts)out.push({name:SIZE_VALUE.test(part)?"Size":"Color",value:part});
    }else out.push({name,value});
  }
  return out;
}

/* "Small" and "S" are the same vote. */
const SIZE_NAMES:Record<string,string>={"x-small":"XS","xsmall":"XS","extra small":"XS","small":"S","medium":"M","large":"L","x-large":"XL","xlarge":"XL",
  "extra large":"XL","xx-large":"2XL","xxlarge":"2XL","xxl":"2XL","2x":"2XL","xxx-large":"3XL","xxxl":"3XL","3x":"3XL","4x":"4XL","xxxxl":"4XL","5x":"5XL"};
/* "M US Women's Letter" is the size M with the chart name attached. */
export function sizeLabel(value:string){const clean=value.replace(/&#0?39;|&apos;/g,"'").trim();const key=clean.toLowerCase();
  if(SIZE_NAMES[key])return SIZE_NAMES[key];
  const lead=clean.match(/^(xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl|small|medium|large|x-large|xx-large|\d{1,2})\b/i);
  if(lead&&clean.length>lead[0].length)return SIZE_NAMES[lead[0].toLowerCase()]??lead[0].toUpperCase();
  return clean.toUpperCase().replace(/^(\d)X$/,"$1XL")}
const COLOR_CASE=(value:string)=>value.trim().toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export type OptionVotes={name:string;units:number;values:Array<{value:string;units:number}>};
export function variationVotes(sales:SaleVariation[],since:number):{units:number;options:OptionVotes[]}{
  const by=new Map<string,Map<string,number>>();let units=0;
  for(const sale of sales){
    if(sale.soldAt<since)continue;
    const parts=splitVariations(sale.variations);if(!parts.length)continue;
    units+=sale.quantity;
    for(const part of parts){const raw=part.value.replace(/\s+/g," ");const key=part.name==="Size"?sizeLabel(raw):part.name==="Color"?COLOR_CASE(raw):raw;
      const map=by.get(part.name)??new Map<string,number>();map.set(key,(map.get(key)??0)+sale.quantity);by.set(part.name,map);}
  }
  const order=["Color","Size","Style"];
  const options=[...by.entries()].map(([name,map])=>{const values=[...map.entries()].map(([value,n])=>({value,units:n})).sort((a,b)=>b.units-a.units);
    return {name,units:values.reduce((s,v)=>s+v.units,0),values:values.slice(0,5)}})
    .filter(option=>option.values.length>=2)
    .sort((a,b)=>(order.indexOf(a.name)+1||9)-(order.indexOf(b.name)+1||9)||b.units-a.units).slice(0,2);
  return {units,options};
}

export function repeatBuyers(orders:OrderSignal[],sales:SaleVariation[]){
  const known=orders.filter(order=>order.buyerKey);
  const byBuyer=new Map<string,OrderSignal[]>();
  for(const order of known){const list=byBuyer.get(order.buyerKey!)??[];list.push(order);byBuyer.set(order.buyerKey!,list)}
  const repeat=[...byBuyer.values()].filter(list=>list.length>=2);
  const later=new Set<number>();
  for(const list of repeat)for(const order of list.sort((a,b)=>a.createdAt-b.createdAt).slice(1))later.add(order.receiptId);
  const picks=new Map<number,number>();
  for(const sale of sales)if(later.has(sale.receiptId))picks.set(sale.listingId,(picks.get(sale.listingId)??0)+sale.quantity);
  return {buyers:byBuyer.size,repeatBuyers:repeat.length,repeatOrders:later.size,
    secondPicks:[...picks.entries()].map(([listingId,units])=>({listingId,units})).sort((a,b)=>b.units-a.units).slice(0,3)};
}

export function boughtTogether(sales:SaleVariation[],since:number){
  const byReceipt=new Map<number,Set<number>>();
  for(const sale of sales){if(sale.soldAt<since)continue;const set=byReceipt.get(sale.receiptId)??new Set<number>();set.add(sale.listingId);byReceipt.set(sale.receiptId,set)}
  const pairs=new Map<string,{a:number;b:number;orders:number}>();let multi=0;
  for(const set of byReceipt.values()){
    if(set.size<2)continue;multi++;
    const ids=[...set].sort((a,b)=>a-b);
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const key=`${ids[i]}:${ids[j]}`;
      const row=pairs.get(key)??{a:ids[i],b:ids[j],orders:0};row.orders++;pairs.set(key,row)}
  }
  return {orders:byReceipt.size,multiItemOrders:multi,pairs:[...pairs.values()].sort((a,b)=>b.orders-a.orders).slice(0,3)};
}

export function giftOrders(orders:OrderSignal[],since:number){
  const recent=orders.filter(order=>order.createdAt>=since);
  return {orders:recent.length,gifts:recent.filter(order=>order.isGift).length,withMessage:recent.filter(order=>order.giftMessage).length};
}

const US_STATES:Record<string,string>={AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",
  DC:"Washington, DC",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",
  ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
  NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",
  PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",
  WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico"};
const COUNTRIES:Record<string,string>={US:"United States",CA:"Canada",GB:"United Kingdom",AU:"Australia",DE:"Germany",FR:"France",IE:"Ireland",
  NL:"Netherlands",NZ:"New Zealand",SE:"Sweden",NO:"Norway",DK:"Denmark",ES:"Spain",IT:"Italy",CH:"Switzerland",AT:"Austria",BE:"Belgium",MX:"Mexico"};
export function placeName(order:{country:string|null;region:string|null}){
  const country=String(order.country||"").toUpperCase();const region=String(order.region||"").trim();
  if(country==="US")return US_STATES[region.toUpperCase()]??(region||"United States");
  return COUNTRIES[country]??(country||null);
}
export function buyerPlaces(orders:OrderSignal[],since:number){
  const recent=orders.filter(order=>order.createdAt>=since&&(order.country||order.region));
  const by=new Map<string,number>();let abroad=0;
  for(const order of recent){const name=placeName(order);if(!name)continue;by.set(name,(by.get(name)??0)+1);
    if(String(order.country||"").toUpperCase()!=="US")abroad++}
  return {orders:recent.length,abroad,places:[...by.entries()].map(([label,n])=>({label,orders:n})).sort((a,b)=>b.orders-a.orders).slice(0,6)};
}

/** The same 30 days, one year ago: what sold then is what is coming up now. */
export function lastYearWindow(sales:YearSaleRow[],now:number){
  const from=now-365*DAY,to=from+30*DAY;
  const by=new Map<number,number>();let units=0;
  for(const sale of sales){if(sale.soldAt<from||sale.soldAt>=to)continue;units+=sale.quantity;by.set(sale.listingId,(by.get(sale.listingId)??0)+sale.quantity)}
  return {from,to,units,listings:[...by.entries()].map(([listingId,n])=>({listingId,units:n})).sort((a,b)=>b.units-a.units).slice(0,4)};
}

/** Favorites gained since the oldest snapshot at least `days` old. */
export function gainingFavorites(snapshots:Snapshot[],current:Array<{listingId:number;favorites:number|null}>,today:string,days=7){
  const days_=[...new Set(snapshots.map(row=>row.day))].sort();
  const first=days_[0]??null;
  const cutoff=new Date(Date.parse(today+"T00:00:00Z")-days*DAY*1000).toISOString().slice(0,10);
  const base=days_.filter(day=>day<=cutoff).pop()??null;
  if(!base)return {ready:false as const,since:first,days:0,listings:[]};
  const then=new Map(snapshots.filter(row=>row.day===base).map(row=>[row.listingId,row.favorites]));
  const span=Math.round((Date.parse(today)-Date.parse(base))/(DAY*1000));
  const listings=current.filter(row=>row.favorites!=null&&then.has(row.listingId))
    .map(row=>({listingId:row.listingId,gained:Number(row.favorites)-Number(then.get(row.listingId)),favorites:Number(row.favorites)}))
    .filter(row=>row.gained>0).sort((a,b)=>b.gained-a.gained).slice(0,5);
  return {ready:true as const,since:base,days:span,listings};
}

/** What GET /api/shop-map/votes-signals returns. */
export type VotesSignals={
  refreshedAt:number|null;stale:boolean;coverage:{orders:number;since:number};
  variations:ReturnType<typeof variationVotes>;repeat:ReturnType<typeof repeatBuyers>&{since:number|null};
  together:ReturnType<typeof boughtTogether>;gifts:ReturnType<typeof giftOrders>;places:ReturnType<typeof buyerPlaces>;
  lastYear:ReturnType<typeof lastYearWindow>&{covered:boolean};photos:ReviewPhoto[];gaining:ReturnType<typeof gainingFavorites>;
};
