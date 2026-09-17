import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensurePreviewTickets, mintPreviewTicket } from "@/app/preview-ticket";

/**
 * A SHORT-LIVED WAY INTO THE STATE HARNESS FROM A SECOND BROWSER.
 *
 * WHY THIS EXISTS. Some of this product's mobile rules require BOTH a narrow
 * viewport and a coarse pointer:
 *
 *   @media (max-width: 820px) and (pointer: coarse)
 *
 * They hide the topbar on the responsive surfaces and set
 * `html,body{overflow:hidden}`. An iframe can give a page a real narrow
 * viewport but cannot make a browser report a touch device, so no amount of
 * narrow-width testing can tell whether a phone can actually scroll these
 * pages. The only tool here with real device emulation is a second browser,
 * and it has no session.
 *
 * WHAT THIS IS NOT. It is not a way into the product. A ticket admits its
 * holder to `/dev/state-preview` and nothing else — a page which mounts
 * components against fixtures behind a patched `fetch` that refuses every
 * request it has no fixture for. It reads no member data, writes nothing,
 * and cannot reach Etsy, Printify, Stripe or any provider.
 *
 * WHAT KEEPS IT TIGHT. Only the owner can mint one. It lasts five minutes.
 * It is recorded, so one can be accounted for afterwards. No route other
 * than the harness consults it, and the owner check is untouched everywhere
 * else — including here.
 */
export const GET = withErrorLog("dev-preview-ticket", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const db = (env as unknown as { DB: D1Database }).DB;
  await ensurePreviewTickets(db);
  const { ticket, expiresAt } = await mintPreviewTicket(db, user.userId);
  const site = new URL(request.url).origin;
  return NextResponse.json({
    ticket,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    url: `${site}/dev/state-preview?ticket=${ticket}`,
    reach: "the state harness only; it carries no access to the product",
  });
});
