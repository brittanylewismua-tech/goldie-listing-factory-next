import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const identity = process.env.QA_REVIEWER_JWT;
if (!identity) throw new Error("QA_REVIEWER_JWT is required");
await mkdir("qa-artifacts", {recursive:true});
const browser = await chromium.launch({headless:true});
const results = [];
try {
  const context = await browser.newContext({viewport:{width:900,height:1100},deviceScaleFactor:1});
  const login = await context.request.post("https://thegoldiesuite.com/qa/oidc", {
    headers:{authorization:"Bearer "+identity},timeout:30000,
  });
  if (!login.ok()) throw new Error("Reviewer identity rejected: "+login.status());
  const page = await context.newPage();
  await page.goto("https://thegoldiesuite.com/qa/mobile", {waitUntil:"domcontentloaded",timeout:60000});
  await page.getByRole("heading",{name:"Goldie mobile reviewer check"}).waitFor({timeout:30000});
  for (const width of [390,320]) {
    if (width===320) await page.getByRole("button",{name:"Width: 390px"}).click();
    for (const [key,label] of [
      ["overview","Opportunity Engine"],
      ["money","Your Numbers"],
      ["themes","Product Themes"],
      ["sold","Sold Listings"],
    ]) {
      await page.getByRole("button",{name:label,exact:true}).click();
      const output=page.locator("output");
      await output.getByText(new RegExp("Measured iframe viewport: "+width+"px")).waitFor({timeout:30000});
      await page.waitForTimeout(1800);
      const measured=(await output.innerText()).trim();
      const match=measured.match(/Measured iframe viewport: (\d+)px · document: (\d+)px · horizontal overflow: (YES|NO) · tab rows: ([\d+]+) · heading: ([^·]+) · loading: (YES|NO) · alert: ([^·]+) · body text characters: (\d+)/);
      if(!match)throw new Error("Mobile metrics unavailable in "+key+": "+measured);
      const row={width,tab:key,viewport:Number(match[1]),documentWidth:Number(match[2]),
        overflow:match[3],tabRows:match[4],heading:match[5].trim(),
        loading:match[6],alert:match[7].trim(),textLength:Number(match[8])};
      results.push(row);
      console.log("QA_METRICS "+JSON.stringify(row));
      await page.screenshot({path:`qa-artifacts/shop-map-${width}-${key}.png`,fullPage:true});
      if(row.viewport!==width)throw new Error("Wrong viewport in "+key);
      if(row.documentWidth>width+1||row.overflow!=="NO")throw new Error("Horizontal overflow in "+key+" at "+width+"px");
      if(row.tabRows!=="2+2")throw new Error("Tabs are not 2x2 in "+key+" at "+width+"px: "+row.tabRows);
      if(row.alert!=="none")throw new Error("Alert in "+key+": "+row.alert);
      if(row.loading!=="NO"||row.textLength<500)throw new Error("Blank or incomplete "+key+" panel");
    }
  }
  await writeFile("qa-artifacts/results.json",JSON.stringify(results,null,2));
  await context.close();
} finally {
  await browser.close();
}
