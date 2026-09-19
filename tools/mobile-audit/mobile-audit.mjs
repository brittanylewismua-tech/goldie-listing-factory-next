/**
 * MOBILE LAYOUT AND INTERACTION AUDIT, ON THE SHIPPING COMPONENTS.
 *
 * The production site cannot be reached from this sandbox (egress is
 * allowlisted and thegoldiesuite.com does not resolve), and the user's own
 * Chrome must not be resized. So the app is served locally and driven by a
 * headless Chromium at real phone viewports with touch and pointer: coarse.
 *
 * What renders here is the shipping interface: the state preview mounts the
 * real production components and answers their network calls from the fixture
 * table, with the network closed.
 */
import { chromium } from 'playwright';
import { measureContrast, required } from './pixel-contrast.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5199';
const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

/* Contrast, so "unreadable colour combinations" is measured not eyeballed. */
const luminance = ([r, g, b]) => {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

async function audit(page, label, scope = '') {
  return page.evaluate(({ label, scope }) => {
    const root = scope ? document.querySelector('.sp-stage') : document;
    if (!root) return { label, findings: [{ kind: 'stage-missing', detail: 'component did not mount' }], textBoxes: [] };
    const de = document.documentElement;
    const out = { label, findings: [] };
    const add = (kind, detail) => out.findings.push({ kind, detail });

    /* 1. Horizontal overflow. */
    if (de.scrollWidth > de.clientWidth + 1) {
      const wide = [...root.querySelectorAll('*')]
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
        })
        .filter(el => !el.closest('[data-scroll], .overflow-x-auto, table, pre'))
        .slice(0, 5)
        .map(el => `${el.tagName.toLowerCase()}.${String(el.className || '').trim().split(/\s+/)[0] || '?'} `
          + `w=${Math.round(el.getBoundingClientRect().width)} right=${Math.round(el.getBoundingClientRect().right)}`);
      add('horizontal-overflow', `page ${de.scrollWidth} > viewport ${de.clientWidth}; ${wide.join(' | ')}`);
    }

    /* 2. Touch targets. Only things a finger must hit. */
    const small = [];
    for (const el of root.querySelectorAll('button, a[href], input, select, [role="button"], [role="tab"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;             // hidden
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      /*
        A visually hidden input with a properly sized label is the standard
        accessible file-picker, not a 1x1 tap target: the member taps the
        label. Judge the thing they actually touch.
      */
      const hidden = Number(style.opacity) === 0 || style.position === 'absolute' && r.width <= 2;
      const label = el.labels && el.labels[0];
      if (hidden && label) {
        const lb = label.getBoundingClientRect();
        if (lb.height >= 44 && lb.width >= 24) continue;
      }
      if (r.height < 44 || r.width < 24) {
        small.push(`${el.tagName.toLowerCase()}[${(el.textContent || '').trim().slice(0, 22)}] `
          + `${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    if (small.length) add('touch-target-under-44', small.slice(0, 6).join(' | '));

    /* 3. Clipped text: content wider than its own scroll container. */
    const clipped = [...root.querySelectorAll('h1,h2,h3,p,span,div,li,td')]
      .filter(el => {
        const style = getComputedStyle(el);
        if (style.overflow === 'visible' || el.children.length) return false;
        return el.scrollWidth > el.clientWidth + 2 && style.textOverflow !== 'ellipsis';
      })
      .slice(0, 4)
      .map(el => `${el.tagName.toLowerCase()}[${(el.textContent || '').trim().slice(0, 25)}]`);
    if (clipped.length) add('clipped-text', clipped.join(' | '));

    /* 4. Raw internals reaching a member's screen. */
    const body = (root.innerText || document.body.innerText || '');
    const leaks = [];
    if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(body)) leaks.push('uuid');
    if (/\b1[7-9]\d{8}\b/.test(body)) leaks.push('unix-timestamp');
    if (/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(body)) leaks.push('iso-timestamp');
    if (/\{"[a-z_]+":/i.test(body)) leaks.push('json');
    if (/\b[a-z]+_[a-z]+_[a-z]+\b/.test(body)) leaks.push('snake_case-field');
    if (leaks.length) add('raw-internals', leaks.join(', '));

    /* 5. Contrast of visible text against its painted background. */
    const parse = v => (v.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const painted = el => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const p = parse(bg);
        if (p.length === 3 && !/rgba\(.*,\s*0\)/.test(bg)) return p;
      }
      return [255, 255, 255];
    };
    out.textBoxes = [...root.querySelectorAll('p, h1, h2, h3, span, button, a, li')]
      .filter(el => (el.textContent || '').trim().length > 3
        && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().width > 0
        && getComputedStyle(el).visibility !== 'hidden')
      .slice(0, 40)
      .map(el => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
        return { text: (el.textContent||'').trim().slice(0,30),
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          size: parseFloat(st.fontSize), weight: st.fontWeight }; });
    out.contrastSamples = [...root.querySelectorAll('p, h1, h2, h3, span, button, a, li')]
      .filter(el => (el.textContent || '').trim().length > 3 && el.getBoundingClientRect().height > 0)
      .slice(0, 120)
      .map(el => {
        const style = getComputedStyle(el);
        return { text: (el.textContent || '').trim().slice(0, 30),
          fg: parse(style.color), bg: painted(el),
          size: parseFloat(style.fontSize), weight: style.fontWeight };
      });
    return out;
  }, { label, scope });
}

const results = [];
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const ticket = process.env.TICKET ?? '';
const states = (process.env.STATES ?? '').split(',').filter(Boolean);
const targets = states.length
  ? states.map(k => ({ name: k, path: `/dev/state-preview?state=${k}&ticket=${ticket}` }))
  : JSON.parse(process.env.TARGETS ?? '[]');

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
      + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await context.addInitScript(() => {
    /*
      NO ANIMATION WHILE MEASURING.

      Cards here fade in. A contrast reading taken mid-fade measures a
      half-painted colour, which is how a heading that is really 18:1 was
      recorded at 1.09:1. Motion is disabled and the page is given time to
      settle, so every reading is of the finished pixel.
    */
    const kill = document.createElement('style');
    kill.textContent = `*,*::before,*::after{animation-duration:0s!important;`
      + `animation-delay:0s!important;transition-duration:0s!important;`
      + `transition-delay:0s!important;scroll-behavior:auto!important}`;
    const attach = () => (document.head || document.documentElement)?.appendChild(kill);
    attach();
    document.addEventListener('DOMContentLoaded', attach);
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 120)));

  for (const target of targets) {
    consoleErrors.length = 0;
    const url = BASE + target.path;
    let status = 'ERR';
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      status = response ? response.status() : 'no-response';
    } catch { status = 'TIMEOUT'; }
    await page.waitForTimeout(1100);

    /* Confirm the emulation actually took. */
    const env = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      coarse: matchMedia('(pointer: coarse)').matches,
      touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    }));

    const scope = (await page.$('.sp-stage')) ? '.sp-stage ' : '';
    const found = await audit(page, `${target.name} @${vp.name}`, scope);
    /* Pixels, not computed styles — see pixel-contrast.mjs. */
    const bad = [];
    const handles = await page.$$(`${scope}p, ${scope}h1, ${scope}h2, ${scope}h3, ${scope}span, ${scope}button, ${scope}a, ${scope}li`);
    for (const h of handles.slice(0, 18)) {
      const info = await h.evaluate(el => {
        const st = getComputedStyle(el); const r = el.getBoundingClientRect();
        /* WCAG exempts disabled controls from contrast, and a greyed-out
           button is greyed out on purpose. */
        const off = el.disabled === true || el.getAttribute('aria-disabled') === 'true'
          || el.closest('[disabled],[aria-disabled="true"]') !== null;
        return { text: (el.textContent||'').trim().slice(0,30), size: parseFloat(st.fontSize),
          weight: st.fontWeight, ok: !off && r.height>0 && r.width>0 && st.visibility!=='hidden'
            && (el.textContent||'').trim().length>2 && el.children.length===0 };
      }).catch(()=>({ok:false}));
      if (!info.ok) continue;
      const r = await measureContrast(page, h);
      if (r === null) continue;
      const need = required(info.size, info.weight);
      if (r < need) bad.push(`"${info.text}" ${r.toFixed(2)}:1 (needs ${need}) @${info.size}px`);
      if (bad.length >= 4) break;
    }
    if (bad.length) found.findings.push({ kind: 'low-contrast', detail: bad.join(' | ') });
    delete found.contrastSamples; delete found.textBoxes;

    results.push({ ...found, path: target.path, status, env, consoleErrors: [...new Set(consoleErrors)].slice(0, 3) });
  }
  await context.close();
}
await browser.close();

import { appendFileSync } from 'node:fs';
appendFileSync(process.env.OUT ?? '/tmp/audit-results.jsonl',
  results.map(r => JSON.stringify(r)).join('\n') + '\n');

for (const r of results) {
  const flag = r.findings.length || r.consoleErrors.length ? 'FINDINGS' : 'clean';
  console.log(`\n[${flag}] ${r.label}  status=${r.status}  vw=${r.env?.width} coarse=${r.env?.coarse} touch=${r.env?.touch}`);
  for (const f of r.findings) console.log(`   - ${f.kind}: ${f.detail}`);
  for (const e of r.consoleErrors) console.log(`   ! console: ${e}`);
}
console.log(`\nTOTAL findings: ${results.reduce((n, r) => n + r.findings.length, 0)} across ${results.length} page/viewport combinations`);
