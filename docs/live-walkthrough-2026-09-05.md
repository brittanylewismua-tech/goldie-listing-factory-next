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

## Still required (not a pass)

D1111 clean build/tests/deploy/version, then actual live retest of these corrections; remove QA size guide; verify reset/reload and remaining bundle steps, non-apparel fresh runs, mobile/narrow layout, complete error recovery. Existing durable creation/capacity rewrite remains unshipped in separate worktree. No 100/300/500-user production capacity claim. No claim every control is verified.
