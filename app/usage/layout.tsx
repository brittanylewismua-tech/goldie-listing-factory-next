/*
  A TITLE FOR A CLIENT-COMPONENT PAGE.

  `export const metadata` is ignored in a client component, so this tab fell
  through to the neutral fallback and read "Etsy seller tools". A route layout
  is a server component, which is where metadata belongs.
*/
export const metadata = { title: "Usage and limits" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
