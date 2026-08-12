import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";

const PRINTIFY_API = "https://api.printify.com/v1";
type Runtime = { DB?: D1Database; PRINTIFY_TOKEN_KEY?: string };
type Product = { variants?: Array<{ is_enabled?: boolean }>; print_areas?: Array<{ placeholders?: Array<{ position?: string; images?: Array<{ id?: string }> }> }> };

function runtime() { return env as unknown as Runtime; }

async function decryptToken(value: string) {
  const secret = runtime().PRINTIFY_TOKEN_KEY;
  if (!secret) throw new Error("Token encryption is unavailable.");
  const keyBytes = Uint8Array.from(secret.match(/.{1,2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const [ivValue, encryptedValue] = value.split(".");
  const iv = Uint8Array.from(atob(ivValue), (character) => character.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(encryptedValue), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted));
}

async function status(path: string, token: string) {
  const response = await fetch(`${PRINTIFY_API}${path}`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" }, cache: "no-store" });
  return { response, status: response.status };
}

export async function GET(request: Request) {
  const owner = await getChatGPTUser();
  if (!owner || !isOwner(owner)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  const db = runtime().DB;
  if (!db || !email) return NextResponse.json({ error: "Member email is required." }, { status: 400 });

  const access = await db.prepare("SELECT user_id AS userId FROM mastermind_access WHERE lower(email) = ?").bind(email).first<{ userId: string }>();
  if (!access) return NextResponse.json({ error: "That member has not redeemed access." }, { status: 404 });
  const [connection, diagnostic] = await Promise.all([
    db.prepare("SELECT encrypted_token AS encryptedToken, updated_at AS updatedAt FROM printify_connections WHERE user_id = ?").bind(access.userId).first<{ encryptedToken: string; updatedAt: string }>(),
    db.prepare("SELECT template_product_id AS templateProductId, shop_id AS shopId, error_code AS errorCode, stage, updated_at AS updatedAt FROM printify_diagnostics WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(access.userId).first<{ templateProductId: string | null; shopId: number | null; errorCode: string | null; stage: string; updatedAt: string }>(),
  ]);
  if (!connection) return NextResponse.json({ email, connection: "missing", latestFailure: diagnostic ?? null });

  const token = await decryptToken(connection.encryptedToken);
  const shopsCheck = await status("/shops.json", token);
  const result: Record<string, unknown> = {
    email,
    connection: shopsCheck.status === 200 ? "valid" : "rejected",
    connectionHttpStatus: shopsCheck.status,
    connectionSavedAt: connection.updatedAt,
    latestFailure: diagnostic ?? null,
  };
  if (shopsCheck.status !== 200 || !diagnostic?.shopId || !diagnostic.templateProductId) return NextResponse.json(result);

  const templateCheck = await status(`/shops/${diagnostic.shopId}/products/${diagnostic.templateProductId}.json`, token);
  result.templateHttpStatus = templateCheck.status;
  if (!templateCheck.response.ok) return NextResponse.json(result);
  const product = await templateCheck.response.json() as Product;
  const placeholders = product.print_areas?.flatMap((area) => area.placeholders ?? []) ?? [];
  const inheritedIds = [...new Set(placeholders.flatMap((placeholder) => placeholder.images?.map((image) => image.id).filter(Boolean) ?? []))] as string[];
  const mediaChecks = await Promise.all(inheritedIds.slice(0, 20).map(async (id) => (await status(`/uploads/${encodeURIComponent(id)}.json`, token)).status));
  result.template = {
    enabledVariants: product.variants?.filter((variant) => variant.is_enabled).length ?? 0,
    printAreas: product.print_areas?.length ?? 0,
    placeholderPositions: placeholders.map((placeholder) => placeholder.position ?? "unknown"),
    inheritedImageReferences: inheritedIds.length,
    inheritedMediaAvailable: mediaChecks.filter((code) => code === 200).length,
    inheritedMediaUnavailable: mediaChecks.filter((code) => code !== 200).length,
    inheritedMediaStatuses: mediaChecks,
  };
  return NextResponse.json(result);
}
