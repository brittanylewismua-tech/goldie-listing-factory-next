import { requireFeaturePage } from "@/app/require-feature";
import { isQaReviewer, QA_REVIEWER_EMAIL } from "@/app/qa-reviewer";
import FactoryShell from "@/app/factory-shell";
import ShopMapClient from "./shop-map-client";
import "./shop-map.css";

/* The tab says what this page is. There is no product name to append, and
   a placeholder in a tab title is how a stand-in becomes permanent. */
export const metadata = { title: "Your shop" };


/*
  Shop Map is read-only and phone-first. The member is usually standing in a
  queue or sitting on a sofa, not at a desk with a spreadsheet, so the page
  answers three questions in order: what did I make, where is the shop
  pointed, and what is it made of.
*/
export default async function ShopMapPage() {
  const reviewer = await isQaReviewer();
  const user = reviewer ? { email: QA_REVIEWER_EMAIL } : await requireFeaturePage("shopMap", "/shop-map");
  return (
    /* D1575 · the same rail, topbar, wordmark and footer as the Listing
       Factory. This page rendered as a bare column on white before. */
    <FactoryShell active="shop-map" title="Your shop" desktopOnly={false} reviewer={reviewer}>
      <ShopMapClient signedInEmail={user.email} />
    </FactoryShell>
  );
}
