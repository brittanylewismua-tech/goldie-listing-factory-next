import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {primaryImageForSide,replaceArtworkForVariants} from "../app/api/printify/drafts/color-artwork.ts";

const areas=[{variant_ids:[1,2,3],background:"#fff",placeholders:[{position:"front",images:[{id:"main",x:.5,y:.4,scale:.8,angle:0}]},{position:"back",images:[{id:"back",x:.5,y:.5,scale:.6,angle:0}]}]}];

test("D957: one color receives alternate artwork without changing other colors or print sides",()=>{
  const next=replaceArtworkForVariants(areas,"front",[2],"alternate");
  assert.deepEqual(next.map(area=>area.variant_ids),[[1,3],[2]]);
  const retained=next.find(area=>area.variant_ids.includes(1));
  const changed=next.find(area=>area.variant_ids.includes(2));
  assert.equal(retained.placeholders[0].images[0].id,"main");
  assert.equal(changed.placeholders[0].images[0].id,"alternate");
  assert.equal(changed.placeholders[1].images[0].id,"back");
});

test("D957: the original image is recoverable and a missing variant cannot be silently ignored",()=>{
  assert.equal(primaryImageForSide(areas,"front"),"main");
  assert.throws(()=>replaceArtworkForVariants(areas,"front",[99],"alternate"),/did not expose artwork placement/);
});

test("D957: color artwork lives only in the post-draft color workspace and uses the owned update route",async()=>{
  const [app,route]=await Promise.all([readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),readFile(new URL("../app/api/printify/drafts/update/route.ts",import.meta.url),"utf8")]);
  assert.match(app,/Use different artwork for \$\{focused\.title\}/);
  assert.doesNotMatch(app,/>＋ Use different artwork on some colors/);
  assert.match(app,/productId:draft\.id,artworkUpdate/);
  assert.match(route,/That Printify draft was not created by this Listing Factory account/);
  assert.match(route,/staged\.customMetadata\?\.owner!==user\.userId/);
  assert.match(route,/replaceArtworkForVariants/);
});
