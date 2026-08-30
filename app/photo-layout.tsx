"use client";

import type { ReactNode } from "react";

/* D725 · The prototype's .goldie-photo-layout (source: goldie-ux-preview-site
   @ aad9208, peach-glass). Measured from its computed styles:

     .goldie-photo-layout      grid 190px / rest, gap 18
     .goldie-listing-identity  190 wide, padding-right 18
     .goldie-design-large      171x150, radius 9, #f1edef
     identity strong           700 13px/1.35
     identity small            11px #796a74, margin-top 5
     .goldie-photos            4 columns, gap 8
     .goldie-photo             91 tall, radius 8; selected 2px #6d3b5e,
                               unselected 1px #ddd5da

   Production shows the same information in a 240px card stacked above the
   photos, so the design and its photos never share a sightline. The prototype
   puts them side by side: the artwork is what tells one listing from another,
   and it stays visible while the photos underneath it are worked.

   Presentational only. The photo column is whatever the caller passes, so
   uploading, ordering, the size guide and the download button keep their own
   components, handlers and state. */

export default function PhotoLayout({
  previewUrl,
  name,
  meta,
  children,
}: {
  previewUrl?: string;
  name: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <div className="factory-photo-layout">
      <aside className="factory-listing-identity">
        <div className="factory-design-large">
          {previewUrl ? <img src={previewUrl} alt={`${name} artwork`} /> : null}
        </div>
        <strong>{name}</strong>
        {meta ? <small>{meta}</small> : null}
      </aside>
      <div className="factory-photo-column">{children}</div>
    </div>
  );
}
