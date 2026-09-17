# Beta-readiness milestone — running state

Kept in the repo so a new session can pick this up without re-deriving it.
Update it as sections land. It records what is PROVEN, not what is intended.

## Build / test state
- Build marker: D1590. Tests 3,080 passing, 0 failing.
- Canary: `listingFactoryLayeredFlow` ON for the owner account only, globally OFF.
- Checkout disabled. Nobody invited. No Etsy listing or draft created.

---

## 1. Layered flow — WIRED INTO THE MEMBER WORKFLOW (D1591-D1593)

`/api/listing-intelligence` — the route the Listing Factory workflow itself
calls twice per listing — now branches on the canary. No owner-only route
involved. Measured through that member route, in production:

| Member-route run | Paid calls | Billed |
|---|---|---|
| Cold (tee) | 1 vision + 1 copy | $0.00149 |
| Identical warm repeat | 0 | $0 |
| Same family, other product | 0 | $0 |
| New family (mug) | 1 copy only | $0.00016 |
| Title mode, design known | **0** | $0 |
| Two simultaneous, same artwork | **1 vision total** | $0.0005 |
| Unsupported blueprint | 0 | $0, no guessed category |

The title stopped being a paid call at all: the legacy path made a fresh
uncached vision call every time a title was requested.

Fixed along the way:
- D1592 — the member route hashed the image, the canary route used the stored
  provenance hash: one design, two cache keys, two charges. One module now.
- D1593 — a model's refusal ("none", "n/a", "no occasion cues") is dropped
  where the answer is parsed, not where it is printed.
- Strict bank ranking on the layered path: a phrase appears only if it shares
  a stem with the design. No bank-order padding (D544/D414 stay honoured).

Chrome walkthrough so far (real interface, canary account):
- product selection, artwork upload (4500x5400 PNG accepted), batch saved to
  Batch History, Designs step reached — all working.
- final review screen reached on an existing completed batch: per-listing
  checklist in plain language, no internal IDs, no provider or cache
  terminology, correct shop named. Reads well enough to catch a bad listing.

BLOCKER 2 IS FIXED (D1594). Original text kept below for the record.

TWO BLOCKERS FOUND:
1. The Review step is gated behind creating a Printify draft, and this
   instruction says create no listing or draft — so the walkthrough cannot
   continue past Designs on a NEW batch without that decision being made.
2. "Reload saved batch here" DOES NOTHING when clicked. The batch-held-by-
   another-tab notice offers it as the only way to take over, so a member in
   that state is stuck with saving paused and no way out.
   Likely cause, NOT yet confirmed: `confirmAction` in confirm-dialog.tsx
   returns `Promise.resolve(false)` when its module-level `announce` is unset,
   which happens if the workflow and the layout's `ConfirmHost` end up holding
   different instances of that module. Every confirm-guarded control would
   silently do nothing. Needs confirming before fixing — a wrong fix here
   could make destructive actions proceed WITHOUT a prompt, which is worse.

## 1b. Earlier canary-route measurements (kept for reference)

`/api/listing-factory/prepare` (canary-gated) runs the real layers and stops
before Etsy. Measured against production, real money:

| Run | Paid calls | Billed |
|---|---|---|
| Cold, seven blueprints | 2 | $0.002191 |
| Identical warm repeat | 0 | $0 |
| Another product, existing family | 0 | $0 |
| One new family (tote) | 1 | $0.000183 |
| Unknown blueprint | stopped | $0 |
| Unbilled failure | 0 reached provider | $0, member refunded |
| Billed failure | 1 | $0.00049988 kept on ledger, member refunded |
| Two simultaneous, same artwork | 1 total | one charge |

Legacy would be 14. `categoryCalls: 0`. Ledger reconciles: vision $0.0028
across four calls including the failed one; copy $0.0011.

**STILL OPEN — this is what stops section 1 being complete:** the member's
actual Listing Factory workflow still calls the legacy
`/api/listing-intelligence` (two vision calls per listing, title call
uncached, no spend reservation). The orchestrator is reachable only from the
canary route. Wiring `listing-factory-app.tsx` to `ensureDesign` /
`ensureFamilyCopy` is the remaining work, plus the ten-step Chrome walkthrough.

## 2. Design Scanner — NOT STARTED
17 cases must run through the real route and interface, at 375/390/430.

## 3. Visual system — SHELL DONE, TOKENS NOT
- Shell unified: every feature wears the same rail, topbar, grid, footer.
- Measured debt: 5 palettes, 87 custom properties, 3,574 hardcoded hex
  literals, 354 of them gold/amber survivors (296 in five files:
  globals 128, theme 63, mockups 61, factory-tools 22, scene-editor 22).
- Token system, component unification and page migration NOT started.

## 4. Chrome states — NOT STARTED (25 enumerated states)

## 5. Shop Watch — DONE
Cards rewritten to state findings. Attention card now
"drawing 6.8× its share", with the denominator shown. Rejected and removed:
"N new reviews since yesterday" (bare arrival count). Favourites now need
>=5 or >=2% movement. Verified against listing 4543912444 — real, correct
shop, Etsy independently badges it Bestseller. `BRIEF_CARD_VERSION` added
because a wording change did not invalidate the cached brief.

## 6. Branding correction — DONE, verified in Chrome
Umbrella product has no name. Shared shell carries none.
- Rail: no wordmark on shared pages; Listing Factory lockup only on
  factory / batches / keywords. Home is NOT a Listing Factory page.
- Footer: "Powered by ..." removed from BOTH rails (the workflow's inline
  copy kept it one deploy longer — the two-rail drift again).
- Tab titles: every page names its own feature. Three were client components
  where `export const metadata` is silently ignored; fixed with route layouts.
- Manifest: no name, no icons. **Consequence: home-screen install is off**
  until there is a brand (Chrome needs 192+512 icons). Deliberate, reversible.
- Favicon references removed; asset files untouched.
- Member copy cleaned in Market Watch, Shop Map, costs, More, deletion,
  billing. Deletion phrase is now "DELETE MY DATA".
- Left alone on purpose: storage keys, event names, User-Agent strings,
  bucket bindings, the domain, and the asset files themselves.
- Guard: `tests/shared-shell-neutral.test.mjs`.

`NEUTRAL_FALLBACK_TITLE` in `app/shell-identity.ts` is the single place to
change when the name exists.

## 7. Background
- Trademark: 185,303 marks. 26 done / 3 skipped / 88 waiting. Daily files
  complete; no second HISTORICAL chunk since 2026-09-14 — USPTO 429 is the
  external blocker. Backoff added (D1574): escalating, capped under a daily
  reset, and the status now says "Stalled: USPTO is rate limiting" instead of
  reporting "88 waiting" while nothing moved.
- Market Watch: observation continues on semantics version 1. NOT reset.

## Traps already paid for — do not re-learn
- `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table. ALTER too.
- A test asserting an exact member string breaks on every copy change; assert
  the property, not the sentence.
- `export const metadata` does nothing in a `"use client"` page.
- An unpriced workload (`unitCost: 0`) is an UNCAPPED one: the ceiling check
  is `spent + unitCost > ceiling`.
- A cache keyed only on data is not invalidated by a change to wording.
- Two copies of anything drift: two rails, two `who_made` answers, two
  composition functions. One source, asserted by test.


## Confirmation controls — ROOT CAUSED AND FIXED (D1594)

Reproduced: the identical `confirmAction` call opened a dialog on Batch
History and silently returned false inside the Listing Factory workflow.
Reproducible, no console error, and only ONE confirm-dialog chunk on disk — so
not a missing host and not a duplicated file.

Cause: `announce` was a MODULE-LEVEL variable. `ConfirmHost` set it on mount;
`confirmAction` read it. That is a singleton only while every caller and the
host share one instance of the module, which nothing guarantees across route
chunks. D528 had already fixed one instance of this by moving the host into
the root layout; it came back because the mechanism was unchanged.

Worst part was the failure mode: `confirmAction` answered "the person said
no", so a guarded control became a button that does nothing. "Reload saved
batch here" is the ONLY exit from a paused batch, and it did nothing at all.

Fix: a request is now a `window` CustomEvent — one object per page, shared by
every module instance, chunk and React root by construction. A mounted host
claims the request synchronously inside the dispatch. If nothing claims it,
the action still does not run AND the person is shown a notice saying nothing
was changed, instead of watching a dead control.

Verified in Chrome on D1594:
- dialog visibly opens in the workflow (was dead)
- Cancel: dialog closes, lock still held, no reload — no action taken
- Confirm: page reloads once, lock cleared, lands on Review — action ran once
- Batch History delete: dialog opens; Cancel leaves the batch present
Tests: tests/confirmation-controls.test.mjs (8 cases).

## Printify deletion preflight (safeguard 1) — VERIFIED IN CODE, NOT YET RUN
Endpoint: DELETE https://api.printify.com/v1/shops/{shopId}/products/{id}.json
Proven in app/api/launch-check/listing.ts, which treats 404 as already-gone.
A purpose-built safeguarded cleanup already exists: `cleanupLaunchListings`
takes 1-8 exact owner-owned batch ids, verifies ownership, and cannot select a
customer product. That is the mechanism to use for the temporary draft.
Live token/permission check NOT yet performed.

## Printify validation journey — PERMISSION PROVEN, CLEANUP UNCONFIRMED

Resume here.

### Safeguard 1 — permission, verified before creating anything (D1595)
`GET /api/listing-factory/prepare?printify=preflight` (owner only):
- shops readable: yes. She's A Wolf Clothing = **1374648** (etsy).
  Others: 1325072 The Bohipstian, 20191756 GODISAGIRLAPPAREL,
  26761995 THE FIRE SHOP (shopify).
- delete probe: `DELETE /v1/shops/1374648/products/000000000000000000000000.json`
  answered **404** -> authorised to delete, nothing written.

### The attempt
Batch `6aa23db3-41de-4e90-9e9d-788f093c579e`, display name
"INTERNAL TEST DO NOT ORDER", product Gildan Tee / Unisex Heavy Cotton Tee,
one design uploaded (4500x5400). Clicked "Create 1 Printify draft" ONCE.

Goldie recorded a FAILURE. Four independent signals say no Printify product
was created:
1. `/api/batches?id=` -> no succeeded child, "failed" present.
2. batch `thumbnail_url` fell back to the TEMPLATE's preview image, which only
   happens when no draft has a previewUrl.
3. `launch-check` (requires a succeeded draft row) -> "does not belong to this
   account".
4. the only 24-hex id anywhere was `6a860ca48acd77c37807c14b`, which is the
   SOURCE TEMPLATE: title "Unisex Heavy Cotton Tee", linked to live Etsy
   listing 4558927057. NOT the created product.

**NOT YET CONFIRMED THROUGH PRINTIFY.** D1597 adds
`?printify=find&shopId=1374648`, which lists products whose title starts with
"INTERNAL TEST". Commit bd3ebffd is on the remote; the deploy had not produced
D1597 after ~14 minutes against a usual ~4. FIRST ACTION NEXT SESSION: wait for
D1597, run the find, and if an orphan exists delete it with
`?printify=delete&shopId=1374648&productId=<id>` and confirm `confirmedGone`.

### Removal path (D1596, live)
`?printify=read` / `?printify=delete` — owner only. Delete reads the product
first and REFUSES unless the title starts with "INTERNAL TEST", then confirms
by re-reading and reporting `confirmedGone`. This guard already earned itself:
it would have refused `6a860ca48acd77c37807c14b`, the real customer product I
briefly mistook for mine.

### New defects found (both unfixed)
- **Duplicate-creation risk.** After the failed creation, reopening the batch
  shows "Create 1 Printify draft" and "1 listing will be created" again, with
  no sign one was already attempted. A member retrying would create a second
  Printify product each time. `draft_count` counts client draft ENTRIES
  including failures, so it cannot be used to tell.
- **The batch thumbnail is the template's mockup URL**, which reads exactly
  like the created product's id. That is what nearly sent a delete at a real
  customer product.
