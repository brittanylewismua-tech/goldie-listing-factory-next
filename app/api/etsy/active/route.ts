import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

/* D835 · Switching shops. Every connection the seller has authorised stays
   stored; this only moves which one is active, so switching is a menu choice
   rather than an OAuth round trip.
   Nothing is fetched from Etsy here - the token for the shop being switched to
   was already saved when it was connected, and is refreshed on first use like
   any other. */
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { shopId?: number };
  const shopId = Number(body.shopId) || 0;
  if (!shopId) return NextResponse.json({ error: "Choose the shop to switch to." }, { status: 400 });

  const owned = await env.DB.prepare("SELECT shop_name FROM etsy_connections WHERE user_id=? AND shop_id=?")
    .bind(user.userId, shopId).first<{ shop_name: string }>();
  if (!owned) return NextResponse.json({ error: "That shop is not connected to this account." }, { status: 404 });

  await env.DB.batch([
    env.DB.prepare("UPDATE etsy_connections SET is_active=0 WHERE user_id=?").bind(user.userId),
    env.DB.prepare("UPDATE etsy_connections SET is_active=1, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND shop_id=?").bind(user.userId, shopId),
  ]);
  return NextResponse.json({ connected: true, shopId, shopName: owned.shop_name });
}
