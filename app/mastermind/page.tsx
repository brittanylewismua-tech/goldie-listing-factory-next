import ListingFactory from "@/app/page";
import { accountSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { mastermindState } from "./access";
import CodeGate from "./code-gate";
import "./mastermind.css";

function Brand() {
  return <div className="beta-brand" aria-label="Goldie Listing Factory"><span>Gold<span className="beta-i">ı<i>✦</i></span>e</span><b>LISTING FACTORY</b></div>;
}

function BetaShell({ children }: { children: React.ReactNode }) {
  return <main className="beta-shell"><div className="beta-orb beta-orb-one"/><div className="beta-orb beta-orb-two"/><Brand/><section className="beta-card">{children}</section><p className="beta-powered">POWERED BY GOLDIE AI · © 2026 BE A WOLF BIZ</p></main>;
}

function WelcomeScreen() {
  return <BetaShell><p className="beta-eyebrow">PRIVATE MASTERMIND BETA</p><h1>Your Listing Factory beta is ready.</h1><p className="beta-intro">Create up to 10 listings during the private mastermind beta. Access stays open until Brittany closes testing.</p><p className="beta-intro">10 listings total · No automatic expiration</p><a className="beta-primary" href={accountSignInPath("/mastermind?stage=code")}>Sign in to start</a><p className="beta-fine-print">You will enter your mastermind beta code after signing in. No card required.</p></BetaShell>;
}

export default async function MastermindPage({ searchParams }: { searchParams?:Promise<{preview?:string;stage?:string}> }) {
  const params = await searchParams;
  if (params?.stage !== "code") return <WelcomeScreen/>;
  const user = await getChatGPTUser();
  if (!user) return <WelcomeScreen/>;
  const state = await mastermindState(user);
  if (!state.active) return <BetaShell><p className="beta-eyebrow">MASTERMIND BETA</p><h1>Testing is closed.</h1><p className="beta-intro">This mastermind testing period is not currently accepting new testers.</p></BetaShell>;
  if (!state.redeemed) return <CodeGate email={user.email} />;
  return <ListingFactory />;
}
