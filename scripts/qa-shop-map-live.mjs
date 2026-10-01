import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const identity = process.env.QA_REVIEWER_JWT;
if (!identity) throw new Error("QA_REVIEWER_JWT is required");
await mkdir("qa-artifacts", {recursive:true});
const browser = await chromium.launch({headless:true});
const results = [];
try {
  for (const width of [390,320]) {
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1});
    const login=await context.request.post("https://thegoldiesuite.com/qa/oidc", {
      headers:{authorization:"Bearer "+identity},timeout:30000,
    });
    if(!login.ok())throw new Error("Reviewer identity rejected: "+login.status());
    const page=await context.newPage();
    await page.goto("https://thegoldiesuite.com/shop-map",{waitUntil:"domcontentloaded",timeout:60000});
    const output=page.locator("#qa-mobile-metrics");
    await output.waitFor({timeout:30000});
    for(const [key,label] of [
      ["overview","Opportunity Engine"],
      ["money","Your numbers"],
      ["themes","Product themes"],
      ["sold","Sold listings"],
    ]){
      await page.locator(".shop-map-tabs button").filter({hasText:label}).click();
      await page.waitForTimeout(2200);
      const measured=(await output.innerText()).trim();
      const match=measured.match(/QA viewport: (\d+)px; document: (\d+)px; body: (\d+)px; tab rows: ([\d+]+); active: ([^;]+); loading: (YES|NO); alert: ([^;]+); text: (\d+)/);
      if(!match)throw new Error("Mobile metrics unavailable: "+measured);
      const row={width,tab:key,viewport:Number(match[1]),documentWidth:Number(match[2]),
        bodyWidth:Number(match[3]),tabRows:match[4],active:match[5],loading:match[6],
        alert:match[7],textLength:Number(match[8])};
      results.push(row);
      console.log("QA_METRICS "+JSON.stringify(row));
      await page.screenshot({path:`qa-artifacts/shop-map-${width}-${key}.png`,fullPage:true});
      const qaImage=(await page.screenshot({type:"jpeg",quality:35,fullPage:true})).toString("base64");
      console.log(`QA_IMAGE_BEGIN ${width} ${key}`);
      for(let offset=0;offset<qaImage.length;offset+=16000) console.log("QA_IMAGE_CHUNK "+qaImage.slice(offset,offset+16000));
      console.log(`QA_IMAGE_END ${width} ${key}`);
      if(row.viewport!==width)throw new Error("Wrong viewport in "+key);
      if(row.documentWidth>width+1||row.bodyWidth>width+1)
        throw new Error("Horizontal overflow in "+key+" at "+width+"px");
      if(row.tabRows!=="2+2")throw new Error("Tabs are not 2x2 in "+key+" at "+width+"px: "+row.tabRows);
      if(row.active.toLowerCase()!==label.toLowerCase())throw new Error("Wrong active tab in "+key);
      if(row.alert!=="none")throw new Error("Alert in "+key+": "+row.alert);
      if(row.loading!=="NO"||row.textLength<200)throw new Error("Blank or incomplete "+key+" panel");
      if(width===320){
        await page.mouse.move(width/2,560);
        const scrollSteps=key==="overview"?9:3;
        for(let step=1;step<=scrollSteps;step++){
          await page.mouse.wheel(0,600);
          await page.waitForTimeout(350);
          const scrolled=(await page.screenshot({type:"jpeg",quality:35,fullPage:false})).toString("base64");
          console.log(`QA_IMAGE_BEGIN ${width} ${key}_${step}`);
          for(let offset=0;offset<scrolled.length;offset+=16000) console.log("QA_IMAGE_CHUNK "+scrolled.slice(offset,offset+16000));
          console.log(`QA_IMAGE_END ${width} ${key}_${step}`);
        }
      }
    }
    await context.close();
  }
  await writeFile("qa-artifacts/results.json",JSON.stringify(results,null,2));
} finally {
  await browser.close();
}
