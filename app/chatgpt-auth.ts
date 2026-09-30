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
    /*
      ROUTE NAVIGATION MUST NOT CALL SUPABASE AUTH ON EVERY CLICK.

      getUser() always performs a network request to the Auth server. Every
      protected route used it before React could render the destination, which
      put the same remote round-trip in front of Home, Your Shop, Research and
      every other member page.

      getClaims() verifies the signed access token from the existing session
      cookie. With Supabase's asymmetric signing keys the JWKS is cached and
      verification happens locally, so this is the correct hot path for page
      and API authorization. The app's sign-in surfaces are Google and email
      OTP, both of which prove control of the returned email address.
    */
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;
    const claims = data.claims as Record<string, unknown>;
    const email = typeof claims.email === "string" ? claims.email : "";
    const subject = typeof claims.sub === "string" ? claims.sub : "";
    if (!email || !subject) return null;
    const metadata = claims.user_metadata && typeof claims.user_metadata === "object"
      ? claims.user_metadata as Record<string, unknown> : {};
    const fullName = typeof metadata.full_name === "string" ? metadata.full_name : null;
    return {
      userId: `supabase:${subject}`,
      displayName: fullName ?? email,
      email,
      fullName,
      emailVerified: true,
    };
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
