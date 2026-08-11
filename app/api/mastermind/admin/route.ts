import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const body = await request.json() as { active?: boolean };
  const db = runtime().DB;
  if (!db || typeof body.active !== "boolean") return NextResponse.json({ error: "The setting could not be changed." }, { status: 400 });
  await db.prepare("INSERT INTO mastermind_settings (id, active, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET active = excluded.active, updated_at = CURRENT_TIMESTAMP").bind(body.active ? 1 : 0).run();
  if (!body.active) await db.prepare("DELETE FROM printify_connections WHERE user_id IN (SELECT user_id FROM mastermind_access)").run();
  return NextResponse.json({ active: body.active });
}
