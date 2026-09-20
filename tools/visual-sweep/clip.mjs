import { chromium } from 'playwright';
const B=process.env.BASE??'http://127.0.0.1:5199', T=process.env.TICKET??'';
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.goto(`${B}/dev/state-preview?state=${process.env.STATE}&ticket=${T}`,{waitUntil:'networkidle'});
await page.waitForTimeout(900);
console.log(JSON.stringify(await page.evaluate(()=>{
  const out=[];
  for(const el of document.querySelectorAll('.sp-stage *')){
    if(el.children.length) continue;
    const s=getComputedStyle(el); const text=(el.textContent||'').trim();
    if(!text||s.overflow==='visible') continue;
    if(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2)
      out.push({cls:String(el.className).slice(0,40),tag:el.tagName.toLowerCase(),
        text:text.slice(0,60), scrollW:el.scrollWidth, clientW:el.clientWidth,
        scrollH:el.scrollHeight, clientH:el.clientHeight, overflow:s.overflow, ellipsis:s.textOverflow});
  }
  return out.slice(0,6);
}),null,1));
await browser.close();
