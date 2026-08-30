"use client";

import type { ReactNode } from "react";

/* D728 · The prototype's .goldie-footer (source: goldie-ux-preview-site
   @ aad9208, peach-glass). Read from its own CSSOM:

     .goldie-footer  position:sticky; bottom:0; margin-top:18; padding:14 38;
                     background:rgba(255,255,255,.96); border-top:1px #d9cbd3;
                     box-shadow:0 -8px 24px rgba(75,40,62,.07);
                     backdrop-filter:blur(10px); flex, space-between, centred;
                     and it breaks the work column's max-width to span the pane
     .goldie-footer small  11px, #776873
     .goldie-next    #5d3151, #fff, radius 8, padding 11 18, weight 750

   Production's forward action sat inside whichever panel was open, with the
   reason it was disabled printed under it as a third paragraph. The prototype
   gives the step one bar: why you cannot continue on the left, the way forward
   on the right, both visible without scrolling to find them.

   The button is passed in, not built here - it keeps its own disabled state,
   title, gate checks and handler exactly as production wrote them. */

export default function FactoryFooter({ status, children }: { status?: ReactNode; children: ReactNode }) {
  return (
    <div className="factory-footer">
      <small>{status}</small>
      {children}
    </div>
  );
}
