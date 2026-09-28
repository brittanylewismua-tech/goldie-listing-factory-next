import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { printifyCall } from "@/app/printify-call";
import type { UpdateItem } from "@/app/platform-update-model";

/**
 * NEW PRODUCTS IN THE PRINTIFY CATALOG.
 *
 * Every other source in the update brief is a page somebody at Etsy or
 * Printify remembered to write on. Printify does not announce new products
 * anywhere a machine can read: there is no changelog, the blog is marketing,
 * and printify.com/catalog is drawn by JavaScript after load, so it arrives as
 * an empty document. A seller asking "what is new this month" about the thing
 * they actually print on had nothing to read, and the brief reported nothing
 * because there was nothing to report FROM - not because nothing shipped.
 *
 * The catalog API answers it exactly. Blueprints are the products Printify
 * offers; the set is public, identical for every account, and a blueprint id
 * that was not in last week's list is a new product. That is a counted fact
 * rather than a page diff passed through a language model, so nothing here is
 * summarised or worded by a model: the product's own title and brand are what
 * gets reported.
 *
 * WHOSE TOKEN. The catalog endpoint needs a bearer token but returns the same
 * public catalogue whatever token asks, so nothing read here belongs to the
 * member whose connection supplied it, and nothing about them is stored: only
 * the blueprint id, title and brand are kept.
 *
 * It still may not go looking for a token. The first version read whichever
 * connection happened to be newest, which is an unscoped read of a
 * member-owned table - exactly what the user_id scoping guard exists to catch,
 * and it caught it. One connection is nominated for this, by its owner, when
 * they run a source check; the read is scoped to that user_id and to nothing
 * else. With nobody nominated the source reports itself as unread rather than
 * borrowing somebody's credentials.
 */

export const CATALOG_SOURCE_ID = "printify-catalog";
export const CATALOG_URL = "https://printify.com/catalog/";

/* Enough to name what arrived without turning the brief into a product list. */
const NAMES_IN_ITEM = 6;
/*
  A run that suddenly sees hundreds of "new" blueprints is far more likely to
  be Printify changing how the catalogue is paginated than Printify launching
  hundreds of products. Above this the arrivals are recorded but not reported,
  because a number that large would be a guess about its own cause.
*/
const IMPLAUSIBLE_ARRIVALS = 60;

type Blueprint = { id: number; title: string; brand: string; image: string };

const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureCatalogTable() {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS printify_catalog_seen (
      blueprint_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      first_seen INTEGER NOT NULL)`),
    /* Who nominated their connection to read the public catalogue. One row. */
    db().prepare(`CREATE TABLE IF NOT EXISTS printify_catalog_reader (
      only_row INTEGER PRIMARY KEY CHECK (only_row = 1),
      user_id TEXT NOT NULL,
      nominated_at INTEGER NOT NULL)`),
  ]);
}

/** Called when an owner runs a source check, so the scheduled pass can too. */
export async function nominateCatalogReader(userId: string, now: number) {
  await ensureCatalogTable();
  await db().prepare(
    `INSERT INTO printify_catalog_reader(only_row,user_id,nominated_at) VALUES (1,?,?)
      ON CONFLICT(only_row) DO UPDATE SET user_id=excluded.user_id,nominated_at=excluded.nominated_at`)
    .bind(userId, now).run();
}

/**
 * The nominated connection and no other. The token is decrypted, used once,
 * and never written anywhere.
 */
async function catalogToken(): Promise<string | null> {
  const reader = await db()
    .prepare(`SELECT user_id AS userId FROM printify_catalog_reader WHERE only_row = 1`)
    .first<{ userId: string }>();
  if (!reader?.userId) return null;
  const row = await db()
    .prepare(`SELECT encrypted_token FROM printify_connections
               WHERE user_id = ? AND encrypted_token <> ''`)
    .bind(reader.userId).first<{ encrypted_token: string }>();
  if (!row) return null;
  return decryptPrintifyToken(
    row.encrypted_token,
    (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY,
  ).catch(() => null);
}

async function readCatalog(token: string): Promise<Blueprint[]> {
  const response = await printifyCall(
    "https://api.printify.com/v1/catalog/blueprints.json",
    { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Update-Brief" },
      signal: AbortSignal.timeout(25000) },
    { feature: "qa" },
  );
  if (!response.ok) throw new Error(`Printify catalog returned ${response.status}`);
  const body = await response.json() as unknown;
  if (!Array.isArray(body)) throw new Error("Printify catalog could not be read");
  return body
    .map(row => row as { id?: unknown; title?: unknown; brand?: unknown; images?: unknown })
    .filter(row => Number(row.id) > 0)
    .map(row => ({
      id: Number(row.id),
      title: String(row.title ?? "").trim().slice(0, 120),
      brand: String(row.brand ?? "").trim().slice(0, 60),
      /* D1913 · Printify's own photograph of the product it just added. */
      image: (() => {
        const first = Array.isArray(row.images) ? String(row.images[0] ?? "") : "";
        try {
          const url = new URL(first);
          return url.protocol === "https:" ? url.toString().slice(0, 400) : "";
        } catch { return ""; }
      })(),
    }));
}

/**
 * Returns the items to publish. The first run stores the whole catalogue and
 * reports nothing: on day one every product is "new", and announcing eleven
 * hundred products as arrivals would be a lie told confidently.
 */
export async function collectPrintifyCatalog(now: number): Promise<{
  items: Array<Omit<UpdateItem, "id"> & { quoteKey: string }>;
  baseline: boolean;
}> {
  await ensureCatalogTable();
  const token = await catalogToken();
  if (!token) throw new Error("No Printify connection has been nominated to read the catalog. Run a source check while signed in to nominate this account.");
  const catalog = await readCatalog(token);
  if (!catalog.length) throw new Error("Printify catalog came back empty");

  const known = await db()
    .prepare(`SELECT blueprint_id AS id FROM printify_catalog_seen`)
    .all<{ id: number }>();
  const seen = new Set((known.results ?? []).map(row => Number(row.id)));
  const arrivals = catalog.filter(row => !seen.has(row.id));

  for (const row of arrivals)
    await db().prepare(
      `INSERT OR IGNORE INTO printify_catalog_seen(blueprint_id,title,brand,first_seen)
       VALUES (?,?,?,?)`).bind(row.id, row.title, row.brand, now).run();

  /* First run, or a paging change dressed up as a product launch. */
  if (!seen.size || !arrivals.length || arrivals.length > IMPLAUSIBLE_ARRIVALS)
    return { items: [], baseline: !seen.size };

  const named = arrivals.slice(0, NAMES_IN_ITEM)
    .map(row => row.brand && !row.title.startsWith(row.brand) ? `${row.brand} ${row.title}` : row.title);
  const rest = arrivals.length - named.length;
  const list = named.join(", ") + (rest > 0 ? `, and ${rest} more` : "");

  return { baseline: false, items: [{
    platform: "Printify",
    imageUrl: arrivals.find(row => row.image)?.image ?? "",
    priority: "GOOD TO KNOW",
    /* Counted from Printify's own catalogue, not read off a page. */
    evidence: "Confirmed platform change",
    title: `${arrivals.length} new product${arrivals.length === 1 ? "" : "s"} in the Printify catalog`,
    impact: `Printify added ${list}.`.slice(0, 240),
    action: "Open the catalog to see print areas, providers and base costs before designing for one.",
    sourceUrl: CATALOG_URL,
    sourceTitle: "Printify catalog",
    topic: "printify catalog arrivals",
    urgent: false,
    publishedAt: now,
    quoteKey: arrivals.map(row => row.id).sort((a, b) => a - b).join(","),
  }] };
}
