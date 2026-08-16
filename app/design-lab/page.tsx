import "./design-lab.css";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function DesignLab(){
  await requireChatGPTUser("/design-lab?background=saturated");
  return <main className="design-reference">
    <iframe title="Approved Goldie design" src="/goldie-real.html" />
  </main>;
}
