import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { sellerPreferences } from "@/db/schema";

/* D339 · The listing goal lives in the existing pricingJson blob rather than a
   new column, so it needs no migration. Both halves are written through one
   MERGE: a fee save must not wipe the goal and a goal save must not wipe the
   fees. That is the D305 lesson — a blob written from scratch on every POST
   silently clears whatever the caller did not send. */
export type ListingGoal = { enabled: boolean; period: "week" | "month"; target: number };

const DEFAULT_GOAL: ListingGoal = { enabled: false, period: "week", target: 20 };

function readGoal(value: unknown): ListingGoal {
  const raw = (value || {}) as Partial<ListingGoal>;
  return {
    enabled: raw.enabled === true,
    period: raw.period === "month" ? "month" : "week",
    /* A goal of zero is a bar that is always full, which is worse than no goal. */
    target: Math.max(1, Math.min(10000, Math.round(Number(raw.target) || DEFAULT_GOAL.target))),
  };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load seller preferences." }, { status: 401 });
  const [row] = await getDb().select().from(sellerPreferences).where(eq(sellerPreferences.userId, user.userId)).limit(1);
  const saved = row ? JSON.parse(row.pricingJson || "{}") as Record<string, unknown> : null;
  return NextResponse.json({
    pricing: saved,
    listingGoal: saved && saved.listingGoal ? readGoal(saved.listingGoal) : DEFAULT_GOAL,
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save seller preferences." }, { status: 401 });
  const body = await request.json() as { pricing?: Record<string, number>; listingGoal?: Partial<ListingGoal> };

  const [row] = await getDb().select().from(sellerPreferences).where(eq(sellerPreferences.userId, user.userId)).limit(1);
  let existing: Record<string, unknown> = {};
  try { existing = row ? JSON.parse(row.pricingJson || "{}") as Record<string, unknown> : {}; } catch { existing = {}; }

  const merged: Record<string, unknown> = { ...existing };
  if (body.pricing !== undefined) {
    const pricing = body.pricing;
    merged.etsyFeePercent = Math.max(0, Math.min(40, Number(pricing?.etsyFeePercent ?? 9.5)));
    merged.fixedFee = Math.max(0, Number(pricing?.fixedFee ?? 0.25));
    merged.listingFee = Math.max(0, Number(pricing?.listingFee ?? 0.2));
  }
  if (body.listingGoal !== undefined) merged.listingGoal = readGoal(body.listingGoal);

  await getDb().insert(sellerPreferences)
    .values({ userId: user.userId, pricingJson: JSON.stringify(merged) })
    .onConflictDoUpdate({ target: sellerPreferences.userId, set: { pricingJson: JSON.stringify(merged) } });
  return NextResponse.json({ ok: true });
}
