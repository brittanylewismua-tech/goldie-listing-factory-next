"use client";

import { FormEvent, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/app/supabase-auth";
import ListingFactoryWordmark from "@/app/goldie-wordmark";

export default function SignInClient({ returnTo, initialError = "" }: { returnTo: string; initialError?: string }) {
  /* Where they were going decides what this page may call itself. */
  const listingFactoryBound = /^\/(listing-factory|batches|keywords)\b/.test(returnTo || "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError);
  const pending = useRef(false);
  const callback = () => `${window.location.origin}/auth/callback?return_to=${encodeURIComponent(returnTo)}`;

  async function emailSignIn(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy("email"); setError(""); setMessage("");
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callback(), shouldCreateUser: true } });
      if (authError) return setError(authError.name === "AuthRetryableFetchError" ? "We couldn’t confirm your sign-in request. Check your inbox first; if no link arrives, check your connection and try again." : authError.message);
      setMessage("Check your email. Your secure sign-in link is on its way.");
    } catch {
      setError("We couldn’t confirm your sign-in request. Check your inbox first; if no link arrives, check your connection and try again.");
    } finally {
      pending.current = false; setBusy(null);
    }
  }

  async function googleSignIn() {
    if (pending.current) return;
    pending.current = true; setBusy("google"); setError(""); setMessage("");
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
      if (authError) setError(authError.message);
    } catch {
      setError("We couldn't open Google sign-in. Check your connection and try again.");
    } finally {
      pending.current = false; setBusy(null);
    }
  }

  return <main className="account-page" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingBottom:24}}><section className="account-card">
    {/*
      D1606 · THE SIGN-IN PAGE IS NOT INSIDE THE LISTING FACTORY.

      It carried the Listing Factory's wordmark and read "Sign in to your
      Listing Factory" for every member, whichever feature they were heading
      for — somebody bounced from Market Watch was told they were signing in
      to something else. The wordmark belongs on the Listing Factory's own
      pages, so it appears here only when that is genuinely where they are
      going; otherwise the page says what it is and nothing more.
    */}
    {listingFactoryBound && (
      <div className="account-wordmark"><ListingFactoryWordmark /></div>
    )}
    <p className="account-eyebrow">{listingFactoryBound?"WELCOME":"GOLDIE SUITE"}</p>
    <h1>{listingFactoryBound ? "Sign in to your Listing Factory." : "Sign in to Goldie Suite."}</h1>
    <p className="account-intro">Choose the easiest option for you. Your saved products, batches, keyword banks, and plan stay with your account.</p>
    <button className="account-provider" type="button" onClick={() => void googleSignIn()} disabled={Boolean(busy)}><b className="google-mark">G</b><span>{busy === "google" ? "Opening Google…" : "Continue with Google"}</span></button>
    <div className="account-divider"><span>or</span></div>
    <form onSubmit={emailSignIn}><label htmlFor="account-email">Email address</label><input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="account-primary" disabled={Boolean(busy)}>{busy === "email" ? "Sending your link…" : "Email me a sign-in link"}</button></form>
    {message && <p className="account-message" role="status">{message}</p>}{error && <p className="account-error" role="alert">{error}</p>}
    <p className="account-fine">No password to remember. Email sign-in uses a secure, one-time link.</p>{/* account-chatgpt retired with platform authentication */}
  </section><footer className="account-footer" style={{position:"static",width:"auto",minHeight:0,margin:"22px 0 0",padding:0,border:0,borderRadius:0,background:"transparent",boxShadow:"none",fontSize:11,lineHeight:1.4,textAlign:"center"}}>© 2026 Be A Wolf Biz</footer></main>;
}
