import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://127.0.0.1:5199';
const TICKET = process.env.TICKET ?? '';
const state = process.env.STATE;
const sel = process.env.SEL ?? 'body';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/dev/state-preview?state=${state}&ticket=${TICKET}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const out = await page.evaluate((sel) => {
  const nodes = [...document.querySelectorAll(sel)].slice(0, 12);
  return nodes.map(el => {
    const s = getComputedStyle(el);
    return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50),
      color: s.color, bg: s.backgroundColor, size: s.fontSize,
      text: (el.textContent || '').trim().slice(0, 40) };
  });
}, sel);
console.log(JSON.stringify(out, null, 1));
await browser.close();
