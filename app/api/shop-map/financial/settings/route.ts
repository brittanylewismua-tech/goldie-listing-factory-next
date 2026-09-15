import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { setShopTimezone, shopTimezone, ensureFinanceTables } from "@/app/finance-store";
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

  const wanted = new URL(request.url).searchParams.get("timezone") ?? "";
  if (wanted) {
    if (!isKnownTimezone(wanted))
      return NextResponse.json({ error: `"${wanted}" is not a timezone this runtime knows.` },
        { status: 400 });
    await setShopTimezone(user.userId, shopId, wanted);
  }

  const timezone = await shopTimezone(user.userId, shopId);
  return NextResponse.json({
    shopId, timezone,
    monthlyFiguresAvailable: Boolean(timezone),
    because: timezone ? "" : MISSING_TIMEZONE,
    examples: ["America/Los_Angeles", "America/New_York", "Europe/London"],
  });
});
