"use client";

import { useEffect, useRef, useState } from "react";
import { PLANS, type PlanKey } from "@/app/plan-limits";

type OfferKey = "trial" | PlanKey;

export default function SignupClient({ signedIn, checkout, returnTo = "/listing-factory", initialOffer }: { signedIn: boolean; checkout?: string; returnTo?: string; initialOffer?: OfferKey }) {
  const [loading, setLoading] = useState<OfferKey | null>(null);
  const [error, setError] = useState("");
  const resumed = useRef(false);

  async function choose(offer: OfferKey) {
    if (!signedIn) {
      const selectedReturn = `${returnTo}?offer=${offer}`;
      window.location.href = `/account/sign-in?return_to=${encodeURIComponent(selectedReturn)}`;
      return;
    }
    setLoading(offer);
    setError("");
    const plan: PlanKey = offer === "trial" ? "goldie" : offer;
    const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
    const result = await response.json() as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      setError(result.error || "Checkout could not start.");
      setLoading(null);
      return;
    }
    window.location.href = result.url;
  }

  useEffect(() => {
    if (!signedIn || !initialOffer || resumed.current) return;
    resumed.current = true;
    void choose(initialOffer);
  }, [initialOffer, signedIn]);

  const offers: Array<{ key: OfferKey; name: string; description: string; price: string; cadence: string; featured?: boolean; benefits: React.ReactNode; button: string }> = [
    { key: "trial", name: "Free Trial", description: "Take the full workflow for a test drive.", price: "$0", cadence: "for 3 days", benefits: <><li><b>10</b> Printify drafts</li><li><b>5</b> AI lifestyle mockups</li><li>Full Listing Factory access</li><li>Then <b>$29/month</b>. Cancel anytime.</li></>, button: "Start free trial" },
    ...((Object.keys(PLANS) as PlanKey[]).map((key, index) => { const plan = PLANS[key]; return { key, name: plan.name, description: index === 0 ? "Everything an active Etsy seller needs." : "More room for high-volume listing days.", price: `$${plan.price}`, cadence: "/month", featured: index === 0, benefits: <><li><b>{plan.drafts}</b> Printify drafts each month</li><li><b>{plan.aiMockups}</b> AI lifestyle mockups each month</li><li><b>{plan.mockupSets}</b> saved mockup sets</li><li>Up to <b>{plan.mockupsPerSet}</b> mockups in each set</li></>, button: `Choose ${plan.name}` }; })),
  ];

  return <main className="signup-page">
    <header className="signup-topbar"><div className="signup-brand" aria-label="Goldie Listing Factory"><div className="approved-wm">Gold<span className="approved-i">ı<span>✦</span></span>e</div><div className="approved-sub">Listing Factory</div></div>{signedIn ? <p>Signed in securely</p> : <a href={`/account/sign-in?return_to=${encodeURIComponent(returnTo)}`}>Already have an account? <b>Sign in</b></a>}</header>
    <section className="signup-hero"><span className="signup-eyebrow">YOUR LISTING WORKFLOW, AUTOMATED</span><h1>Automated Etsy listings like you’ve never seen before.</h1><p>Let Goldie AI be your ultimate automation assistant.</p><div className="signup-proof"><span>Printify drafts</span><span>Pricing + Etsy details</span><span>AI lifestyle mockups</span></div></section>
    {checkout === "success" && <div className="signup-notice success"><b>Your Listing Factory access is being activated.</b><span>If this is your first subscription, your three-day trial starts now. Stripe is confirming everything securely.</span><a href={returnTo}>Open Listing Factory</a></div>}
    {checkout === "canceled" && <div className="signup-notice"><b>No charge was made.</b><span>Your plan is still waiting whenever you are ready.</span></div>}
    <h2 className="signup-plan-heading">Choose your plan</h2>
    <section className="signup-plans signup-plans-three">{offers.map(offer => { const selectedReturn = `${returnTo}?offer=${offer.key}`; const signInUrl = `/account/sign-in?return_to=${encodeURIComponent(selectedReturn)}`; return <article className={`${offer.featured ? "featured" : ""} offer-${offer.key}`} key={offer.key}>{offer.featured && <span className="plan-ribbon">RECOMMENDED</span>}<div className="offer-heading"><p>{offer.name}</p><span>{offer.description}</span></div><h2>{offer.price}<small>{offer.cadence}</small></h2><ul>{offer.benefits}</ul>{signedIn ? <button className="offer-button" disabled={Boolean(loading)} onClick={() => void choose(offer.key)}>{loading === offer.key ? "Opening secure checkout…" : offer.button}</button> : <a className="offer-button" href={signInUrl}>{offer.button}</a>}</article>; })}</section>
    <section className="signup-next"><div><b>1. Choose your offer</b><span>Pick the access level that fits your listing volume.</span></div><div><b>2. Create your account</b><span>Sign in securely after you choose.</span></div><div><b>3. Start listing</b><span>Connect Printify and Etsy inside Listing Factory.</span></div></section>
    {initialOffer && signedIn && loading && <p className="signup-resume" role="status">You’re signed in. Opening the offer you selected…</p>}
    {error && <p className="signup-error" role="alert">{error}</p>}
    <footer className="signup-footer"><span>Secure checkout powered by Stripe. Card required for the trial. Cancel before it ends and you will not be charged.</span><span>Powered by Goldie AI · © 2026 Be A Wolf Biz</span></footer>
  </main>;
}
