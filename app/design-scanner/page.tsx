import { requireFeaturePage } from "@/app/require-feature";
import FactoryShell from "@/app/factory-shell";
import DesignScannerClient from "./design-scanner-client";
import "./design-scanner.css";

/* The tab says what this page is. There is no product name to append, and
   a placeholder in a tab title is how a stand-in becomes permanent. */
export const metadata = { title: "Design Scanner" };


/*
  The member is holding a design and one question: is this going to land with
  the people I made it for. Everything on this page serves that question, and
  the design itself stays the biggest thing on screen the whole way through.
*/
export default async function DesignScannerPage() {
  const user = await requireFeaturePage("designScanner", "/design-scanner");
  return (
    /* D1575 · the same rail, topbar, wordmark and footer as the Listing
       Factory. This page rendered as a bare column on white before. */
    <FactoryShell active="design-scanner" title="Design Scanner" desktopOnly={false}>
      <DesignScannerClient signedInEmail={user.email} />
    </FactoryShell>
  );
}
