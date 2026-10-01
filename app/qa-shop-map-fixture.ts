/* Isolated, read-only reviewer data. No Etsy or member account is used. */
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
}];
export const qaListings = titles.map((title,index) => ({
  listingId:index+1,title,tags:[],state:"active",family:["tee","sweatshirt","tee","poster","mug"][index],
  artworkHash:`qa-art-${index+1}`,favorites:[38,24,15,10,8][index],views:[310,250,150,90,70][index],
  imageUrl:images[index],sold90:sold[index],
}));

export function qaMapFixture(url: URL) {
  const view = url.searchParams.get("view") ?? "overview-insights";
  if (view === "overview-insights") return {
    shop,patterns,visualCoverage:{analysedListings:20,totalListings:20},
    winnerDna:{basis:"sales-90",sellingArtworks:4,traits:[
      {label:"Typography: stacked bold",sellingArtworks:3,customerPercent:78,catalogPercent:25},
      {label:"Short visible wording",sellingArtworks:3,customerPercent:73,catalogPercent:30},
    ]},
  };
  if (view === "overview-support") return {catalogActions,opportunities:[],marketCorroboration:[]};
  if (view === "overview-market") return {marketProof};
  if (view === "money") return {
    shop,month:"2026-09",timezoneNeeded:false,
    thisMonth:{revenueMinor:842300,productRevenueMinor:799000,shippingCollectedMinor:43300,
      discountsMinor:0,marketplaceTaxMinor:0,etsyFeesMinor:102000,etsyTransactionFeesMinor:52000,
      etsyProcessingFeesMinor:30000,etsyListingFeesMinor:20000,etsyAdvertisingFeesMinor:0,
      etsyOtherFeesMinor:0,productionCostMinor:350000,productionProductCostMinor:310000,
      productionShippingMinor:40000,refundsMinor:0,adjustmentsMinor:0,profitMarginPercent:46.3,
      currency:"USD",headline:"Verified profit",label:"verified",profitMinor:390300,
      accuracy:"Includes recorded sales, fees and production costs.",orders:41,
      coverage:{verified:41,estimated:0,unavailable:0}},
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
