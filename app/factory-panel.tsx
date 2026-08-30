"use client";
import type { ReactNode } from "react";

/* D723 · The panel from the approved prototype (goldie-ux-preview-site @
   aad9208, public/prototype.html, peach-glass — .goldie-panel).
   Structure, verbatim from the source:

     .goldie-panel
       .goldie-panel-head
         .goldie-panel-index      "01"
         .goldie-panel-title      strong + small
         .goldie-state            "Complete" / "2 ready" / "2 reviewed"
       .goldie-panel-body         (only when there is something to show)

   This is presentation only. It owns no state, fetches nothing and decides
   nothing — every value and every handler is passed in by the workflow, which
   remains the behavioural source of truth. */

export type PanelTone = "done" | "attention" | "optional" | "pending";

export default function FactoryPanel({
  index,
  title,
  description,
  state,
  tone = "done",
  open = false,
  onToggle,
  toggleLabel,
  toggleDisabled,
  toggleTitle,
  children,
}: {
  index: number;
  title: string;
  description?: ReactNode;
  state?: ReactNode;
  tone?: PanelTone;
  open?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
  toggleDisabled?: boolean;
  toggleTitle?: string;
  children?: ReactNode;
}) {
  const toneClass =
    tone === "attention" ? " is-attention"
    : tone === "optional" ? " is-optional"
    : tone === "pending" ? " is-pending"
    : " is-done";

  return (
    <section className={`factory-panel${toneClass}${open ? " is-open" : ""}`}>
      <div className="factory-panel-head">
        {/* The prototype prints a zero-padded ordinal. It is decorative: it
            names the seller's position in the step, not an id. */}
        <span className="factory-panel-index" aria-hidden="true">
          {String(index).padStart(2, "0")}
        </span>
        <div className="factory-panel-title">
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </div>
        {state ? <span className="factory-panel-state">{state}</span> : null}
        {onToggle ? (
          <button
            type="button"
            className="factory-panel-toggle"
            aria-expanded={open}
            disabled={toggleDisabled}
            title={toggleTitle}
            onClick={onToggle}
          >
            {toggleLabel ?? (open ? "Close" : "Open")}
          </button>
        ) : null}
      </div>
      {/* D687 kept the collapse because a batch of twenty designs is 34 screens
          with every panel open. The prototype only ever shows two listings, so
          it can afford to render them all; production cannot. The capability
          wins and the layout adapts, which is the rule in the brief. */}
      {open && children ? <div className="factory-panel-body">{children}</div> : null}
    </section>
  );
}
