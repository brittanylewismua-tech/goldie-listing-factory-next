import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireFeatureApi } from "@/app/require-feature";
import { addWatch, removeWatch, watchLimit } from "@/app/shop-watch";

/**
 * ADD OR DROP A WATCHED SHOP.
 *
 * The resolver already accepts a shop URL, a listing URL, a shop name and
 * localized Etsy domains, so this is a thin wrapper over it. The limit is
 * checked before Etsy is asked anything, so hitting it costs no call.
 *
 * Twenty members watching one shop cost what one member costs: the shop row
 * is shared and `addWatch` reports whether collection was already running.
 */
export const POST = withErrorLog("market-watch-add-shop", async (request: Request) => {
  /* The entitlement decides, not the owner flag: a complimentary beta
     member reaches this and a Listing Factory member does not. */
  const access = await requireFeatureApi("marketWatch");
  if (!access.ok) return access.response;
  const user = access.user;

  const body = await request.json().catch(() => null) as
    { input?: string; remove?: number } | null;

  if (body?.remove) {
    /* The member's watch goes. The shared shop and its review history stay,
       so another watcher is unaffected and re-adding it later resumes. */
    await removeWatch(user.userId, Number(body.remove));
    return NextResponse.json({ removed: true });
  }

  const input = String(body?.input ?? "").trim().slice(0, 300);
  if (!input) return NextResponse.json({ error: "Paste a shop link or name." }, { status: 400 });

  const outcome = await addWatch(user.userId, input);
  if (!outcome.ok)
    return NextResponse.json({ error: outcome.reason, etsyCalls: outcome.calls }, { status: 400 });

  return NextResponse.json({
    added: true, shopId: outcome.shop.shopId, shopName: outcome.shop.shopName,
    alreadyWatched: outcome.alreadyWatched,
    /* True when somebody already watches this shop, so this member's watch
       started no new collection at all. */
    sharedCollection: outcome.shared,
    etsyCalls: outcome.calls, limit: watchLimit(),
  });
});
