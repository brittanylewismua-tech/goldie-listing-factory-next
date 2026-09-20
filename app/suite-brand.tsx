/**
 * THE HOME LINK. NOT A WORDMARK.
 *
 * This carried "goldie suite" over "SELLER COMMAND CENTER". Two problems, and
 * the second was the quieter one:
 *
 *   1. Goldie is not this product's name and has not been for some time. A
 *      name nobody stands behind, printed on every page, is worse than none.
 *   2. "Seller command center" appeared here, again as the rail's first group
 *      heading, and a third time as the home page's eyebrow — three times
 *      within a few inches of each other, all saying nothing a member needed.
 *
 * So this is what it always actually was: the way back to Home. The mark
 * stays, because the rail needs an anchor at the top and the mark is part of
 * the approved visual language. The words go.
 */
export default function SuiteBrand() {
  return <a className="suite-brand approved-brand" href="/home" aria-label="Home">
    <span className="suite-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M25.2 6.8l-2.8 2.8M9.6 22.4l-2.8 2.8" />
        <circle cx="16" cy="16" r="7.5" />
        <circle cx="16" cy="16" r="2.5" />
      </svg>
      <i />
    </span>
  </a>;
}
