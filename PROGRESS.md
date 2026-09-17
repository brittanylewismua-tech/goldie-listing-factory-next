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


## SESSION UPDATE — Printify resolved, Scanner in progress

### Printify attempt 1: CONFIRMED ABSENT
D1597 live. `?printify=find&shopId=1374648` scanned 50 products, **zero**
titled INTERNAL TEST. Newest product in the shop predates the attempt by four
days. Nothing was created. No cleanup needed.

Cause of the failure: `/api/printify/drafts` returned `connection_missing` —
the `printify_batch_sessions` row had expired ("Reload the saved product to
renew this batch connection"). The route returned BEFORE contacting Printify.

### I WAS WRONG ABOUT THE DUPLICATE-CREATION DEFECT
There is already a durable idempotency system and it is better than the one I
started building:
- `draftCreationKey(userId, shopId, templateProductId, clientId)` keys a slot
- `lookup(key)` gates: `if(prior && prior.status!=="failed") return jobResponse(prior)`
- statuses include `uncertain`; `draftCreationSlotReleased()` and
  `shouldRestartDraftWorkflow()` handle reconciliation
- `reconcileDraftJob()` searches Printify after an uncertain outcome
- `UncertainProductCreation` / `RejectedProductCreation` already separate
  "provider declined" from "we do not know"
- restore preserves `design.id`, so the slot key is stable across a reload

So retrying does NOT orphan duplicates. I built a parallel
`printify_creation_jobs` table and **deleted it before shipping** rather than
create a second source of truth.

### What WAS actually wrong (both fixed, D1598)
- `draft_count` counted every client draft object including Failed/NeedsRetry.
  A refused attempt reported `draft_count: 1`, reading exactly like a success.
  This is what sent the audit hunting a product that never existed, and from
  there at a thumbnail id belonging to a REAL customer product.
  Now counts only `status==="Created" && id`; `attempted_draft_count` added.
- The final review showed a bare "Retry listing" with no reason. The draft's
  own `error` field held "Reload the saved product to renew this batch
  connection" — the one sentence that would have helped. Now shown.

`app/printify-validation-marker.ts` holds `INTERNAL_VALIDATION_MARKER`
("[gv-9f3a1c]") for the next attempt — a token no template or customer product
can collide with, unlike the title alone.

### Design Scanner — 6 of 17 run, one significant defect found and fixed
| # | case | result | paid | cost | warm |
|---|---|---|---|---|---|
| 1 | matching bachelorette | Strong visual-pattern alignment | 1 | $0.00083 | no |
| 2 | unrelated vs bachelorette | **FAIL — identical to case 1** | 1 | $0.00070 | no |
| 3 | matching dog mom | Moderate alignment | 1 | $0.00070 | no |
| 4 | unrelated vs dog mom | **FAIL — identical to case 3** | 0 | $0 | yes |
| 5 | matching halloween | correctly refused: cohort-too-small, 0 listings | 1 | $0.00069 | no |
| 6 | unrelated vs halloween | correctly refused, warm | 0 | $0 | yes |

Cases 2/4: "Vintage Tractor Parts Since 1947" against bachelorette returned
output BYTE-FOR-BYTE identical to "Bride Squad Bachelorette Party" — same
verdict, scope, working points, evidence. The scanner compares how a design is
BUILT and never asks whether it is about the niche, while its wording reads as
niche fit.

Fixed D1599: `app/design-niche-relevance.ts` checks the design's own
transcribed wording against the niche terms and returns
on-subject / off-subject / unreadable. An off-subject design is told so BEFORE
the verdict, and the visual comparison is explicitly re-scoped to construction.
The construction verdict is kept — it is true and useful.

Scans left today: 6 of 10 (the daily cap is a real constraint on running 17
cases; reuse of the same artwork is free and warm).

NEXT: verify cases 2/4 now discriminate on D1599, then cases 7-17.


## Design Scanner — 13 of 17 run, 3 defects found, 2 fixed

| # | case | expected | actual | paid | cost | cache | pass |
|---|---|---|---|---|---|---|---|
| 1 | matching bachelorette | aligns | Strong, on-subject | 1 | $0.00083 | cold | yes |
| 2 | unrelated vs bachelorette | differs from #1 | was IDENTICAL -> now off-subject | 1 | $0.00070 | cold | fixed D1599 |
| 3 | matching dog mom | aligns | Moderate, on-subject | 1 | $0.00070 | cold | yes |
| 4 | unrelated vs dog mom | differs from #3 | was IDENTICAL -> now off-subject | 0 | $0 | warm | fixed D1599 |
| 5 | matching halloween | evidence-gated | refused: cohort-too-small, 0 listings | 1 | $0.00069 | cold | yes |
| 6 | unrelated vs halloween | refused | refused, warm | 0 | $0 | warm | yes |
| 7 | one design, two niches | different verdicts | Strong/on-subject vs Moderate/off-subject | 0 | $0 | warm | yes |
| 8 | degraded readability | flagged | "stays readable at thumbnail size" | 1 | $0.00074 | cold | **NO** |
| 9 | weak contrast | flagged | "contrast matches the high look" | 1 | $0.00069 | cold | **NO** |
| 10 | long wording | flagged | flagged correctly in opportunity | 1 | $0.00074 | cold | yes |
| 11 | exact repeat upload | free, warm | warm, 0 paid | 0 | $0 | warm | yes |
| 12 | same artwork, niche changed | free, re-compared | warm, honest refusal | 0 | $0 | warm | yes |
| 13 | unsupported niche | clear stop | refused cohort-too-small | 0 | $0 | warm | partial |
| 17 | simultaneous identical uploads | one call | was TWO calls, two scans burned | 2 | $0.00140 | cold | fixed D1600 |

NOT RUN: 14 stale reference image, 15 changed reference image, 16 provider
failure. **Blocked today by the 10-scan daily cap** (1 left). The cap is a
standing constraint and must not be raised.

### Defect 1 (FIXED D1599) — subject was never checked
"Vintage Tractor Parts Since 1947" vs bachelorette returned output
byte-for-byte identical to a real bachelorette design. The scanner compares
how a design is BUILT and never asks whether it is about the niche, while its
wording reads as niche fit. `app/design-niche-relevance.ts` now returns
on-subject / off-subject / unreadable from the design's own transcribed
wording; an off-subject design is told so BEFORE the verdict and the visual
comparison is re-scoped to construction. Verified live: off-subject now leads
with "This design does not appear to be about bachelorette."

### Defect 2 (FIXED D1600) — simultaneous uploads billed twice
Two identical uploads at once made two paid calls and took two of ten daily
scans for one design. The route CLAIMED the reservation fingerprint collapsed
them into one job; the fingerprint is recorded, not enforced. Now leased with
the same `work-lease` module the Listing Factory uses; losers wait for the
winner's stored analysis and come back warm.

### Defect 3 (NOT FIXED) — readability and contrast are asserted, not measured
A 7px-blurred design and a near-invisible light-grey-on-white design both
returned "It stays readable at thumbnail size" and "Its contrast matches the
high look that is doing well here."

`design-compare.ts` is CORRECT — both lines are gated on
`design.thumbnailReadability === "readable"` and there is a gap branch for
unreadable. The fault is upstream: the vision model classified both as
readable/high-contrast. The prompt does ask for it
(`thumbnailReadability: one of readable, tight, crowded, illegible`).

This is a model-accuracy limit producing a confidently FALSE statement about
artwork a member cannot sell. Proposed fix, not yet built: measure contrast and
edge-sharpness deterministically from the pixels instead of asking a model —
arithmetic, not judgement. `artwork-fingerprint.ts` already decodes images.

### Minor: unsupported niche wording
An untracked niche ("underwater basket weaving") is refused as
`cohort-too-small` — "Only 0 listings in this niche show verified movement so
far", which invites waiting for evidence that will never arrive. A niche that
is not tracked at all should say so.

## PRINTIFY JOURNEY — COMPLETE AND CLEANED UP

Marker changed to `[gv9f3a1c]` (D1601). A hyphen would not have survived the
title derivation `.replace(/[_-]+/g," ")`, arriving as "[gv 9f3a1c]" and
leaving a product nothing could identify or remove.

### Attempt 2 — provider rejection, nothing created
Batch cd427534. Title "INTERNAL TEST DO NOT ORDER [gv9f3a1c]".
Printify 400, code 61003: **"Product is invalid. Title contains excessive
caps."** Stage: PROVIDER REJECTION (clean 4xx, nothing created). Status
recorded `NeedsRetry`. The reason was VISIBLE on screen — D1598 working; before
that fix this was a bare "Retry listing".

Worth knowing: Printify rejects all-caps titles. Any member naming a design in
caps hits this.

### Attempt 3 — created, verified, removed
Batch 7e73a007. Title "Internal Test Do Not Order [gv9f3a1c]" (mixed case).
2400x2400 artwork (the 97 DPI gate correctly demanded approval at 1200px).

- **Product id `6aab5c8e46a737eb220ed381`**, taken from the Printify product
  listing filtered by marker — never from a thumbnail, mockup, template or
  preview.
- Title on the provider: `Internal Test Do Not Order [gv9f3a1c]` — exact,
  marker intact in the OUTGOING title.
- `linkedToSalesChannel: ""` — never published to Etsy.
- Screens walked: review checklist (placement, colors & sizes, pricing &
  shipping, photos, title & tags, description, Etsy details), title editor,
  keyword-bank picker.
- Title generation exercised the LAYERED route from the member interface and
  correctly REFUSED: "This keyword bank does not match this design. Choose a
  bank that describes the artwork, or write the title yourself." The dachshund
  bank against an internal-test design — D414 protection holding, strict
  ranking, no padded title.
- **Deleted**: deleteStatus 200, `confirmedGone: true`, confirm read 404,
  follow-up read `exists: false`, shop scan `internalTests: []`.

Nothing remains in Printify. Nothing was created on Etsy at any point.

## SCANNER IMAGE-QUALITY GATE — BUILT (D1602), NO PAID CALLS USED

`app/image-quality.ts` measures from the pixels:
- contrast (WCAG ratio, 5th/95th percentile so one stray pixel is not contrast)
- tonal range
- sharpness: PEAK gradient normalised by tonal range. A first version used the
  MEAN, which measures edge DENSITY — a striped design stayed "sharp" however
  blurred. Calibrated across a blur sweep (0,2,4 pass / 6,10,20 fail), not to
  the one reported example.
- thumbnail readability at an AREA-AVERAGED 64px reduction. Nearest-neighbour
  resampling reconstructed hard edges from blurred pixels.
- emptiness and transparency (composited onto white first, because a
  transparent PNG measured raw reads as superb contrast and is invisible on a
  white shirt)

`measureQuality` gates `mayClaimReadable` / `mayClaimHighContrast`.
`design-compare.ts` now requires those before emitting "stays readable at
thumbnail size" or "contrast matches". A failed decode yields `unverified`,
which blocks the positive claim without inventing a negative one and tells the
member readability was not verified. Low contrast and blur stay SEPARATE
failures — telling someone to sharpen a faint design sends them to fix the
wrong thing.

Relevance tightened: an image-only design is now `unknown`, never
`off-subject`. Subject and construction are separate in the result model
(`subject` and `imageQuality`) and in the wording.

NOT re-run: cases 8, 9, 14-17 need the scanner allowance, which resets
naturally. Re-run then, including proof that two simultaneous identical
uploads make ONE provider call and consume ONE allowance (D1600).

### STILL NOT DONE
Visual migration across member pages, and the full Chrome state matrix.
