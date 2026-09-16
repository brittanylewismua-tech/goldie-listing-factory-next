import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

/* The tab says what this page is. There is no product name to append, and
   a placeholder in a tab title is how a stand-in becomes permanent. */
export const metadata = { title: "More" };


/*
  The fifth tab. Everything that is not one of the four features, in the order
  somebody actually needs it.
*/
const ITEMS = [
  { href: "/trademark", name: "Trademark Checker",
    what: "Check a phrase against the federal register and known risks." },
  { href: "/connections", name: "Connections",
    what: "Your Etsy shops and Printify, and what can be seen." },
  { href: "/usage", name: "Limits and usage",
    what: "What you have used today and what is left." },
  { href: "/account/sign-out", name: "Sign out", what: "" },
];

export default async function MorePage() {
  await requireChatGPTUser("/more");
  return <main className="hub">
    <header className="hub-head"><h1>More</h1></header>
    <section className="hub-grid">
      {ITEMS.map(item => (
        <Link key={item.href} className="hub-tool" href={item.href}>
          <b>{item.name}</b>
          {item.what && <span className="hub-what">{item.what}</span>}
        </Link>
      ))}
    </section>
  </main>;
}
