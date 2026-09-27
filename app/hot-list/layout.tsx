import type { ReactNode } from "react";

/*
  D1865 · `export const metadata` is ignored in a client component, so this
  route's tab read the neutral "The Goldie Suite" fallback - the one kept for
  pages that must not name a product, not for a page that forgot to say what
  it is. A route layout is a server component, which is where it belongs.
*/
export const metadata = { title: "Hot List" };

export default function HotListLayout({ children }: { children: ReactNode }) {
  return children;
}
