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
  for(let offset=0;offset<data.length;offset+=16000)
    console.log("QA_IMAGE_CHUNK "+data.slice(offset,offset+16000));
  console.log(`QA_IMAGE_END ${width} ${name}`);
};
const login=async(context)=>{
  const response=await context.request.post("https://thegoldiesuite.com/qa/oidc",{
    headers:{authorization:"Bearer "+token},timeout:30000});
  if(!response.ok())throw new Error("Reviewer identity rejected: "+response.status());
};
const waitReady=async(page)=>{
  await page.locator(".oe-priority-grid .oe-priority-card").first().waitFor({timeout:45000});
  await page.locator(".oe-site-grid .oe-site-card").first().waitFor({timeout:45000});
};
const measurements=async(page)=>page.evaluate(()=>{
  const boxes=selector=>[...document.querySelectorAll(selector)]
    .filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect());
  const tabBoxes=boxes(".shop-map-tabs button");
  const priorities=boxes(".oe-priority-grid").length?boxes(".oe-priority-grid")[0]:null;
  const cards=boxes(".oe-priority-grid .oe-priority-card").slice(0,3);
  const grid=boxes(".oe-site-grid .oe-site-card").slice(0,4);
  const cardArt=boxes(".oe-site-grid .oe-site-card-art").slice(0,4);
  return {
    viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth,
    tabRows:[...new Set(tabBoxes.map(box=>Math.round(box.top)))].length,
    priorityCount:cards.length,
    priorityRows:[...new Set(cards.map(box=>Math.round(box.top)))].length,
    gridCount:grid.length,gridRows:[...new Set(grid.map(box=>Math.round(box.top)))].length,
    visibleArt:cardArt.length,
    priorityTop:priorities?.top??null,
    heading:document.querySelector(".shop-map-head h1")?.textContent?.trim()??"",
    oldSectionVisible:[...document.querySelectorAll(".oe-site-deep .oe-review,.oe-site-deep .oe-patterns")]
      .some(node=>node.getClientRects().length>0),
  };
});
try{
  for(const width of [390,320,1280]){
    const context=await browser.newContext({viewport:{width,height:width===1280?900:844},deviceScaleFactor:1});
    await login(context);
    const page=await context.newPage();
    await page.goto("https://thegoldiesuite.com/shop-map",{waitUntil:"domcontentloaded",timeout:60000});
    await waitReady(page);
    await page.getByRole("heading",{name:"Opportunity Engine",exact:true}).waitFor();
    await page.getByRole("heading",{name:"Your top three"}).waitFor();
    await page.getByRole("heading",{name:"More opportunities"}).waitFor();
    await page.getByRole("heading",{name:"How Goldie reaches a direction"}).waitFor();
    for(const label of ["All","Build out","Improve","Restore"])
      await page.locator(".oe-site-filter").getByRole("button",{name:label,exact:true}).waitFor();
    const p=page.locator(".oe-priority-grid").first().locator(".oe-priority-card");
    if(await p.count()!==3)throw new Error("Top three breakdowns are missing");
    for(const card of await p.all()){
      if(!(await card.locator(".oe-priority-diagnosis,.oe-priority-direction").count()))
        throw new Error("A top listing has no direction");
    }
    const firstImage=p.first().locator(".oe-priority-art img");
    if(!(await firstImage.evaluate(img=>img instanceof HTMLImageElement&&img.complete&&img.naturalWidth>0)))
      throw new Error("Top listing image failed to load");
    const pageLayout=await measurements(page);
    if(pageLayout.heading!=="Opportunity Engine"||pageLayout.documentWidth>width+1
      ||pageLayout.bodyWidth>width+1||pageLayout.priorityCount!==3||pageLayout.gridCount<1
      ||pageLayout.visibleArt<1||pageLayout.oldSectionVisible)
      throw new Error("Opportunity Engine layout failed: "+JSON.stringify(pageLayout));
    if(width<600&&pageLayout.tabRows!==2)throw new Error("Tabs are not 2x2");
    if(width===1280&&(pageLayout.tabRows!==1||pageLayout.priorityRows!==1||pageLayout.gridRows!==2))
      throw new Error("Desktop card grid does not match approved layout: "+JSON.stringify(pageLayout));
    console.log("QA_LAYOUT "+JSON.stringify({width,...pageLayout}));
    await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
    await emit(page,width,width===1280?"desktop_first_viewport":"overview_first_viewport");
    await emit(page,width,width===1280?"desktop_overview":"overview",true);
    for(const index of [1,2]){
      await p.nth(index).scrollIntoViewIfNeeded();
      await emit(page,width,"priority_"+(index+1));
    }
    await page.locator(".oe-site-grid").scrollIntoViewIfNeeded();
    await emit(page,width,"opportunity_grid");
    await page.locator(".oe-site-evidence-band").scrollIntoViewIfNeeded();
    await emit(page,width,"evidence_band");
    await page.locator(".oe-site-grid .oe-site-link").first().click();
    const dialog=page.locator(".oe-site-dialog");
    await dialog.waitFor({state:"visible"});
    if(!(await dialog.locator("li").count()))throw new Error("Evidence dialog lacks source detail");
    await emit(page,width,"evidence_dialog");
    await dialog.getByRole("button",{name:"Close"}).click();
    for(const label of ["Build out","Improve","Restore","All"]){
      await page.locator(".oe-site-filter").getByRole("button",{name:label,exact:true}).click();
      const visible=await page.locator(".oe-site-grid .oe-site-card").count();
      const empty=await page.locator(".oe-site-empty").count();
      if(!visible&&!empty)throw new Error("Filter became blank: "+label);
    }
    if(width<600){
      await page.locator(".oe-site-period").getByRole("button",{name:"Last 30 days"}).click();
      await page.waitForTimeout(1000);
      await p.first().waitFor();
      await emit(page,width,"overview_30",true);
      await page.locator(".oe-site-period").getByRole("button",{name:"Last 90 days"}).click();
      await waitReady(page);
    }
    const tabs=[
      ["Your numbers","money"],["Product themes","themes"],["Sold listings","sold"]];
    for(const [label,key] of tabs){
      await page.locator(".shop-map-tabs").getByRole("button",{name:label}).click();
      await page.locator(".shop-map-tabs button[aria-current=page]").filter({hasText:label}).waitFor({timeout:20000});
      await page.waitForTimeout(1000);
      const layout=await measurements(page);
      const panelText=(await page.locator(".shop-map-tab-panel,.shop-map-money,.shop-map-themes,.shop-map-sold").allInnerTexts()).join(" ");
      if(layout.documentWidth>width+1||layout.bodyWidth>width+1||panelText.trim().length<50)
        throw new Error("Blank or overflowing "+key+": "+JSON.stringify(layout));
      if(width<600&&layout.tabRows!==2)throw new Error("Tab rows changed in "+key+": "+JSON.stringify(layout)+"; body="+(await page.locator("main").innerText()).slice(0,300));
      console.log("QA_TAB "+JSON.stringify({width,key,documentWidth:layout.documentWidth,textLength:panelText.length}));
      await emit(page,width,key,true);
    }
    results.push({width,overview:pageLayout,tabs:"passed"});
    await context.close();
  }
  const emptyContext=await browser.newContext({viewport:{width:320,height:844},deviceScaleFactor:1});
  await login(emptyContext);
  const emptyPage=await emptyContext.newPage();
  await emptyPage.route(url=>url.pathname==="/api/shop-map/map"&&url.searchParams.get("view")==="overview-purchases",async route=>{
    await new Promise(resolve=>setTimeout(resolve,1600));
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      shop:{shopId:900001,shopName:"Goldie Reviewer Shop"},
      purchasePriorities:{days:90,totalUnits:0,totalOrders:0,unmatchedUnits:0,excludedRefundUnits:0,
        receiptsComplete:true,refreshedAt:null,shareLabel:"Share of shop purchases",remainingUnits:0,
        priorities:[],listings:[]},
    })});
  });
  await emptyPage.goto("https://thegoldiesuite.com/shop-map",{waitUntil:"domcontentloaded",timeout:60000});
  await emptyPage.locator(".shop-map-progressive-loading").waitFor({state:"visible",timeout:5000});
  await emit(emptyPage,320,"loading");
  await emptyPage.getByText("No purchases in this period.").waitFor({timeout:20000});
  await emit(emptyPage,320,"empty_purchases");
  await emptyContext.close();
  await writeFile("qa-artifacts/results.json",JSON.stringify(results,null,2));
}finally{await browser.close()}
