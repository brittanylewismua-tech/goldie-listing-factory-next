import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { searchSold } from "@/app/sold-overnight";

/**
 * Look a phrase up against what actually sold.
 *
 * No Etsy call, so no quota and no rate limit — this reads the same counted
 * numbers the board is built from. Replaces a lookup that asked Etsy for its
 * relevance order and printed the answer as "top on Etsy", which it was not.
 */
export const GET = withErrorLog("sold-overnight-search", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to look up a keyword." }, { status: 401 });

  const keyword = (new URL(request.url).searchParams.get("keyword") ?? "").trim().slice(0, 80);
  if (!keyword) return NextResponse.json({ error: "Type a keyword to look up." }, { status: 400 });

  const requestedHours=Number(new URL(request.url).searchParams.get("hours")||168);
  const hours=[24,168].includes(requestedHours)?requestedHours:168;
  return NextResponse.json({ keyword, hours, listings: await searchSold(keyword,hours) });
});
