import {WinningPatterns} from "@/app/shop-map/shop-map-client";
import type {WinningPatternMap} from "@/app/shop-map-patterns";
import "@/app/shop-map/shop-map.css";

export const metadata={title:"My Shop visual review"};

const patterns:WinningPatternMap={
  basis:"sales-90",
  basisLabel:"units sold in the last 90 days",
  totalSignal:100,
  patterns:[
    {rank:1,key:"reproductive rights",label:"Reproductive Rights",customerPercent:31,catalogPercent:12,gapPoints:19,lift:2.6,sellingListings:7,catalogListings:10,listingIds:[1,2,3,4,5,6,7]},
    {rank:2,key:"anti patriarchy",label:"Anti Patriarchy",customerPercent:24,catalogPercent:11,gapPoints:13,lift:2.2,sellingListings:6,catalogListings:9,listingIds:[8,9,10,11,12,13]},
    {rank:3,key:"women history",label:"Women History",customerPercent:18,catalogPercent:9,gapPoints:9,lift:2,sellingListings:4,catalogListings:7,listingIds:[14,15,16,17]},
    {rank:4,key:"feminist mama",label:"Feminist Mama",customerPercent:14,catalogPercent:8,gapPoints:6,lift:1.8,sellingListings:3,catalogListings:6,listingIds:[18,19,20]},
    {rank:5,key:"voting rights",label:"Voting Rights",customerPercent:10,catalogPercent:7,gapPoints:3,lift:1.4,sellingListings:3,catalogListings:6,listingIds:[21,22,23]},
  ],
  listings:[
    {rank:1,listingId:1,title:"My Body My Choice Feminist Tee",imageUrl:"",signal:22,attentionPercent:22},
    {rank:2,listingId:2,title:"Bans Off Our Bodies Shirt",imageUrl:"",signal:18,attentionPercent:18},
    {rank:3,listingId:8,title:"Smash The Patriarchy Sweatshirt",imageUrl:"",signal:16,attentionPercent:16},
    {rank:4,listingId:14,title:"Well Behaved Women History Tee",imageUrl:"",signal:12,attentionPercent:12},
    {rank:5,listingId:21,title:"Votes For Women Shirt",imageUrl:"",signal:10,attentionPercent:10},
  ],
};

export default function MyShopVisualReview(){
  return <main id="suite-workspace">
    <div className="shop-map shop-map-redesign" style={{maxWidth:1180,margin:"0 auto",padding:"40px 24px 80px"}}>
      <header className="shop-map-head current-page-heading">
        <div><p className="current-kicker">YOUR SHOP</p><h1>She's A Wolf Clothing</h1>
          <p>What is working, where your attention belongs, and what to build out next.</p></div>
      </header>
      <nav className="shop-map-tabs" aria-label="Your shop sections">
        <button aria-current="page">Opportunity Engine</button><button>Your numbers</button>
        <button>Product themes</button><button>Sold listings</button>
      </nav>
      <WinningPatterns map={patterns}/>
    </div>
  </main>;
}
