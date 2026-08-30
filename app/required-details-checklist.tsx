"use client";

/* D730 · The prototype's .goldie-checklist beside the form (source:
   goldie-ux-preview-site @ aad9208, peach-glass). Measured:

     .goldie-listing-grid  grid 1.15fr .85fr, gap 14
     .goldie-checklist     grid, gap 8
     .goldie-check         flex, space-between, centred, 12px,
                           1px #eee9ec bottom rule, padding 8 0

   Production states the same fact as one line of summary text - "2 of 5
   required set" - which names a number but not which two. The checklist names
   them, so the thing still to do is readable without opening the fields.

   Presentational. The caller passes the properties it already holds; nothing
   here decides what is required or what counts as set. */

export type ChecklistItem = { key: string; label: string; value: string; required: boolean };

export default function RequiredDetailsChecklist({ items }: { items: ChecklistItem[] }) {
  if (!items.length) return null;
  return (
    <aside className="factory-form-card factory-checklist-card">
      <h3>What Etsy needs</h3>
      <div className="factory-checklist">
        {items.map(item => (
          <div className="factory-check" key={item.key}>
            <span>{item.label}{item.required ? "" : " (optional)"}</span>
            <b className={item.value.trim() ? "is-set" : "is-missing"}>
              {item.value.trim() ? item.value.trim() : item.required ? "Needed" : "—"}
            </b>
          </div>
        ))}
      </div>
    </aside>
  );
}
