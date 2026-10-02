import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";

const token=process.env.QA_REVIEWER_JWT;
if(!token)throw new Error("QA_REVIEWER_JWT is required");
await mkdir("qa-artifacts",{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
const emit=async(page,width,name,fullPage=false)=>{
  const data=(await page.screenshot({type:"jpeg",quality:42,fullPage})).toString("base64");
  console.log(`QA_IMAGE_BEGIN ${width} ${name}`);
  for(let offset=0;offset<data.length;offset+=16000)console.log("QA_IMAGE_CHUNK "+data.slice(offset,offset+16000));
  console.log(`QA_IMAGE_END ${width} ${name}`);
};
const login=async(context)=>{
  const response=await context.request.post("https://thegoldiesuite.com/qa/oidc",{
    headers:{authorization:"Bearer "+token},timeout:30000});
  if(!response.ok())throw new Error("Reviewer identity rejected: "+response.status());
};
const workspace=page=>page.locator('section[aria-labelledby="oe-workspace-title"]');
const focus=page=>workspace(page).locator("article").first();
const choices=page=>workspace(page).getByRole("group",{name:"Top purchased listings"}).locator("button");
const waitReady=async(page)=>{
  await page.getByRole("heading",{name:"Top listings in your shop"}).waitFor({timeout:45000});
  await focus(page).waitFor({timeout:45000});
  await page.getByRole("heading",{name:"What customers are choosing"}).waitFor({timeout:45000});
};
const measurements=async(page)=>page.evaluate(()=>{
  const boxes=selector=>[...document.querySelectorAll(selector)]
    .filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect());
  const tabBoxes=boxes(".shop-map-tabs button");
  const selectors=boxes('section[aria-labelledby="oe-workspace-title"] [role="group"][aria-label="Top purchased listings"] button');
  const focused=boxes('section[aria-labelledby="oe-workspace-title"] article')[0];
  return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth,tabRows:[...new Set(tabBoxes.map(box=>Math.round(box.top)))].length,
    selectorCount:selectors.length,selectorRows:[...new Set(selectors.map(box=>Math.round(box.top)))].length,
    focusTop:focused?.top??null,heading:document.querySelector(".shop-map-head h1")?.textContent?.trim()??"",
    oldLayoutVisible:[...document.querySelectorAll(".oe-priority-grid,.oe-site-grid,.oe-site-evidence-band")]
      .some(node=>node.getClientRects().length>0),
    groupCount:document.querySelectorAll('section[aria-labelledby="oe-workspace-title"] details').length,
    clippedPurchaseLabels:[...document.querySelectorAll('section[aria-labelledby="oe-workspace-title"] [role="group"] button small')]
      .filter(node=>node.scrollWidth>node.clientWidth+1).length};
});
try{
  for(const width of [390,320,1280]){
    const context=await browser.newContext({viewport:{width,height:width===1280?900:844},deviceScaleFactor:1});
    await login(context);
    const page=await context.newPage();
    await page.goto("https://thegoldiesuite.com/shop-map",{waitUntil:"domcontentloaded",timeout:60000});
    await waitReady(page);
    await page.getByRole("heading",{name:"Opportunity Engine",exact:true}).waitFor();
    if(await choices(page).count()!==10)throw new Error("Ten-listing selector did not render");
    for(let index=0;index<10;index++){
      const label=(await choices(page).nth(index).textContent()||"").trim();
      if(!label.startsWith(`${index+1}. `))throw new Error("Displayed listing numbers are not sequential: "+label);
    }
    const firstImage=focus(page).locator("img").first();
    if(!(await firstImage.evaluate(img=>img instanceof HTMLImageElement&&img.complete&&img.naturalWidth>0)))
      throw new Error("Selected product image failed to load");
    const firstText=await focus(page).innerText();
    if(!/units purchased/.test(firstText)||!/Listing 1 of 10/i.test(firstText)
      ||/Product details need review/.test(firstText))
      throw new Error("Focused product lacks purchase breakdown or navigation");
    const layout=await measurements(page);
    if(layout.heading!=="Opportunity Engine"||layout.documentWidth>width+1||layout.bodyWidth>width+1
      ||layout.selectorCount!==3||layout.selectorRows!==1||layout.oldLayoutVisible||layout.clippedPurchaseLabels>0)
      throw new Error("Opportunity workspace layout failed: "+JSON.stringify(layout));
    if(width<600&&layout.tabRows!==2)throw new Error("Tabs are not 2×2");
    if(width===1280&&layout.tabRows!==1)throw new Error("Desktop tabs do not share one row");
    console.log("QA_LAYOUT "+JSON.stringify({width,...layout}));
    await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
    await emit(page,width,width===1280?"desktop_first_viewport":"overview_first_viewport");
    await emit(page,width,"overview",true);
    await focus(page).getByRole("button",{name:"Next top listing"}).click();
    if(!/Listing 2 of 10/i.test(await focus(page).innerText()))throw new Error("Next listing arrow failed");
    await focus(page).getByRole("button",{name:"Previous top listing"}).click();
    if(!/Listing 1 of 10/i.test(await focus(page).innerText()))throw new Error("Previous listing arrow failed");
    await workspace(page).getByText(/View listings 4/).click();
    await choices(page).nth(9).click();
    if(!/Listing 10 of 10/i.test(await focus(page).innerText())
      ||!(await focus(page).getByRole("button",{name:"Next top listing"}).isDisabled()))
      throw new Error("Tenth listing navigation failed");
    if(await focus(page).getByRole("status").count()!==1
      ||/No checked ideas yet|Goldie has no checked recommendation/.test(await focus(page).innerText()))
      throw new Error("Tenth listing shows overlapping or outdated empty states");
    await emit(page,width,"tenth_product");
    await choices(page).nth(1).click();
    const secondText=await focus(page).innerText();
    if(secondText===firstText)throw new Error("Product selector did not change the analysis");
    await emit(page,width,"second_product");
    await choices(page).first().click();
    const path=focus(page).getByRole("button",{name:/Compare|Review|Test|Check|Explore/i}).first();
    await path.waitFor({state:"visible",timeout:30000});
    {
      await path.click();
      const dialog=page.getByRole("dialog");await dialog.waitFor({state:"visible"});
      if(!(await dialog.locator("li").count()))throw new Error("Product detail lacks evidence checks");
      await emit(page,width,"product_evidence");
      if(width<600){
        await dialog.evaluate(node=>{node.scrollTop=node.scrollHeight});
        const scroll=await dialog.evaluate(node=>({top:node.scrollTop,remaining:node.scrollHeight-node.clientHeight-node.scrollTop}));
        if(scroll.remaining>2)throw new Error("Evidence dialog cannot scroll to its end: "+JSON.stringify(scroll));
        await emit(page,width,"product_evidence_bottom");
      }
      await dialog.getByRole("button",{name:"Close details"}).click();
    }
    const directComparison=await page.request.post("https://thegoldiesuite.com/api/shop-map/market-comparisons?listingId=1");
    console.log("QA_COMPARISON_API "+JSON.stringify({status:directComparison.status(),body:(await directComparison.text()).slice(0,700)}));
    console.log("QA_COMPARISON_PATHS "+JSON.stringify(await focus(page).getByRole("button").allTextContents()));
    const publicPath=focus(page).getByRole("button",{name:/sample comparison/i});
    await publicPath.waitFor({state:"visible",timeout:30000});
    await publicPath.click();
    const comparisonDialog=page.getByRole("dialog");await comparisonDialog.waitFor({state:"visible"});
    if(!(await comparisonDialog.getByRole("link",{name:"Etsy comparison"}).count())
      ||!(await comparisonDialog.getByText(/public listing reviews/).count())
      ||!(await comparisonDialog.getByText(/public title emphasizes a statement tee/).count())
      ||(await comparisonDialog.getByText(/saved.*watch has dated public activity/).count()))
      throw new Error("Public comparison lacks source or exact review signal");
    await emit(page,width,"public_comparison");
    await comparisonDialog.getByRole("button",{name:"Close details"}).click();
    await page.getByRole("heading",{name:"What customers are choosing"}).waitFor({timeout:30000});
    await page.getByRole("heading",{name:"Review these"}).waitFor({timeout:30000});
    await emit(page,width,"whole_shop",true);
    const reviewSection=page.getByRole("heading",{name:"Review these"}).locator("..").locator("..");
    if(await reviewSection.getByRole("button").count()<1)throw new Error("Whole-shop review is blank in reviewer fixture");
    if(width<600){
      await page.locator(".oe-site-period").getByRole("button",{name:"Last 30 days"}).click();
      await waitReady(page);
      await emit(page,width,"overview_30",true);
      await page.locator(".oe-site-period").getByRole("button",{name:"Last 90 days"}).click();
      await waitReady(page);
    }
    for(const [label,key] of [["Your numbers","money"],["Product themes","themes"],["Sold listings","sold"]]){
      await page.locator(".shop-map-tabs").getByRole("button",{name:label}).click();
      await page.locator(".shop-map-tabs button[aria-current=page]").filter({hasText:label}).waitFor({timeout:20000});
      let panelText="";
      for(let attempt=0;attempt<80;attempt++){
        panelText=(await page.locator(".shop-map-tab-panel,.shop-map-money,.shop-map-themes,.shop-map-sold").allInnerTexts()).join(" ");
        if(panelText.trim().length>=50)break;
        await page.waitForTimeout(250);
      }
      const tabLayout=await measurements(page);
      if(tabLayout.documentWidth>width+1||tabLayout.bodyWidth>width+1||panelText.trim().length<50)
        throw new Error("Blank or overflowing "+key+": "+JSON.stringify(tabLayout));
      if(width<600&&tabLayout.tabRows!==2)throw new Error("Tab layout changed in "+key);
      console.log("QA_TAB "+JSON.stringify({width,key,documentWidth:tabLayout.documentWidth,textLength:panelText.length}));
      await emit(page,width,key,true);
    }
    results.push({width,overview:layout,tabs:"passed"});
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:320,height:844},deviceScaleFactor:1});
  await login(context);const page=await context.newPage();
  await page.route(url=>url.pathname==="/api/shop-map/map"&&url.searchParams.get("view")==="overview-purchases",async route=>{
    await new Promise(resolve=>setTimeout(resolve,1600));
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      shop:{shopId:900001,shopName:"Goldie Reviewer Shop"},
      purchasePriorities:{days:90,totalUnits:0,totalOrders:0,unmatchedUnits:0,excludedRefundUnits:0,
        receiptsComplete:true,refreshedAt:null,shareLabel:"Share of shop purchases",remainingUnits:0,
        priorities:[],listings:[]},
    })});
  });
  await page.goto("https://thegoldiesuite.com/shop-map",{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator(".shop-map-progressive-loading").waitFor({state:"visible",timeout:5000});
  await emit(page,320,"loading");
  await page.getByText("No purchases in this period.",{exact:false}).waitFor({timeout:20000});
  await emit(page,320,"empty_purchases");
  const factory=await context.newPage();
  const factoryResponse=await factory.goto("https://thegoldiesuite.com/listing-factory",{waitUntil:"domcontentloaded",timeout:60000});
  if(!factoryResponse||factoryResponse.status()>=500)throw new Error("Protected Listing Factory route failed");
  console.log("QA_LISTING_FACTORY_ROUTE "+JSON.stringify({status:factoryResponse.status()}));
  await context.close();
  await writeFile("qa-artifacts/results.json",JSON.stringify(results,null,2));
}finally{await browser.close()}
