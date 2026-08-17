import ListingFactory from "@/app/page";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { mastermindState } from "./access";
import CodeGate from "./code-gate";
import BetaCountdown from "./beta-countdown";
import "./mastermind.css";
import "./countdown.css";

function Brand() {
  return <div className="beta-brand" aria-label="Goldie Listing Factory"><span>Gold<span className="beta-i">ı<i>✦</i></span>e</span><b>LISTING FACTORY</b></div>;
}

function BetaShell({ children }: { children: React.ReactNode }) {
  return <main className="beta-shell"><div className="beta-orb beta-orb-one"/><div className="beta-orb beta-orb-two"/><Brand/><section className="beta-card">{children}</section><p className="beta-powered">POWERED BY GOLDIE AI · © 2026 BE A WOLF BIZ</p></main>;
}

function WelcomeScreen() {
  return <BetaShell><p className="beta-eyebrow">PRIVATE MASTERMIND BETA</p><h1>Your Listing Factory beta is ready.</h1><p className="beta-intro">Sign in to unlock 48 hours inside the Listing Factory. You can create up to 20 listings and 20 AI lifestyle mockups while you test.</p><div className="beta-limit-grid"><div><b>20</b><span>listings</span></div><div><b>20</b><span>lifestyle mockups</span></div><div><b>48</b><span>hours of access</span></div></div><a className="beta-primary" href={chatGPTSignInPath("/mastermind")}>Sign in to start</a><p className="beta-fine-print">You will enter your mastermind beta code after signing in. No card required.</p></BetaShell>;
}

export default async function MastermindPage({ searchParams }: { searchParams?:Promise<{preview?:string}> }) {
  if ((await searchParams)?.preview === "welcome") return <WelcomeScreen/>;
  const user = await getChatGPTUser();
  if (!user) return <WelcomeScreen/>;
  const state = await mastermindState(user);
  if (!state.active) return <BetaShell><p className="beta-eyebrow">MASTERMIND BETA</p><h1>Testing is closed.</h1><p className="beta-intro">This mastermind testing period is not currently accepting new testers.</p></BetaShell>;
  if (state.expired) return <BetaShell><p className="beta-eyebrow">MASTERMIND BETA</p><h1>Your beta has ended.</h1><p className="beta-intro">Your free 48-hour Listing Factory beta is complete. Your saved work will still be here if you choose a plan.</p><a className="beta-primary" href="/signup">See Listing Factory plans</a></BetaShell>;
  if (!state.redeemed) return <CodeGate email={user.email} />;
  return <><BetaCountdown expiresAt={state.expiresAt}/><ListingFactory /></>;
}
