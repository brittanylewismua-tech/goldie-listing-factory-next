import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { unlockState } from "@/app/unlocks";

/** The week: what has been listed, and what that has opened. */
async function handleGET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to see your cards." }, { status: 401 });
  return NextResponse.json(await unlockState(user.userId));
}

export const GET = withErrorLog("unlocks", handleGET);
