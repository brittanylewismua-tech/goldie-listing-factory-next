import Image from "next/image";
import ListingFactory from "@/app/page";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { mastermindState } from "./access";
import CodeGate from "./code-gate";

export default async function MastermindPage() {
  const user = await requireChatGPTUser("/mastermind");
  const state = await mastermindState(user);
  if (!state.active) return <div className="access-shell"><div className="access-card"><Image src="/goldie-wordmark.webp" width={236} height={120} alt="Goldie" /><p className="mini-label">MASTERMIND BETA</p><h1>Testing is closed</h1><p>This mastermind testing period is not currently open.</p></div></div>;
  if (state.expired) return <div className="access-shell"><div className="access-card"><Image src="/goldie-wordmark.webp" width={236} height={120} alt="Goldie" /><p className="mini-label">MASTERMIND BETA</p><h1>Your beta has ended</h1><p>Your free 48-hour Goldie beta is complete. Your saved work will still be here if you choose a plan.</p><a className="access-link" href="/signup">See Goldie plans</a></div></div>;
  if (!state.redeemed) return <CodeGate email={user.email} />;
  return <ListingFactory />;
}
