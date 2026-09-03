"use client";

import { cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
   title, gate checks and handler exactly as production wrote them.

   D776 · and it has to be IN the bar. Measured on step 1 with her five saved
   products: this rendered where it stood in the step, which put "Next step" at
   y=2003 on a 2278px page - 1,260px below the fold, under every product card,
   while the sticky bar at the bottom of the window showed only Back, "Saved
   automatically" and "Save as draft". Two bars, and the one you could see was
   the one without the way forward.

   So it portals into the sticky bar, which is the only bar production has on
   every step. The slot is a DOM node rather than a prop because the forward
   control is built deep inside each step's own JSX, next to the gate checks it
   reads - and moving those up would mean rewriting five steps' worth of
   conditions to say the same thing somewhere else.

   No slot (server render, or a step that has no bar) means it renders in place,
   exactly as it did before. */

export default function FactoryFooter({ status, children }: { status?: ReactNode; children: ReactNode }) {
  const [slot, setSlot] = useState<Element | null>(null);
  /* D778 · There is more than one bar. Once the Printify drafts exist, step 2
     swaps its bar for .post-draft-footer and leaves the ordinary one in the
     tree, hidden. Taking the first slot in the document put the step's footer
     inside the hidden bar: the visible one showed Back, "Saved automatically"
     and "Save as draft", and no way forward at all - the same fault D776 fixed
     on step 1, wearing different clothes.

     So: the slot inside a bar that is actually laid out. No deps, because
     which bar is showing changes with the step, not with a mount. Setting the
     same node back is a no-op in React, so this does not loop. */
  useEffect(() => {
    const find = () => {
      const slots = [...document.querySelectorAll(".factory-footer-slot")];
      const visible = slots.find(candidate => {
        const bar = candidate.closest(".workflow-footer-actions");
        return bar instanceof HTMLElement && bar.offsetParent !== null && bar.getBoundingClientRect().width > 0;
      });
      setSlot(visible || slots[0] || null);
    };
    find();
    /* For a bar that mounts later than this - an opening batch, say. */
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  });

  /* D955 · The pink offset belongs to the forward action because it lives in
     the persistent footer, not because a button happens to use a historical
     class name. Mark the footer's control here so every step gets the same
     hierarchy and no in-card control can accidentally inherit it. */
  const forward = isValidElement(children)
    ? cloneElement(children as ReactElement<{className?: string}>, {
        className: `${(children.props as {className?: string}).className || ""} footer-forward-action`.trim()
      })
    : children;

  const body = (
    <>
      <small>{status}</small>
      {forward}
    </>
  );

  if (slot) return createPortal(<div className="factory-footer in-bar">{body}</div>, slot);
  return <div className="factory-footer">{body}</div>;
}
