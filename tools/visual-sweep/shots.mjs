/**
 * SCREENSHOTS OF THE SHIPPING INTERFACE, TO BE LOOKED AT.
 *
 * Measurements answer "does it overflow". They cannot answer "does this read
 * like one finished product", which is the question this exists for. Every
 * state is captured at a desktop width and at the three phone widths, and the
 * images are reviewed by eye.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5199';
const OUT = process.env.OUT ?? '/tmp/shots';
const TICKET = process.env.TICKET ?? '';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const WIDTHS = (process.env.WIDTHS ?? 'desktop,375')
  .split(',').map(name => name === 'desktop'
    ? { name: 'desktop', width: 1440, height: 900, phone: false }
    : { name, width: Number(name), height: 900, phone: true });

const states = process.env.STATES ? process.env.STATES.split(',') : [];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });

for (const view of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    hasTouch: view.phone, isMobile: view.phone,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  let pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  for (const state of states) {
    if (ONLY && !ONLY.includes(state)) continue;
    const url = `${BASE}/dev/state-preview?state=${encodeURIComponent(state)}`
      + (TICKET ? `&ticket=${TICKET}` : '') + '&bare=1'
      + (state === 'factory-ready' ? '&step=setup' : '');
    try {
      pageErrors = [];
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(900);
      const fatalText = await page.locator('body').innerText();
      const hasErrorOverlay = await page.locator('nextjs-portal, .nextjs-toast-errors-parent').count();
      if (fatalText.includes('Page not found') || hasErrorOverlay || pageErrors.length) {
        throw new Error(pageErrors[0] || (hasErrorOverlay ? 'React error overlay rendered' : '404 rendered'));
      }
      await page.screenshot({ path: `${OUT}/${state}__${view.name}.png`, fullPage: true });
      console.log(`ok ${state} ${view.name}`);
    } catch (error) {
      console.log(`FAIL ${state} ${view.name}: ${String(error).slice(0, 110)}`);
    }
  }
  await context.close();
}
await browser.close();
