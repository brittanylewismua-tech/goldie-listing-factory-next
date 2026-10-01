import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoverWinningPatterns } from "../app/shop-map-patterns.ts";

const row=(id,title,tags,sales90)=>({
  listingId:id,title,tags:[...tags,"girl power"],shopSection:"",productFamily:"tee",
  state:"active",favorites:0,sales90,lifetimeSales:sales90,imageUrl:"",
});

test("ubiquitous shop-wide wording does not masquerade as a winning pattern",()=>{
  const map=discoverWinningPatterns([
    row(1,"My Body My Choice",["reproductive rights"],12),
    row(2,"Bans Off Our Bodies",["reproductive rights"],10),
    row(3,"Smash The Patriarchy",["smash patriarchy"],8),
    row(4,"Down With The Patriarchy",["smash patriarchy"],7),
    row(5,"Votes For Women",["voting rights"],6),
    row(6,"Women Vote",["voting rights"],5),
    row(7,"Women Make History",["women history"],4),
    row(8,"History Made By Women",["women history"],3),
    row(9,"Power Girl Feminist Mama",["feminist mama"],3),
    row(10,"Power Girl Feminist Mom",["feminist mama"],2),
  ]);
  assert.equal(map.basis,"sales-90");
  assert.ok(map.patterns.length>=1&&map.patterns.length<=5);
  assert.equal(map.patterns.some(pattern=>/girl power|power girl/i.test(pattern.key)),false);
  assert.equal(map.patterns.some(pattern=>/girl power|power girl/i.test(pattern.label)),false);
  assert.equal(map.patterns.some(pattern=>{
    const words=new Set(pattern.key.toLowerCase().split(/\s+/));
    return words.has("girl")&&words.has("power");
  }),false,"shop-wide Girl Power language leaked back through a longer phrase variant");
  assert.ok(map.patterns[0].customerPercent>map.patterns[0].catalogPercent);
});

test("patterns do not require pre-existing world assignments",()=>{
  const map=discoverWinningPatterns([
    row(1,"Book Club After Dark",["dark romance"],8),
    row(2,"Morally Gray Book Club",["dark romance"],6),
    row(3,"Generic Reader",["book lover"],0),
    row(4,"Another Reader",["book lover"],0),
  ]);
  assert.ok(map.patterns.some(pattern=>pattern.key==="dark romance"));
});


test("shop-wide language stays background even when many matching listings are inactive",()=>{
  const base=(id,title,tags,sales90,state="active")=>({
    listingId:id,title,tags,shopSection:"",productFamily:"tee",state,
    favorites:0,sales90,lifetimeSales:sales90,imageUrl:"",
  });
  const rows=[
    base(1,"My Body My Choice",["girl power","reproductive rights"],12),
    base(2,"Bans Off Our Bodies",["girl power","reproductive rights"],10),
    base(3,"Smash Patriarchy",["girl power","smash patriarchy"],8),
    base(4,"Women Vote",["girl power","voting rights"],7,"inactive"),
    base(5,"Votes For Women",["girl power","voting rights"],6,"inactive"),
    base(6,"Feminist Mama",["girl power","feminist mama"],0,"inactive"),
    base(7,"Book Lover",["book lover"],0),
    base(8,"Teacher Life",["teacher life"],0),
  ];
  const map=discoverWinningPatterns(rows);
  assert.equal(map.patterns.some(pattern=>/girl power|power girl/i.test(pattern.label)),false);
});

test("Power Girl can never be the displayed canonical label",()=>{
  const map=discoverWinningPatterns([
    row(1,"Power Girl Rebel",["power girl rebel"],10),
    row(2,"Power Girl Rebel Again",["power girl rebel"],8),
    row(3,"Another Theme",["other theme"],0),
    row(4,"Different Theme",["different theme"],0),
  ]);
  assert.equal(map.patterns.some(pattern=>/^Power Girl$/i.test(pattern.label)),false);
});


test("SEO title wording cannot create a priority without visual design evidence",()=>{
  // Legacy text pattern engine may still be tested independently, but the
  // Opportunity Engine route must no longer call it.
  const routeSource=readFileSync("app/api/shop-map/map/route.ts","utf8");
  assert.doesNotMatch(routeSource,/discoverWinningPatterns\(patternInput\(\)\)/);
  assert.match(routeSource,/discoverVisualWinningPatterns/);
  assert.match(routeSource,/design_intelligence/);
  assert.match(routeSource,/artwork_provenance/);
});


const visualRow=(id,hash,wording,sales90)=>({
  listingId:id,artworkHash:hash,sales90,lifetimeSales:sales90,favorites:0,state:"active",
  design:{wording:[wording],illustrationCategory:"typography",audienceCues:[],
    recipientCues:[],occasionCues:[],tone:"bold",composition:"centered"},
});

test("a single artwork mega-winner can lead when customer response is concentrated",()=>{
  const map=discoverVisualWinningPatterns([
    visualRow(1,"a","sometimes the king is a woman",70),
    visualRow(2,"b","another design",20),
    visualRow(3,"c","third design",10),
  ]);
  assert.equal(map.patterns[0]?.label,"Sometimes The King Is A Woman");
  assert.equal(map.patterns[0]?.customerPercent,70);
  assert.equal(map.patterns[0]?.artworkCount,1);
});

test("a one-off design does not become a priority without mega-winner response",()=>{
  const map=discoverVisualWinningPatterns([
    visualRow(1,"a","first one off",20),
    visualRow(2,"b","second one off",20),
    visualRow(3,"c","third one off",20),
    visualRow(4,"d","fourth one off",20),
    visualRow(5,"e","fifth one off",20),
  ]);
  assert.equal(map.patterns.length,0);
});
