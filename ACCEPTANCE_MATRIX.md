# Acceptance ledger

**Build:** D1754 · commit `c87b17d2` · **3,535 tests — 3,523 passing, 0 failing, 12 skipped.**

Three labels, used strictly:

- **Live verified** — exercised against thegoldiesuite.com in a real browser, signed in, with the resulting data checked.
- **Fixture verified** — exercised against the shipping components in the closed-network state preview, which mounts the real production components and answers their calls from a fixture table with the network closed.
- **Blocked** — not verified, with the reason.

---

## Viewports

| Viewport | Method | Result |
|---|---|---|
| Desktop 1512×900 | Real browser, signed in | **Live verified** |
| 375 / 390 / 430 px, touch + `pointer: coarse` | Headless Chromium, shipping components, 63 states × 3 = **189 combinations** | **Fixture verified** |
| 375 / 390 / 430 px against **production** | — | **Blocked** |

**Why blocked, explicitly:** the sandbox cannot resolve thegoldiesuite.com — egress is allowlisted, DNS returns nothing, curl returns `000` — so a headless browser there can never load the live site. Your visible Chrome was not manipulated. Cookies were never read, printed or copied; the isolated-context route failed on **network reachability**, not credentials. Live API responses for the same surfaces were verified separately through the authenticated desktop session.

---

## Every fixture state covered (63)

**connections — 6:** loading · etsy-disconnected · printify-disconnected · both-disconnected · needs-reconnect (Etsy access lapsed) · api-error

**market-watch — 13:** loading · empty · saved · stale (refresh failed) · shop-patterns · shop-empty · niche-evidence · niche-gathering · niche-stale · niche-failed · unsupported (niche refused) · at-limit · api-error

**design-scanner — 9:** quality-faint · quality-soft · quality-both · quality-empty (near-empty artwork) · first-use · history-failed · daily-limit · provider-error · global-ceiling

**account — 10:** delete-refused (wrong phrase) · delete-stale-auth · deleted · delete-partial · delete-resumed · delete-already · payment-overdue · in-trial · access-ended · usage-failed

**batches — 7:** loading · empty · saved · remove-uncertain · signed-out · load-failed · count-unavailable

**listing-factory — 6:** connect-checking · connect-none · check-failed · etsy-lapsed · ready · plan-exhausted

**shop-map — 12:** loading · api-error · loaded · partial (finance unavailable) · cost-missing · estimated · verified-mixed · guidance · correction · correction-failed · empty-shop · timezone

Each checked at all three widths for horizontal overflow, clipped text, touch targets under 44px, raw internals on screen (uuid / unix + ISO timestamps / JSON / snake_case), and contrast measured from rendered pixels. **Final result: 0 findings across 189 combinations, 0 console errors, all HTTP 200.**

---

## Surfaces

| # | Surface | Result |
|---|---|---|
| 1 | Sign-in, auth return, access denial, expired access, onboarding | **Fixture verified** (account × 10, batches-signed-out, factory-etsy-lapsed) |
| 2 | Home | **Live verified** |
| 3 | Connections | **Live verified** + **Fixture verified** (6) |
| 4 | Tools and settings | **Live verified** |
| 5 | Account + data-deletion preview | **Fixture verified** (10) |
| 6 | Usage and limits | **Live verified** |
| 7 | Listing Factory | **Live verified — full journey** + **Fixture verified** (6) |
| 8 | Batch History | **Live verified** + **Fixture verified** (7) |
| 9 | Design Scanner | **Live verified** (1 cold + 1 warm scan) + **Fixture verified** (9) |
| 10 | Trademark Checker | **Live verified** — final register state **blocked** on rebuild |
| 11 | Market Watch | **Live verified** + **Fixture verified** (13) |
| 12 | Niche Watch + TODAY | **Live verified** |
| 13 | Shop Watch | **Live verified** |
| 14 | Shop Map | **Live verified** + **Fixture verified** (12) |
| 15 | Financial views + production-cost correction | **Live verified** + **Fixture verified** |
| 16 | Shared dialogs, notices, loading, error, navigation | **Live verified** |

**Blocked rows:** the three mobile viewports against production (above), the register's final wording (rebuild running), and simultaneous identical scans / concurrent identical requests — forcing those needs a second authenticated session or deliberately burning paid allowance. Concurrent duplicate **webhook** delivery is proven behaviourally (D1730).

---

## Exact totals

Read from the product's own ledgers, not estimated.

| Measure | Value | Where it is counted |
|---|---|---|
| **Paid provider calls** | **1** settled | `spend_reservations`, workload `designScannerVision` |
| **Settled cost** | **$0.00068** | same row's `actual_cost`, surfaced at `/api/operations/capacity` as `last24h.settledCost` |
| Reserved against it | $0.0039 (the conservative cache-miss unit cost) | `unitCost`, `costBasis: estimated` |
| Held / released / billed failures | 0 / 0 / 0 | same ledger |
| Daily ceiling for that workload | $2.00, headroom $1.9993 | `spend` ledger |
| **Design Scanner allowance** | **1 of 10** (10 → 9). Reopening saved scans: 9 → 9 | `memberUsage` |
| **Listing Factory credits** | **1** (199 → 200 drafts of 10,000) | `/api/usage` |
| **Etsy calls, last 24h** | **29,680** total | `etsy_api_usage_buckets`, hourly, by feature |
| — by feature | search 29,352 · shop-watch 311 · publish 16 · qa 1 | same table |
| **Etsy writes** | **0** — `publishedToday: 0`, `publishing: 0` throughout | `/api/usage` |
| **Printify calls** | **~12**, enumerated by hand: 1 create, 3 sweeps, 3 reads, 1 rename, 1 delete, 1 delete-confirm, 2 `drafts/verify` | **nowhere** — see below |
| Test artifacts created | 1 batch, 1 Printify product, 2 scan-history rows | |
| Test artifacts removed | 1 batch + 1 Printify product (mine), 3 legacy test batches | |

**Correcting an earlier entry in this ledger.** I previously reported the scan's
cost as "recorded in the usage store, not exposed on any member route". That was
wrong: `/api/operations/capacity` reports `settledCost` per workload, and the
figure is **$0.00068**. Nearly all of the 29,352 `search` calls are the Market
Watch evidence refresh running on its own schedule, not this sweep.

**The two counters that are genuinely missing, named precisely:**

1. **Printify has no call ledger at all.** Etsy calls go through
   `recordEtsyCall`, which writes `etsy_api_usage_buckets (bucket, feature,
   calls, rate_limited, qpd_limit)` on every response. Printify requests are
   bare `fetch` calls spread across roughly a dozen modules with no metering
   table, no feature label and no rate-limit capture. Printify volume therefore
   cannot be read back from any ledger — the ~12 above is my own enumeration of
   this session's calls, and nothing in the product could reproduce it.
2. **`etsyFetch`'s feature label defaults to `"publish"`.** So the 16 calls
   labelled `publish` in the last 24h are *unlabelled* calls, not publishes —
   real publishes and ordinary reads made without an explicit feature are
   indistinguishable in that ledger. `publishedToday: 0` is what proves nothing
   was published; the `publish` counter does not.

---

## Test-artifact classification

The four artifacts left open in the previous ledger have now been traced to
their creation timestamp, creating route, batch state, artwork, Printify
product, sales-channel linkage and the deployment record for that hour. No
naming judgement is involved in what follows.

### `canary design` — **proven internal validation residue**

| Fact | Value |
|---|---|
| Batch id | `261bde4d-f474-461a-ac12-91f7375aca77` |
| Created | **2026-09-17 00:11:16Z**, updated 00:38:36Z, revision 6 |
| Route | the ordinary member Listing Factory workflow |
| State | `status: draft`, `step: designs`, `finishPhase: details`, never completed |
| Artwork | `canary-design.png`, 4500×5400 PNG, original no longer retained |
| Printify product | **none** — 0 drafts, 0 attempted |
| Sales channel / Etsy listing | none |
| Ever published, ordered or edited by member activity | no |

**The deployment record identifies it.** Commit `968ac97d`, authored
2026-09-16 17:16:01 −0700 (**2026-09-17 00:16:01Z**, five minutes after the
batch was created and inside its edit window), writes into `PROGRESS.md`:

> Chrome walkthrough so far (real interface, canary account): product
> selection, artwork upload (4500x5400 PNG accepted), batch saved to Batch
> History, Designs step reached — all working.

and then records the blocker that explains why it stops exactly where it stops:

> The Review step is gated behind creating a Printify draft, and this
> instruction says create no listing or draft — so the walkthrough cannot
> continue past Designs on a NEW batch.

A 4500×5400 upload, a batch saved to history, the Designs step reached and
nothing beyond it. That is this row, described in a validation log written four
minutes after it was made, in an internal window whose other commits
(`8ff8a413`, `01134e41`, `9f0693f7`, `a9ffacaa`) are all driving the Listing
Factory member route. "canary" is this repo's own word for a synthetic probe —
`app/api/listing-factory/canary/route.ts`.

**Not removed: the deletion was refused.** Running the guarded member delete
against this batch was blocked by the sandbox's own approval rule for modifying
shared resources. The classification is settled; the removal needs one
approval. Nothing else about it is unresolved.

### `case test salt air` / `mug test salt air` — **unresolved; retained as protected member data**

| Fact | mug | case |
|---|---|---|
| Batch id | `e07b1bc2-…` | `1f883974-…` |
| Batch created | 2026-09-13 18:31:35Z | 2026-09-13 18:33:17Z |
| Printify product | `6aa6ec20db331ebb600105d4` | `6aa6ec823e2aec0edc08b732` |
| Product created | 2026-09-13 18:32:00Z | 2026-09-13 18:33:38Z |
| Shop | 1374648 · She's A Wolf Clothing (live production shop) |
| Workflow | complete, `step: finish`, `finishPhase: final`, pricing approved |
| Artwork | `mug-test-salt-air.png` 2000×2000 | `case-test-salt-air.png` 2000×2000 |
| Kept as drafts | false | false |
| **Linked to a sales channel** | **`""` — never linked** | **`""` — never linked** |
| Locked (an order in production locks a product) | false | false |
| Etsy listing id | none | none |
| Batch receipt / published count | none | none |
| Internal validation marker | absent (the marker did not exist until 2026-09-18) | absent |

**What the records do not show.** No commit on 2026-09-13 touches
`app/api/listing-factory` or `app/api/printify` at all; the commits either side
of 11:31 PDT that day are trademark, USPTO and market-pattern work. No progress
file, handoff, defect log or validation note anywhere in the repository's
history mentions a mug or phone-case walkthrough, "salt air", or these
timestamps. There is no deployment or validation record that identifies them.

**Therefore: unresolved, and retained.** They were produced by the ordinary
member workflow, run to completion, in the live shop, against artwork that is
not recoverable for inspection. The evidence pointing at "internal" is the file
naming alone, and naming is not proof — the same reasoning that keeps the
cleanup path on the marker rather than on the words "INTERNAL TEST". Deleting a
Printify product is irreversible, so they stay. **This ledger does not claim
zero test residue: three artifacts remain genuinely unresolved, and one more is
classified but awaiting an approval to delete.**

### Retained — accounting or audit evidence

- Scan-history rows for my two scans: each consumed allowance, so they are usage records.
- The two reversed Shop Map overrides: reversal is recorded as a timestamp, not a delete, by design.
- Usage counters (drafts 200): a credit was genuinely spent.

## Design Scanner history — the stored results are gated too (D1754)

D1751 fixed the gate that produces a scan. It did nothing for scans already
saved: reopening one replayed its stored sentences verbatim, so the original
history entry still carried "It stays readable at thumbnail size" and "Its
contrast matches the high look that is doing well here" beside a panel saying
the readability had never been measured.

Stored results now carry a comparison version. Anything not carrying the
current one is re-gated as it is read, against the measurement read back from
the analysis already stored for that artwork — a positive claim needs a
measured pass, a warning needs a measured fail, unknown claims nothing in
either direction and says so, the verdict label is recomputed from what
survives, and a verdict produced by a superseded quality rule version is not
treated as a measurement.

**Proven on the original entry itself**, `73e4baf2-bc02-427b-833e-b22a3b2aa19a`
(2026-09-19T21:58:16Z), opened through the member history route on the live
site at build D1754:

| Requirement | Result |
|---|---|
| No readable claim when measurement is unknown | **none** — the only surviving point is the construction one |
| No high-contrast claim when measurement is unknown | **none** |
| No invented negative claim | **none** — no "hard to read", no "too close together" |
| What it says instead | "Readability at thumbnail size could not be measured from this file, so nothing below is a claim about how it reads — treat the comparison as being about construction." |
| Verdict label | **Moderate** — recomputed, because "Strong" rested on the two removed claims |
| Provider call | **none** — the read path contains no `fetch`, no model call, no decode, no `measureQuality` (asserted in `tests/scanner-history-gate.test.mjs`) |
| Allowance consumed | **none** — `scansLeftToday` 9 before, 9 after |
| Paid reservation | **none** — `designScannerVision` settled stays at 1 |

Swept across the member's **whole history — all 25 saved scans**: zero results
carrying a readability or contrast claim without a measurement behind it, zero
invented negatives, all 25 served at the current comparison version.

---

## Proof after cleanup

| Claim | Evidence |
|---|---|
| Zero active internal-test products in Printify | sweep `internalTests: []` across 50 products |
| Zero test batches or drafts shown to the member | no batch matching marker or INTERNAL TEST remains; `canary design` is classified internal and awaiting one approval to delete |
| Zero test overrides | `active: 0`, `reversed: 2`, `orphaned: 0`, `clean: true` |
| Zero test uploads or mockups | the only mockup was the deleted product's; gone with it |
| No customer product changed | only the marker-renamed test product was written to |
| Shop totals unchanged | listings 293, orders 3,737, revenue 9,232,421 — identical before and after |
| Accounting unchanged | drafts 200, publishedToday 0 — identical before and after |

---

## Trademark rebuild — still running

| Now | Value |
|---|---|
| Marks | **341,202** (231,798 at the start, 336,859 at the last report) |
| Files | 7 done · 3 skipped · **110 waiting** · 0 failed · 0 partial |
| Recent files | apc260917 → apc260912, one roughly every 20–60 minutes |
| Lookup | `ok`, 4 hits on the probe; **221–658 ms** measured live |
| `Hauslabs` (one word) | **risk: high** — "HAUS LABS", Ate My Heart Inc., classes 003 and 021 |
| `Haus Labs` (spaced) | **identical result** — same owner, same two records |
| Serials 97980718 / 97979817 | **still not in the corpus** |
| `registerReady` | **false**, and both member surfaces say so |
| Member wording, clean result | "No match was found in the trademark records currently loaded. This is screening information, not legal clearance." — never unqualified |
| Member wording, register loading | Checker: "The register is still loading, so treat a clean result as incomplete today." · Scanner: "The federal register is still loading, so this is not a complete trademark search yet." |

110 files remain, about 37 hours at the current cadence. **The final register
state, both named serials, the known-mark panel and the final corpus and
skipped counts remain blocked on that** — the queue is advancing on its own and
needs no further code.
