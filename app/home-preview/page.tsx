import { requireFeaturePage } from "@/app/require-feature";
import FactoryShell from "@/app/factory-shell";
import PreviewClient from "./preview-client";
import "./preview.css";

export const metadata = { title: "Homepage preview" };

/*
  D1866 · THREE HOMEPAGE DIRECTIONS, ON A REAL PAGE.

  Not in the navigation and not linked from anywhere: reachable only by typing
  the address. It reads the same endpoints Home reads, so the figures and the
  photographs are the real ones rather than a mockup's grey squares.
*/
export default async function HomePreviewPage() {
  await requireFeaturePage("marketWatch", "/home-preview");
  return (
    <FactoryShell active="home" title="Homepage preview" desktopOnly={false}>
      <PreviewClient/>
    </FactoryShell>
  );
}
