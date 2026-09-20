/*
  `export const metadata` is ignored in a client component, so this page's tab
  carried only the fallback — every other page names itself. The layout is a
  server component, which is where metadata belongs.
*/
export const metadata = { title: "Listing goal" };

export default function GoalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
