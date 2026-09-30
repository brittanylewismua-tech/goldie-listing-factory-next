import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/app/supabase-auth";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  /*
    D1722 · Whether the provider has confirmed this address belongs to them.

    It matters because being the owner here is an email allowlist, not a flag
    in a table — which is a good design, since no member can write themselves
    into it. But it does mean the whole owner boundary rests on the address
    being genuinely theirs. This was read straight from the session with no
    check, so if email confirmation were ever off in Supabase, signing up as
    one of those addresses would have been enough.
  */
  emailVerified: boolean;
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  // A visitor can have both a Sites/ChatGPT identity header and an app-owned
  // Supabase session in the same browser. The explicit Google/email sign-in is
  // the account they just chose, so it must win. Otherwise an older ChatGPT
  // session can silently expose another account's saved products and
  // connections after OAuth returns.
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
      /* Supabase sets one or the other depending on how the account was
         created; either is proof. A third-party provider that verified the
         address itself also sets them. */
      const verified = Boolean(user.email_confirmed_at || user.confirmed_at);
      return { userId: `supabase:${user.id}`, displayName: fullName ?? user.email,
        email: user.email, fullName, emailVerified: verified };
    }
  } catch {}
  return null;
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(accountSignInPath(returnTo));
}

export function accountSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `/account/sign-in?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
