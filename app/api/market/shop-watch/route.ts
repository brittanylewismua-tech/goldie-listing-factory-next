import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import {
  addWatch, refreshPass, removeWatch, shopWatchHealth, watchesFor,
} from "@/app/shop-watch";

/**
 * The member's watched shops.
 *
 * Adding resolves whatever was pasted to one Etsy shop id first, so two
 * members pasting the same shop in different forms share one collection.
 */
export const GET = withErrorLog("shop-watch", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to watch shops." }, { status: 401 });

  /* Operational figures are owner-only; a member sees their own shops. */
  if (new URL(request.url).searchParams.get("health")) {
    if (!isOwner(user)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    return NextResponse.json(await shopWatchHealth());
  }
  return NextResponse.json({ watches: await watchesFor(user.userId) });
});

export const POST = withErrorLog("shop-watch-add", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to watch shops." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { shop?: string; remove?: number };
  if (body.remove) {
    await removeWatch(user.userId, Number(body.remove));
    return NextResponse.json({ removed: Number(body.remove) });
  }

  const result = await addWatch(user.userId, String(body.shop ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({
    shop: result.shop,
    alreadyWatched: result.alreadyWatched,
  });
});

/** The scheduled refresh, reached only by the worker's own clock. */
export const PUT = withErrorLog("shop-watch-refresh", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(await refreshPass());
});
