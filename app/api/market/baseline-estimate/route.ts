import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { estimateBackfill, probeSortSupport } from "@/app/shop-baseline";

/**
 * WHAT THE BACKFILL WOULD COST, BEFORE IT RUNS.
 *
 * Sampled against real shops rather than assumed, so the decision to start it
 * is made against a measurement. Owner only; it spends a dozen calls.
 */
export const GET = withErrorLog("market-baseline-estimate", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const parameters = new URL(request.url).searchParams;

  /*
    THE QUESTION THAT DECIDES WHETHER THIS IS AFFORDABLE.

    The sampled shops hold a median of 695 listings, so enumerating a whole
    shop on every inspection would cost seven to fifteen calls each. If Etsy
    will return a shop's listings most-recently-updated first, only the top of
    the list can contain anything that moved, and an inspection becomes one
    call instead of fifteen. Worth knowing before committing to either.
  */
  const sortShop = Number(parameters.get("probe_sort"));
  if (Number.isFinite(sortShop) && sortShop > 0)
    return NextResponse.json(await probeSortSupport(sortShop));

  const asked = Number(parameters.get("sample"));
  const sample = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 30) : 12;
  return NextResponse.json(await estimateBackfill({ sample }));
});
