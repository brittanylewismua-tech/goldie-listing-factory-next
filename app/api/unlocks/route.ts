import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { crackCard, unlockState } from "@/app/unlocks";

/** GET the counter and everything opened so far. POST opens one that is owed. */
async function handleGET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to see your cards." }, { status: 401 });
  return NextResponse.json(await unlockState(user.userId));
}

async function handlePOST() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to open a card." }, { status: 401 });
  const card = await crackCard(user.userId);
  /* No card owed, or today's drop has nothing left to say that they have not
     already seen. Neither is a failure, and neither spends the card. */
  if (!card) return NextResponse.json({ card: null, ...(await unlockState(user.userId)) });
  return NextResponse.json({ card, ...(await unlockState(user.userId)) });
}

export const GET = withErrorLog("unlocks", handleGET);
export const POST = withErrorLog("unlocks", handlePOST);
