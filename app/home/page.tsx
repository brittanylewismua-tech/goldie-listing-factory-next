import Link from "next/link";
import { accountSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import FactoryShell from "@/app/factory-shell";
import HomeView from "./home-view";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sellerPreferences } from "@/db/schema";
import "../home-preview/preview.css";

/* The tab says what this page is. There is no product name to append, and
   a placeholder in a tab title is how a stand-in becomes permanent. */
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
  if (!firstName && user.fullName) firstName = user.fullName.trim().split(/\s+/)[0] || "";
  if (!firstName && user.email === "brittany@beawolfbiz.com") firstName = "Brittany";

  return <FactoryShell active="home" title="Home" desktopOnly={false}>
    <HomeView firstName={firstName} />
  </FactoryShell>;
}
