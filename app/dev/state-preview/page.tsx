import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { previewTicketValid } from "@/app/preview-ticket";
import StatePreviewClient from "./preview-client";
import "@/app/dev/state-preview/state-preview.css";

/*
  OWNER ONLY, READ ONLY.

  Every feature has a dozen states a member can land in, and until now each was
  verified by waiting for it or by reading the code. That is why the same class
  of defect kept surfacing one page at a time.

  This renders the shipping components against fixture responses with the
  network closed. It is gated to the owner because it is a diagnostic surface,
  not because it is dangerous — it cannot write, and it reads nothing belonging
  to a member.
*/
export const metadata = { title: "State preview" };

export default async function StatePreviewPage(
  { searchParams }: { searchParams: Promise<{ state?: string; ticket?: string }> },
) {
  const user = await getChatGPTUser();
  /*
    A PAGE REFUSES BY NOT EXISTING, NOT BY RETURNING A RESPONSE OBJECT.

    This returned `NextResponse.json({ error: "Not found." }) as never`. A page
    component has to return JSX or throw a navigation signal; returning a
    Response throws during render, so every signed-out visit to this route
    answered 500 and rendered the crash boundary — "The page hit a startup
    problem" — instead of a clean 404. The `as never` is the tell: it silenced
    the type error that was saying exactly this.

    Found from a signed-out browser, which is the only place it is visible.
  */
  const asked = await searchParams;
  /*
    THE OWNER, OR A TICKET THE OWNER MINTED MINUTES AGO.

    The second path exists because some of this product's mobile rules need a
    coarse pointer as well as a narrow viewport, and the only tool here with
    real device emulation is a second browser with no session. A ticket
    admits its holder to THIS PAGE and nothing else; the page answers every
    request from fixtures behind a closed network, so it reads no member data
    and can reach no provider. See app/api/dev/preview-ticket/route.ts.
  */
  if (!user || !isOwner(user)) {
    const db = (env as unknown as { DB: D1Database }).DB;
    const admitted = db
      ? await previewTicketValid(db, asked.ticket).catch(() => false)
      : false;
    if (!admitted) notFound();
  }
  const initial = asked.state ?? "";
  return <StatePreviewClient initial={initial} />;
}
