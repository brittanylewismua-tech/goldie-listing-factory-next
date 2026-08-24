"use client";

import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        kind: "global-boundary",
        message: error.message || "Goldie failed during startup",
        source: error.stack || "",
        digest: error.digest || "",
        url: typeof location === "undefined" ? "" : location.pathname + location.search,
        stack: error.stack || "",
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="factory-startup-error" role="alert">
          <div>
            <p>Goldie kept your saved work safe.</p>
            <h1>The page hit a startup problem.</h1>
            <p>The error has been recorded. Reloading will not delete your saved Listing Factory batch.</p>
            <button type="button" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
