import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";

type Runtime = { DB: D1Database; ARTWORK: R2Bucket };

const memberTables = [
  "account_plans",
  "billing_customers",
  "billing_subscriptions",
  "billing_trials",
  "etsy_connections",
  "etsy_listing_links",
  "etsy_listing_usage",
  "etsy_oauth_states",
  "etsy_publish_items",
  "etsy_publish_jobs",
  "keyword_lists",
  "listing_batches",
  "mastermind_access",
  "mockup_render_usage",
  "mockup_set_preferences",
  "mockup_templates",
  "printify_batch_sessions",
  "printify_connections",
  "printify_diagnostic_events",
  "printify_diagnostics",
  "printify_draft_results",
  "product_bundles",
  "product_recipes",
  "seller_preferences",
  "trial_reminder_emails",
] as const;

async function deletePrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length) {
      await bucket.delete(page.objects.map((object) => object.key));
      deleted += page.objects.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const runtime = env as unknown as Runtime;
  const backup: Record<string, unknown[]> = {};
  const userIds = new Set<string>();
  const objectKeys = new Set<string>();

  for (const table of memberTables) {
    const result = await runtime.DB.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
    backup[table] = result.results;
    for (const row of result.results) {
      if (typeof row.user_id === "string") userIds.add(row.user_id);
      if (typeof row.object_key === "string") objectKeys.add(row.object_key);
    }
  }

  const createdAt = new Date().toISOString();
  const backupKey = `admin-backups/account-reset-${createdAt.replace(/[:.]/g, "-")}.json`;
  await runtime.ARTWORK.put(
    backupKey,
    JSON.stringify({ createdAt, tables: backup }),
    { httpMetadata: { contentType: "application/json" } },
  );

  const countsBefore = Object.fromEntries(memberTables.map((table) => [table, backup[table].length]));
  await runtime.DB.batch(memberTables.map((table) => runtime.DB.prepare(`DELETE FROM ${table}`)));

  if (objectKeys.size) await runtime.ARTWORK.delete([...objectKeys]);
  let deletedListingImages = 0;
  let deletedMockupLibraryObjects = 0;
  for (const userId of userIds) {
    deletedListingImages += await deletePrefix(runtime.ARTWORK, `etsy-listing-images/${userId}/`);
    deletedMockupLibraryObjects += await deletePrefix(runtime.ARTWORK, `mockup-library/${userId}/`);
  }

  const countsAfter: Record<string, number> = {};
  for (const table of memberTables) {
    const row = await runtime.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
    countsAfter[table] = Number(row?.count || 0);
  }

  return NextResponse.json({
    ok: Object.values(countsAfter).every((count) => count === 0),
    backupKey,
    countsBefore,
    countsAfter,
    removedUsers: userIds.size,
    deletedListingImages,
    deletedMockupLibraryObjects,
  });
}
