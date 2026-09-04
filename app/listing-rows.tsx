"use client";
import { useMemo, useState, type ReactNode } from "react";

/* D687 · One component for "show me every listing in this batch".

   There were three implementations of this idea: designTaskRows() behind the
   three step 3 panels, four hand-rolled listings.map() blocks in step 2, and
   final-listing-review.tsx for step 4. Three codebases for one thing is why the
   spacing, colours and fonts drifted apart between steps, and why a single
   instruction like "make the thumbnails bigger" had to be given more than once.

   Measured before this existed: one listing block was 541px tall, so a batch of
   twenty was 10,820px - 14.3 screens of scrolling inside one panel, with no way
   to tell which listings needed anything. A collapsed row is 76px, so the same
   twenty is 2.4 screens, and the ones that need work announce themselves.

   The pattern is the one bulk editors converge on: a dense row for scanning that
   expands into a vertical form for editing. Editing several fields inline across
   a horizontal row is the thing every table-design guide warns against. */

export type ListingFlag = {
  /* "attention" is the only thing in this component that carries colour. Every
     other signal is neutral. Too many coloured badges and none of them mean
     anything - the eye needs exactly one place to land. */
  tone: "attention" | "note";
  label: string;
};

export type ListingRow = {
  key: string;
  thumb?: string;
  /* The one line under "Listing N of M": the title, the description, the
     category - whatever this panel is asking her to judge. */
  summary: string;
  /* Right-aligned counter: "125/140", "9 photos", "6/8 fields". */
  meta?: string;
  flags?: ListingFlag[];
  /* Revealed on expand. This is the panel's existing editor, unchanged. */
  detail: ReactNode;
};

export default function ListingRows({
  rows,
  defaultOpen = false,
  singleOpen = false,
  readyLabel = "Ready",
  noun = "listing",
}: {
  rows: ListingRow[];
  /* D553 · Photo panels pass defaultOpen. Her words on the version that made her
     choose a listing before she could drag a photo: "so fucking stupid". She was
     right - dragging is direct manipulation and has to be open. Reading a title
     is scanning, and scanning wants density. The job decides, not the component. */
  defaultOpen?: boolean;
  singleOpen?: boolean;
  readyLabel?: string;
  noun?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(defaultOpen ? (singleOpen ? rows.slice(0, 1).map(row => row.key) : rows.map(row => row.key)) : []),
  );

  const flagged = useMemo(
    () => rows.filter(row => (row.flags || []).some(flag => flag.tone === "attention")),
    [rows],
  );
  const allOpen = rows.length > 0 && rows.every(row => open.has(row.key));

  const toggle = (key: string) =>
    setOpen(current => {
      if (singleOpen) return current.has(key) ? new Set() : new Set([key]);
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /* D1071 · Moving to another listing is navigation, not merely a state swap.
     The old pagination opened the next card while leaving the viewport at the
     bottom of the previous one, so the seller arrived at the bottom of the new
     workspace. Open it first, then move the actual workflow viewport to that
     listing's header after React has committed the new card. */
  const openListing = (index: number) => {
    const row = rows[index];
    if (!row) return;
    setOpen(new Set([row.key]));
    if (typeof window !== "undefined")
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() =>
          document
            .querySelector(`[data-listing-row="${CSS.escape(row.key)}"]`)
            ?.scrollIntoView({ block: "start" }),
        ),
      );
  };

  if (!rows.length) return null;

  return (
    /* D690 · Panels that open by default are working surfaces - the photo picker
       needs its width. The indent that aligns a text field with the summary
       column above it costs 179px, which squeezed the picker to two tiles a row.
       Text panels keep the alignment; work surfaces get the width. */
    <div className={`listing-rows${defaultOpen ? " is-worksurface" : ""}`}>
      {rows.length>1&&<div className="listing-rows-bar">
        <div className="listing-rows-summary">
          <b>{rows.length} {rows.length === 1 ? noun : `${noun}s`}</b>
          {flagged.length > 0 && (
            <span className="listing-rows-attention">{flagged.length} {flagged.length === 1 ? "needs" : "need"} attention</span>
          )}
          <span className="listing-rows-rest">
            · {rows.length - flagged.length} {readyLabel.toLowerCase()}
          </span>
        </div>
        {!singleOpen && <div className="listing-rows-actions">
          {/* Expand all changes the VIEW. It is not an action on her listings, so
              it does not get to look like one. */}
          <button
            type="button"
            className="listing-rows-view"
            onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map(row => row.key)))}
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
          {flagged.length > 0 && (
            <button
              type="button"
              className="listing-rows-jump"
              onClick={() => {
                const first = flagged[0];
                setOpen(new Set([first.key]));
                if (typeof document !== "undefined")
                  document
                    .querySelector(`[data-listing-row="${CSS.escape(first.key)}"]`)
                    ?.scrollIntoView({ block: "center" });
              }}
            >
              Review {flagged.length} flagged
            </button>
          )}
        </div>}
      </div>}

      {rows.map((row, index) => {
        const flags = row.flags || [];
        const isOpen = open.has(row.key);
        const needsAttention = flags.some(flag => flag.tone === "attention");
        return (
          <article
            key={row.key}
            className={`listing-card${needsAttention ? " is-flagged" : ""}${isOpen ? " is-open" : ""}`}
          >
            <div
              className="listing-card-head"
              data-listing-row={row.key}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggle(row.key)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(row.key);
                }
              }}
            >
              <span className="listing-card-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              {row.thumb
                ? <img className="listing-card-thumb" src={row.thumb} alt="" decoding="async"/>
                : <span className="listing-card-thumb"/>}
              <span className="listing-card-ident">
                {/* Said plainly, where the eye lands first. Before this, one
                    listing was told apart from the next only by a heading that
                    read as a filename. */}
                <span className="listing-card-index">Listing {index + 1} of {rows.length}</span>
                <span className="listing-card-summary">{row.summary}</span>
              </span>
              <span className="listing-card-flags">
                {flags.length
                  ? flags.map(flag => (
                      <span
                        key={flag.label}
                        className={`listing-flag${flag.tone === "attention" ? " is-attention" : ""}`}
                      >
                        {flag.label}
                      </span>
                    ))
                  : <span className="listing-flag">{readyLabel}</span>}
              </span>
              {row.meta ? <span className="listing-card-meta">{row.meta}</span> : <span/>}
            </div>
            {/* Indented to the summary column, on a darker surface than any closed
                card, so it reads as inside this listing rather than as the next
                one starting. Indentation alone was not enough separation. */}
            {isOpen && <div className="listing-card-detail">
              {row.detail}
              {/* D705 · An open listing is taller than the screen, so the only
                  control that closed it - its head - was always somewhere above
                  the viewport. Her words: "not have to go all the way to the top
                  to click it." Two changes, because the problem has two halves:
                  the head is now sticky so it is reachable at any scroll depth,
                  and this bar closes the listing from where reading actually
                  ends. Clicking the body itself is deliberately NOT a close -
                  the body is a form, and a stray click while editing a title
                  must never throw the panel shut. */}
              {singleOpen ? <div className="listing-card-pagination">
                <button type="button" disabled={index === 0} onClick={() => openListing(index - 1)}>← Previous listing</button>
                <b>Listing {index + 1} of {rows.length}</b>
                <button type="button" disabled={index === rows.length - 1} onClick={() => openListing(index + 1)}>Next listing →</button>
              </div> : <button type="button" className="listing-card-done" onClick={() => toggle(row.key)}>
                  Close listing {index + 1}
                </button>}
            </div>}
          </article>
        );
      })}
    </div>
  );
}
