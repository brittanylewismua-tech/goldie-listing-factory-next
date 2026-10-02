/* Isolated, read-only reviewer data. No Etsy or member account is used. */
import { buildPurchasePriorities } from "./shop-map-purchase-priorities";
const shop = { shopId: 900001, shopName: "Goldie Reviewer Shop", imageUrl: "" };
const images = [1,2,3,4,5].map(id => `/qa-artwork-${id}.svg`);
const titles = [
  "My Body My Choice Statement Tee",
  "Motherhood Is Political Sweatshirt",
  "Smash The Patriarchy Tee",
  "Bodily Autonomy Is For Everyone Poster",
  "I Raise Daughters Who Resist Mug",
];
const sold = [22,16,9,6,3];
const topListings = titles.map((title,index) => ({
  rank:index+1,listingId:index+1,title,imageUrl:images[index],
  signal:sold[index],attentionPercent:Math.round(sold[index]/56*100),
}));
const patterns = {
  basis:"sales-90",basisLabel:"units sold in the last 90 days",totalSignal:56,
  patterns:[
    {rank:1,key:"bodily autonomy",label:"Bodily Autonomy",customerPercent:50,catalogPercent:15,gapPoints:35,lift:3.3,sellingListings:3,catalogListings:3,listingIds:[1,2,4]},
    {rank:2,key:"feminist motherhood",label:"Feminist Motherhood",customerPercent:34,catalogPercent:10,gapPoints:24,lift:3.4,sellingListings:2,catalogListings:2,listingIds:[2,5]},
    {rank:3,key:"anti patriarchy humor",label:"Anti Patriarchy Humor",customerPercent:16,catalogPercent:8,gapPoints:8,lift:2,sellingListings:1,catalogListings:2,listingIds:[3]},
  ],
  overbuilt:[{key:"generic floral",label:"Generic Floral",customerPercent:4,catalogPercent:26,activeArtworkCount:5}],
  listings:topListings,
};
const catalogActions = [
  {listingId:5,title:titles[4],headline:"Sales have dropped",fact:"1 sold in 30 days, down from 6",
    evidence:"1 non-refunded unit in the last 30 days versus 6 in the preceding 30 days.",
    nextStep:"Check Etsy Stats for changes in visits and orders.",priority:2},
  {listingId:4,title:titles[3],headline:"Emerging winner",fact:"6 sold in 30 days after 0 in the previous 30",
    evidence:"6 non-refunded units in the last 30 days versus 0 in the preceding 30 days.",
    nextStep:"Keep this listing active and test a distinct variation if the rise continues.",priority:3},
];
const marketProof = [{
  patternKey:"bodily autonomy",phrase:"bodily autonomy",sellingListings:8,
  observedSold30:21,moving:8,productFamilies:[{family:"sweatshirt",sold30:12},{family:"tee",sold30:9}],
  listings:[{listingId:900007,title:"My Body My Choice Tee",imageUrl:images[0],
    etsyUrl:"https://www.etsy.com/listing/900007",priceCents:3200,currency:"USD",
    observedUnits30:3,confirmedAt:0,reviewsOnThisListing:2}],
}];
export const qaListings = [...titles.map((title,index) => ({
  listingId:index+1,title,tags:[],state:"active",family:["tee","sweatshirt","tee","poster","mug"][index],
  artworkHash:`qa-art-${index+1}`,favorites:[38,24,15,10,8][index],views:[310,250,150,90,70][index],
  imageUrl:images[index],sold90:sold[index],
})),{listingId:6,title:"My Body My Choice Sweatshirt",tags:[],state:"active",family:"sweatshirt",
  artworkHash:"qa-art-1",favorites:2,views:35,imageUrl:images[0],sold90:0}];

export function qaMapFixture(url: URL) {
  const view = url.searchParams.get("view") ?? "overview-insights";
  if (view === "overview-purchases") {
    const now=Math.floor(Date.now()/1000);
    const recent=[8,5,3,6,1];
    const sales=titles.flatMap((_,index)=>[
      {listingId:index+1,quantity:recent[index],priceMinor:2800,currency:"USD",soldAt:now-10*86400,refunded:false},
      {listingId:index+1,quantity:sold[index]-recent[index],priceMinor:2800,currency:"USD",soldAt:now-45*86400,refunded:false},
    ]);
    const days=Number(url.searchParams.get("days"))===30?30:90;
    return {shop,purchasePriorities:buildPurchasePriorities(sales,
      titles.map((title,index)=>({listingId:index+1,title,imageUrl:images[index],state:"active"})),
      {days,now,receiptsComplete:true,refreshedAt:now-3600})};
  }
  if (view === "overview-insights") {
    const days=Number(url.searchParams.get("days"))===30?30:90;
    const ranked=days===30?[1,4,2,3,5]:[1,2,3,4,5];
    const direction=(listingId:number)=>({
      listingId,kind:listingId===1?"already-offered":listingId>=4?"research":"check-first",
      retainedCharacteristic:listingId===1?"the visible wording “MY BODY MY CHOICE” and its artwork":
        listingId===2?"the visible wording “MOTHERHOOD IS POLITICAL” and its artwork":
        listingId===3?"the visible wording “SMASH THE PATRIARCHY” and its artwork":
        listingId===5?"the visible wording “I RAISE DAUGHTERS WHO RESIST” and its artwork":
        "the visible bodily autonomy message and its artwork",
      proposedChange:null,targetFormat:listingId>=4?null:listingId===2?"tee":"sweatshirt",
      catalogCoverage:listingId===1?"This exact artwork is already listed on a sweatshirt (active).":
        listingId>=4?"No supported format suggestion is available yet from the verified active catalog.":
        `No exact-artwork ${listingId===2?"tee":"sweatshirt"} was found in the current artwork-linked catalog.`,
      whyNow:`${days===30?[8,5,3,6,1][listingId-1]:sold[listingId-1]} purchased units in the last ${days} days`,
      relatedListingId:listingId===1?6:null,researchQuestion:listingId===1
        ?"Compare the existing sweatshirt with the tee before creating another version.":
        listingId>=4?"Review same-format variations and confirm feasible changes.":"Check existing versions and confirm artwork fit before building.",
    });
    return {
    shop,patterns,productDirections:ranked.map(direction),opportunityFindings:[
      {id:"existing-qa-art-1",kind:"compare",listingIds:[1,6],title:titles[0],imageUrl:images[0],label:"EXISTING FORMAT",
        evidence:`${days===30?8:22} purchased on tee; 0 on the existing sweatshirt in the last ${days} days.`,
        direction:"Compare the existing version before creating another.",detail:"Compare listing dates, visits, availability, imagery, price and options."},
      {id:"emerging-4",kind:"emerging",listingIds:[4],title:titles[3],imageUrl:images[3],label:"EMERGING",
        evidence:"6 purchased in the last 30 days; 0 in the prior 30.",direction:"Inspect what changed before building on it.",
        detail:"Check listing age, visits, availability and related products."},
    ],analysedListingIds:[1,2,3,4,5],visualCoverage:{analysedListings:20,totalListings:20},
    winnerDna:{basis:"sales-90",sellingArtworks:4,traits:[
      {label:"Typography: stacked bold",sellingArtworks:3,customerPercent:78,catalogPercent:25,listingIds:[1,2,3]},
      {label:"Short visible wording",sellingArtworks:3,customerPercent:73,catalogPercent:30,listingIds:[1,2,3]},
    ]},
  };
  }
  if (view === "overview-support") return {catalogActions,opportunities:[],marketCorroboration:[]};
  if (view === "overview-market") return {marketProof:marketProof.map(proof=>({...proof,
    listings:proof.listings.map(row=>({...row,confirmedAt:Math.floor(Date.now()/1000)-86400}))}))};
  if (view === "money") return {
    shop,month:"2026-09",timezoneNeeded:false,
    thisMonth:{revenueMinor:842300,productRevenueMinor:799000,shippingCollectedMinor:43300,
      discountsMinor:0,marketplaceTaxMinor:0,etsyFeesMinor:102000,etsyTransactionFeesMinor:52000,
      etsyProcessingFeesMinor:30000,etsyListingFeesMinor:20000,etsyAdvertisingFeesMinor:0,
      etsyOtherFeesMinor:0,productionCostMinor:350000,productionProductCostMinor:310000,
      productionShippingMinor:40000,refundsMinor:0,adjustmentsMinor:0,profitMarginPercent:46.3,
      currency:"USD",headline:"Verified profit",label:"verified",profitMinor:390300,
      accuracy:"Includes recorded sales, fees and production costs.",orders:41,
      coverage:{verified:1,estimated:0,unavailable:0}},
  };
  if (view === "themes") return {
    shop,worldsPeriod:"last 90 days",worlds:[
      {worldId:"autonomy",label:"Bodily autonomy",listings:7,activeListings:7,period:"Last 90 days",
       orders:28,units:32,lifetimeUnits:96,revenueMinor:318000,lifetimeOrders:80,lifetimeRevenueMinor:1150000,
       evidence:"Grouped from stored listing classifications.",
       productFamilies:[{family:"tee",listings:4},{family:"sweatshirt",listings:3}],
       memberListings:[{listingId:1,title:titles[0],imageUrl:images[0],favorites:38,sales:22,state:"active"}],
       reviews:{recent:3,lifetimeHeld:12}},
      {worldId:"motherhood",label:"Feminist motherhood",listings:5,activeListings:5,period:"Last 90 days",
       orders:16,units:19,lifetimeUnits:44,revenueMinor:210000,lifetimeOrders:39,lifetimeRevenueMinor:440000,
       evidence:"Grouped from stored listing classifications.",
       productFamilies:[{family:"sweatshirt",listings:3},{family:"mug",listings:2}],
       memberListings:[{listingId:2,title:titles[1],imageUrl:images[1],favorites:24,sales:16,state:"active"}],
       reviews:{recent:2,lifetimeHeld:8}},
    ],unclassifiedCard:null,
  };
  if (view === "sold") return {
    shop,soldListings:{period:`Last ${[30,90,365].includes(Number(url.searchParams.get("days")))?url.searchParams.get("days"):"90"} days`,
      days:Number(url.searchParams.get("days")||90),
      listings:titles.map((title,index)=>({
        listingId:index+1,title,imageUrl:images[index],favorites:qaListings[index].favorites,
        sales:sold[index],revenueMinor:sold[index]*2800,
      }))},
  };
  return { error: "Unknown reviewer view." };
}
