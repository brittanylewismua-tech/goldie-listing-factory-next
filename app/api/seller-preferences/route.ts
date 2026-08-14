import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { sellerPreferences } from "@/db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load seller preferences." }, { status: 401 });
  const [row] = await getDb().select().from(sellerPreferences).where(eq(sellerPreferences.userId, user.userId)).limit(1);
  return NextResponse.json({ pricing: row ? JSON.parse(row.pricingJson || "{}") : null });
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save seller preferences." }, { status: 401 });
  const { pricing } = await request.json() as { pricing?: Record<string, number> };
  const safe={etsyFeePercent:Math.max(0,Math.min(40,Number(pricing?.etsyFeePercent??9.5))),fixedFee:Math.max(0,Number(pricing?.fixedFee??.25)),listingFee:Math.max(0,Number(pricing?.listingFee??.20))};
  await getDb().insert(sellerPreferences).values({ userId: user.userId, pricingJson: JSON.stringify(safe) }).onConflictDoUpdate({ target: sellerPreferences.userId, set: { pricingJson: JSON.stringify(safe), updatedAt: new Date().toISOString() } });
  return NextResponse.json({ ok: true });
}
