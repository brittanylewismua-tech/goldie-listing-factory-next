import SignInClient from "./sign-in-client";
import "./sign-in.css";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const query = await searchParams;
  const returnTo = query.return_to?.startsWith("/") && !query.return_to.startsWith("//") ? query.return_to : "/listing-factory";
  return <SignInClient returnTo={returnTo} />;
}
