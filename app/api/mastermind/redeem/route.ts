import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { codeMatches, mastermindState, runtime } from "@/app/mastermind/access";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const state = await mastermindState(user);
  const db = runtime().DB;
  if (!db) return NextResponse.json({ error: "Access storage is unavailable." }, { status: 503 });
  if (!state.enrollmentOpen) return NextResponse.json({ error: "Mastermind beta enrollment is closed." }, { status: 403 });
  if(state.expired)return NextResponse.json({error:"Your 48-hour mastermind beta has ended."},{status:403});
  const body = await request.json() as { code?: string };
  if (!await codeMatches(body.code ?? "")) return NextResponse.json({ error: "That mastermind code is not correct." }, { status: 403 });
  await db.batch([
    db.prepare("INSERT INTO mastermind_access (user_id, email, redeemed_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email").bind(user.userId, user.email),
    db.prepare("INSERT INTO account_plans (user_id,plan_key) VALUES (?,'mastermind_beta') ON CONFLICT(user_id) DO UPDATE SET plan_key='mastermind_beta',updated_at=CURRENT_TIMESTAMP").bind(user.userId),
  ]);
  return NextResponse.json({ accepted: true, hours:48, aiMockups:20 });
}
