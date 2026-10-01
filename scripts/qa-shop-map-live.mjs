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
      if(key==="overview"){
        await page.getByText(/CANDIDATE.*CHECK FIRST/i).first().waitFor({timeout:30000});
        const dna=page.locator(".oe-dna");
        await dna.getByText("Winner DNA").waitFor({timeout:30000});
        await dna.locator("summary").click();
        if(!(await dna.innerText()).includes("Purchased units among 4 leading analyzed selling artworks"))
          throw new Error("Winner DNA denominator is not labeled");
        await dna.locator("summary").click();
        await page.evaluate(()=>{
          const hero=document.querySelector(".oe-lead");
          for(let el=hero?.parentElement;el;el=el.parentElement){
            if(el.scrollTop){
              el.style.scrollBehavior="auto";
              el.scrollTop=0;
            }
          }
          document.documentElement.style.scrollBehavior="auto";
          document.body.style.scrollBehavior="auto";
          window.scrollTo({top:0,left:0,behavior:"instant"});
        });
        await page.waitForTimeout(350);
        console.log("QA_SCROLL "+JSON.stringify(await page.evaluate(()=>({
          y:window.scrollY,
          root:document.scrollingElement?.scrollTop,
          heroTop:document.querySelector(".oe-lead")?.getBoundingClientRect().top,
        }))));
        const firstViewport=(await page.screenshot({type:"jpeg",quality:45,fullPage:false})).toString("base64");
        console.log(`QA_IMAGE_BEGIN ${width} overview_first_viewport`);
        for(let offset=0;offset<firstViewport.length;offset+=16000)console.log("QA_IMAGE_CHUNK "+firstViewport.slice(offset,offset+16000));
        console.log(`QA_IMAGE_END ${width} overview_first_viewport`);
        const hero=page.locator(".oe-lead").first();
        const heroImage=hero.locator(".oe-lead-art img").first();
        const imageBox=await heroImage.boundingBox();
        if(!(await heroImage.evaluate(img=>img instanceof HTMLImageElement&&img.complete&&img.naturalWidth>0)))
          throw new Error("Winning product image did not load in the live browser");
        const votesBox=await hero.locator(".oe-lead-stats").boundingBox();
        if(!imageBox||!votesBox||imageBox.y<0||votesBox.y<0||imageBox.y>660||votesBox.y+votesBox.height>784)
          throw new Error("Winning product image and purchase evidence are below the initial phone viewport");
        if(!(await hero.innerText()).includes("sweatshirt"))
          throw new Error("Selected product direction missing");
        console.log("QA_HERO "+JSON.stringify({width,imageTop:imageBox.y,imageHeight:imageBox.height,
          votesBottom:votesBox.y+votesBox.height,text:(await hero.innerText()).slice(0,180)}));
      }
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
        const votes=page.locator(".oe-lead-stats").first();
        if(!(await votes.innerText()).includes("22"))throw new Error("90-day purchase leader missing");
        await page.locator(".shop-map-analysis-period select").selectOption("30");
        await page.waitForTimeout(1800);
        if(!(await votes.innerText()).includes("8"))throw new Error("30-day purchase leader missing");
        await page.getByText(/CANDIDATE.*CHECK FIRST/i).first().waitFor({timeout:30000});
        if(!(await page.locator(".oe-lead-copy").first().innerText()).includes("exact artwork"))
          throw new Error("Specific purchased-product direction missing");
        await page.screenshot({path:`qa-artifacts/shop-map-${width}-overview-30.png`,fullPage:true});
        const day30=(await page.screenshot({type:"jpeg",quality:35,fullPage:true})).toString("base64");
        console.log(`QA_IMAGE_BEGIN ${width} overview_30`);
        for(let offset=0;offset<day30.length;offset+=16000) console.log("QA_IMAGE_CHUNK "+day30.slice(offset,offset+16000));
        console.log(`QA_IMAGE_END ${width} overview_30`);
        await page.mouse.move(width/2,560);
        await page.mouse.wheel(0,600);
        await page.waitForTimeout(300);
        const day30Card=(await page.screenshot({type:"jpeg",quality:35})).toString("base64");
        console.log(`QA_IMAGE_BEGIN ${width} overview_30_card`);
        for(let offset=0;offset<day30Card.length;offset+=16000) console.log("QA_IMAGE_CHUNK "+day30Card.slice(offset,offset+16000));
        console.log(`QA_IMAGE_END ${width} overview_30_card`);
        await page.mouse.wheel(0,-1000);
        await page.locator(".shop-map-analysis-period select").selectOption("90");
        await page.waitForTimeout(1800);
        const cacheKeys=await page.evaluate(()=>Object.keys(sessionStorage)
          .filter(key=>key.startsWith("goldie:shop-map:v13:")));
        if(!cacheKeys.some(key=>key.includes("qa-reviewer:900001:view=overview-purchases&days=30"))
          ||!cacheKeys.some(key=>key.includes("qa-reviewer:900001:view=overview-purchases&days=90"))
          ||cacheKeys.some(key=>!key.includes("qa-reviewer:900001:")))
          throw new Error("Shop Map cache scope or period key is wrong: "+cacheKeys.join(","));
        console.log("QA_CACHE_SCOPE "+JSON.stringify({width,member:"reviewer",shop:900001,periods:[30,90]}));
      }
      const scrollSteps=key==="overview"?(width===390?11:14):(width===390?3:2);
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
      if(key==="overview"){
        const research=page.locator(".shop-map-mirrorbot").first();
        await research.locator("summary").click();
        const researchText=await research.innerText();
        if(!researchText.includes("Purchased listing #1")||!researchText.includes("22 units"))
          throw new Error("Deep research lost the purchased winner context");
        if(!researchText.includes("Opening it does not transfer this context"))
          throw new Error("MirrorBot transfer status is unclear");
        const researchImage=(await page.screenshot({type:"jpeg",quality:35})).toString("base64");
        console.log(`QA_IMAGE_BEGIN ${width} purchased_research`);
        for(let offset=0;offset<researchImage.length;offset+=16000)console.log("QA_IMAGE_CHUNK "+researchImage.slice(offset,offset+16000));
        console.log(`QA_IMAGE_END ${width} purchased_research`);
        const more=page.locator(".oe-more");
        await more.locator("summary").click();
        const extra=more.locator(".oe-more-list button").first();
        if(await extra.count()===0)throw new Error("Purchased products outside the first three are missing");
        const extraTitle=(await extra.locator("span").nth(0).innerText()).trim();
        await extra.click();
        if(!(await page.locator(".oe-lead-product").innerText()).includes(extraTitle))
          throw new Error("An additional purchased product cannot open its direction");
        console.log("QA_FULL_SHOP "+JSON.stringify({width,additionalVisible:await more.locator(".oe-more-list button").count(),selected:extraTitle}));
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
    const empty={shop:{shopId:900001,shopName:"Goldie Reviewer Shop"},purchasePriorities:{
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
  // A fourth product tied at the cutoff must remain reachable with the same rank.
  const tieContext=await browser.newContext({viewport:{width:320,height:844},deviceScaleFactor:1});
  const tieLogin=await tieContext.request.post("https://thegoldiesuite.com/qa/oidc",{
    headers:{authorization:"Bearer "+identity},timeout:30000,
  });
  if(!tieLogin.ok())throw new Error("Tie reviewer identity rejected: "+tieLogin.status());
  const tiePage=await tieContext.newPage();
  await tiePage.route(url=>url.pathname==="/api/shop-map/map"&&url.searchParams.get("view")==="overview-purchases",async route=>{
    const listings=[1,2,3,4].map(listingId=>({
      listingId,title:`Tied product ${listingId}`,imageUrl:"",state:"active",rank:1,
      unitsPurchased:5,orders:1,productRevenueMinor:10000,currency:"USD",
      share:.25,lastPurchasedAt:Math.floor(Date.now()/1000),
    }));
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      shop:{shopId:900001,shopName:"Goldie Reviewer Shop"},
      purchasePriorities:{days:90,totalUnits:20,totalOrders:4,unmatchedUnits:0,
        excludedRefundUnits:0,receiptsComplete:true,refreshedAt:null,
        shareLabel:"Share of shop purchases",remainingUnits:5,
        priorities:listings.slice(0,3),listings},
    })});
  });
  await tiePage.goto("https://thegoldiesuite.com/shop-map",{waitUntil:"domcontentloaded",timeout:60000});
  const ties=tiePage.getByRole("button",{name:"View 1 tied listing"});
  await ties.waitFor({timeout:15000});
  await ties.click();
  const tieCards=tiePage.locator(".oe-top-grid .oe-top-card");
  if(await tieCards.count()!==4)throw new Error("The fourth tied product is hidden");
  await tieCards.last().click();
  await tiePage.locator(".oe-lead-copy").getByText("Review this purchased product before choosing a new test.").waitFor({timeout:15000});
  if(!(await tiePage.locator(".oe-lead-art").innerText()).includes("LEADING PRODUCT"))
    throw new Error("Equal-rank product lost its leading status");
  await tieCards.last().scrollIntoViewIfNeeded();
  const tieImage=(await tiePage.screenshot({type:"jpeg",quality:35})).toString("base64");
  console.log("QA_IMAGE_BEGIN 320 tied_priorities");
  for(let offset=0;offset<tieImage.length;offset+=16000)console.log("QA_IMAGE_CHUNK "+tieImage.slice(offset,offset+16000));
  console.log("QA_IMAGE_END 320 tied_priorities");
  console.log("QA_TIES "+JSON.stringify({width:320,cards:4,rank:1,expanded:true}));
  await tieContext.close();
  // Distinguish failed catalog and purchase reads on the authenticated page.
  const sourceContext=await browser.newContext({viewport:{width:320,height:844},deviceScaleFactor:1});
  const sourceLogin=await sourceContext.request.post("https://thegoldiesuite.com/qa/oidc",{
    headers:{authorization:"Bearer "+identity},timeout:30000,
  });
  if(!sourceLogin.ok())throw new Error("Source-state reviewer identity rejected: "+sourceLogin.status());
  const sourcePage=await sourceContext.newPage();
  let sourceRequests=0;
  await sourcePage.route(url=>url.pathname==="/api/shop-map/my-listings",async route=>{
    sourceRequests++;
    if(sourceRequests>2){await route.continue();return;}
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      shop:{shopId:900001,shopName:"Goldie Reviewer Shop"},listings:[],
      salesObservations:sourceRequests===1?[{listingId:1,units:22}]:[],
      sources:{shop:"available",catalog:sourceRequests===1?"failed":"available",
        sales:sourceRequests===1?"available":"failed"},
    })});
  });
  await sourcePage.goto("https://thegoldiesuite.com/shop-map",{waitUntil:"domcontentloaded",timeout:60000});
  const sourceBanner=sourcePage.getByText("Comparison needs a retry");
  await sourceBanner.waitFor({timeout:25000});
  await sourcePage.getByText("Catalog coverage could not load.").waitFor();
  await sourceBanner.scrollIntoViewIfNeeded();
  let sourceImage=(await sourcePage.screenshot({type:"jpeg",quality:35})).toString("base64");
  console.log("QA_IMAGE_BEGIN 320 catalog_failure");
  for(let offset=0;offset<sourceImage.length;offset+=16000)console.log("QA_IMAGE_CHUNK "+sourceImage.slice(offset,offset+16000));
  console.log("QA_IMAGE_END 320 catalog_failure");
  await sourcePage.getByRole("button",{name:"Retry comparison"}).click();
  await sourcePage.getByText("Purchase history could not load.").waitFor();
  await sourcePage.getByRole("button",{name:"Retry comparison"}).click();
  await sourceBanner.waitFor({state:"hidden",timeout:25000});
  await sourcePage.locator(".oe-review-grid").waitFor({timeout:25000});
  console.log("QA_SOURCE_RECOVERY "+JSON.stringify({catalogFailure:true,salesFailure:true,recovered:true,width:320}));
  await sourceContext.close();
  await writeFile("qa-artifacts/results.json",JSON.stringify(results,null,2));
} finally {
  await browser.close();
}
