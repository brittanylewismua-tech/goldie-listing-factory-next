import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { NavIcon } from "@/app/nav-icons";
import FactoryShell from "@/app/factory-shell";
import MoreView from "./more-view";
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
  { heading: "Listing Factory", rows: [
    {href:"/listing-factory?step=setup",name:"Listing Factory",icon:"listingFactory",what:"Create an individual listing or a batch on your computer."},
    {href:"/batches",name:"Batch History",icon:"batches",what:"Open saved batches and check their progress."},
    {href:"/mockups",name:"Mockup Sets",icon:"mockups",what:"Manage the photos used for your listings."},
  ]},
  {
    heading: "Tools",
    rows: [
      { href: "/trademark", name: "Trademark Tracker", icon: "trademark",
        /* D1693 · "the federal register" claims a complete search. The tool
           itself says "the trademark records currently loaded", and the
           register is still ingesting. The menu should not promise more
           than the page it opens. */
        what: "Check a phrase and watch for trademark changes." },
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
      { href: "/account/settings", name: "Account", icon: "account",
        what: "Who you are signed in as, your access, and the data held about you." },
      { href: "/usage", name: "Usage and limits", icon: "usage",
        what: "Your monthly listing allowance and what is left." },
      { href: "/goals", name: "Listing goal", icon: "goals",
        what: "How many listings you have prepared this period." },
    ],
  },
];

/*
  D1611 · THIS PAGE IS WHERE A MEMBER WITHOUT ACCESS IS SENT.

  `requireFeaturePage` redirects to `/more?needs=<feature>` when somebody opens
  a feature their plan does not include. This page ignored the parameter
  entirely, so that member landed on a list of tools with no explanation of why
  they were moved, what they had tried to open, or what to do about it — the
  navigation equivalent of a door closing with no sign on it.
*/
const FEATURE_NAMES: Record<string, string> = {
  listingFactory: "the Listing Factory",
  designScanner: "Design Scanner",
  marketWatch: "Market Watch",
  shopMap: "Shop Map",
  trademarkStandalone: "the Trademark Tracker",
  trademarkAtPublish: "the trademark check at publish",
};

export default async function MorePage(
  { searchParams }: { searchParams: Promise<{ needs?: string }> },
) {
  await requireChatGPTUser("/more");
  const needs = (await searchParams).needs ?? "";
  const needsName = FEATURE_NAMES[needs] ?? "";
  return <FactoryShell active="more" title="Tools & settings" desktopOnly={false}>
    <MoreView needsName={needsName} />
  </FactoryShell>;
}
