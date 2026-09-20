/**
 * A FAST FIRST PASS, WITH ITS LIMIT STATED.
 *
 * Contrast measured from computed styles: the text colour against the nearest
 * ancestor that actually paints a background. It cannot read a gradient or an
 * image, so anything it flags is confirmed against rendered pixels before it
 * is called a defect — but it runs in one page pass instead of two
 * screenshots per element, which is what makes checking every state at every
 * width possible at all.
 *
 * It also collects the things that need no measurement: horizontal overflow,
 * touch targets, clipped text, and internals that reached the member.
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5199';
const TICKET = process.env.TICKET ?? '';
const OUT = process.env.OUT ?? '/tmp/scan.jsonl';
const states = (process.env.STATES ?? '').split(',').filter(Boolean);
const VIEWS = {
  desktop: { width: 1440, height: 900, phone: false },
  '375': { width: 375, height: 812, phone: true },
  '390': { width: 390, height: 844, phone: true },
  '430': { width: 430, height: 932, phone: true },
};
const views = (process.env.VIEWPORTS ?? 'desktop').split(',').map(n => [n, VIEWS[n]]).filter(v => v[1]);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
for (const [name, view] of views) {
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height },
    isMobile: view.phone, hasTouch: view.phone, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    const kill = document.createElement('style');
    kill.textContent = '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}';
    const attach = () => (document.head || document.documentElement)?.appendChild(kill);
    attach(); document.addEventListener('DOMContentLoaded', attach);
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 100)));

  for (const state of states) {
    errors.length = 0;
    let status = 'ERR';
    try {
      const response = await page.goto(`${BASE}/dev/state-preview?state=${state}&ticket=${TICKET}`,
        { waitUntil: 'domcontentloaded', timeout: 25000 });
      status = response ? response.status() : 'none';
    } catch { status = 'TIMEOUT'; }
    await page.waitForTimeout(1000);

    const found = await page.evaluate(() => {
      const root = document.querySelector('.sp-stage') ?? document.body;
      const out = [];
      const add = (kind, detail) => out.push({ kind, detail });
      const de = document.documentElement;

      /*
        ALPHA IS NOT OPACITY TO IGNORE.

        A first version treated rgba(165,50,78,.09) as an opaque colour, so a
        9%-tint error panel read as a dark red background and every message on
        it was reported unreadable. Translucent layers are composited over
        what is behind them, which is what the eye does.
      */
      const rgba = value => {
        const m = /rgba?\(([^)]+)\)/.exec(value || '');
        if (!m) return null;
        const parts = m[1].split(',').map(Number);
        return { c: parts.slice(0, 3), a: parts.length === 4 ? parts[3] : 1 };
      };
      const rgb = value => { const p = rgba(value); return p && p.a > 0 ? p.c : null; };
      const over = (top, bottom) => top.c.map((channel, i) =>
        Math.round(channel * top.a + bottom[i] * (1 - top.a)));
      const lum = ([r, g, b]) => {
        const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const behind = el => {
        const layers = [];
        for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
          const s = getComputedStyle(node);
          if (s.backgroundImage && s.backgroundImage !== 'none') return null;   // cannot read
          const layer = rgba(s.backgroundColor);
          if (!layer || layer.a === 0) continue;
          if (layer.a >= 1) {
            let base = layer.c;
            for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
            return base;
          }
          layers.push(layer);
        }
        let base = [255, 255, 255];
        for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
        return base;
      };

      /* 1. Horizontal overflow. */
      if (de.scrollWidth > de.clientWidth + 1)
        add('horizontal-overflow', `page ${de.scrollWidth} > viewport ${de.clientWidth}`);

      /* 2. Contrast, on leaf text only. */
      const low = [];
      for (const el of root.querySelectorAll('p,h1,h2,h3,h4,b,strong,span,small,li,dt,dd,button,a,label')) {
        if (el.children.length) continue;
        const text = (el.textContent || '').trim();
        if (text.length < 3) continue;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === 'hidden' || s.opacity === '0') continue;
        if (el.closest('[disabled],[aria-disabled="true"]') || el.disabled) continue;
        const fg = rgb(s.color); const bg = behind(el);
        if (!fg || !bg) continue;
        const size = parseFloat(s.fontSize);
        const need = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700) ? 3 : 4.5;
        const got = ratio(fg, bg);
        if (got < need) low.push(`"${text.slice(0, 34)}" ${got.toFixed(2)}:1 needs ${need} @${size}px`);
        if (low.length >= 6) break;
      }
      if (low.length) add('low-contrast', low.join(' | '));

      /* 3. Touch targets, only where a finger is the pointer. */
      if (matchMedia('(pointer: coarse)').matches) {
        const small = [];
        for (const el of root.querySelectorAll('button,a[href],input,select,[role="button"],[role="tab"]')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (getComputedStyle(el).display === 'contents') continue;
          /* Visually-hidden inputs are triggered by their label, which is the
             thing a finger actually hits. */
          if (r.width <= 2 && r.height <= 2) continue;
          if (el.closest('.sr-only, .visually-hidden')) continue;
          if (r.height < 44 || r.width < 24)
            small.push(`${el.tagName.toLowerCase()}"${(el.textContent||'').trim().slice(0,18)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (small.length >= 6) break;
        }
        if (small.length) add('touch-target-under-44', small.join(' | '));
      }

      /* 4. Clipped text. */
      const clipped = [];
      for (const el of root.querySelectorAll('*')) {
        if (el.children.length) continue;
        const s = getComputedStyle(el);
        if (s.overflow === 'visible' || !(el.textContent || '').trim()) continue;
        /* Screen-reader text is clipped on purpose. */
        if (el.classList.contains('sr-only') || el.closest('.sr-only, .visually-hidden')) continue;
        if (el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis')
          clipped.push(`"${(el.textContent||'').trim().slice(0,24)}"`);
        if (clipped.length >= 5) break;
      }
      if (clipped.length) add('clipped-text', clipped.join(' | '));

      /* 5. Internals a member should never see. */
      const body = (root.textContent || '');
      const leaks = [];
      if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(body)) leaks.push('uuid');
      if (/\b1[0-9]{9}\b/.test(body)) leaks.push('unix timestamp');
      if (/\b[a-z_]+_[a-z_]+\b/.test(body) && /\b(user_id|shop_id|created_at|updated_at|state_json|_json)\b/.test(body)) leaks.push('snake_case column');
      if (/\bD1[0-9]{3}\b/.test(body)) leaks.push('build marker');
      if (/undefined|NaN|\[object Object\]/.test(body)) leaks.push('undefined/NaN');
      if (leaks.length) add('raw-internals', leaks.join(', '));

      return out;
    }).catch(error => [{ kind: 'scan-failed', detail: String(error).slice(0, 120) }]);

    appendFileSync(OUT, JSON.stringify({ state, view: name, status, findings: found,
      errors: [...new Set(errors)].slice(0, 3) }) + '\n');
    const flag = found.length || errors.length ? 'FINDINGS' : 'clean';
    if (flag === 'FINDINGS') {
      console.log(`[${flag}] ${state} @${name} status=${status}`);
      for (const f of found) console.log(`   - ${f.kind}: ${f.detail}`);
      for (const e of errors) console.log(`   ! console: ${e}`);
    }
  }
  await context.close();
}
await browser.close();
