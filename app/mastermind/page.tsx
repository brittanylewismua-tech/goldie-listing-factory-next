import Image from "next/image";
import ListingFactory from "@/app/page";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { mastermindState } from "./access";
import CodeGate from "./code-gate";

export default async function MastermindPage() {
  const user = await requireChatGPTUser("/mastermind");
  const state = await mastermindState(user);
  if (!state.active) return <div className="access-shell"><div className="access-card"><Image src="/goldie-wordmark.webp" width={236} height={120} alt="Goldie" /><p className="mini-label">MASTERMIND ACCESS</p><h1>Testing is closed</h1><p>This mastermind testing period is no longer active.</p></div></div>;
  if (!state.redeemed) return <CodeGate email={user.email} />;
  return <ListingFactory />;
}
