# Deletion audit

A permanent record of anything removed from the live product outside a
member's own ordinary use: what it was, how it was identified, what proved it
safe to remove, who authorised it, and what was checked afterwards.

---

## 2026-09-19 — batch "canary design"

**Authorised by** the account owner, in writing, for this one artifact:
> "You are authorized to delete the exact `canary design` artifact created on
> 2026-09-17 at 00:11:16Z, provided you resolve and verify its exact
> member-scoped batch and storage identifiers first."

### What it was

| Identifier | Value |
|---|---|
| Batch id | `261bde4d-f474-461a-ac12-91f7375aca77` |
| Member | `supabase:23df14e8-2194-4069-8489-002315a2b0aa` |
| Created | 2026-09-17 00:11:16Z · updated 00:38:36Z · revision 6 |
| Status | `draft`, step `designs`, `finishPhase: details` — never completed |
| Design | `canary-design.png`, 4500×5400, content hash `0720e990772a0e9df9fb7585a999cb1d1cfbef501f3fe7da315ef8af982b8739` |
| Uploaded original | **not retained** (`originalUnavailable: true`, 0 artwork versions) |
| Printify products | **none** — 0 drafts, 0 attempted |
| Etsy listing / order / sales channel | none |
| Child batches | none |
| Parent batch | none |
| Template snapshot | `batch-templates/supabase%3A23df14e8-2194-4069-8489-002315a2b0aa/e00e392bd659f670dac9590f0595d6a1f1af50ed323ea4958ad745b663850830.json.gz` |
| Snapshot shared with | **nothing** (`sharedWith: []`) — exclusive to this batch |

Resolved before deletion through the owner-only read at
`GET /api/batches?storage=<id>`, which reports a batch's stored objects and,
for each, whether any other batch references it.

### Why it was removed

It is internal validation residue, and a validation log names it. Commit
`968ac97d`, authored 2026-09-16 17:16:01 −0700 (**2026-09-17 00:16:01Z**, five
minutes after the batch was created and inside its editing window), records in
`PROGRESS.md`:

> Chrome walkthrough so far (real interface, canary account): product
> selection, artwork upload (4500x5400 PNG accepted), batch saved to Batch
> History, Designs step reached — all working.

and the blocker that explains why it stops exactly where it stops:

> The Review step is gated behind creating a Printify draft, and this
> instruction says create no listing or draft — so the walkthrough cannot
> continue past Designs on a NEW batch.

A 4500×5400 upload, a batch saved to history, the Designs step reached and
nothing beyond it. The surrounding commits in that window (`8ff8a413`,
`01134e41`, `9f0693f7`, `a9ffacaa`) are all driving the Listing Factory member
route. "canary" is this repository's own word for a synthetic probe —
`app/api/listing-factory/canary/route.ts`.

### What was done

1. `DELETE /api/batches?id=261bde4d-…` — the ordinary guarded member path.
   Answered `{"deleted": true}`.
2. `DELETE /api/batches?orphanTemplate=<key>` — owner-only, refuses any key
   outside the member's own prefix, refuses any object still referenced by a
   remaining batch, and confirms removal by reading the object back.

### What was verified afterwards

| Check | Result |
|---|---|
| The batch | `GET /api/batches?id=…` → **404**, `GET ?storage=…` → `found: false` |
| Neighbouring batches | all 20 in the member's history load **200**; nothing else disappeared |
| Nothing created | the row that newly appeared in the 20-row page is `3603c7b0-…`, created 2026-09-09, untouched — it moved into view when the deleted row left |
| Shop totals | listings 293 · active 83 · orders 3,737 · revenue 9,232,421 · reviews 607 — **identical before and after** |
| Accounting | drafts 200 · mockup sets 9 · publishedToday 0 · publishing 0 — **identical before and after** |
| Printify | no product existed, none was touched |
| Etsy | no listing existed, no Etsy call was made |

### What was deliberately NOT touched

`case test salt air` and `mug test salt air` — two batches and their two
Printify products (`6aa6ec20db331ebb600105d4`, `6aa6ec823e2aec0edc08b732` in
shop 1374648). Their origin cannot be proven: no commit on 2026-09-13 touches
the Listing Factory or Printify, and no progress file, defect log or validation
note in the repository's history mentions them. They remain protected member
data, and this product does not claim zero test residue while they do.
