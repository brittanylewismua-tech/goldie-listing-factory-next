import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

type Runtime = { DB?: D1Database; MIGRATION_EXPORT_SECRET?: string };
type Value = string | number | null;
const TABLES = new Set(["account_plans","billing_customers","billing_migrations","billing_subscriptions","billing_trials","error_log","etsy_api_usage_buckets","etsy_connections","etsy_listing_links","etsy_listing_usage","etsy_oauth_states","etsy_publish_items","etsy_publish_jobs","etsy_queue_state","etsy_worker_runs","keyword_lists","listing_batches","mastermind_access","mastermind_settings","mockup_artwork_overrides","mockup_render_jobs","mockup_render_usage","mockup_scene_geometry","mockup_set_preferences","mockup_templates","platform_cache","printify_batch_sessions","printify_connections","printify_diagnostic_events","printify_diagnostics","printify_draft_results","product_bundles","product_recipes","seller_preferences","shop_pairing_proofs","stripe_events","trial_reminder_emails"]);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

export async function POST(request: Request) {
  const runtime = env as unknown as Runtime;
  const supplied = request.headers.get("x-goldie-migration-secret") || "";
  const expected = runtime.MIGRATION_EXPORT_SECRET || "";
  if (!runtime.DB || !expected || supplied.length !== expected.length || supplied !== expected) return NextResponse.json({error:"Not authorized."},{status:403});
  const body = await request.json().catch(()=>({})) as {name?:string;rows?:Array<Record<string,Value>>};
  if (!body.name || !TABLES.has(body.name) || !Array.isArray(body.rows)) return NextResponse.json({error:"Invalid table."},{status:400});
  await runtime.DB.prepare(`DELETE FROM ${quote(body.name)}`).run();
  for(let index=0;index<body.rows.length;index+=25){
    const statements=body.rows.slice(index,index+25).map(row=>{const columns=Object.keys(row);return runtime.DB!.prepare(`INSERT INTO ${quote(body.name!)} (${columns.map(quote).join(",")}) VALUES (${columns.map(()=>"?").join(",")})`).bind(...columns.map(column=>row[column]));});
    if(statements.length)await runtime.DB.batch(statements);
  }
  return NextResponse.json({ok:true,table:body.name,rows:body.rows.length});
}
