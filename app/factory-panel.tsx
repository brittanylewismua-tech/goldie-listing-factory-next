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
      {/* D209/D332 · The head itself opens the panel, not only its button - the
          row was always the target and a 34px button is a smaller one. */}
      <div
        className="factory-panel-head"
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
        aria-expanded={onToggle ? open : undefined}
        aria-label={onToggle ? `${toggleLabel ?? (open ? "Close" : "Open")} — ${title}` : undefined}
        aria-disabled={onToggle && toggleDisabled ? true : undefined}
        title={toggleTitle}
        onClick={onToggle ? event => { if (toggleDisabled) return; if ((event.target as HTMLElement).closest("button,a,input,select,textarea")) return; onToggle(); } : undefined}
        onKeyDown={onToggle ? event => { if (toggleDisabled) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggle(); } } : undefined}
      >
        {/* The prototype prints a zero-padded ordinal. It is decorative: it
            names the seller's position in the step, not an id. */}
        <span className="factory-panel-index" aria-hidden="true">
          {String(index).padStart(2, "0")}
        </span>
        <div className="factory-panel-title">
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </div>
        {/* D834 · a finished section says so with a mark, not only a word.
            The tick is drawn, not a glyph, so it keeps its stroke at 11px and
            renders the same on every platform. Decorative: the state text
            beside it already carries the meaning for a screen reader. */}
        {state ? <span className="factory-panel-state">
          {tone === "done" ? <svg className="factory-panel-tick" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg> : null}
          {state}
        </span> : null}
        {/* D790 · A chevron, not a "Change" button.
            The head has been the open/close target since D209/D332, so the
            button beside it was a second control for the same act, sized like a
            primary action and taking a fourth grid column the preview does not
            have. The preview's panel head is three columns: index, title, state.

            The chevron is the affordance and nothing else - aria-hidden, not
            focusable, no separate handler. Everything that made this operable
            stays on the head: role=button, tabIndex, aria-expanded, Enter and
            Space. A screen reader reads one control per panel now instead of a
            row and a button that do the same thing.

            toggleDisabled and toggleTitle still say when a panel cannot be
            opened - on the head, where the click lands. */}
        {onToggle ? (
          <span className="factory-panel-chevron" aria-hidden="true">{open ? "\u2303" : "\u2304"}</span>
        ) : null}
      </div>
      {/* D687 kept the collapse because a batch of twenty designs is 34 screens
          with every panel open. The prototype only ever shows two listings, so
          it can afford to render them all; production cannot. The capability
          wins and the layout adapts, which is the rule in the brief. */}
      {/* D329 · A closing control at the foot as well: after scrolling a
          39-colour grid the way out is where you already are, rather than back
          at the top of the panel. */}
      {open && children ? (
        <div className="factory-panel-body">
          {children}
          {onToggle ? (
            <button type="button" className="panel-collapse-foot" onClick={onToggle}>
              Close {typeof title === "string" ? title.toLowerCase() : "this section"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
