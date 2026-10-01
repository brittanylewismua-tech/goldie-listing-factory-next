import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const identity = process.env.QA_REVIEWER_JWT;
if (!identity) throw new Error("QA_REVIEWER_JWT is required");
await mkdir("qa-artifacts", {recursive:true});
const browser = await chromium.launch({headless:true});
const results = [];
try {
  for (const width of [390,320]) {
    const context = await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1});
    const login = await context.request.post("https://thegoldiesuite.com/qa/oidc", {
      headers:{authorization:"Bearer "+identity},timeout:30000,
    });
    if (!login.ok()) throw new Error("Reviewer identity rejected: "+login.status());
    const page = await context.newPage();
    await page.goto("https://thegoldiesuite.com/shop-map", {waitUntil:"domcontentloaded",timeout:60000});
    await page.locator(".shop-map-tabs button").first().waitFor({timeout:30000});
    for (const [key,label] of [
      ["overview","Opportunity Engine"],
      ["money","Your numbers"],
      ["themes","Product themes"],
      ["sold","Sold listings"],
    ]) {
      await page.locator(".shop-map-tabs button").filter({hasText:label}).click();
      await page.waitForFunction(expected=>{
        const tab=[...document.querySelectorAll(".shop-map-tabs button")]
          .find(button=>button.textContent?.trim().toLowerCase()===expected);
        const loading=document.body.innerText.includes("Loading your shop");
        return tab?.getAttribute("aria-current")==="page" && !loading
          && document.querySelector(".shop-map")?.innerText.length>120;
      },label.toLowerCase(),{timeout:30000});
      await page.waitForTimeout(1200);
      const metrics=await page.evaluate(()=>{
        const buttons=[...document.querySelectorAll(".shop-map-tabs button")];
        const rows=[];
        for(const button of buttons){
          const rect=button.getBoundingClientRect();
          const group=rows.find(row=>Math.abs(row.top-rect.top)<3);
          if(group)group.count++;
          else rows.push({top:rect.top,count:1});
        }
        const main=document.querySelector(".shop-map");
        const imgs=[...document.querySelectorAll(".shop-map img")];
        return {
          viewport:window.innerWidth,
          documentWidth:document.documentElement.scrollWidth,
          bodyWidth:document.body.scrollWidth,
          tabRows:rows.map(row=>row.count),
          tabRects:buttons.map(button=>({label:button.textContent?.trim(),...(()=>{
            const r=button.getBoundingClientRect();
            return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),right:Math.round(r.right)};
          })()})),
          heading:main?.querySelector("h1")?.textContent?.trim()||"",
          headings:[...main?.querySelectorAll("h2,h3")||[]].map(node=>node.textContent?.trim()).filter(Boolean).slice(0,25),
          textLength:main?.innerText.length||0,
          alert:main?.querySelector('[role="alert"]')?.textContent?.trim()||"",
          images:imgs.map(img=>({loaded:img.complete&&img.naturalWidth>0,src:img.getAttribute("src")})),
          excerpt:main?.innerText.slice(0,1200)||"",
        };
      });
      const row={width,tab:key,...metrics};
      results.push(row);
      await page.screenshot({path:`qa-artifacts/shop-map-${width}-${key}.png`,fullPage:true});
      console.log("QA_METRICS "+JSON.stringify(row));
      if(metrics.viewport!==width)throw new Error(`Wrong viewport ${metrics.viewport} for ${width}`);
      if(metrics.documentWidth>metrics.viewport+1 || metrics.bodyWidth>metrics.viewport+1)
        throw new Error(`Horizontal overflow at ${width}px in ${key}`);
      if(metrics.tabRows.join("+")!=="2+2")throw new Error(`Tabs are not 2x2 at ${width}px in ${key}: ${metrics.tabRows.join("+")}`);
      if(metrics.alert)throw new Error(`Alert in ${key}: ${metrics.alert}`);
      if(metrics.textLength<200)throw new Error(`Blank or incomplete ${key} panel`);
      if(metrics.images.some(img=>!img.loaded))throw new Error(`Image failed in ${key}`);
    }
    await context.close();
  }
  await writeFile("qa-artifacts/results.json",JSON.stringify(results,null,2));
} finally {
  await browser.close();
}
