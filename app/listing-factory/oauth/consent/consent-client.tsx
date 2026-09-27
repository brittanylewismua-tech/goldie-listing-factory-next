"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/app/supabase-auth";

/* Where an approved authorization may send the member. Anything else is
   refused, whatever client registered it. */
const ALLOWED_REDIRECT_HOSTS = ["chatgpt.com", "chat.openai.com", "platform.openai.com", "openai.com"];
const allowedRedirect = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_REDIRECT_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
};

type Details = { authorization_id: string; redirect_uri: string; client: { name?: string }; user: { email: string }; scope: string };

export default function ConsentClient({ authorizationId, signedInEmail }: { authorizationId: string; signedInEmail: string | null }) {
  const here = `/listing-factory/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewer, setReviewer] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const pending = useRef(false);
  const callback = () => `${window.location.origin}/auth/callback?return_to=${encodeURIComponent(here)}`;

  useEffect(() => {
    if (!signedInEmail || !authorizationId) return;
    let cancelled = false;
    (async () => {
      const { data, error: authError } = await createSupabaseBrowserClient().auth.oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (authError || !data) return setError("This connection request has expired. Go back to ChatGPT and click Connect again.");
      if ("redirect_url" in data && !("authorization_id" in data)) {
        if (allowedRedirect(data.redirect_url)) window.location.assign(data.redirect_url);
        else setError("This connection request isn't from ChatGPT, so it was refused.");
        return;
      }
      const d = data as Details;
      if (!allowedRedirect(d.redirect_uri)) {
        await createSupabaseBrowserClient().auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true }).catch(() => undefined);
        return setError("This connection request isn't from ChatGPT, so it was refused.");
      }
      setDetails(d);
    })().catch(() => { if (!cancelled) setError("We couldn't load this connection request. Try again from ChatGPT."); });
    return () => { cancelled = true; };
  }, [authorizationId, signedInEmail]);

  async function decide(approve: boolean) {
    if (pending.current || !details) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const client = createSupabaseBrowserClient();
      const { data, error: authError } = approve
        ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (authError || !data?.redirect_url) return setError("That didn't go through. Go back to ChatGPT and click Connect again.");
      if (!allowedRedirect(data.redirect_url)) return setError("This connection request isn't from ChatGPT, so it was refused.");
      window.location.assign(data.redirect_url);
    } finally { pending.current = false; setBusy(false); }
  }

  async function google() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
      if (authError) setError(authError.message);
    } finally { pending.current = false; setBusy(false); }
  }

  async function emailLink(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callback(), shouldCreateUser: true } });
      if (authError) setError(authError.message); else setLinkSent(true);
    } finally { pending.current = false; setBusy(false); }
  }

  async function passwordSignIn(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
      if (authError) setError("That email and password didn't match.");
      else window.location.assign(here);
    } finally { pending.current = false; setBusy(false); }
  }

  const card = (children: React.ReactNode) => (
    <main className="account-page" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingBottom:24}}>
      <section className="account-card">
        <p className="account-eyebrow">MASTERBOT</p>
        {children}
        {error && <p className="account-error" role="alert">{error}</p>}
      </section>
    </main>
  );

  if (!authorizationId) return card(<><h1>Connect MasterBot</h1><p>Open ChatGPT, find MasterBot, and click Connect to start.</p></>);

  if (!signedInEmail) return card(<>
    <h1>Sign in to connect MasterBot.</h1>
    <p>Use the same email as your The Wolf Method Mastermind membership.</p>
    {!reviewer && <>
      <button type="button" className="account-google" onClick={google} disabled={busy}>Continue with Google</button>
      <p className="account-divider">or</p>
      {linkSent ? <p>Check your email — your sign-in link is on its way. Open it in this same browser.</p> :
        <form onSubmit={emailLink}>
          <label htmlFor="mb-email">Email address</label>
          <input id="mb-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          <button type="submit" disabled={busy}>Email me a sign-in link</button>
        </form>}
      <p style={{marginTop:24}}><button type="button" className="account-link" onClick={() => { setReviewer(true); setError(""); }}>OpenAI reviewer access</button></p>
    </>}
    {reviewer && <form onSubmit={passwordSignIn}>
      <label htmlFor="mb-r-email">Reviewer email</label>
      <input id="mb-r-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="mb-r-password">Password</label>
      <input id="mb-r-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit" disabled={busy}>Sign in</button>
      <p style={{marginTop:16}}><button type="button" className="account-link" onClick={() => { setReviewer(false); setError(""); }}>Back</button></p>
    </form>}
  </>);

  if (!details) return card(<><h1>Connect MasterBot</h1><p>{error ? "" : "Loading…"}</p></>);

  return card(<>
    <h1>Connect MasterBot</h1>
    <p><strong>ChatGPT</strong> wants to use MasterBot as <strong>{details.user.email}</strong>.</p>
    <p>Your email will be checked against active access to The Wolf Method Mastermind before MasterBot&apos;s tools run.</p>
    <button type="button" onClick={() => decide(true)} disabled={busy}>Connect MasterBot</button>
    <p style={{marginTop:16}}><button type="button" className="account-link" onClick={() => decide(false)} disabled={busy}>Cancel</button></p>
    <p style={{marginTop:16,fontSize:13}}>Not you? <a href={`/account/sign-out?return_to=${encodeURIComponent(here)}`}>Use a different account</a></p>
  </>);
}
