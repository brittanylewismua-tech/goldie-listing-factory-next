import Link from "next/link";
import { accountSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import HomeView from "./home-view";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sellerPreferences } from "@/db/schema";
import { isOwner } from "@/app/mastermind/access";
import "../home-preview/preview.css";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const user = await getChatGPTUser();
  if (!user)
    return <main className="hub-auth"><Link href={accountSignInPath("/home")}>Sign in</Link></main>;

  let firstName = "";
  try {
    const [row] = await getDb().select().from(sellerPreferences)
      .where(eq(sellerPreferences.userId, user.userId)).limit(1);
    if (row) {
      const saved = JSON.parse(row.pricingJson || "{}") as { firstName?: unknown };
      if (typeof saved.firstName === "string") firstName = saved.firstName.trim();
    }
  } catch {}
  if (!firstName && isOwner(user)) firstName = "Brittany";

  return <main className="goldie-home-page"><HomeView firstName={firstName} /></main>;
}
