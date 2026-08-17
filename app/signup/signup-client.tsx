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
      window.location.href = `/signin-with-chatgpt?return_to=${encodeURIComponent(selectedReturn)}`;
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

  const offers: Array<{ key: OfferKey; name: string; price: string; cadence: string; featured?: boolean; benefits: React.ReactNode; button: string }> = [
    { key: "trial", name: "Free Trial", price: "$0", cadence: "for 3 days", benefits: <><li><b>10</b> Printify drafts</li><li><b>5</b> AI lifestyle mockups</li><li>Full Listing Factory access</li><li>Continues on Goldie at <b>$29/month</b></li></>, button: "Start free trial" },
    ...((Object.keys(PLANS) as PlanKey[]).map((key, index) => { const plan = PLANS[key]; return { key, name: plan.name, price: `$${plan.price}`, cadence: "/month", featured: index === 0, benefits: <><li><b>{plan.drafts}</b> Printify drafts each month</li><li><b>{plan.aiMockups}</b> AI lifestyle mockups each month</li><li><b>{plan.mockupSets}</b> saved mockup sets</li><li>Up to <b>{plan.mockupsPerSet}</b> mockups in each set</li></>, button: `Choose ${plan.name}` }; })),
  ];

  return <main className="signup-page">
    <header className="signup-brand"><span>Goldie</span><b>LISTING FACTORY</b></header>
    <section className="signup-hero"><h1>Automated Etsy listings like you’ve never seen before.</h1><p>Let Goldie AI be your ultimate automation assistant.</p></section>
    {checkout === "success" && <div className="signup-notice success"><b>Your Goldie access is being activated.</b><span>If this is your first subscription, your three-day trial starts now. Stripe is confirming everything securely.</span><a href={returnTo}>Open Listing Factory</a></div>}
    {checkout === "canceled" && <div className="signup-notice"><b>No charge was made.</b><span>Your plan is still waiting whenever you are ready.</span></div>}
    <h2 className="signup-plan-heading">Choose your plan</h2>
    <section className="signup-plans signup-plans-three">{offers.map(offer => <article className={offer.featured ? "featured" : ""} key={offer.key}>{offer.featured && <span className="plan-ribbon">MOST POPULAR</span>}<p>{offer.name}</p><h2>{offer.price}<small>{offer.cadence}</small></h2><ul>{offer.benefits}</ul><button disabled={Boolean(loading)} onClick={() => void choose(offer.key)}>{loading === offer.key ? (signedIn ? "Opening secure checkout…" : "Opening sign in…") : offer.button}</button></article>)}</section>
    {initialOffer && signedIn && loading && <p className="signup-resume" role="status">You’re signed in. Opening the offer you selected…</p>}
    {error && <p className="signup-error" role="alert">{error}</p>}
    <footer className="signup-footer"><span>Card required for the free trial. Cancel through Stripe before the trial ends and you will not be charged.</span><span>Powered by Goldie AI · © 2026 Be A Wolf Biz</span></footer>
  </main>;
}
