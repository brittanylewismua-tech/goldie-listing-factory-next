"use client";

import { useEffect, useState } from "react";
import ListingFactory from "@/app/page";

export default function ClientFactory() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <main className="factory-route-loading" aria-live="polite">
        <p>Opening your Listing Factory…</p>
      </main>
    );
  }

  return <ListingFactory/>;
}
