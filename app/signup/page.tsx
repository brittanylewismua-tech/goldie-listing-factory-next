import { getChatGPTUser } from "@/app/chatgpt-auth";
import SignupClient from "./signup-client";
import { checkoutOpen, CLOSED_HEADLINE, CLOSED_BODY } from "@/app/checkout-gate";
import "./signup.css";
import "./signup-copy.css";
import "./signup-polish.css";
import "./signup-pricing.css";

/*
  D1448 - PRICES ARE NOT RENDERED WHILE GOLDIE IS CLOSED.

  Hiding the buttons would not be enough: this is a server component, and the
  plan names and amounts would still be sent to the browser inside the page
  payload for anyone who looked. So the pricing client is not rendered at all
  when checkout is closed, and nothing about the plans leaves the server.
*/
export default async function SignupPage(
  { searchParams }: { searchParams: Promise<{ checkout?: string; offer?: string; interval?: string }> },
) {
  const [user, query] = await Promise.all([getChatGPTUser(), searchParams]);

  if (!checkoutOpen())
    return (
      <main className="signup-closed" style={{
        maxWidth: "34rem", margin: "0 auto", padding: "4rem 1.25rem", textAlign: "center",
      }}>
        <h1 style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>{CLOSED_HEADLINE}</h1>
        <p style={{ lineHeight: 1.6, opacity: 0.85 }}>{CLOSED_BODY}</p>
      </main>
    );

  const offer = query.offer === "trial" || query.offer === "goldie"
    || query.offer === "pro" || query.offer === "scale" ? query.offer : undefined;
  return <SignupClient signedIn={Boolean(user)} signedInEmail={user?.email}
    checkout={query.checkout} initialOffer={offer}
    initialInterval={query.interval === "year" ? "year" : "month"}
    returnTo="/listing-factory" />;
}
