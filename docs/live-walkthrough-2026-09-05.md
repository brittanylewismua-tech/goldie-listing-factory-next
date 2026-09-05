# Live acceptance log — September 5

## D1131–D1133 continuation (not a complete launch sign-off)

- D1131: `85dbad074cd1213322ac7445d6832286986b50db`, 1343 tests / 1331 passing / 12 skipped. Bundle `b0f1de87-3253-4abb-921b-4dfd5272207c`: Natural alternate pink Books upload, lightweight and real mockup, exact draft editor, five other colors retaining the original, matching placement measurements, reset and reload were exercised before the memory pause. Hoodie listing 2 custom photo upload completed and persisted; listing 1 retained two original photos.
- Resumed after closing ten unused tabs and resetting the memory-heavy browser helper. Replaced one stale QA tab, not the user's unrelated tabs. Browser control intermittently reports unavailable debugging or native windows; these errors are not counted as passing product interactions.
- Uploaded a temporary QA image through the hoodie listing 2 size-guide input, confirmed Selected / Replace / Remove controls, and removed it. Exercised photo-order arrows, product switching, AI titles for the hoodie, independent manual titles/tags for tee listings, generated Hoodie and T-shirt Etsy categories, and reached final review with four drafts and eleven photos. Open My Products opened Printify in the correct shop; no publishing.
- D1132 live `6ea0c7061ef9434c12f467c243d0504d2d32920f`, 1345 tests / 1333 passed / 12 skipped. Live bundle generation only affected the active product, while copy promised the whole batch. Corrected the section heading, action, manual-choice copy, shared-description label and reset scope. Reloaded production and found all three product-specific labels. Existing single-product wording retained.
- Continued saved mug `5cc7fee3-82fc-45e8-876c-67928411ac11`: placement checkbox revealed bulk controls; uncheck removed selection. Size Clear all produced an empty selection with explicit continuation requirement; Match template restored 11oz. Saved $18.67 price (cost $6.44, estimated profit $10.01). All six mug camera views available. Manual title/tags generated Etsy Mugs category, without apparel fields.
- Actual mug photo drag reproduced a missed rightward move onto the image's upper half, although dragging onto text and reverse dragging worked. D1133 captures fixed grid slots at drag start, selects the nearest whole slot rather than mixing horizontal/vertical midpoint rules, and disables nested native image dragging. Executable regressions cover upper/lower targets, both directions, wrapped rows and repeated drag-over stability. Post-deployment mouse retest is required.
- Remaining: complete current-release live matrix, fresh D1131+ durable-creation cleanup/usage test, browser-independent dispatch of later bundle products, legacy uncertain-job reconciliation, capacity/billing controls, typecheck cleanup. No launch-ready claim.

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
- D1121 deployed `cfcc8039e90224e089f5a72d2b8720362cfbedee`, Cloudflare `98986818-dc5f-47c1-82a0-24763f1e4d16`; full build/tests passed with the totals above. Live recovery did not pass: reloading the old UI had renewed its template session, so strict session matching omitted the existing hoodie draft. D1122 uses an owner-scoped join to the original template product ID plus exact design ID; multiple candidates remain unresolved rather than guessed. Added renewed-session and wrong-product regression cases. No new draft is created for recovery.
- D1122 deployed `151b371f5aefe10f4d54a76bc843a8f8f3f6295c`, Cloudflare `dfec54ac-c4a9-4fa7-8f8a-a970a32424fc`; 1292 tests, 1280 passed, 12 skipped. Live restored the original hoodie `6a9c4f816f59811746061089` and its actual costs without another creation. Save hoodie prices → immediate tee switch passed: observed outgoing and late saves retain hoodie child/design/product IDs; tee remains its own draft. Hoodie price $41.04 and tee $24.79/$26.87 stay separate.
- Next real edit exposed another defect: changing the tee profit goal from 12 to 13 recomputed $25.89/$27.97 but still said Prices saved, with no Save button. Saved recipe defaults were re-approving edited final prices. D1123 disables that auto-approval once drafts exist, preserves unsaved price comparisons after reload, and uses the same gating for the rail and footer. Pending live regression.
- Retention audit found routine catalog loading deleted all draft ownership/results after 30 days and all expired six-hour template sessions. D1123 stops aging out durable draft records, retains any referenced original template session/geometry, and records source template IDs directly on new draft results. SQLite retention regression covers created, pending, uncertain and failed referenced records versus unused sessions. This is not the complete durable job/retry architecture.
- D1123 deployed `813a310cf57a310bf960b08669eb14ea1a9d3ced`, Cloudflare `0dbdfaab-e13b-4362-915d-7214e621c72d`; 1297 tests, 1285 passed, 12 skipped. Reload retained the unsaved tee prices $25.89/$27.97, showed Save these prices, and blocked both rail and footer. Saving tee prices and immediately switching to hoodie kept both owned draft IDs separate again. Browser console had no errors at this check.
- Deeper pricing check found the collapsed badge still read Saved for unsaved edits, sibling approval ignored its saved decision, and reopening an approved price panel recalculated automatically. D1124 aligns all badges/member gates with the same approval state, keeps approved prices untouched on panel mount, and removes the inaccurate all 13 tags summary when fewer valid tags were entered.
- Measured production storage read-only: 208 succeeded drafts; 19,991,629 bytes of result JSON, average 96,113.60 bytes, max 465,004 bytes; total database 46,673,920 bytes. At unchanged payload size 100,000 results alone would be roughly 9.61 GB before snapshots/indexes. This is a real capacity concern requiring storage design work, not a launch-capacity pass or complete cost forecast.

## D1124 live results / D1125 correction

- D1124 live `ec10f7bfc2295f38a1354205d6caef0a9a116c3b`, deployment `894f61f2-1ca8-4f3e-8a12-7806521a4b94`, 1298 total / 1286 passed / 12 legacy skips. Reloaded hoodie and opened pricing: approved $41.04 stayed unchanged. Direct edit to $42.04 immediately displayed $10.91 profit, Edit prices badge, Save button and disabled rail/footer. Clicking inside Item prices did not collapse it. Restored $41.04 and saved successfully.
- Fresh bundle title generation exposed wrong hoodie taxonomy again. Root cause was not the per-product baseline: the unbounded `t-?shirt` expression matches the end of `sweatshirt`, and the wrong-category check repeated the same error against Sweatshirts leaves. D1125 uses word-bounded garment matching and recognizes Hooded Sweatshirt as a hoodie. Executable regressions cover exact live name, garment-dyed hoodie/crewneck, tee variants and youth audience. Automatic category live retest required after deployment.
- Tee manual title/tags generated T-shirts / Short sleeve / T-shirt correctly. Hoodie generated Long sleeve / Hoodie but wrong T-shirts category on D1124. Existing incorrect QA category will not be silently rewritten; live regeneration must explicitly exercise the corrected path.
- Screenshot inspected at measured 1440 CSS pixels. The optional individual title builders were only 11px text and 15.4px high hit targets. D1125 restores readable 14px text, 44px disclosure targets, padding, neutral borders and keyboard focus. Title/tag input text also raised to 14px. No image filenames added.

## D1125 live / D1126 storage and update work

- D1125 production `c5913ad62f05828f635ecaf0f01060018fb5b5ab`, Cloudflare `e64ca175-ef29-45c0-8a8a-d01a6a41d723`, 1303 tests / 1291 passed / 12 skipped. Fresh hoodie regeneration now selected Hoodies, Pullover, Long sleeve and Hoodie; tee remained T-shirts and Short sleeve. Both private titles were changed to the accurate Dachshund product names; no Etsy publishing occurred.
- Saved fresh parent batch as `QA D1125 — Fresh hoodie and tee — DO NOT PUBLISH`, reloaded and verified the name and both product results. At measured 1024 CSS width, personalization opened with aligned fields, correctly spaced required checkbox and no out-of-viewport controls. Filled a sample name question/instructions, checked Required, then turned personalization back off. Inspected screenshot. Title disclosure text measured 14px and target height 45.1px after deployment.
- D1126 moves large canonical mockup arrays into private, content-addressed compressed R2 objects. Ownership and indexed product identity remain in D1. Inline legacy/small rows still read without R2. Hash/owner/product checks reject wrong or missing media instead of pretending a gallery is empty. Creation falls back to inline storage if compaction fails, preserving the successful product record.
- Concurrent draft updates now merge only changed fields against the latest canonical record and compare-and-swap the SQL write, preserving unrelated concurrent artwork/title/price changes. New expression and client indexes avoid full account scans for product/design lookups. Ten executable tests cover real array order, identity isolation, corruption, storage failures, concurrent updates and SQLite query plans. Live storage canary, migration and full suite still required.
- This is not a complete storage migration: historical inline records compact when updated, batch snapshots still repeat media, and durable creation/recovery work remains required. No full capacity pass claimed.

## D1126 live / D1127 follow-up

- D1126 deployed `1769dd655b891e4a3808fed9c575b2405b386932`, Cloudflare `60c2f570-e1fe-41db-96af-06709fa18759`; 1314 tests / 1302 passed / 12 skipped. Private tee batch reload retained all 222 mockups and selected photos 2/3/7. Expanded/collapsed the gallery and downloaded the selected-photo ZIP: UI confirmed Download ready.
- Measured 128 batch snapshots totaling 17,976,585 JSON bytes, including 4,296,473 template bytes and 6,900,198 draft bytes. Largest snapshot 1,718,238 bytes. These remain a capacity follow-up; no large-user-count guarantee inferred.
- Real alternate-artwork picker test intended for Natural instead saved an Ice Grey override (437), verified against the canonical owned draft. The page had scrolled below the stationary pointer. D1127 replaces mouse-enter preview changes with real pointer-movement changes, retaining keyboard focus behavior and the existing native-dialog lock. Reset requested through Use main design; post-deploy exact rerun required before passing it.
- D1127 also prevents a late gallery refresh based on an older artwork revision from replacing newer canonical preview/media arrays. Regression retains concurrent title changes and permits intentional artwork resets.

## D1127 live / D1128 follow-up

- D1127 deployed `0b18adc063fc25300bd1e92486300a9505560d53`, Cloudflare `b46b7826-3829-4f05-aca5-d321d28e9ff3`; `/api/version` matched. 1316 tests / 1304 passed / 12 skipped. Normal Chrome dimensions restored after responsive testing.
- Repeated real Natural upload: canonical override is exactly color 552; Ice Grey override absent. Lightweight rendering and real Printify preview both show pink Books artwork. Opened Adjust this artwork and verified exact draft `6a9c4f8b6f59811746061098`. In Printify, clicked White, Sport Grey, Daisy, Carolina Blue and Light Pink: all five keep the original red Dachshund image. Natural alone is variant-specific Books artwork. Both original and alternate display 7.98 × 7.98 inches, scale 190.9%, rotation 0, left 17.58%, top 11.35%.
- Reload retained the Natural alternate, including the lightweight overlay. Use main design removed it; another reload plus keyboard navigation to Natural confirmed Using the main design. No Etsy publishing. Chrome editor connection timed out once; reconnect succeeded without user intervention.
- Reload exposed canonical price approval remaining true after an artwork change even though the immediate UI required approval again. D1128 invalidates canonical approval on artwork updates so reload cannot silently bypass the price review.
- D1128 offloads large batch templates and original placement geometry into owner-checked compressed private storage. Batch draft media is omitted only for exact owned canonical product/design pairs; legacy drafts retain their data. Existing history thumbnails and selected photo order remain inline. Storage failure keeps a complete inline snapshot. Full build/tests and live round-trip canaries required before passing.

## D1128 live / D1129 follow-up

- D1128 live `f0bde0777ca896b5383b18a1436ba609d7f7249e`, deployment `521da815-e7d2-4c00-95d6-6f6c0aa30664`; 1322 total, 1310 passing, 12 legacy skips. Natural alternate upload persisted after reload and price approval stayed invalidated. Reset to main design succeeded. Saved tee prices again: both groups retain $25.89/$27.97 and Next becomes enabled.
- Live listing photos retained selected indices 2/3/7 and all 222 available mockups. Exercised move-later then move-earlier and restored order. Opened the actual Back mockup; screenshot shows centered close icon. Escape dismissed the modal. Expanded all mockups. These are specific exercised interactions, not a full matrix pass.
- Measured the compacted test draft still contained 74,142 bytes of pricing metadata and 50,343 bytes of Etsy option metadata. D1129 moves these objects into the existing integrity-checked private object alongside media/geometry. Exact values, approval state and variant ordering are covered by round-trip plus save/reload regression tests. Retired queue reader also hydrates the representation; no publishing route is enabled.
- Fixed a missing-image null dereference in the lightweight rendering: optional URL equality could compare undefined to undefined and then access a null image. Added regression assertion.
- Remaining release work includes durable creation/reconciliation, retention/capacity/load measurements, typecheck cleanup, and the uncompleted live matrix. No claim of launch readiness.

## D1129 live verification

- Live and main `1b956b5c24f11d9c25901869375b680438f84330`, Cloudflare `1d9b4b63-7c51-4e22-a021-e8900a680157`. Full build passed; 1324 tests, 1312 passed, 12 legacy skips, 0 failures. `/api/version` returned D1129 and the exact hash.
- Changed tee group price $25.89 → $25.90: profit immediately changed $13.00 → $13.01 without blur; panel stayed open. Switched to hoodie before saving: hoodie remained $41.04 and the bundle continuation remained disabled for the unsaved tee. Returned, restored $25.89, saved. Reload retained approved $25.89/$27.97, 24/6 variant groups and Etsy T-shirts/Cotton/Unisex/Short sleeve/Crew attributes.
- Final bundle review screenshot exposed a duplicate large first-product preview and a group named after the hoodie even though it contains a tee too. D1129 now uses Design 1 for the multi-product group, with each finished product shown once in its own row. Reopened after deployment and inspected screenshot; edit controls have spacing and the duplicate image is gone. A single-product group retains its useful large preview.
- Canonical tee result now 3,572 bytes with private storage pointer; inline pricing/Etsy option objects absent. No user data discarded.
# D1134 — durable whole-submission admission (live verification pending)

- Fresh single-product and bundle submissions prepare and save all child/design
  identities before sending one admission request. All accepted jobs are
  dispatched together; four server-side creation lanes preserve bounded writes.
- The quota reservation is one atomic SQL statement, including overlapping
  submissions and existing uncertain reservations. Job identity remains
  owner/shop/template/design; connection errors do not manufacture new IDs.
- Shared original files reuse their staged transfer across bundle products.
- Reopening a batch and Batch History recover completed background results,
  including completion state, without requiring the final browser autosave.
- Poll recovery now uses the idempotent Workflows bulk-create operation instead
  of a failing create plus a status lookup on each poll.
- Validation before commit: build passed; 1,354 tests, 1,342 passed, 12 skipped,
  zero failures. Existing unrelated type-check errors remain.
- Required live check after deployment: submit a multi-product batch with more
  than four jobs, close the tab after acceptance, verify all jobs and products,
  reopen every member, and verify single-product creation as well. Do not infer
  these live checks passed from this section.
# D1134 close-tab bundle verification / D1135 corrections

2026-09-05: live Chrome submitted three real files for a hoodie + tee bundle (six private drafts), parent `586c2e97-ce47-438a-afab-5be8ae65d1a5`, named QA D1134 — Six drafts with tab closed — DO NOT PUBLISH. Click 20:51:10.917Z; closed the actual QA tab at 20:51:28.874Z while the UI showed 3/6 and confirmed background acceptance. All six workflows completed; last at 20:51:37Z. Workflow `8e601861-0b19-429b-8575-d9bbdc4cf4fb` waited in its server lane until 20:51:31Z, created after the tab closed, and completed checkpoint cleanup at :37. History after reopening showed three ready drafts per product, usage 132 (126 before), and all six garment previews were visually present. No Etsy publishing. Low-resolution QA files were explicitly approved in the UI.

Live-found defects corrected in D1135: contradictory keep-tab-open note after background acceptance; save-for-later dialogs claiming drafts already existed before creation; unnecessary template reload during restoration of a server-completed processing snapshot, which cleared the product and bounced bundle navigation to setup; repeated resolution preflight on completed drafts. Preparation copies now run at a bounded four concurrently and all settle before cleanup/admission on error. New regression checks cover these paths. Full D1135 precommit build passed; 1,356 tests, 1,344 passed, 12 skipped, zero failures. Deployment and post-deploy navigation verification recorded separately below when performed. This is not a claim of a complete current-release launch matrix.
