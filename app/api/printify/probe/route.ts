import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { decryptPrintifyToken } from "../token-crypto";
import { isOwner } from "@/app/mastermind/access";
import { printAreasWithOnlyCurrentArtwork } from "../product-payload";
import { withErrorLog } from "@/app/error-log";

/* D612 - one controlled diagnostic, to name the failing Printify subsystem.

   Live evidence: POST /uploads/images.json returns 200 with an image ID, and
   POST /shops/{id}/products.json then rejects that same ID with error 8253,
   "Provided images do not exist". 56 consecutive failures, zero successes, on a
   file that produced a working draft on the same shop hours earlier.

   The normal draft path cannot answer WHICH service is wrong, because it retries
   product creation seven times and re-uploads midway. This does the opposite:

     1. upload exactly once
     2. keep the returned image ID
     3. poll GET /uploads/{id}.json slowly
     4. only once that lookup succeeds, attempt product creation exactly ONCE
     5. record Printify's raw status and body at every step

   Three outcomes, three different conclusions:
     - lookup stays 404            -> Printify never finished registering it
     - lookup 200 then 8253        -> Printify's own services disagree
     - both succeed with no change -> it was a temporary Printify incident

   Owner-gated, and deliberately cheap: one upload, at most twelve lookups, at
   most one product call. Printify requires failed requests stay under 5% of an
   integration's traffic, so this must never become a loop. */

const PRINTIFY_API = "https://api.printify.com/v1";
const LOOKUP_ATTEMPTS = 12;
const LOOKUP_INTERVAL_MS = 10_000;

type Step = { step: string; status: number | null; ms: number; body: string; at: number };

function runtimeEnv() {
  return env as unknown as {
    DB?: D1Database;
    ARTWORK?: { get(key: string): Promise<{ body?: ReadableStream; customMetadata?: Record<string, string> } | null> };
    PRINTIFY_TOKEN_KEY?: string;
  };
}

async function tokenFor(userId: string) {
  const row = await runtimeEnv().DB?.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id = ?")
    .bind(userId).first<{ encrypted_token: string }>();
  if (!row?.encrypted_token) throw new Error("Connect Printify before running this probe.");
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!secret) throw new Error("Secure token storage is not configured.");
  return decryptPrintifyToken(row.encrypted_token, secret);
}

/* Raw, never parsed into a friendly message. The whole point is what Printify
   literally said. */
async function call(path: string, token: string, init?: RequestInit): Promise<{ status: number; body: string; ms: number }> {
  const began = Date.now();
  const response = await fetch(`${PRINTIFY_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory", "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.text().catch(() => "");
  return { status: response.status, body: body.slice(0, 600), ms: Date.now() - began };
}

async function handlePOST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  /* Unreleased diagnostic. Not a customer surface. */
  if (!isOwner(user)) return NextResponse.json({ error: "Not available." }, { status: 404 });

  const body = await request.json() as { batchId?: string; stagedId?: string; fileName?: string; createProduct?: boolean };
  if (!body.batchId || !body.stagedId || !body.fileName) {
    return NextResponse.json({ error: "batchId, stagedId and fileName are required." }, { status: 400 });
  }

  const session = await runtimeEnv().DB?.prepare("SELECT shop_id, product_id, template_json FROM printify_batch_sessions WHERE id = ? AND user_id = ? AND expires_at > unixepoch()")
    .bind(body.batchId, user.userId).first<{ shop_id: number; product_id: string; template_json: string }>();
  if (!session) return NextResponse.json({ error: "That batch session has expired." }, { status: 400 });

  const artwork = await runtimeEnv().ARTWORK?.get(body.stagedId);
  if (!artwork?.body) return NextResponse.json({ error: "That staged artwork is gone." }, { status: 400 });
  if (artwork.customMetadata?.owner !== user.userId) return NextResponse.json({ error: "Not available." }, { status: 404 });

  const bytes = new Uint8Array(await new Response(artwork.body).arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  const contents = btoa(binary);

  const token = await tokenFor(user.userId);
  const began = Date.now();
  const steps: Step[] = [];
  const note = (step: string, r: { status: number; body: string; ms: number }) =>
    steps.push({ step, status: r.status, ms: r.ms, body: r.body, at: Date.now() - began });

  /* 1 - upload, once. */
  const upload = await call("/uploads/images.json", token, {
    method: "POST", body: JSON.stringify({ file_name: body.fileName, contents }),
  });
  note("upload", upload);
  let imageId = "";
  try { imageId = (JSON.parse(upload.body) as { id?: string }).id ?? ""; } catch { /* recorded raw above */ }
  if (!imageId) return NextResponse.json({ imageId: null, verdict: "upload-returned-no-id", steps });

  /* 2/3 - poll the official lookup, slowly, without ever creating a product. */
  let lookupSucceeded = false;
  for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt += 1) {
    const lookup = await call(`/uploads/${encodeURIComponent(imageId)}.json`, token);
    note(`lookup-${attempt}`, lookup);
    if (lookup.status === 200) { lookupSucceeded = true; break; }
    if (attempt < LOOKUP_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, LOOKUP_INTERVAL_MS));
  }

  /* 4 - exactly one product attempt, and only if asked. No retry ladder. */
  let verdict = lookupSucceeded ? "lookup-succeeded" : "lookup-never-succeeded";
  if (lookupSucceeded && body.createProduct !== false) {
    const template = JSON.parse(session.template_json) as {
      blueprint_id: number; print_provider_id: number; description?: string;
      variants: Array<{ id: number; price: number; cost?: number; is_enabled: boolean }>;
      print_areas: Parameters<typeof printAreasWithOnlyCurrentArtwork>[0];
    };
    const product = await call(`/shops/${session.shop_id}/products.json`, token, {
      method: "POST",
      body: JSON.stringify({
        title: `Goldie API probe ${new Date().toISOString()}`,
        description: template.description ?? "",
        blueprint_id: template.blueprint_id,
        print_provider_id: template.print_provider_id,
        variants: template.variants.slice(0, 4).map(({ id, price, is_enabled }) => ({ id, price, is_enabled })),
        print_areas: printAreasWithOnlyCurrentArtwork(template.print_areas, imageId),
      }),
    });
    note("product", product);
    verdict = product.status >= 200 && product.status < 300
      ? "both-succeeded"
      : /8253|Provided images do not exist/i.test(product.body)
        ? "lookup-200-but-product-8253"
        : `product-failed-${product.status}`;
  }

  return NextResponse.json({ imageId, shopId: session.shop_id, verdict, totalMs: Date.now() - began, steps });
}

export const POST = withErrorLog("printify_probe", handlePOST);
