import { requireFeaturePage } from "@/app/require-feature";
import DesignScannerClient from "./design-scanner-client";
import "./design-scanner.css";

/*
  The member is holding a design and one question: is this going to land with
  the people I made it for. Everything on this page serves that question, and
  the design itself stays the biggest thing on screen the whole way through.
*/
export default async function DesignScannerPage() {
  const user = await requireFeaturePage("designScanner", "/design-scanner");
  return <DesignScannerClient signedInEmail={user.email} />;
}
