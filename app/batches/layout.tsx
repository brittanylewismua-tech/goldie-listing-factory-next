/*
  A TITLE FOR A CLIENT-COMPONENT PAGE.

  `export const metadata` is ignored in a client component, so the title added
  to batches/page.tsx never applied and the tab fell through to the neutral
  fallback. A route layout is a server component, which is where metadata
  belongs.
*/
export const metadata = { title: "Batch History" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
