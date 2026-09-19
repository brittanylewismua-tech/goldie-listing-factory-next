# Acceptance ledger

**Build:** D1753 · commit `dd623795` · **3,522 tests — 3,510 passing, 0 failing, 12 skipped.**

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

| Measure | Count |
|---|---|
| **Paid provider calls** | **1** — one cold Design Scanner scan. Confirmed independently: `paidReservations.last24h.settled = 1`. The warm re-scan used the cached analysis and spent none. |
| **Measured paid cost** | Shop Map `paidProviderCost: 0`; the scan's cost is recorded in the usage store, not exposed on any member route. Reported as **1 settled reservation** rather than a dollar figure I cannot read. |
| **Design Scanner allowance** | **1 of 10** (10 → 9). The warm re-scan consumed none (9 → 9). |
| **Listing Factory credits** | **1** (199 → 200) |
| **Etsy writes** | **0** — `publishedToday: 0`, `publishing: 0` throughout |
| **Etsy reads** | Page loads plus 3 shop-watch resolutions. Not individually metered on any member route; the app reports `averageEtsyCallsPerListing: 17.1` as its own aggregate. Reported as **not separately countable**, rather than estimated. |
| **Printify calls** | **~12**: 1 product create, 1 products.json sweep ×3, 1 product read ×3, 1 rename (PATCH), 1 delete, 1 delete-confirm read, plus `drafts/verify` ×2 |
| **Test artifacts created** | 1 batch, 1 Printify product, 2 scan-history rows |
| **Test artifacts removed** | 1 batch + 1 Printify product (mine), **3 legacy test batches** |

---

## Test-artifact classification

**Removed — proven internal tests**

| Artifact | Proof |
|---|---|
| Batch "INTERNAL TEST do not publish" (mine) | Created by me this session |
| Printify product `6aaf0035…` (mine) | Created by me; deleted through the guarded marker path; gone confirmed 4 ways |
| Batch "Internal Test Do Not Order **[gv9f3a1c]**" | Carries the marker |
| Batch "INTERNAL TEST DO NOT ORDER **[gv9f3a1c]**" | Carries the marker |
| Batch "INTERNAL TEST DO NOT ORDER" | Prefix **plus** corroboration: attempted 1 / drafts 0, matching the all-caps Printify rejection reproduced in D1745 |

**Retained — accounting or audit evidence**

- Scan-history rows for my two scans: each consumed allowance, so they are usage records.
- The two reversed Shop Map overrides: reversal is recorded as a timestamp, not a delete, by design.
- Usage counters (drafts 200): a credit was genuinely spent.

**Retained — not proven internal, must not be touched**

| Artifact | Why I left it |
|---|---|
| Batch "case test salt air" (1 draft) | No marker. "case test" could be a member testing a phone-case design. |
| Printify product "case test salt air" | Exists in your shop, no marker. Deleting it is irreversible. |
| Printify product "mug test salt air" | Same. |
| Batch "canary design" (0 attempted, 0 drafts) | No marker; "canary" is a plausible design name. |

These four are yours to judge. Say the word and I will remove them by the same guarded path.

## Proof after cleanup

| Claim | Evidence |
|---|---|
| Zero active internal-test products in Printify | sweep `internalTests: []` across 50 products |
| Zero test batches or drafts shown to the member | no batch matching marker or INTERNAL TEST remains |
| Zero test overrides | `active: 0`, `reversed: 2`, `orphaned: 0`, `clean: true` |
| Zero test uploads or mockups | the only mockup was the deleted product's; gone with it |
| No customer product changed | only the marker-renamed test product was written to |
| Shop totals unchanged | listings 293, orders 3,737, revenue 9,232,421 — identical before and after |
| Accounting unchanged | drafts 200, publishedToday 0 — identical before and after |

---

## Trademark rebuild — still running

| Now | Value |
|---|---|
| Marks | 336,859 (from 231,798 at the start) |
| Files | 6 done · 3 skipped · **111 waiting** · 0 partial |
| Queue | Advancing |
| Lookup | `ok`, **347 ms** |
| `Hauslabs` / `Haus Labs` | both **`risk: high`**, `registerRead: true` |
| Serials 97980718 / 97979817 | **not yet in the corpus** |

The class-003 HAUS LABS record has now arrived — the cosmetics class — so both spellings resolve to it as an exact match. Her two named serials have not landed; 111 files remain, roughly 37 hours at the current cadence. **Final register state, both serials, the known-mark panel, corpus size and final skipped/waiting counts remain blocked on that.**
