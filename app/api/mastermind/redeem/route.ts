import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { codeMatches, mastermindState, runtime } from "@/app/mastermind/access";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in with ChatGPT first." }, { status: 401 });
  const state = await mastermindState(user);
  if (!state.active) return NextResponse.json({ error: "Mastermind testing is currently closed." }, { status: 403 });
  const body = await request.json() as { code?: string };
  if (!await codeMatches(body.code ?? "")) return NextResponse.json({ error: "That mastermind code is not correct." }, { status: 403 });
  const db = runtime().DB;
  if (!db) return NextResponse.json({ error: "Access storage is unavailable." }, { status: 503 });
  await db.prepare("INSERT INTO mastermind_access (user_id, email, redeemed_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, redeemed_at = CURRENT_TIMESTAMP").bind(user.userId, user.email).run();
  return NextResponse.json({ accepted: true });
}
