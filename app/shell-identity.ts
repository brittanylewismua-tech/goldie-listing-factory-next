/**
 * THE SHARED SHELL IS UNBRANDED ON PURPOSE.
 *
 * The umbrella product name has not been chosen. Until it is, the chrome that
 * every feature wears carries no product name, no wordmark and no mark of its
 * own — and no placeholder standing in for one, because a placeholder is the
 * thing that quietly becomes the name.
 *
 * WHAT IS ALLOWED TO IDENTIFY ITSELF is a feature, by its actual name:
 * Listing Factory, Design Scanner, Market Watch, Shop Watch, Shop Map,
 * Trademark Checker. The topbar already names the page, which is why the
 * rail's brand slot can simply be empty rather than needing something put in
 * it.
 *
 * THE LISTING FACTORY WORDMARK IS A FEATURE'S MARK, NOT THE PRODUCT'S. It
 * belongs on the Listing Factory's own pages and nowhere else. Home is not
 * one of those pages: it is the way in to everything, so it stays neutral.
 *
 * Nothing here deletes an asset or renames anything internally. Event names,
 * storage keys, bucket names and the domain are infrastructure and are left
 * exactly as they are; this is about what a member reads.
 */
export type ShellSection =
  | "home" | "hotlist" | "trademark" | "factory" | "batches" | "keywords"
  | "usage" | "connections" | "market-watch" | "shop-map" | "design-scanner" | "more";

/** The Listing Factory's own pages — the only place its wordmark appears. */
const LISTING_FACTORY_PAGES = new Set<ShellSection>(["factory", "batches", "keywords"]);

export const showsListingFactoryWordmark = (section: ShellSection) =>
  LISTING_FACTORY_PAGES.has(section);

/**
 * What a browser tab, a bookmark and a share card say.
 *
 * A tab needs some words in it. With no product name to use, each page says
 * what it is; there is no suffix, because a suffix is where a suite name
 * would go and there is not one to put there.
 */
export const TAB_TITLES: Record<ShellSection, string> = {
  home: "Home",
  factory: "Listing Factory",
  batches: "Batch History",
  keywords: "Keyword Banks",
  "market-watch": "Market Watch",
  "shop-map": "Shop Map",
  "design-scanner": "Design Scanner",
  trademark: "Trademark Checker",
  hotlist: "Hot List",
  usage: "Usage and Plan",
  connections: "Connections",
  more: "Tools and settings",
};

/**
 * The one string the installed app and the browser fall back to.
 *
 * Deliberately a plain description of what the software does rather than a
 * name: it must not read as a product somebody chose to call this. Replace it
 * the moment the umbrella name exists — it is referenced from the layout
 * metadata and the web manifest, and nowhere else.
 */
export const NEUTRAL_FALLBACK_TITLE = "Etsy seller tools";
