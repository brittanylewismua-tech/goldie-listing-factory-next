# Live acceptance log — September 5

## Production tested

D1110, commit 936f91547910000e0b1146c0558a7107b17be774. Chrome, authenticated owner account. Private QA only; no Etsy publishing.

Single: saved batch 25e9ca17-2675-436b-b917-719ff98a5845, Printify 6a9b6df2ee9655c6230653ab. Actual Gold alternate-file upload, lightweight rendering, real Printify preview, correct adjustment link, reset, rapid Select all / Clear all, template reset, price editing and approval, shipping search, 55-camera mockup expansion, modal close, photo-order arrows both ways, personalization toggle, final handoff exercised. Hover did not issue a save. Clear all remained empty after late responses.

New bundle: parent bf6a6cbe-259f-4aee-8612-1deae708adfe. Two real design uploads, hoodie + tee, four private drafts. All four creation requests returned 200, individually 4.95–5.94 seconds; first creation request to last creation response 15.34 seconds. This is not full click-to-finish latency or a concurrency capacity claim.

Hoodie drafts 6a9c36ad6f5981174605f660 / 6a9c36ad2525159670071e06. Tee drafts 6a9c36b72525159670071e0c / 6a9c36b6c8dc7ed3a507a6bc.

Natural alternate on Tee listing 1: real upload completed; only color override 552 recorded; original placement remained x .5000000000000003, y .3628168845310654, scale .6483702522638559, angle 0, front. Real Natural mockup visibly showed replacement Books artwork. Correct Printify draft opened. Use main design completed. Further reload/isolation verification remains required.

Bundle controls exercised: product switching; color Next Listing (heading top 99.7px); hoodie mockup selection/copy, uploaded product photo, native mouse drag left-to-right and right-to-left, size-guide upload, both product pricing approvals, whole-number pricing, bank bulk action, AI titles. The guide upload is a QA placeholder and must be removed after the removal control is deployed.

## D1111 corrections found by live use

- Hide old product task content while switching/restoring; no active editor flash under the wrong product.
- Add individually scoped size-guide removal and preserve explicit empty overrides.
- Serialize/coalesce photo-order writes; stale responses cannot revert newer local moves.
- Append new photos without silently replacing the current cover.
- Label photo-copy scope as this product's listings, not the entire bundle.
- Remove hidden paid title generation during bundle draft creation. The second product was unexpectedly using its saved bank before Step 3.
- Make explicit bundle-bank changes durable across children without editing global saved product defaults; report failed writes honestly.
- Align collapsed-product tag summary with the active product's 13-tag advisory threshold.
- Clear stale generation messages when switching products.

## Further live passes: D1111–D1114

- Removed the QA size guide from hoodie listing 2 and reloaded: no guide selected, uploaded photo preserved.
- Rapid photo-order arrows while an earlier save was pending survived reload in the exact final order.
- Bundle photo Next Listing opened the next header at 72.14px; title Next Listing at 179.59px. Color navigation was also checked earlier.
- Photo layout inspected at actual 1440px and 1024px CSS widths: no horizontal overflow or overlaps in that panel. This is not a whole-matrix responsive pass.
- Both bundle products reached Step 3 and final handoff. An advisory tag-count regression blocked progression and was corrected in D1112; fewer than 13 tags remain optional, not a blocker.
- Bulk bank selection persisted across child switching and reload. The tee saved-product default was restored to its original JANE AUSTEN TEE bank after QA; hoodie remained daschund. QA child banks remain CLAUDE TEST BANK.
- Personalization exercised text, required checkbox, second question, dropdown choices, file upload type, removal, and Off. It was left Off.
- Four-draft bundle saved in history as `QA D1112 — two designs hoodie and tee — DO NOT PUBLISH`.
- D1113 scopes cached Etsy category baselines by Printify product ID and promotes the ready headline. Cross-product live regeneration remains to be explicitly retested.

## Fresh phone-case run

Batch `51b32491-43c4-4d67-9d0d-7e4f375fa131`; private Printify draft `6a9c3de2dd664f915805b655`. Real Books/Wieners file upload; one draft successfully created. Creation latency was NOT captured because network recording was inactive for that request.

Printify's saved case template names its primary area `front` (not back). Saved template and created draft agree exactly: x .49999999999999983, y .5315457413249212, scale .6615462769154533, angle 0. Actual case mockup displays the uploaded design. Printify editor opens the correct draft and reports 477 DPI. No apparel-only color panel appears; variants are phone models.

Exercised placement checkbox and selected-draft opening; Clear all and Match Printify template models; pricing approval; shipping dropdown; all 21 available mockups; image enlargement and centered close button; photo-order arrows in both directions; manual title/tags; Phone Cases Etsy category; final ready headline; expanded final card; My Products handoff opens tab 1154574578 without publishing.

Live model reset exposed a shared color/size bug: runBounded returned no results, and successful provider saves then threw `Cannot read properties of undefined (reading map)`. D1114 returns input-ordered results with concurrency limits and regression tests. Exact Clear all / Match template path retested live successfully, PATCH 200, no false error; price approval then enables Next.

Live shipping dropdown exposed phone cases being classified as posters by an appended `print` surface hint. D1114 removes that invented noun, recognizes phone-case profiles, and bounds paper placement classification. Live dropdown now recommends only phone-case profiles, keeps the attached SPOKE profile, and puts posters in other profiles.

D1114 live version: `5412189d7c78c94d29142902093266e103cfe4d5`; Cloudflare `139892c1-0e5d-49e9-9fc9-bc7d1732aad5`; 1251 tests / 1239 pass / 12 skipped / 0 failures.

## D1115 live verification

Final-review Edit images reproduced an empty page. Corrected both shortcuts to target the exact draft, product, and editor; old mockups-phase bookmarks recover into the real photo step. A single listing no longer repeats the same expanded preview as another thumbnail. File-chooser cancellation uses the native cancel event. Explicit empty selections survive reload; legacy quality approval values are normalized. Full build: 1258 tests / 1246 pass / 12 skipped / 0 failures. Live `/api/version` confirmed D1115 / `8c356662181386c8db62c9d6ba2bfbdf1bfbeae6`, Cloudflare `784999ca-460b-463d-b6cb-b1491067be6f`.

Single phone-case Edit images and Edit title both retested successfully after reload. Bundle final review, while hoodie active: clicked the tee's second-listing Edit images; switched to tee, opened Listing 2 of 2, row top 72.01px. Case saved under `QA D1115 — Phone case — DO NOT PUBLISH`.

Further photo audit found the same product/variant/camera repeated under old and new title filenames. D1116 work in progress: canonical identity ignores title slugs, retains persisted index slots, hides duplicate picker entries, and copies selected views by variant/camera identity rather than assuming another draft has the same array ordering.

Bundle custom-name defect fixed in D1117: explicit saves rename the owned parent and children atomically; autosaves preserve that name. Live saved “QA D1117 — Hoodie and Tee — DO NOT PUBLISH”, verified matching History card, reopened it, switched to the tee, and verified the name stayed correct.

## Continued live pass: D1116–D1118

- D1116 deployed `9d2ced07e4d8fde265e68716f66d3365d8b961cb`; 1262 tests, 1250 passed, 12 skipped. Gallery deduplicates physical camera views without shifting persisted image indices. Live tee gallery reduced from 271 accumulated entries to 222 unique views, preserving selections 2/3/7 and order. Product-scoped copy exercised; hoodie count remained five photos. Selected-photo ZIP returned “Download ready”. Next listing opened Listing 2 at the top; screenshot inspected.
- Expanding all 222 views triggered transient image failures; a live Retry returned HTTP 200. D1117 adds viewport-based lazy loading with explicit 800×800 dimensions plus two bounded automatic retries; full live expanded-gallery retest still required.
- D1117 deployed `9ca7c9e62f0b490d256b7bc3db6dce123d8203ee`; 1271 tests, 1259 passed, 12 skipped. In-flight preview requests cannot open a different hovered color. A bundle product switch now retains the current editor phase. Live previously jumped from tee Listing details to hoodie final review; after deployment and reload, product switching retained Listing details. Batch-name fix verified as above.
- D1118 deployed `56c1ad24458b020448e7fa5dc748007bba36d41d`; 1273 tests, 1261 passed, 12 skipped. Live hoodie category change exposed stale enum IDs: displayed Long sleeve still carried Short sleeve’s Etsy value ID, reverting during category change. Product-fact restoration now updates both label and matching enum ID; category changes reapply supported physical facts. D1118 category live retest remains required.
- QA hoodie Listing 2 was manually changed to the gender-neutral adult Hoodies category via search and confirmation. Listing 1 still has the historical tee category from the old baseline bug; do not claim fresh cross-product category generation has been validated yet.
- A generated `worker-configuration.d.ts` is untracked, created to diagnose type checking. With runtime types present, type checking reveals remaining real and browser/worker ambient-type conflicts; `/private/tmp/goldie-type-audit-new.log`. It is not a passing typecheck and not included in the deployed commits.

## Still required (not a pass)

D1115 version and real shortcut retests, final alternate-artwork reset/reload/isolation checks, fresh mug and non-apparel bundle run, remaining narrow-layout/control matrix, complete error recovery. Existing durable creation/capacity rewrite remains unshipped in separate worktree. No 100/300/500-user production capacity claim. No claim every control is verified. Type audit additionally found missing Cloudflare type declarations and other existing type errors; full typecheck is not clean.
# D1119–D1120 follow-up

- D1119 live version: `039b5da773a60076240e0ade2e9c89edb93150e4`.
- Fresh mug batch `36fc69de-42f7-40cd-b28b-26214f736c0b` reached final review and My Products without publishing. Its creation POST returned 200 in 2.805406 seconds; that is endpoint time, not a capacity forecast. Cleared sizes survived reload, template reset restored 11oz, prices/shipping and manual titles/tags saved. Unsaved custom shipping changes were discarded.
- Reopening the mug after D1119 shows saved camera 10395 (Right) with the artwork, not Printify's default front angle. Saved QA name is present in Batch History.
- D1119 uploaded-cover canary: moved the existing QA hoodie upload from position 3 to 1. Final review fetched that exact private uploaded image for hoodie draft `6a9c36ad2525159670071e06`, while the tee retained its own selected camera.
- D1118 enum correction verified in Chrome: hoodie sleeve select's actual value is 2671 / Long sleeve, including the changed Hoodies category, not merely the visible summary.
- Expanded 222-photo tee gallery: 32 initially loaded, 120 and then 182 after deeper scrolling, zero failed images at those checks. Did not claim all 222 requests were exercised. Photo Next Listing 2 header top measured 72.01px.
- Found listing-number mismatch: parallel completion made hoodie photos use Books first while titles used Dachshund first. D1120 derives every active draft view from the original design order and keeps final bundle ordering independent of the active product. Live post-deploy verification still required.
- D1120 also corrects the repeated 8253 rejection off-by-one: exactly two creation POSTs, one controlled re-upload and one three-second wait, rather than an unnecessary third POST and extra seven-second wait. This does not claim to solve durable recovery or provider latency generally.

## D1121 integrity correction and new live evidence

- D1120 Natural alternate-artwork sequence completed on tee `6a9c36b72525159670071e0c`: real Books file uploaded, five other selected colors retained their original artwork in Printify, alternate survived reload, main-design reset succeeded and survived a second reload. Printify opened the exact draft. Native file-dialog cancellation has not been verified.
- D1120 listing order verified across hoodie photos, colors, and titles: the same Dachshund design is Listing 1. Existing QA photo restored behind the Printify cover.
- Fresh two-product run `3e39b16c-f258-43c2-ada8-f971d3f0d2ae` created hoodie `6a9c4f816f59811746061089` and tee `6a9c4f8b6f59811746061098`. POSTs returned 200 in 5.308424 and 5.139252 seconds. First request to last response was 15.236955 seconds. No hidden title-generation request occurred.
- Immediately switching from tee to hoodie after clicking Save prices reproduced cross-product snapshot corruption. Hoodie child `28cd3b4c-ba0a-4e25-9781-895fc9524fc1` retained its own design ID but received the tee result; canonical server results remained intact. This is a release-blocking defect, not a passing walkthrough.
- D1121 captures price-save ownership before awaiting, merges results by both product and design identity, serializes writes per batch, rejects foreign draft IDs and cross-product database overwrites, and restores matching authoritative results on owned-batch retrieval. Saves now check their response and no longer always claim Saved just now. Fresh batches clear old task focus and run-specific approval state. Warning modals use listing/design numbers, not junk filenames.
- Pre-build tests: 1291 total, 1279 passed, 12 skipped, 0 failures. Includes the exact cross-product recovery fixture, concurrent write ordering, and the actual SQLite upsert rejecting another product or user. Deployment and live rapid-switch recovery verification are still pending at this entry.
