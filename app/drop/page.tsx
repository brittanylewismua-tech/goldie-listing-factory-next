import { redirect } from "next/navigation";

/**
 * TODAY'S HOT LIST IS NOW SOLD OVERNIGHT.
 *
 * Two pages answered the same question — what is working on Etsy — sitting
 * next to each other in the nav, with the same cards and the same unlock rail.
 * One counted sales. The other ranked by saves over age, could not see a sale
 * at all, and badged a twenty-three-month-old listing "New today" because
 * "new" there meant new to that morning's ranking rather than new to Etsy.
 *
 * Keeping both would have been the same shape in a different hat. The keyword
 * lookup was the only thing this page had that the other does not, and it came
 * across on the rail. A redirect rather than a deletion, because the path is
 * bookmarked and in the nav of older sessions.
 */
export default function HotListRedirect() {
  redirect("/hot-list");
}
