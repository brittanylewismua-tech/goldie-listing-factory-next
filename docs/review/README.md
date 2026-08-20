# START HERE

Single entry point for the Listing Factory review. Status below was verified
against the code on `main`, not assumed.

**Note on file paths:** older documents in this folder reference `app/page.tsx`.
That file was split in commit `31501ac` ("Separate Listing Factory app from route
modules") and the workflow now lives in **`app/listing-factory-app.tsx`**
(~215 KB). Read any `page.tsx` reference as that file.

---

## Already shipped — verified present in the code, do not rebuild

| Change | Where |
|---|---|
| Title generator: product-type rule (no koozie phrases on a tee) | `api/listing-intelligence/route.ts` |
| Title generator: asks for 8–13 phrases to fill the 140-char title | same |
| Title generator: silent alphabetical fallback replaced with a real error | same |
| Step rail: 5 steps with the four Finish phases nested | `listing-factory-app.tsx` |
| Both step counters agree (rail and the subtitle under the H1) | same |
| Plain-language print copy (no "transparent padding detected") | same |
| Shipping shortfall warning on Pricing | same |
| Plan quota shown on the upload step | same |
| Design thumbnails, filenames and Remove on the upload step | same |
| Scroll resets on step change | same |
| `etsyDefaults` field on `Recipe` (type only — not yet wired) | `factory-tools.tsx` |
| Rail sub-step styling | `clarity-pass.css` |

---

## Open — in priority order

### 1. Blocking
- **S0.1 — no forward button once a batch has drafts.** Verified on Pricing and
  Designs: the only controls are help icons, Edit, and Back. Every step becomes a
  dead end on a finished batch. → `SCREEN-AUDIT.md`

### 2. Correctness
- `UX-DIRECTION.md` **Part A** — A2 through A9 (the whole-number checkbox
  detached from the prices it changes, "✓ Approved" before anything is approved,
  duplicated headings, the summary repeating figures reconciled above it).
- **Photo validation no longer names the listings.** The old `, .` bug is gone —
  the message is now "2 listings need at least one photo" — but at 20 designs you
  still can't tell which two. → `SCREEN-AUDIT.md` S3

### 3. The pre-fill work — the biggest change in how it feels
- `UX-DIRECTION.md` **Part B** (B1, B1a, B2, B3) with **Part C** answered first.
  Part C is not optional: without B1a, generate-on-arrival overwrites hand-edited
  titles on revisit.

### 4. Structure
- `PRODUCT-MODEL.md` — one saved product, no "recipe" or "template" in the UI.
  Colours and mockups expanded on the batch screen, the other seven settings
  collapsed behind one summary row.
- `ROWS-SPEC.md` — rows instead of stacked cards. Must ship alongside the
  pre-fill work, not before it.
- `STRUCTURAL.md` — per-listing publishing, and the observation that only two of
  eleven questions are real for a returning seller.

### 5. Strategic
- `BUNDLES.md` — one design into several listings. The one strategic item
  Brittany validated. Quota maths first: 20 designs × 3 products = 60 listings.

---

## Reading order

1. **`README.md`** ← you are here
2. **`SCREEN-AUDIT.md`** — every screen walked, findings S0.1–S5.5
3. **`UX-DIRECTION.md`** — Part A defects, Part B pre-fill, Part C edge cases
4. **`PRODUCT-MODEL.md`** — how the saved product works
5. **`ROWS-SPEC.md`** — the review table
6. **`BUNDLES.md`** — the multiplier
7. **`STRUCTURAL.md`** — the shape of the tool
8. `FULL-UX-REVIEW.md` — the original walkthrough, evidence for everything above
9. `BACKLOG.md` — superseded by the docs above; kept for the items not restated
10. `THE-BIG-IDEA.md` — **has a correction banner. Most of it was rejected.**
11. `CHANGES-APPLIED.md`, `STACK-NOTES.md` — history

---

## Rules for whoever builds this

- **Build one item at a time, push, and stop for review.** Do not batch.
- **Answer the `UX-DIRECTION.md` Part C entry before building its Part B item.**
- **Run the build and tests before every push.** Three test assertions have
  already broken from renames, twice.
- **`known-good-2026-08-20` is a tag on GitHub.** Do not move or delete it. It is
  the restore point.
- **Watch for regressions during refactors.** The `31501ac` refactor dropped a
  fix that had already shipped. Re-verify shipped items after any structural
  change.
