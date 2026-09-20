import Link from "next/link";
import { accountSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import FactoryShell from "@/app/factory-shell";
import HomeView from "./home-view";

/* The tab says what this page is. There is no product name to append, and
   a placeholder in a tab title is how a stand-in becomes permanent. */
export const metadata = { title: "Home" };

export default async function HomePage() {
  const user = await getChatGPTUser();
  if (!user)
    return <main className="hub-auth"><Link href={accountSignInPath("/home")}>Sign in</Link></main>;

  return <FactoryShell active="home" title="Home" desktopOnly={false}>
    <HomeView firstName={(user.fullName ?? user.displayName).trim().split(/\s+/)[0] || "there"} />
  </FactoryShell>;
}
