import type { ReactNode } from "react";

/* D1865 · This layout existed and said nothing, so the tab read the neutral
   fallback. */
export const metadata = { title: "Mockup Sets" };

export default function MockupsLayout({ children }: { children: ReactNode }) {
  return children;
}
