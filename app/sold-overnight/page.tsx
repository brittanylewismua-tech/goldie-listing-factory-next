import { redirect } from "next/navigation";

/**
 * SOLD OVERNIGHT LIVES INSIDE THE HOT LIST NOW.
 *
 * It was never a separate question — "what sold overnight" and "what sold this
 * week" are the same count over two lengths of time, and having them as two
 * destinations meant two pages competing to answer one thing. Overnight is a
 * switch on the Hot List instead.
 *
 * A redirect rather than a deletion, because the path is bookmarked.
 */
export default function SoldOvernightRedirect() {
  redirect("/hot-list");
}
