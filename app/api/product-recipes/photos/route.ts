import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { eq, and } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { productRecipes } from "@/db/schema";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { productIdFromUrl, flatlayOf, type ProductImage } from "../flatlay";

/* D848 · The saved-product tiles drew a grey placeholder garment.
 *
 * D842 taught selectRecipe to remember a product's flatlay, which is right for
 * every product opened from that day on - and does nothing for the products
 * already in the bank. On her account that was all five: the step-1 grid was a
 * wall of identical grey t-shirts, which is what she was looking at when she
 * asked, for the second time, why the Printify mockup still was not there.
 *
 * So: fill the gap once, from the server, for the recipes that have no photo.
 * The client asks after the bank loads and only when something is missing, the
 * answer is written onto the recipe, and the question is never asked again.
 *
 * Deliberately cheap. One /shops.json, then one product read per missing
 * recipe per shop, all in parallel, capped at twelve recipes a call. No
 * variant maths, no Etsy lookup, no shop-pairing proof - this route decides
 * nothing, it only fetches a picture.
 */

const PRINTIFY_API = "https://api.printify.com/v1";
const MAX_PER_CALL = 12;

type Shop = { id: number; title: string };
type Product = { images?: ProductImage[] };

function runtimeEnv() {
  return env as unknown as { DB?: D1Database; PRINTIFY_TOKEN_KEY?: string };
}

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const db = runtimeEnv().DB;
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!db || !secret) return NextResponse.json({ photos: {} });

  const row = await db.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id = ?")
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!row) return NextResponse.json({ photos: {} });

  let token = "";
  try { token = await decryptPrintifyToken(row.encrypted_token, secret) } catch { return NextResponse.json({ photos: {} }) }
  if (!token) return NextResponse.json({ photos: {} });

  const drizzle = getDb();
  const saved = await drizzle.select().from(productRecipes).where(eq(productRecipes.userId, user.userId));
  const missing = saved
    .map((recipe) => {
      let pricing: Record<string, unknown> = {};
      try { pricing = JSON.parse(recipe.pricingJson || "{}") } catch { pricing = {} }
      return { recipe, pricing, productId: productIdFromUrl(String(recipe.templateUrl || "")) };
    })
    .filter((entry) => Boolean(entry.productId))
    .slice(0, MAX_PER_CALL);
  if (!missing.length) return NextResponse.json({ photos: {} });

  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" };
  let shops: Shop[] = [];
  try {
    const response = await fetch(`${PRINTIFY_API}/shops.json`, { headers, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ photos: {} });
    shops = (await response.json()) as Shop[];
  } catch { return NextResponse.json({ photos: {} }) }
  if (!shops.length) return NextResponse.json({ photos: {} });

  const found = await Promise.all(missing.map(async (entry) => {
    /* A product lives in exactly one store, and the recipe may already say
       which - ask that one first, and every other store only if it has to. */
    const hinted = Number(entry.pricing.printifyShopId) || 0;
    const order = hinted ? [...shops.filter((shop) => shop.id === hinted), ...shops.filter((shop) => shop.id !== hinted)] : shops;
    for (const shop of order) {
      try {
        const response = await fetch(`${PRINTIFY_API}/shops/${shop.id}/products/${entry.productId}.json`, { headers, cache: "no-store" });
        if (!response.ok) continue;
        const photo = flatlayOf(((await response.json()) as Product).images);
        if (photo) return { id: entry.recipe.id, photo, pricing: entry.pricing, shop };
      } catch { /* try the next store */ }
    }
    return null;
  }));

  const photos: Record<string, string> = {};
  for (const hit of found) {
    if (!hit) continue;
    photos[hit.id] = hit.photo;
    const next: Record<string, unknown> = { ...hit.pricing, previewImage: hit.photo.slice(0, 300) };
    /* Remember which store answered, so the bank can scope this product even
       if it was saved before D835 started recording it. */
    if (!Number(hit.pricing.printifyShopId)) { next.printifyShopId = hit.shop.id; next.printifyShopTitle = hit.shop.title }
    await drizzle.update(productRecipes).set({ pricingJson: JSON.stringify(next) })
      .where(and(eq(productRecipes.id, hit.id), eq(productRecipes.userId, user.userId)));
  }
  return NextResponse.json({ photos });
}
