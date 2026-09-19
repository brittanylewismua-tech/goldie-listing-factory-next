import { requireFeaturePage } from "@/app/require-feature";
import CostsClient from "./costs-client";
import FactoryShell from "@/app/factory-shell";
import "./costs.css";

/*
  Why profit is unavailable, and what would fix it. A member told "profit
  unavailable" with no explanation and no action assumes the product is broken.
*/
/* D1670 · This route had no title, so the tab read "Etsy seller tools" — the
   neutral fallback, which exists for pages that must not name a product, not
   for a page that simply forgot to say what it is. A server component, so
   metadata is all it needs. */
export const metadata = { title: "Production costs" };
export default async function CostsPage() {
  const user = await requireFeaturePage("shopMap", "/shop-map/costs");
  return <FactoryShell active="shop-map" title="Production costs" desktopOnly={false}>
    <CostsClient signedInEmail={user.email} />
  </FactoryShell>;
}
