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
      <main className="signup-closed-screen">
        <section className="signup-closed">
          <p className="mini-label">GOLDIE SUITE</p>
          <h1>{CLOSED_HEADLINE}</h1>
          <p>{CLOSED_BODY}</p>
        </section>
      </main>
    );

  const offer = query.offer === "trial" || query.offer === "goldie"
    || query.offer === "pro" || query.offer === "scale" ? query.offer : undefined;
  return <SignupClient signedIn={Boolean(user)} signedInEmail={user?.email}
    checkout={query.checkout} initialOffer={offer}
    initialInterval={query.interval === "year" ? "year" : "month"}
    returnTo="/listing-factory" />;
}
