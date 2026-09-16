import { requireFeaturePage } from "@/app/require-feature";
import CostsClient from "./costs-client";
import "./costs.css";

/*
  Why profit is unavailable, and what would fix it. A member told "profit
  unavailable" with no explanation and no action assumes the product is broken.
*/
export default async function CostsPage() {
  const user = await requireFeaturePage("shopMap", "/shop-map/costs");
  return <CostsClient signedInEmail={user.email} />;
}
