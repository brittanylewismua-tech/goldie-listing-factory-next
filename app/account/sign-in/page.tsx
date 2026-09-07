import { safeReturnPath } from "@/app/safe-return-path";
import SignInClient from "./sign-in-client";
import "./sign-in.css";
import "./sign-in-v2.css";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string; error?: string }> }) {
  const query = await searchParams;
  const returnTo = safeReturnPath(query.return_to);
  return <SignInClient returnTo={returnTo} initialError={query.error ? "Your sign-in link may have expired or already been used. Request a new link below, or continue with Google." : ""} />;
}
