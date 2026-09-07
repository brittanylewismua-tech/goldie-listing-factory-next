"use client";

import { useEffect, useRef, useState } from "react";
import { PLANS, type PlanKey, type BillingInterval } from "@/app/plan-limits";
import GoldieWordmark from "@/app/goldie-wordmark";

type OfferKey = "trial" | PlanKey;

export default function SignupClient({ signedIn, signedInEmail, checkout, returnTo = "/listing-factory", initialOffer, initialInterval = "month" }: { signedIn: boolean; signedInEmail?: string; checkout?: string; returnTo?: string; initialOffer?: OfferKey; initialInterval?: BillingInterval }) {
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const [loading, setLoading] = useState<OfferKey | null>(null);
  const [error, setError] = useState("");
  const resumed = useRef(false);
  const checkoutPending = useRef(false);

  const offerReturn = (offer: OfferKey) => `/signup?offer=${offer}&interval=${offer === "trial" ? "month" : interval}`;
  const signInUrl = (offer: OfferKey) => `/account/sign-in?return_to=${encodeURIComponent(offerReturn(offer))}`;

  async function choose(offer: OfferKey) {
    if (checkoutPending.current) return;
    if (!signedIn) {
      window.location.href = signInUrl(offer);
      return;
    }
    checkoutPending.current = true;
    setLoading(offer);
    setError("");
    const plan: PlanKey = offer === "trial" ? "goldie" : offer;
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, interval: offer === "trial" ? "month" : interval }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        setError(result.error || "Checkout could not start. Please try again.");
        return;
      }
      window.location.href = result.url;
    } catch {
      setError("We couldn't open checkout. Check your connection and try again.");
    } finally {
      checkoutPending.current = false;
      setLoading(null);
    }
  }

  useEffect(() => {
    if (!signedIn || !initialOffer || resumed.current) return;
    resumed.current = true;
    void choose(initialOffer);
  }, [initialOffer, signedIn]);

  const offers = (Object.keys(PLANS) as PlanKey[]).map(key => {
    const plan = PLANS[key];
    const descriptions: Record<PlanKey, string> = { goldie: "For sellers building a consistent listing rhythm.", pro: "For active shops testing and launching at volume.", scale: "For high-output shops and growing teams." };
    return { ...plan, description: descriptions[key], amount: interval === "year" ? plan.annualPrice : plan.price };
  });
  const freeAction = (className: string) => signedIn
    ? <button type="button" className={className} disabled={Boolean(loading)} onClick={() => void choose("trial")}>{loading === "trial" ? "Opening checkout…" : "Start for free"}</button>
    : <a className={className} href={signInUrl("trial")}>Start for free</a>;

  return <main className="signup-page">
    <header className="signup-topbar"><a className="signup-brand" href="/" aria-label="Listing Factory home"><GoldieWordmark /></a><nav className="signup-nav" aria-label="Main navigation"><a href="#pricing">Pricing</a><a href={`/account/sign-in?return_to=${encodeURIComponent(returnTo)}`}>Login</a>{freeAction("signup-nav-start")}</nav></header>
    {signedIn && <div className="signup-account-strip"><span className="signup-account-dot" aria-hidden="true">✓</span><span>{signedInEmail || "Signed in"}</span><a href={`/account/sign-out?return_to=${encodeURIComponent(`/account/sign-in?return_to=${returnTo}`)}`}>Use a different account</a></div>}
    <section className="signup-hero"><span className="signup-eyebrow">THE GOLDIE LISTING FACTORY</span><h1>Automated Etsy listings like you’ve <span>never seen before</span>.</h1><p className="signup-hero-tagline">Let Goldie AI be your automated listing assistant.</p><div className="signup-proof"><span>Listing creation</span><span>Pricing + Etsy details</span><span>Your own listing photos</span></div><div className="signup-hero-action">{freeAction("signup-start-button")}<p>10 listing creations · 3 days free<br/>Card required. Then ${PLANS.goldie.price}/month. Cancel before your trial ends to avoid a charge.</p></div></section>
    {checkout === "success" && <div className="signup-notice success"><b>Your Listing Factory access is being activated.</b><span>If this is your first subscription, your three-day trial starts now. Stripe is confirming everything securely.</span><a href={returnTo}>Open Listing Factory</a></div>}
    {checkout === "canceled" && <div className="signup-notice"><b>No charge was made.</b><span>Your plan is still waiting whenever you are ready.</span></div>}
    <section id="pricing" className="signup-pricing" aria-labelledby="signup-plan-title">
      <h2 id="signup-plan-title" className="signup-plan-heading">Choose your plan</h2>
      <div className="signup-billing-toggle" role="group" aria-label="Billing frequency"><button type="button" aria-pressed={interval === "month"} disabled={Boolean(loading)} onClick={() => setInterval("month")}>Monthly</button><button type="button" aria-pressed={interval === "year"} disabled={Boolean(loading)} onClick={() => setInterval("year")}>Yearly <span>Save 17%</span></button></div>
      <p className="signup-allowance-note">Listing allowances refresh on the 1st of each month. No rollover.</p>
      <div className="signup-plans signup-plans-three">{offers.map(offer => <article className={`${offer.key === "goldie" ? "featured" : ""} offer-${offer.key}`} key={offer.key}><div className="offer-heading"><p>{offer.name}</p>{offer.key === "goldie" && <span className="signup-recommendation">Best for most shops</span>}<span>{offer.description}</span></div><h2>${offer.amount}<small>/{interval === "year" ? "year" : "month"}</small></h2><p className="signup-billing-summary">{interval === "year" ? `$${offer.annualPrice} billed yearly · $${(offer.annualPrice / 12).toFixed(2)}/month equivalent` : "Billed monthly"}</p><ul><li><b>{offer.drafts}</b> listing creations each month</li><li>Upload your own listing photos</li></ul>{signedIn ? <button className="offer-button" disabled={Boolean(loading)} onClick={() => void choose(offer.key)}>{loading === offer.key ? "Opening secure checkout…" : `Choose ${offer.name}`}</button> : <a className="offer-button" href={signInUrl(offer.key)}>Choose {offer.name}</a>}</article>)}</div>
    </section>
    <section className="signup-next"><div><b>1. Choose your offer</b><span>Pick the access level that fits your listing volume.</span></div><div><b>2. Create your account</b><span>Sign in securely after you choose.</span></div><div><b>3. Start listing</b><span>Connect Printify and Etsy inside Listing Factory.</span></div></section>
    {initialOffer && signedIn && loading && <p className="signup-resume" role="status">You’re signed in. Opening the offer you selected…</p>}
    {error && <p className="signup-error" role="alert">{error}</p>}
    <footer className="signup-footer"><span>Secure checkout powered by Stripe. Card required for the trial. Cancel before it ends and you will not be charged.</span><span>Powered by Goldie AI · © 2026 Be A Wolf Biz</span></footer>
  </main>;
}
