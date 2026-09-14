import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { salesCapability } from "@/app/shop-map-auth";

/**
 * WHAT SHOP MAP CAN SEE FOR THIS MEMBER.
 *
 * One answer the page can act on: connected or not, and whether the grant
 * covers sales data. It never asks for authorisation itself — a page that
 * demands a new permission the moment it loads is how members learn to click
 * away — it reports, and Shop Map shows one button if the answer is no.
 */
export const GET = withErrorLog("shop-map-capability", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  /* A shop id here only ever selects among the caller's own connections; it
     grants nothing and is not trusted for anything else. */
  const asked = Number(new URL(request.url).searchParams.get("shop")) || undefined;
  const capability = await salesCapability(user.userId, asked);
  return NextResponse.json({
    ...capability,
    /* The sentence the member reads, written here so the page cannot invent a
       more alarming one. */
    action: capability.connected
      ? capability.canReadSales ? null : "Connect Your Sales Data"
      : "Connect Etsy",
    why: capability.canReadSales
      ? null
      : "Etsy asks for your permission before Goldie can read the sales and fees it needs to work out profit. Your shop stays connected either way.",
  });
});
