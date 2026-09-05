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

Additional open defect: bundle custom name is retained inside the batch but Batch History still labels the parent with its generic bundle name. This needs a parent-name persistence/display correction.

## Still required (not a pass)

D1115 version and real shortcut retests, final alternate-artwork reset/reload/isolation checks, fresh mug and non-apparel bundle run, remaining narrow-layout/control matrix, complete error recovery. Existing durable creation/capacity rewrite remains unshipped in separate worktree. No 100/300/500-user production capacity claim. No claim every control is verified. Type audit additionally found missing Cloudflare type declarations and other existing type errors; full typecheck is not clean.
