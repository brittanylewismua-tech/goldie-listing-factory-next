import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { recordDiagnostic, startDiagnostic } from "../diagnostics";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { reference?: string; fileName?: string; stage?: string; message?: string };
  const reference = body.reference?.replace(/[^A-Z0-9-]/gi, "").slice(0, 40) ?? "";
  if (!reference || !body.fileName) return NextResponse.json({ ok: false }, { status: 400 });
  const db = (env as unknown as { DB?: D1Database }).DB;
  await startDiagnostic(db, { reference, userId: user.userId, userEmail: user.email, fileName: body.fileName });
  await recordDiagnostic(db, reference, { stage: body.stage ?? "browser_image_preparation", event: "failed", message: body.message ?? "Browser image preparation failed." });
  return NextResponse.json({ ok: true });
}
