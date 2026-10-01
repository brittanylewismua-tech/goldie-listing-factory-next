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
      if(key==="money" && !(await page.locator(".shop-map-money-detail").innerText()).includes("100%"))
        throw new Error("Reviewer cost coverage is not 100%");
      if(key==="overview"){
        const votes=page.locator(".shop-map-purchases-votes").first();
        if(!(await votes.innerText()).includes("22"))throw new Error("90-day purchase leader missing");
        await page.locator(".shop-map-analysis-period select").selectOption("30");
        await page.waitForTimeout(1800);
        if(!(await votes.innerText()).includes("8"))throw new Error("30-day purchase leader missing");
        await page.screenshot({path:`qa-artifacts/shop-map-${width}-overview-30.png`,fullPage:true});
        const day30=(await page.screenshot({type:"jpeg",quality:35,fullPage:true})).toString("base64");
        console.log(`QA_IMAGE_BEGIN ${width} overview_30`);
        for(let offset=0;offset<day30.length;offset+=16000) console.log("QA_IMAGE_CHUNK "+day30.slice(offset,offset+16000));
        console.log(`QA_IMAGE_END ${width} overview_30`);
        await page.locator(".shop-map-analysis-period select").selectOption("90");
        await page.waitForTimeout(1800);
      }
      const scrollSteps=key==="overview"?(width===390?9:7):(width===390?3:0);
      if(scrollSteps){
        await page.mouse.move(width/2,560);
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
  // Authenticate a separate browser context and hold the Overview response long
  // enough to observe loading. Then render an empty purchase response on the
  // real production page without modifying a member's shop data.
  const emptyContext=await browser.newContext({viewport:{width:320,height:844},deviceScaleFactor:1});
  const emptyLogin=await emptyContext.request.post("https://thegoldiesuite.com/qa/oidc",{
    headers:{authorization:"Bearer "+identity},timeout:30000,
  });
  if(!emptyLogin.ok())throw new Error("Empty-state reviewer identity rejected: "+emptyLogin.status());
  const emptyPage=await emptyContext.newPage();
  await emptyPage.route(url=>url.pathname==="/api/shop-map/map"&&url.searchParams.get("view")==="overview-purchases",async route=>{
    await new Promise(resolve=>setTimeout(resolve,1800));
    const empty={shop:{shopId:1,shopName:"Goldie Reviewer Shop"},purchasePriorities:{
      days:90,totalUnits:0,totalOrders:0,unmatchedUnits:0,excludedRefundUnits:0,
      receiptsComplete:true,refreshedAt:null,shareLabel:"Share of shop purchases",
      remainingUnits:0,priorities:[],listings:[],
    }};
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(empty)});
  });
  await emptyPage.goto("https://thegoldiesuite.com/shop-map",{waitUntil:"domcontentloaded",timeout:60000});
  const loading=emptyPage.locator(".shop-map-progressive-loading");
  await loading.waitFor({state:"visible",timeout:5000});
  const loadingImage=(await emptyPage.screenshot({type:"jpeg",quality:35})).toString("base64");
  console.log("QA_IMAGE_BEGIN 320 loading");
  for(let offset=0;offset<loadingImage.length;offset+=16000)console.log("QA_IMAGE_CHUNK "+loadingImage.slice(offset,offset+16000));
  console.log("QA_IMAGE_END 320 loading");
  await emptyPage.getByText("No purchases in this period.").waitFor({timeout:15000});
  const emptyImage=(await emptyPage.screenshot({type:"jpeg",quality:35})).toString("base64");
  console.log("QA_IMAGE_BEGIN 320 empty_purchases");
  for(let offset=0;offset<emptyImage.length;offset+=16000)console.log("QA_IMAGE_CHUNK "+emptyImage.slice(offset,offset+16000));
  console.log("QA_IMAGE_END 320 empty_purchases");
  console.log("QA_VARIANTS "+JSON.stringify({loading:true,emptyPurchases:true,width:320}));
  await emptyContext.close();
  await writeFile("qa-artifacts/results.json",JSON.stringify(results,null,2));
} finally {
  await browser.close();
}
