import { chromium } from 'playwright';
const B=process.env.BASE??'http://127.0.0.1:5199', T=process.env.TICKET??'';
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.goto(`${B}/dev/state-preview?state=${process.env.STATE}&ticket=${T}`,{waitUntil:'networkidle'});
await page.waitForTimeout(900);
console.log(JSON.stringify(await page.evaluate((sel)=>{
  const el=document.querySelector(sel); if(!el) return 'not found';
  const chain=[]; for(let n=el;n&&n!==document.documentElement;n=n.parentElement){
    const s=getComputedStyle(n);
    chain.push({tag:n.tagName.toLowerCase(),cls:String(n.className).slice(0,40),color:s.color,bg:s.backgroundColor});
    if(chain.length>6)break;
  } return chain;
}, process.env.SEL),null,1));
await browser.close();
