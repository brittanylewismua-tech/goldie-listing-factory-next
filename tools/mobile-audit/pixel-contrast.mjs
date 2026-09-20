/**
 * CONTRAST FROM RENDERED PIXELS, BY DIFFERENCE.
 *
 * Two cheaper methods were wrong here and both were wrong confidently.
 *
 * getComputedStyle is wrong because these cards paint with gradients and
 * background images: backgroundColor answers "transparent" and any walk up
 * the tree blames whichever ancestor happens to be dark. It reported 1.00:1
 * for a button that is perfectly legible.
 *
 * Percentiles over a screenshot are wrong because a text box is mostly
 * background, and over a gradient the 5th and 95th percentiles measure the
 * gradient rather than the glyphs — which is why the same string scored
 * 1.04:1 at one width and 1.32:1 at another.
 *
 * So: shoot the box twice, once normally and once with the glyphs made
 * invisible. The pixels that changed ARE the text. Compare each against what
 * was behind it. No guessing about what the background is.
 */
import { PNG } from 'pngjs';

const relLum = (r, g, b) => {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [relLum(...a), relLum(...b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

export async function measureContrast(page, handle) {
  /*
    SCROLL IT INTO VIEW FIRST.

    Playwright's boundingBox is viewport-relative and screenshot({clip}) is
    page-relative. For anything below the fold those disagree, so the clip
    sampled a different part of the page entirely — which is how a plainly
    black-on-white heading measured 1.10:1.
  */
  /*
    SHOOT THE ELEMENT, NOT A CLIP OF THE PAGE.

    boundingBox is viewport-relative and screenshot({clip}) is page-relative,
    so anything below the fold sampled a different region entirely — a plainly
    black-on-white heading measured 1.10:1 that way. elementHandle.screenshot
    scrolls and clips for us, and there is no arithmetic left to get wrong.
  */
  const size = await handle.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }).catch(() => null);
  if (!size || size.width < 2 || size.height < 2 || size.height > 400) return null;

  let withText, withoutText;
  try {
    /*
      Let the scroll settle before the first shot. elementHandle.screenshot
      scrolls the element into view, and capturing on the same tick sometimes
      caught the frame mid-scroll — which showed up as a scattering of
      1.07:1 readings that never repeated on the same element twice.
    */
    /*
      CENTRE IT, DON'T JUST BRING IT INTO VIEW.

      scrollIntoViewIfNeeded leaves an element that is already barely on
      screen exactly where it is — clinging to the bottom edge, partly under
      the chrome. The capture was then mostly dark UI rather than the text,
      which is where the scattering of 1.08:1 readings came from. Centring
      guarantees the whole box is clear of both edges.
    */
    await handle.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' })).catch(() => {});
    await new Promise(r => setTimeout(r, 350));
    withText = await handle.screenshot({ timeout: 5000 });
    await handle.evaluate(el => {
      el.dataset.oldColor = el.style.color; el.dataset.oldShadow = el.style.textShadow;
      el.style.color = 'transparent'; el.style.textShadow = 'none';
    });
    withoutText = await handle.screenshot({ timeout: 5000 });
    await handle.evaluate(el => {
      el.style.color = el.dataset.oldColor || ''; el.style.textShadow = el.dataset.oldShadow || '';
      delete el.dataset.oldColor; delete el.dataset.oldShadow;
    });
  } catch (e) {
    /* Restore even if a shot failed, so the page is not left mangled. */
    await handle.evaluate(el => {
      if (el.dataset.oldColor !== undefined) {
        el.style.color = el.dataset.oldColor || ''; el.style.textShadow = el.dataset.oldShadow || '';
        delete el.dataset.oldColor; delete el.dataset.oldShadow;
      }
    }).catch(() => {});
    if (process.env.CDEBUG) console.log('shot fail:', String(e).slice(0, 90));
    return null;
  }

  let a, b;
  try { a = PNG.sync.read(withText); b = PNG.sync.read(withoutText); } catch (e) { if (process.env.CDEBUG) console.log('png fail:', String(e).slice(0,80)); return null; }
  if (a.data.length !== b.data.length) return null;

  /* The glyph core: the pixel that moved furthest when the text vanished.
     Antialiased edges move less, so this lands on solid ink. */
  let best = -1, worstRatio = null;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i + 3] < 200) continue;
    const d = Math.abs(a.data[i] - b.data[i])
      + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d <= best || d < 24) continue;                 // 24 filters antialias noise
    best = d;
    worstRatio = contrast(
      [a.data[i], a.data[i + 1], a.data[i + 2]],
      [b.data[i], b.data[i + 1], b.data[i + 2]]);
  }
  /* Nothing changed: no glyphs in this box, or the text is already invisible
     for a reason this measurement cannot distinguish. Report nothing rather
     than guess. */
  return worstRatio;
}

export function required(size, weight) {
  const large = size >= 24 || (size >= 18.66 && Number(weight) >= 700);
  return large ? 3 : 4.5;
}
