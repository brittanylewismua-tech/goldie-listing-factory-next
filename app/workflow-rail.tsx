"use client";
import { useEffect, useRef, useState } from "react";

/* D710 · The batch rail.
 *
 * Before this, the step indicator sat across the top of the page and the button
 * that advances the batch sat at the bottom of the work column. On step 2 with
 * twenty listings those are thousands of pixels apart, so "where am I" and
 * "what do I press" were never on screen together. Measured against the pattern
 * she asked for (Quest's scheduler): rail 308px, transparent - no card, no
 * border, no shadow, no radius - 54px rows, a 25px ring, a 2px connector, 16px
 * regular labels, and a flat 308x48 pill with a 24px radius.
 *
 * The rail is a real grid column and sticks; it is NOT position:fixed floating
 * over the page. A fixed rail cannot align to the content, which is what made
 * every earlier attempt look bolted on.
 */

export type RailStep = { key: string; label: string; state: "done" | "current" | "todo"; answer?: string };

export default function WorkflowRail({
  steps,
  actionLabel,
  onPrevious,
  showPrevious,
}: {
  steps: RailStep[];
  actionLabel?: string;
  onPrevious?: () => void;
  showPrevious?: boolean;
}) {
  /* D710 · Interim, and deliberately narrow. Each step has its own primary
     button with its own guards and handler - six of them - and lifting all six
     into this component in the same change that moves the layout would put two
     risky refactors in one deploy. So the rail's button forwards to whichever
     primary button the current step has rendered, and the page's own copy is
     hidden by CSS. When the handlers are lifted properly this goes away, and
     the test pins that it still finds a target. */
  const [label, setLabel] = useState(actionLabel || "");
  const [disabled, setDisabled] = useState(false);
  const target = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const find = () => {
      const live = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".workflow-next,.launch-button,.publish-all-button"),
      ).filter(button => button.offsetParent !== null);
      const button = live[live.length - 1] || null;
      target.current = button;
      if (!button) { setLabel(""); return; }
      setLabel((button.textContent || "").replace(/\s+/g, " ").trim());
      setDisabled(button.disabled);
    };
    find();
    const watch = new MutationObserver(find);
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "class"] });
    return () => watch.disconnect();
  }, [steps]);

  return (
    <aside className="workflow-rail" aria-label="Batch progress">
      <p className="workflow-rail-head">Batch progress</p>
      <ol className="workflow-rail-steps">
        {/* D710 · The state class is written out rather than built with a
            template literal: tests/stylesheet-liveness.test.mjs scans for the
            literal class name, and one it cannot see reads as dead CSS and gets
            swept - which is exactly how D702 deleted a live rule. */}
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={
              step.state === "done"
                ? "workflow-rail-step is-done"
                : step.state === "current"
                  ? "workflow-rail-step is-current"
                  : "workflow-rail-step is-todo"
            }
          >
            <span className="workflow-rail-dot" aria-hidden="true">{step.state === "done" ? "✓" : index + 1}</span>
            <span className="workflow-rail-label">
              {step.label}
              {step.answer ? <em className="workflow-rail-answer">{step.answer}</em> : null}
            </span>
            {index < steps.length - 1 && <span className="workflow-rail-link" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      {label && (
        <button
          type="button"
          className="workflow-rail-action"
          disabled={disabled}
          onClick={() => target.current?.click()}
        >
          {label}
        </button>
      )}
      {showPrevious && onPrevious && (
        <button type="button" className="workflow-rail-previous" onClick={onPrevious}>Previous</button>
      )}
    </aside>
  );
}
