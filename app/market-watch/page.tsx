import { requireFeaturePage } from "@/app/require-feature";
import FactoryShell from "@/app/factory-shell";
import MarketWatchClient from "./market-watch-client";
import "./market-watch.css";

/* The tab says what this page is. There is no product name to append, and
   a placeholder in a tab title is how a stand-in becomes permanent. */
export const metadata = { title: "Market Watch" };


/*
  Market Watch is about everybody else's shop, never the member's own. It
  answers one question — what is actually moving out there — and then gets out
  of the way. It does not tell the seller what to do next.
*/
export default async function MarketWatchPage() {
  const user = await requireFeaturePage("marketWatch", "/market-watch");
  return (
    /* D1575 · the same rail, topbar, wordmark and footer as the Listing
       Factory. This page rendered as a bare column on white before. */
    <FactoryShell active="market-watch" title="Market Watch" desktopOnly={false}>
      <MarketWatchClient signedInEmail={user.email} />
    </FactoryShell>
  );
}
