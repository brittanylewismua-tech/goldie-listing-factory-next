import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
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
  { searchParams }: { searchParams: Promise<{ state?: string }> },
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
  if (!user || !isOwner(user)) notFound();
  const initial = (await searchParams).state ?? "";
  return <StatePreviewClient initial={initial} />;
}
