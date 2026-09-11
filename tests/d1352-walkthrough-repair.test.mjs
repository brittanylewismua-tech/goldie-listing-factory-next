import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");

test("D1352: automatic Etsy status checks stay inline and cannot summon the global wait modal",()=>{
 const app=read("app/listing-factory-app.tsx"),wait=read("app/wait-progress.tsx");
 const button=app.slice(app.indexOf('className="review-etsy-draft-button"'),app.indexOf('className="review-printify-link"'));
 assert.match(button,/data-inline-progress="true"/);
 assert.doesNotMatch(button,/aria-busy=\{[^}]*!photoDeliveryStatusReady/);
 assert.match(button,/Check saved progress above/);
 assert.match(wait,/!node\.closest\('\[data-inline-progress="true"\]'\)/);
});

test("D1352: Setup has one decision heading and finished design counts are not repeated in a banner",()=>{
 const app=read("app/listing-factory-app.tsx"),tools=read("app/factory-tools.tsx");
 assert.match(app,/title: "Start your batch", copy: "Choose a saved product or bundle\."/);
 assert.doesNotMatch(tools,/bundleForm\?"Products":"Saved products"/);
 assert.doesNotMatch(app,/files.length > 0 && designsFinished && <div className="batch-capacity"/);
 assert.match(app,/`\$\{files.length\} \${files.length===1\?"listing":"listings"} will be created`/);
});

test("D1352: white product thumbnails and over-goal fills remain visibly bounded",()=>{
 const css=read("app/interface-v2.css"),clarity=read("app/clarity-pass.css");
 assert.match(css,/\.recipe-icon > img\{[^}]*background:#eee9ec/);
 assert.match(clarity,/\.listing-goal-track>i\{[^}]*max-width:100%!important/s);
});
