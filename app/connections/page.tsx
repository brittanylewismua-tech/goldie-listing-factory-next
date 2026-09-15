import { requireChatGPTUser } from "@/app/chatgpt-auth";
import ConnectionsClient from "./connections-client";
import "./connections.css";

/*
  One screen answering: what is Goldie connected to, what can it do with that,
  and what happens if I disconnect it. Written for somebody who has never heard
  the word "scope".
*/
export default async function ConnectionsPage() {
  const user = await requireChatGPTUser("/connections");
  return <ConnectionsClient signedInEmail={user.email} />;
}
