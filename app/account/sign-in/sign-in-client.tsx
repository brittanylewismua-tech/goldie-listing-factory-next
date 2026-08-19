"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/app/supabase-auth";

export default function SignInClient({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const callback = () => `${window.location.origin}/auth/callback?return_to=${encodeURIComponent(returnTo)}`;

  async function emailSignIn(event: FormEvent) {
    event.preventDefault(); setBusy("email"); setError(""); setMessage("");
    const { error: authError } = await createSupabaseBrowserClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callback(), shouldCreateUser: true } });
    setBusy(null);
    if (authError) return setError(authError.message);
    setMessage("Check your email. Your secure sign-in link is on its way.");
  }

  async function googleSignIn() {
    setBusy("google"); setError(""); setMessage("");
    const { error: authError } = await createSupabaseBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (authError) { setBusy(null); setError(authError.message); }
  }

  return <main className="account-page" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingBottom:24}}><section className="account-card">
    <div className="account-wordmark" aria-label="Goldie Listing Factory"><div>Gold<span>ı<i>✦</i></span>e</div><small>LISTING FACTORY</small></div>
    <p className="account-eyebrow">WELCOME</p><h1>Sign in to your Listing Factory.</h1>
    <p className="account-intro">Choose the easiest option for you. Your saved products, batches, keyword banks, and plan stay with your account.</p>
    <button className="account-provider" type="button" onClick={() => void googleSignIn()} disabled={Boolean(busy)}><b className="google-mark">G</b><span>{busy === "google" ? "Opening Google…" : "Continue with Google"}</span></button>
    <div className="account-divider"><span>or</span></div>
    <form onSubmit={emailSignIn}><label htmlFor="account-email">Email address</label><input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="account-primary" disabled={Boolean(busy)}>{busy === "email" ? "Sending your link…" : "Email me a sign-in link"}</button></form>
    <a className="account-chatgpt" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}>Continue with ChatGPT</a>
    {message && <p className="account-message" role="status">{message}</p>}{error && <p className="account-error" role="alert">{error}</p>}
    <p className="account-fine">No password to remember. Email sign-in uses a secure, one-time link.</p>
  </section><footer className="account-footer" style={{position:"static",width:"auto",minHeight:0,margin:"22px 0 0",padding:0,border:0,borderRadius:0,background:"transparent",boxShadow:"none",fontSize:11,lineHeight:1.4,textAlign:"center"}}>Powered by Goldie AI · © 2026 Be A Wolf Biz</footer></main>;
}
