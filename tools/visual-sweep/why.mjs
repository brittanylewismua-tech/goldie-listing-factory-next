import { chromium } from 'playwright';
const B=process.env.BASE??'http://127.0.0.1:5199', T=process.env.TICKET??'';
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.goto(`${B}/dev/state-preview?state=${process.env.STATE}&ticket=${T}`,{waitUntil:'networkidle'});
await page.waitForTimeout(800);
console.log(JSON.stringify(await page.evaluate((sel)=>{
  const el=document.querySelector(sel); if(!el) return 'not found';
  const hits=[];
  for(const sheet of document.styleSheets){
    let rules; try{rules=sheet.cssRules}catch{continue}
    for(const rule of rules){
      if(!rule.selectorText||!/background/.test(rule.cssText||''))continue;
      try{ if(!el.matches(rule.selectorText))continue }catch{continue}
      const bg=rule.style.getPropertyValue('background')||rule.style.getPropertyValue('background-color');
      if(!bg)continue;
      hits.push({sel:rule.selectorText.slice(0,90),bg:bg.slice(0,40),
        important:rule.style.getPropertyPriority('background')||rule.style.getPropertyPriority('background-color'),
        href:(sheet.href||'inline').split('/').pop().slice(0,40)});
    }
  }
  return hits;
}, process.env.SEL),null,1));
await browser.close();
