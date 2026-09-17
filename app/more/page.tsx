import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { NavIcon } from "@/app/nav-icons";
import FactoryShell from "@/app/factory-shell";
import "@/app/tools-settings.css";

/*
  TOOLS & SETTINGS.

  This was a page called "More" — a navigation label promoted to a heading,
  set at hero size over four oversized cards floating in a full-height black
  field with a decorative gear. "More" tells a member nothing; it is the name
  of the tab they pressed, repeated back at them. And a utility destination
  built out of feature-sized cards reads as a page whose content was never
  designed, only placed.

  The bottom tab stays "More" because a five-tab bar has no room for anything
  longer. The destination says what it holds.

  Structure follows the Listing Factory: light paper over the pink grid, one
  clear purpose, compact rows of the same density as the workflow's own
  checklists rather than cards, grouped so the eye can skip to the group it
  wants. Sign out is not a feature and does not wear a feature's card.
*/
export const metadata = { title: "Tools & settings" };

type Row = { href: string; name: string; what: string; icon: Parameters<typeof NavIcon>[0]["name"] };
type Group = { heading: string; rows: Row[] };

/*
  ONLY DESTINATIONS THAT EXIST.

  A "Help" group with support, privacy and delete-account was specified, and
  none of those is a route in this application today — support is a component
  inside the workflow, not a page. Inventing three links to nowhere would make
  the page look more complete and be worse. The group appears when the routes do.
*/
const GROUPS: Group[] = [
  {
    heading: "Tools",
    rows: [
      { href: "/trademark", name: "Trademark Checker", icon: "trademark",
        what: "Check a phrase against the federal register and known risks." },
      { href: "/keywords", name: "Keyword Banks", icon: "keywords",
        what: "The phrases your titles and tags are built from." },
    ],
  },
  {
    heading: "Shop setup",
    rows: [
      { href: "/connections", name: "Etsy and Printify", icon: "connections",
        what: "Which shops are connected, and what each one can see." },
    ],
  },
  {
    heading: "Account",
    rows: [
      { href: "/usage", name: "Plan and limits", icon: "usage",
        what: "What you have used today, and what is left." },
      { href: "/goals", name: "Listing goal", icon: "goals",
        what: "How many listings you have prepared this period." },
    ],
  },
];

export default async function MorePage() {
  await requireChatGPTUser("/more");
  /*
    The rail comes too. On a phone this is the fifth tab and the bottom bar is
    the navigation, so the shell opts out of the desktop gate; on a desktop a
    member who lands here without it has no way anywhere else.
  */
  return <FactoryShell active="more" title="Tools and settings" desktopOnly={false}>
    <main className="tools-settings p-grid">
    <div className="p-page">
      <header className="p-head">
        <h1>Tools &amp; settings</h1>
        <p>Manage your tools, shop connections, and account.</p>
      </header>

      {GROUPS.map(group => (
        <section className="ts-group" key={group.heading}>
          <h2 className="ts-heading">{group.heading}</h2>
          <div className="ts-rows">
            {group.rows.map(row => (
              <Link className="ts-row" key={row.href} href={row.href}>
                <span className="ts-icon"><NavIcon name={row.icon} /></span>
                <span className="ts-text">
                  <b>{row.name}</b>
                  <small>{row.what}</small>
                </span>
                <span className="ts-go" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                    strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {/* Ends the session. Not a feature, so not a feature's card. */}
      <div className="ts-signout">
        <Link href="/account/sign-out">Sign out</Link>
      </div>
    </div>
    </main>
  </FactoryShell>;
}
