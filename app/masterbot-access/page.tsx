import MasterbotFrame from "../masterbot/masterbot-frame";
import { createSupabaseServerClient } from "@/app/supabase-auth";
import { masterbotProfile, refreshMembership } from "@/app/masterbot/masterbot-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "MasterBot access" };

/* Signed in: who, and whether the mastermind membership is active - the same
   database check the MCP tools use. Signed out: a sign-in button, and only
   then. A signed-in member is never shown "Sign in". */
export default async function MasterbotAccess() {
  let email: string | null = null;
  let status: "active" | "inactive" | "error" | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      email = user.email;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) await refreshMembership(session.access_token);
      const profile = session?.access_token ? await masterbotProfile(session.access_token) : null;
      status = !profile || !profile.ok ? "error" : profile.data.active ? "active" : "inactive";
    }
  } catch { status = email ? "error" : null; }

  return <MasterbotFrame>
    <p className="mb-eyebrow">MASTERBOT</p>
    <h1>MasterBot access</h1>
    <p>MasterBot is included with The Wolf Method Mastermind. When ChatGPT asks you to connect, sign in with the same email address you use for the mastermind. Membership is checked before MasterBot&apos;s protected tools run.</p>
    <div className="mb-card">
      {!email && <>
        <p style={{marginTop:0}}>Sign in to check your access.</p>
        <a className="mb-button" href="/account/sign-in?return_to=%2Fmasterbot-access">Sign in</a>
      </>}
      {email && <>
        <p style={{marginTop:0}}><strong>Signed in as {email}</strong></p>
        {status === "active" && <p><strong>MasterBot access: Active</strong></p>}
        {status === "inactive" && <p>No active The Wolf Method Mastermind membership found for {email}. If your membership uses a different email, sign out and sign in with that one. Need access? MasterBot comes with The Wolf Method Mastermind.</p>}
        {status === "error" && <p>We couldn&apos;t check your membership right now — try again in a moment.</p>}
        {status === "active" && <div style={{margin:"16px 0"}}>
          <p style={{margin:"0 0 6px"}}><strong>How to use MasterBot</strong></p>
          <ol style={{margin:0}}>
            <li>Open ChatGPT (chatgpt.com or the app).</li>
            <li>Click + in the message box, find MasterBot, and click Connect.</li>
            <li>Sign in with this same email: {email}.</li>
            <li>Start a chat — try: “Review my Etsy shop with MasterBot.”</li>
          </ol>
        </div>}
        <a className="mb-button secondary" href="/account/sign-out?return_to=%2Fmasterbot-access">Sign out</a>
      </>}
    </div>
  </MasterbotFrame>;
}
