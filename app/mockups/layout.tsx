import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/* D671 — Lifestyle mockup generation and saved mockup sets are retired. The
   legacy implementation remains only so previously generated listing images
   can still be read; sellers can no longer enter this route. */
export default function RetiredMockupsLayout({ children }: { children: ReactNode }) {
  void children;
  notFound();
}
