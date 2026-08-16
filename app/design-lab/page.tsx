import "./design-lab.css";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import ListingFactory from "@/app/page";

export const dynamic = "force-dynamic";

export default async function DesignLab(){
  if (process.env.NODE_ENV === "production") {
    await requireChatGPTUser("/design-lab?background=saturated");
  }
  return <ListingFactory/>;
}
