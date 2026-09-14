/**
 * WHAT THE MEMBER PASTED, TURNED INTO SOMETHING RESOLVABLE.
 *
 * Members paste a shop URL, a listing URL, a bare name, a name with the @ they
 * saw somewhere. Two members pasting the same shop in different forms must end
 * up on the same shared collection, so everything is reduced to a name — or to
 * a listing id to be resolved through Etsy — before anything is stored.
 *
 * Kept free of imports so the parsing, which is the part that has to be right,
 * is testable without Cloudflare or a network.
 */

/** Configurable, because the right number is a pricing decision. */
export const WATCH_LIMIT_DEFAULT = 25;
/** Etsy's freshness rule for anything derived from listing data. */
export const FRESH_HOURS = 6;
/** The first pull for a new shop. Lifetime histories run to six figures. */
export const REVIEW_BOOTSTRAP = 500;
export const REVIEW_PAGE = 100;

export function shopNameFrom(input: string): string {
  const text = String(input ?? "").trim();
  if (!text) return "";
  const fromUrl = text.match(/etsy\.com\/(?:[a-z-]{2,5}\/)?shop\/([A-Za-z0-9_-]+)/i);
  if (fromUrl) return fromUrl[1];
  /* A listing URL carries no shop name; the caller has to resolve the listing
     instead, and saying so is better than guessing from the slug. */
  if (/etsy\.com\/(?:[a-z-]{2,5}\/)?listing\//i.test(text)) return "";
  return text.replace(/^@/, "").replace(/[^A-Za-z0-9_-]/g, "");
}

export const listingIdFrom = (input: string): number => {
  const match = String(input ?? "").match(/etsy\.com\/(?:[a-z-]{2,5}\/)?listing\/(\d+)/i);
  return match ? Number(match[1]) : 0;
};
