import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { setShopTimezone, timezoneState, rememberDetectedTimezone, ensureFinanceTables } from "@/app/finance-store";
import { isKnownTimezone, MISSING_TIMEZONE } from "@/app/finance-month";

/**
 * THE SHOP'S TIMEZONE.
 *
 * Required before any monthly figure, and deliberately not guessed. A shop's
 * country does not determine its timezone, and inferring one would move
 * revenue between months for a reason the seller could never reproduce
 * against their own Etsy dashboard.
 */
export const GET = withErrorLog("shop-map-financial-settings", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureFinanceTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const shop = await db.prepare(
    `SELECT shop_id FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number }>();
  if (!shop) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shop.shop_id);

  const parameters = new URL(request.url).searchParams;
  const wanted = parameters.get("timezone") ?? "";
  /* What the browser reported. Remembered as a suggestion only. */
  const detected = parameters.get("detected") ?? "";
  let recompute = false;

  if (detected && isKnownTimezone(detected))
    await rememberDetectedTimezone(user.userId, shopId, detected);

  if (wanted) {
    if (!isKnownTimezone(wanted))
      return NextResponse.json({ error: `"${wanted}" is not a timezone this runtime knows.` },
        { status: 400 });
    const result = await setShopTimezone(user.userId, shopId, wanted);
    recompute = result.recomputeRequired;
  }

  const state = await timezoneState(user.userId, shopId);
  return NextResponse.json({
    shopId,
    timezone: state.confirmed ? state.timezone : "",
    detected: state.detected,
    confirmed: state.confirmed,
    /* Only this member's own confirmation unlocks monthly figures. */
    monthlyFiguresAvailable: state.confirmed,
    needsConfirmation: !state.confirmed,
    rollupsClearedForRecompute: recompute,
    because: state.confirmed ? "" : MISSING_TIMEZONE,
  });
});
