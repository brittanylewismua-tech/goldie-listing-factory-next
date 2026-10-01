import test from "node:test";
import assert from "node:assert/strict";
import {winnerDnaFrom} from "../app/shop-map-winner-dna.ts";
import {discoverVisualWinningPatterns} from "../app/shop-map-visual-patterns.ts";
import {catalogActions} from "../app/shop-map-actions.ts";

const design=(wording,tone="Direct")=>({
  wording:[wording],typography:["Stacked lettering"],illustrationCategory:"None",
  audienceCues:[],recipientCues:[],occasionCues:[],tone,composition:"Centered",
  textToArtRatio:.85,
});
const row=(id,wording,sales90,tone="Direct")=>({
  listingId:id,artworkHash:`art-${id}`,sales90,lifetimeSales:sales90,
  favorites:0,state:"active",design:design(wording,tone),
});

test("Winner DNA names repeated visual traits that over-index among sellers",()=>{
  const dna=winnerDnaFrom([
    row(1,"My Body My Choice",12),row(2,"Bans Off Our Bodies",8),
    row(3,"Garden Flowers",0,"Gentle"),row(4,"Forest Walk",0,"Gentle"),
    row(5,"Nature Time",0,"Gentle"),
  ]);
  assert.equal(dna?.basis,"sales-90");
  assert.ok(dna?.traits.some(trait=>trait.label==="Tone: Direct"));
  assert.ok(dna?.traits.every(trait=>trait.sellingArtworks>=2));
  assert.deepEqual(dna?.traits.find(trait=>trait.label==="Tone: Direct")?.listingIds,[1,2]);
});

test("trait share uses the top analyzed selling artworks and retains contributing identities",()=>{
  const rows=[row(1,"Strong Message",3),row(2,"Another Message",3),
    ...Array.from({length:12},(_,index)=>row(index+3,`Gentle ${index+1}`,1,"Gentle"))];
  const dna=winnerDnaFrom(rows);
  const direct=dna?.traits.find(trait=>trait.label==="Tone: Direct");
  assert.equal(dna?.sellingArtworks,5);
  assert.equal(direct?.customerPercent,67);
  assert.deepEqual(direct?.listingIds,[1,2]);
  assert.equal(rows.reduce((sum,item)=>sum+item.sales90,0),18);
});

test("Winner DNA withholds a shared formula when only one artwork sold",()=>{
  assert.equal(winnerDnaFrom([row(1,"Only One",10),row(2,"Other Design",0)]),null);
});

test("overbuilding is measured from actual artwork concepts and current sales",()=>{
  const map=discoverVisualWinningPatterns([
    row(1,"Cottagecore Dreams",1),row(2,"Cottagecore Dreams",1),
    row(3,"Cottagecore Dreams",1),row(4,"My Body My Choice",12),
    row(5,"Bans Off Our Bodies",11),
  ]);
  assert.ok(map.overbuilt.some(item=>item.key==="cottagecore dreams"));
  assert.ok(map.overbuilt[0].catalogPercent>map.overbuilt[0].customerPercent);
});

test("recent acceleration can produce an emerging-winner review",()=>{
  const now=1_800_000_000;
  const actions=catalogActions([{listing_id:1,title:"Actual listing",state:"active",created_at:now-60*86400,favorites:0}],
    [{listing_id:1,quantity:6,sold_at:now-3*86400,refunded:0}],now);
  assert.equal(actions[0]?.headline,"Emerging winner");
});

test("visual pattern discovery can use analyzed tone without Etsy SEO fields",()=>{
  const map=discoverVisualWinningPatterns([
    row(1,"Strong Body Statement",12),row(2,"Choice Is Mine",8),
    row(3,"Garden Flowers",0,"Gentle"),row(4,"Forest Walk",0,"Gentle"),
    row(5,"Nature Time",0,"Gentle"),
  ]);
  assert.ok(map.patterns.some(item=>item.key==="direct tone"));
});
