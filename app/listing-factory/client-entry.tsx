"use client";

import { useEffect, useState } from "react";
import ListingFactoryApp from "@/app/listing-factory-app";

/**
 * ListingFactoryApp depends on browser-only file, image, cache, and navigation
 * APIs. Keep the production RSC/SSR renderer from executing that application
 * tree; Chrome mounts it immediately after hydration instead.
 */
export default function ListingFactoryClientEntry() {
  const [browserReady, setBrowserReady] = useState(false);
  useEffect(() => setBrowserReady(true), []);

  if (!browserReady) {
    return <main className="factory-browser-handoff" aria-label="Opening Listing Factory" />;
  }

  return <ListingFactoryApp />;
}
