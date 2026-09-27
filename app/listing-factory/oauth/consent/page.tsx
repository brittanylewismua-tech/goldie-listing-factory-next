import { createSupabaseServerClient } from "@/app/supabase-auth";
import ConsentClient from "./consent-client";
import "../../../account/sign-in/sign-in.css";
import "../../../account/sign-in/sign-in-v2.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect MasterBot" };

/*
  THE OAUTH CONSENT SCREEN FOR MASTERBOT.

  Supabase's OAuth server sends ChatGPT's authorization request here with an
  authorization_id. The path is fixed by Supabase: it appends the configured
  authorization path (/oauth/consent) to the project's Site URL
  (https://thegoldiesuite.com/listing-factory).

  Signed out: offer Google / email sign-in (which return here) and the
  password sign-in the OpenAI reviewer uses. Signed in: show who is
  connecting and approve or deny. Only redirects back to ChatGPT/OpenAI are
  ever approved - this is what keeps open client registration from being a
  phishing tool.
*/
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: authorizationId = "" } = await searchParams;
  let email: string | null = null;
  try {
    const { data } = await (await createSupabaseServerClient()).auth.getUser();
    email = data.user?.email ?? null;
  } catch {}
  return <ConsentClient authorizationId={authorizationId} signedInEmail={email} />;
}
