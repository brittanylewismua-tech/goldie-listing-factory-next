import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupTemplates } from "@/db/schema";
import { ensureMockupStorage } from "@/app/api/mockups/storage";

/* D573 - the occlusion mask: the parts of the photograph that must stay in front
   of the artwork. A hood, hair, a strap, an arm. It is saved once, with the
   scene, and drawn back over the design at render time, so a back print passes
   underneath the hood instead of being painted on top of it. It is stored, not
   re-segmented per render, because the same scene must produce the same result
   every time. */

async function scene(id: string, userId: string) {
  const [row] = await getDb().select().from(mockupTemplates)
    .where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, userId))).limit(1);
  return row;
}

/* D600 - a scene may hold several foreground layers, one per class of object
   that crosses the print. ?layer=N selects one; no parameter keeps the previous
   behaviour of serving the first. A layer that was never isolated is a 404,
   which the renderer treats as "nothing of that kind is in front" rather than
   as a failure. */
function layerKeys(row: { occlusionKey: string | null; preparationJson: string | null }) {
  const keys: string[] = [];
  try {
    const preparation = row.preparationJson ? JSON.parse(row.preparationJson) as { occlusionKeys?: string[] } : null;
    for (const key of preparation?.occlusionKeys || []) if (key) keys.push(key);
  } catch { /* a scene with unreadable preparation still has its own key below */ }
  if (row.occlusionKey && !keys.includes(row.occlusionKey)) keys.unshift(row.occlusionKey);
  return keys;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return new NextResponse(null, { status: 404 });
  await ensureMockupStorage();
  const { id } = await context.params;
  const row = await scene(id, user.userId);
  if (!row) return new NextResponse(null, { status: 404 });
  const keys = layerKeys(row);
  const requested = Number(new URL(request.url).searchParams.get("layer") || 0);
  const key = keys[Number.isFinite(requested) && requested >= 0 ? requested : 0];
  if (!key) return new NextResponse(null, { status: 404 });
  const object = await env.ARTWORK.get(key);
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(object.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save this scene." }, { status: 401 });
  await ensureMockupStorage();
  const { id } = await context.params;
  const row = await scene(id, user.userId);
  if (!row) return NextResponse.json({ error: "That scene could not be found." }, { status: 404 });
  const form = await request.formData();
  const file = form.get("mask");
  // An empty mask means "nothing crosses the print here", which is a real answer
  // and a confirmed one. It is stored as cleared rather than as missing.
  if (!(file instanceof File)) {
    await getDb().update(mockupTemplates)
      .set({ occlusionKey: null, occlusionConfirmed: 1, updatedAt: new Date().toISOString() })
      .where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId)));
    return NextResponse.json({ ok: true, cleared: true });
  }
  if (file.size > 8_000_000) return NextResponse.json({ error: "That mask is too large to save." }, { status: 400 });
  const key = `mockup-occlusion/${user.userId}/${id}.png`;
  await env.ARTWORK.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: "image/png" } });
  await getDb().update(mockupTemplates)
    .set({ occlusionKey: key, occlusionConfirmed: 1, updatedAt: new Date().toISOString() })
    .where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId)));
  return NextResponse.json({ ok: true });
}
