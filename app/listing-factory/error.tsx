"use client";

import { useEffect } from "react";

export default function ListingFactoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        kind: "listing-factory-boundary",
        message: error.message || "Listing Factory failed during startup",
        source: error.stack || "",
        digest: error.digest || "",
        url: typeof location === "undefined" ? "" : location.pathname + location.search,
        stack: error.stack || "",
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="factory-startup-error" role="alert">
      <div>
        <p>Goldie kept your saved work safe.</p>
        <h1>Listing Factory hit a startup problem.</h1>
        <p>The error has been recorded so it can be fixed. You can retry without deleting your saved batch.</p>
        <button type="button" onClick={reset}>Try opening Listing Factory again</button>
      </div>
    </main>
  );
}
