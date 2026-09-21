import { env } from "cloudflare:workers";
import { listingDisplay, type EtsyDisplayListing } from "@/app/etsy-listing-display";
import type { EtsyFeature } from "@/app/api/etsy/client";

/** Public listing details only. This cache never contains member tokens or buyer data. */
export async function ensureEtsyDisplayCache(){
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS etsy_listing_display_cache (
    listing_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, refreshed_at INTEGER NOT NULL)`).run();
  }

export async function cachedListingDisplay(ids: number[], feature: EtsyFeature) {
  await ensureEtsyDisplayCache();
  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const selected = [...new Set(ids)].slice(0, 100);
  const output = new Map<number, EtsyDisplayListing>();
  for (let offset = 0; offset < selected.length; offset += 80) {
    const page = selected.slice(offset, offset + 80);
    const rows = await db.prepare(`SELECT listing_id AS id, payload FROM etsy_listing_display_cache
      WHERE listing_id IN (${page.map(() => "?").join(",")}) AND refreshed_at >= ?`)
      .bind(...page, now - 6 * 3600).all<{id:number;payload:string}>();
    for (const row of rows.results ?? []) {
      try { output.set(Number(row.id), JSON.parse(row.payload)); } catch { /* Refresh unreadable cache entries. */ }
    }
  }
  const missing = selected.filter(id => !output.has(id));
  let refreshFailed = false;
  if (missing.length) {
    try {
      const fresh = await listingDisplay(missing, feature);
      const statements = [...fresh].map(([id, row]) => {
        output.set(id, row);
        return db.prepare(`INSERT INTO etsy_listing_display_cache (listing_id,payload,refreshed_at)
          VALUES (?,?,?) ON CONFLICT(listing_id) DO UPDATE SET payload=excluded.payload,refreshed_at=excluded.refreshed_at`)
          .bind(id, JSON.stringify(row), now);
      });
      for (let offset = 0; offset < statements.length; offset += 25) await db.batch(statements.slice(offset, offset + 25));
    } catch { refreshFailed = true; }
  }
  return { listings: output, refreshFailed };
}
