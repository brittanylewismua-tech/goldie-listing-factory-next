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
      /* Supabase ties a request to the first account that opens it. Signing in
         as someone else afterwards makes it "not found" - that is the usual
         cause, not age, so the message names the account and the fix. */
      if (authError || !data) return setError(`This connection request can't be used while signed in as ${signedInEmail}. It was opened with a different account, or it has timed out. Use a different account below if needed, then go back to ChatGPT and click Connect again.`);
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

  const switchAccount = `/account/sign-out?return_to=${encodeURIComponent("/listing-factory/oauth/consent")}`;

  const card = (children: React.ReactNode) => (
    <main className="account-page" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingBottom:24}}>
      <section className="account-card">
        <p className="account-eyebrow">MASTERBOT</p>
        {children}
        {error && <p className="account-error" role="alert">{error}</p>}
      </section>
    </main>
  );

  if (!authorizationId) return card(<><h1>Connect MasterBot</h1><p className="account-intro">Go back to ChatGPT, open MasterBot, and click Connect to start.</p></>);

  if (!signedInEmail) return card(<>
    <h1>Sign in to connect MasterBot.</h1>
    {!reviewer && <>
      <p className="account-intro">Use the same email as your The Wolf Method Mastermind membership.</p>
      <button type="button" className="account-provider" onClick={google} disabled={busy}><span className="google-mark" aria-hidden="true">G</span>Continue with Google</button>
      <p className="account-divider">or</p>
      {linkSent ? <p className="account-message">Check your email — your sign-in link is on its way. Open it in this same browser.</p> :
        <form onSubmit={emailLink}>
          <label htmlFor="mb-email">Email address</label>
          <input id="mb-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          <button type="submit" className="account-primary" disabled={busy}>Email me a sign-in link</button>
        </form>}
      {/* The OpenAI reviewer has no Mastermind email and no inbox, so this
          path has to be found at a glance, not hidden as small text. */}
      <div className="mb-reviewer">
        <p><strong>Reviewing MasterBot for OpenAI?</strong><br />Sign in with the reviewer email and password from the submission.</p>
        <button type="button" className="account-provider" onClick={() => { setReviewer(true); setError(""); }}>OpenAI reviewer sign-in</button>
      </div>
    </>}
    {reviewer && <>
      <p className="account-intro">OpenAI reviewer sign-in. Use the email and password from the submission.</p>
      <form onSubmit={passwordSignIn}>
        <label htmlFor="mb-r-email">Reviewer email</label>
        <input id="mb-r-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="mb-r-password">Password</label>
        <input id="mb-r-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" className="account-primary" disabled={busy}>Sign in</button>
      </form>
      <button type="button" className="account-chatgpt mb-plain" onClick={() => { setReviewer(false); setError(""); }}>Back</button>
    </>}
  </>);

  if (!details) return card(<>
    <h1>Connect MasterBot</h1>
    {!error && <p className="account-intro">Loading…</p>}
    {error && <a className="account-chatgpt" href={switchAccount}>Use a different account</a>}
  </>);

  return card(<>
    <h1>Connect MasterBot</h1>
    <p className="account-intro"><strong>ChatGPT</strong> wants to use MasterBot as <strong>{details.user.email}</strong>. Your email is checked against active access to The Wolf Method Mastermind before MasterBot&apos;s tools run.</p>
    <button type="button" className="account-primary" onClick={() => decide(true)} disabled={busy}>Connect MasterBot</button>
    <button type="button" className="account-chatgpt mb-plain" onClick={() => decide(false)} disabled={busy}>Cancel</button>
    {/* This request is already tied to this account, so switching must end
        with a fresh Connect from ChatGPT - the sign-out lands on the page
        that says exactly that. */}
    <p className="account-fine">Not you? <a href={switchAccount}>Use a different account</a>, then click Connect in ChatGPT again.</p>
  </>);
}
