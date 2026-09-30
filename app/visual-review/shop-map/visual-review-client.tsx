"use client";
import {useEffect,useState} from "react";
import ShopMapClient from "@/app/shop-map/shop-map-client";

const json=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{"Content-Type":"application/json"}});

const topListings=[
  {rank:1,listingId:1,title:"My Body My Choice Feminist Tee",imageUrl:"",signal:22,attentionPercent:22},
  {rank:2,listingId:2,title:"Bans Off Our Bodies Shirt",imageUrl:"",signal:18,attentionPercent:18},
  {rank:3,listingId:8,title:"Smash The Patriarchy Sweatshirt",imageUrl:"",signal:16,attentionPercent:16},
];

export default function VisualReviewClient(){
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    for(let i=sessionStorage.length-1;i>=0;i--){
      const key=sessionStorage.key(i);
      if(key?.startsWith("goldie:shop-map:"))sessionStorage.removeItem(key);
    }
    const original=window.fetch.bind(window);
    window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
      if(url.includes("/api/shop-map/map?")){
        const parsed=new URL(url,window.location.origin);
        const view=parsed.searchParams.get("view");
        if(view==="overview-insights")return json({
          shop:{shopId:1,shopName:"She's A Wolf Clothing"},
          patterns:{basis:"sales-90",basisLabel:"units sold in the last 90 days",totalSignal:56,patterns:[],listings:topListings},
          visualCoverage:{analysedListings:0,totalListings:42},
        });
        if(view==="overview-support")return json({
          catalogActions:[{listingId:8,title:"Smash The Patriarchy Sweatshirt",headline:"Sales have dropped",fact:"2 sold in 30 days, down from 7",evidence:"Sales slowed in the latest 30-day window.",nextStep:"Review the listing.",priority:2}],
          opportunities:[],marketCorroboration:[],
        });
        if(view==="money")return json({
          shop:{shopId:1,shopName:"She's A Wolf Clothing"},month:"2026-09",timezoneNeeded:false,
          thisMonth:{revenueMinor:842300,productRevenueMinor:799000,shippingCollectedMinor:43300,discountsMinor:0,marketplaceTaxMinor:0,
            etsyFeesMinor:102000,etsyTransactionFeesMinor:52000,etsyProcessingFeesMinor:30000,etsyListingFeesMinor:20000,
            etsyAdvertisingFeesMinor:0,etsyOtherFeesMinor:0,productionCostMinor:350000,productionProductCostMinor:310000,
            productionShippingMinor:40000,refundsMinor:0,adjustmentsMinor:0,profitMarginPercent:46.3,currency:"USD",
            headline:"Verified profit",label:"verified",profitMinor:390300,accuracy:"Includes recorded sales, fees and production costs.",
            orders:41,coverage:{verified:1,estimated:0,unavailable:0}},
        });
        if(view==="themes")return json({
          shop:{shopId:1,shopName:"She's A Wolf Clothing"},worldsPeriod:"last 90 days",
          worlds:[{worldId:"body",label:"Bodily autonomy",listings:12,activeListings:9,period:"Last 90 days",orders:21,units:24,lifetimeUnits:88,
            revenueMinor:318000,lifetimeOrders:80,lifetimeRevenueMinor:1150000,evidence:"Grouped from stored listing classifications.",
            productFamilies:[{family:"tee",listings:9}],memberListings:[
              {listingId:1,title:"My Body My Choice Feminist Tee",imageUrl:"",favorites:33,sales:12,state:"active"}],reviews:{recent:3,lifetimeHeld:12}}],
          unclassifiedCard:null,
        });
        if(view==="sold")return json({
          shop:{shopId:1,shopName:"She's A Wolf Clothing"},month:"2026-09",
          soldListings:{period:"Last 90 days",days:Number(parsed.searchParams.get("days")||90),listings:[
            {listingId:1,title:"My Body My Choice Feminist Tee",imageUrl:"",favorites:33,sales:12,revenueMinor:36000},
            {listingId:2,title:"Bans Off Our Bodies Shirt",imageUrl:"",favorites:21,sales:9,revenueMinor:27000},
          ]},
        });
      }
      if(url.includes("/api/shop-map/my-listings"))return json({listings:[
        {listingId:1,title:"My Body My Choice Feminist Tee",family:"tee",sold90:12,favorites:33,imageUrl:"",artworkHash:"art-1"},
      ]});
      return original(input as any,init);
    };
    setReady(true);
    return()=>{window.fetch=original};
  },[]);
  if(!ready)return null;
  return <ShopMapClient signedInEmail="visual-review@example.com"/>;
}
