import { NextResponse } from "next/server";
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
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not found." }, { status: 404 }) as never;
  const initial = (await searchParams).state ?? "";
  return <StatePreviewClient initial={initial} />;
}
