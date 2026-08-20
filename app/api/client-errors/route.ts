import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let payload: { message?: string; source?: string; line?: number; column?: number; kind?: string } = {};
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const safe = {
    kind: String(payload.kind || "error").slice(0, 40),
    message: String(payload.message || "Unknown browser startup error").slice(0, 500),
    source: String(payload.source || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 300),
    line: Number(payload.line || 0),
    column: Number(payload.column || 0),
  };
  console.error("[listing-factory-client-startup]", JSON.stringify(safe));
  return new NextResponse(null, { status: 204 });
}
