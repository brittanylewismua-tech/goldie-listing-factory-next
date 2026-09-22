"use client";
/* ============================================================================
 * SEARCH, WHICH HAD TO BE REAL OR NOT BE THERE.
 *
 * The approved design puts a search field in the top bar. A search field that
 * opens nothing is worse than no search field: it is a promise the product
 * does not keep, and every member who types into it learns something untrue
 * about how much the software knows.
 *
 * So this one actually resolves. It searches the two things the shell can
 * answer for without inventing an index: every page and tool in the
 * navigation, and the member's own saved batches, which are fetched once, on
 * the first open, and not before - nothing is spent on a field nobody used.
 *
 * The placeholder says what it searches rather than "anything", for the same
 * reason. It finds pages, tools and batches, and those are the words on it.
 * ==========================================================================*/
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SuiteNavItem } from "./suite-sidebar-nav";
import { readBatchHistory } from "./batch-history-read";

type Hit = { key: string; label: string; note: string; href: string };

type BatchRow = { id?: string; batchId?: string; name?: string; title?: string; status?: string };

function batchHits(rows: BatchRow[]): Hit[] {
  return rows.flatMap(row => {
    const id = row.batchId || row.id;
    const label = row.name || row.title;
    if (!id || !label) return [];
    return [{ key: `batch:${id}`, label, note: row.status ? `Batch · ${row.status}` : "Batch", href: `/batches?open=${encodeURIComponent(id)}` }];
  });
}

/* Ranked, not just filtered: a member typing "mock" wants Mockup Sets first
   and a batch called "spring mockups" second. Prefix beats word-start beats
   anywhere, and pages beat batches at equal strength. */
function score(label: string, query: string) {
  const haystack = label.toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) return 0;
  if (haystack.startsWith(needle)) return 3;
  if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack)) return 2;
  return haystack.includes(needle) ? 1 : 0;
}

export default function SuiteSearch({ items }: { items: SuiteNavItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [batches, setBatches] = useState<Hit[]>([]);
  const [batchesRead, setBatchesRead] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  const pages: Hit[] = items.map(item => ({
    key: `page:${item.key}`, label: item.label, note: "Page", href: item.href,
  }));

  const show = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(current => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    if (batchesRead) return;
    setBatchesRead(true);
    /* A failed history read is not an error the search box should report: the
       pages still resolve, and Batch History itself says why when opened. */
    void readBatchHistory<BatchRow>().then(result => setBatches(batchHits(result.batches || [])))
      .catch(() => undefined);
  }, [open, batchesRead]);

  const hits = [...pages, ...batches]
    .map(hit => ({ hit, rank: score(hit.label, query) + (hit.key.startsWith("page:") ? 0.5 : 0) }))
    .filter(entry => !query || entry.rank > 0.5)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 8)
    .map(entry => entry.hit);

  const go = (hit: Hit | undefined) => { if (hit) window.location.href = hit.href; };

  /*
    THE PANEL IS PORTALLED, AND IT HAS TO BE.

    .factory-top carries backdrop-filter, and an element with a backdrop-filter
    becomes the containing block for every fixed-position descendant. Rendered
    in place, this dialog's `position:fixed; inset:0` resolved against the top
    bar instead of the viewport: the overlay was a 72px strip across the top of
    the page and the panel inside it was a few pixels tall with the field
    invisible. Typing went into a box nobody could see.

    Portalling to the body puts it back in the viewport's coordinate space. It
    is mounted only after the component has, because document does not exist
    while the server renders this.
  */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panel = open ? <div className="suite-search-backdrop" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <div className="suite-search-panel" role="dialog" aria-modal="true" aria-label="Search">
      <div className="suite-search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input ref={field} type="search" value={query} placeholder="Search pages, tools and batches"
          aria-label="Search pages, tools and batches"
          onChange={event => { setQuery(event.target.value); setCursor(0); }}
          onKeyDown={event => {
            if (event.key === "ArrowDown") { event.preventDefault(); setCursor(index => Math.min(index + 1, hits.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setCursor(index => Math.max(index - 1, 0)); }
            if (event.key === "Enter") { event.preventDefault(); go(hits[cursor]); }
          }} />
      </div>
      <div className="suite-search-hits" role="listbox">
        {hits.map((hit, index) => <a key={hit.key} role="option" aria-selected={index === cursor}
          className={index === cursor ? "current" : undefined} href={hit.href}
          onMouseEnter={() => setCursor(index)}>
          <b>{hit.label}</b><small>{hit.note}</small></a>)}
        {hits.length === 0 && <p className="suite-search-empty">
          Nothing here matches that. Search finds pages, tools and your saved batches.</p>}
      </div>
    </div>
  </div> : null;

  return <div className="suite-search">
    <button type="button" className="suite-search-trigger" onClick={show}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <span>Search pages, tools and batches</span>
      <kbd aria-hidden="true">&#8984; K</kbd>
    </button>

    {mounted && panel && createPortal(panel, document.body)}
  </div>;
}
