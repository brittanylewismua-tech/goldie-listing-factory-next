import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { monthKey, nextReset, planFor } from "@/app/plan-limits";
import { billingState } from "@/app/billing";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to view usage." }, { status: 401 });
  const month = monthKey();
  const [planRow, drafts, renders, sets, billing, publishedToday, publishing, callAverage] = await Promise.all([
    env.DB.prepare("SELECT plan_key FROM account_plans WHERE user_id=?").bind(user.userId).first<{plan_key:string}>(),
    env.DB.prepare("SELECT COUNT(*) count FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND substr(updated_at,1,7)=?").bind(user.userId, month).first<{count:number}>(),
    env.DB.prepare("SELECT COALESCE(SUM(count),0) count FROM mockup_render_usage WHERE user_id=? AND day=?").bind(user.userId, month).first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(DISTINCT theme) count FROM mockup_templates WHERE user_id=?").bind(user.userId).first<{count:number}>(),
    billingState(user),
    env.DB.prepare("SELECT COUNT(*) count FROM etsy_listing_usage WHERE user_id=? AND published_at>=datetime('now','-24 hours')").bind(user.userId).first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) count FROM etsy_publish_items WHERE user_id=? AND status IN ('queued','running')").bind(user.userId).first<{count:number}>(),
    env.DB.prepare("SELECT ROUND(AVG(api_calls),1) average FROM etsy_listing_usage WHERE published_at>=datetime('now','-30 days') AND api_calls>0").first<{average:number}>(),
  ]);
  const plan = planFor(planRow?.plan_key);
  return NextResponse.json({ plan, resetAt: nextReset(), usage: { drafts: Number(drafts?.count || 0), aiMockups: Number(renders?.count || 0), mockupSets: Number(sets?.count || 0), publishedToday:Number(publishedToday?.count||0), publishing:Number(publishing?.count||0) }, operations:{averageEtsyCallsPerListing:Number(callAverage?.average||0)}, billing });
}
