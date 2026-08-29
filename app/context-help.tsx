"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

/* D705 · `after` is copy that belongs UNDER a numbered list rather than above
   it. "Goldie handles the rest" was its own section, which read as a new topic
   when it is really the last word on the Printify setup steps: you have just
   been told to publish the product, and the thing to say next is that you do
   not have to finish the listing there. */
export type HelpSection = { heading: string; copy: string; bullets?: string[]; steps?: string[]; after?: string };

export default function ContextHelp({ label, title, intro, sections }: { label: string; title: string; intro: string; sections: HelpSection[] }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("keydown", close); document.body.style.overflow = previousOverflow; };
  }, [open]);
  const dialog = open ? createPortal(<div className="context-help-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="context-help-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="context-help-close" aria-label="Close instructions" onClick={() => setOpen(false)}>×</button>
      <p className="mini-label">HELP FOR THIS STEP</p>
      <h2 id={titleId}>{title}</h2>
      <p className="context-help-intro">{intro}</p>
      <div className="context-help-sections">{sections.map(section => <article key={section.heading}>
        <h3>{section.heading}</h3><p>{section.copy}</p>
        {section.bullets?.length ? <ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul> : null}
        {section.steps?.length ? <ol>{section.steps.map(item => <li key={item}>{item}</li>)}</ol> : null}
        {section.after ? <p className="context-help-after">{section.after}</p> : null}
      </article>)}</div>
    </section>
  </div>, document.body) : null;
  return <>
    <button type="button" className="context-help-trigger" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>?</button>
    {dialog}
  </>;
}
