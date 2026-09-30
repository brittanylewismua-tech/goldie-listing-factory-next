import {AttentionEngine,OpportunityRecommendations,type AttentionMap,type ShopOpportunity} from "@/app/shop-map/shop-map-client";
import "@/app/shop-map/shop-map.css";

export const metadata={title:"My Shop visual review"};

const fixture:AttentionMap={
  basis:"sales-90",
  basisLabel:"units sold in the last 90 days",
  totalSignal:100,
  listings:[
    {rank:1,listingId:1,title:"Cowboy Book Club Romance Reader Sweatshirt",imageUrl:"",signal:36,attentionShare:.36,attentionPercent:36,worldId:"dark"},
    {rank:2,listingId:2,title:"Dark Romance Reader Graphic Tee",imageUrl:"",signal:24,attentionShare:.24,attentionPercent:24,worldId:"dark"},
    {rank:3,listingId:3,title:"Bookstore Social Club Shirt",imageUrl:"",signal:17,attentionShare:.17,attentionPercent:17,worldId:"bookish"},
    {rank:4,listingId:4,title:"Western Reader Book Lover Tee",imageUrl:"",signal:13,attentionShare:.13,attentionPercent:13,worldId:"western"},
    {rank:5,listingId:5,title:"Teacher Reading Club Sweatshirt",imageUrl:"",signal:10,attentionShare:.10,attentionPercent:10,worldId:"teacher"},
  ],
  worlds:[
    {rank:1,worldId:"dark",label:"Dark Romance",signal:40,attentionShare:.40,attentionPercent:40,activeListings:6,catalogShare:.12,catalogPercent:12,buildGap:.28,buildGapPoints:28,state:"underbuilt"},
    {rank:2,worldId:"bookish",label:"Bookish Humor",signal:27,attentionShare:.27,attentionPercent:27,activeListings:13,catalogShare:.26,catalogPercent:26,buildGap:.01,buildGapPoints:1,state:"aligned"},
    {rank:3,worldId:"western",label:"Western Readers",signal:18,attentionShare:.18,attentionPercent:18,activeListings:5,catalogShare:.10,catalogPercent:10,buildGap:.08,buildGapPoints:8,state:"underbuilt"},
    {rank:4,worldId:"teacher",label:"Teacher",signal:8,attentionShare:.08,attentionPercent:8,activeListings:15,catalogShare:.30,catalogPercent:30,buildGap:-.22,buildGapPoints:-22,state:"overbuilt"},
    {rank:5,worldId:"mom",label:"Mom Life",signal:7,attentionShare:.07,attentionPercent:7,activeListings:11,catalogShare:.22,catalogPercent:22,buildGap:-.15,buildGapPoints:-15,state:"overbuilt"},
  ],
};

const opportunities:ShopOpportunity[]=[
  {worldId:"dark",label:"Dark Romance",rank:1,state:"underbuilt",
    headline:"Dark Romance deserves more of your next build cycle.",
    explanation:"Dark Romance is earning 40% of your recent sales, but only 12% of your active catalog is built around it.",
    action:"Build deeper into this customer world before spending the same energy on weaker ideas.",
    mirrorBotPrompt:"Research the Dark Romance customer world for me. It currently accounts for 40% of my recent sales, but only 12% of my active Etsy catalog, so I want to build deeper into what is already working. Identify the strongest audience identities, recurring language, emotional themes, rituals, inside jokes, adjacent sub-niches, and fresh design territories I can explore next. Stay close to the proven customer instead of sending me into unrelated niches."},
  {worldId:"western",label:"Western Readers",rank:3,state:"underbuilt",
    headline:"Western Readers deserves more of your next build cycle.",
    explanation:"Western Readers is earning 18% of your recent sales, but only 10% of your active catalog is built around it.",
    action:"Build deeper into this customer world before spending the same energy on weaker ideas.",
    mirrorBotPrompt:"Research the Western Readers customer world for me and help me build deeper into what is already working."},
  {worldId:"teacher",label:"Teacher",rank:4,state:"overbuilt",
    headline:"Stop giving Teacher more catalog space than customers are earning for it.",
    explanation:"Teacher is 30% of your active catalog but only 8% of your recent sales.",
    action:"Maintain the listings that already work, but pause expansion here until customer response catches up.",
    mirrorBotPrompt:null},
];

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
      <AttentionEngine attention={fixture}/>
      <OpportunityRecommendations rows={opportunities}/>
    </div>
  </main>;
}
