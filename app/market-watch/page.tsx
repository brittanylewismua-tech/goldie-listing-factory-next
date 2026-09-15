import { requireChatGPTUser } from "@/app/chatgpt-auth";
import MarketWatchClient from "./market-watch-client";
import "./market-watch.css";

/*
  Market Watch is about everybody else's shop, never the member's own. It
  answers one question — what is actually moving out there — and then gets out
  of the way. It does not tell the seller what to do next.
*/
export default async function MarketWatchPage() {
  const user = await requireChatGPTUser("/market-watch");
  return <MarketWatchClient signedInEmail={user.email} />;
}
