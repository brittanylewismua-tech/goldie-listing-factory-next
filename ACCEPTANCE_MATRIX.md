# Acceptance matrix

**Build:** D1750 · commit `855e411d` · **3,507 tests — 3,495 passing, 0 failing, 12 skipped.**

Three labels, used strictly:

- **Live verified** — exercised against thegoldiesuite.com in a real browser, signed in as the owner, with the resulting data checked.
- **Fixture verified** — exercised against the shipping components in the closed-network state preview, which mounts the real production components and answers their calls from the fixture table.
- **Blocked** — not verified, with the reason.

---

## Viewports

| Viewport | How | Result |
|---|---|---|
| Desktop (1512×900) | Live | **Live verified** — every surface below |
| 375 / 390 / 430 px, touch + `pointer: coarse` | Headless Chromium against the state preview, 63 states × 3 viewports = **189 combinations** | **Fixture verified** |
| 375 / 390 / 430 px against **production** | — | **Blocked.** The sandbox cannot reach thegoldiesuite.com (allowlisted egress; the host does not resolve, `000`, no DNS), so a headless context there can never load the live site. Your own Chrome must not be resized. This is the documented fallback: shipping components at real phone viewports, with the live API responses verified separately through the authenticated desktop session. |

Cookies were never read, printed, or copied. The isolated-context route failed on **network reachability**, not on credentials.

---

## Surfaces

| # | Surface | Result | Evidence |
|---|---|---|---|
| 1 | Sign-in / auth return / access denial / expired access | **Fixture verified** | `account-access-ended`, `account-payment-overdue`, `account-in-trial`, `batches-signed-out`, `factory-etsy-lapsed` |
| 2 | Home | **Live verified** | Renders; month figures, watch evidence, scan allowance, register warning all honest |
| 3 | Connections | **Live verified** + **Fixture verified** | Etsy `shesawolfclothing` + Printify Connected; 6 disconnect/error states in fixtures |
| 4 | Tools and settings | **Live verified** | Reachable, renders |
| 5 | Account + data-deletion preview | **Fixture verified** | 6 deletion states incl. refused, stale-auth, partial, resumed, already-done |
| 6 | Usage and limits | **Live verified** | `owner_test`, 200/10,000, "Not open yet", no prices |
| 7 | **Listing Factory** | **Live verified — full journey** | See below |
| 8 | Batch History | **Live verified** | 20 batches, search, select-all, remove dialog, cancel, confirm |
| 9 | Design Scanner | **Live verified** (1 real scan) + **Fixture verified** | See below |
| 10 | Trademark Checker | **Live verified** | `Hauslabs` / `Haus Labs` both resolve; known-mark and clean paths |
| 11 | Market Watch | **Live verified** | TODAY panel, 7 niches, list/detail agreement |
| 12 | Niche Watch + TODAY | **Live verified** | All 7 niches agree list↔detail (was 4 mismatched) |
| 13 | Shop Watch | **Live verified** | Invalid name, duplicate, tab deep-link |
| 14 | Shop Map | **Live verified** | Correction + reversal + invariants |
| 15 | Financial views / production-cost correction | **Live verified** + **Fixture verified** | Profit withheld when costs missing; `shop-map-cost-missing`, `-estimated`, `-verified-mixed`, `-partial` |
| 16 | Shared dialogs, notices, loading, error, navigation | **Live verified** | Confirm dialog opens, cancels safely, executes once |

---

## Listing Factory — complete member journey, live

| Step | Result |
|---|---|
| Create a batch | Auto-saved with id |
| Upload **invalid** artwork (120×120) | Refused: "VERY LOW RESOLUTION · 9 DPI · below the recommended size", proceed blocked behind "Review resolution warnings" |
| Remove design | "internal-test-tiny.png was removed", count → 0 |
| Upload **valid** artwork (4000×4000) | Accepted, graded softer ("Proceed anyway"), severity tiers work |
| Select product | Unisex Heavy Cotton Tee, 5 colors × 5 sizes imported |
| DPI safeguard | **Verified at two severity levels** |
| Review | "Creates unpublished Printify drafts." |
| Create **one** Printify draft | Created; progress + "you can leave this page" |
| Confirm identity | Found **through Printify by title**, not thumbnail: `6aaf0035b544ed8a5c0a1039` |
| Confirm unpublished | `linkedToSalesChannel: ""`, `published_count: 0`, Etsy "0 of 1 complete" |
| Refresh and resume | Batch resumes at REVIEW |
| Batch History | Shows "1 PRINTIFY DRAFT SAVED" |
| Confirmation dialog | Opens, names the batch, **cancel leaves it intact**, confirm executes once |
| **Delete the product** | Confirmed gone **four ways**: route re-read 404, inspect `exists:false`, Printify verify `missing:[id]`, sweep `internalTests: []` |
| Remove the batch row | Removed; `createdToday: []` |
| **Nothing reached Etsy** | `publishedToday: 0`, `publishing: 0` |

**Cost:** 1 listing credit (199 → 200). Printify: ~8 calls. **Etsy writes: 0.**

## Design Scanner — live

One real scan. Allowance **10 → 9**. Result framed as *construction, not fit*: "A design can match every one of those patterns and still not belong in the niche." Patterns described only in aggregate ("around 2 words") — **no copied wording, no reference-listing leakage.** Ten further states fixture verified.

**Cost:** 1 paid vision call.

## Shop Map — live

| Check | Result |
|---|---|
| Listings | parts 293 = shop 293 **MATCH** |
| Active listings | 83 = 83 **MATCH** |
| Orders (90d) | 15 = 15 **MATCH** |
| Revenue (90d) | 33,800 = 33,800 **MATCH** |
| Correction | Workout & Fitness 6→7, orders 79→80, Unclassified 58→57; invariants held |
| Reversal | Restored to 6 / 58; override audit back to **active 0, reversed 2, clean true** |

Every listing stayed in exactly one primary state; niche totals never exceeded shop totals.

---

## States exercised

**Fixture verified** across 63 states × 3 viewports: loading, empty, populated, success, validation refusal, unsupported input, provider failure, API failure, stale, partial, limit reached, access denied, expired entitlement, disconnected provider, timezone.

**Live verified:** first visit, returning visit, populated, success, validation refusal, retry, refresh after completion, browser back/forward, page reload, new tab, persisted state, duplicate submission.

**Blocked:** simultaneous identical scans and concurrent identical requests were not driven live — forcing them needs either a second authenticated session or deliberately burning paid allowance. Concurrent duplicate **webhook** delivery is proven behaviourally (D1730).

---

## Launch invariants, re-confirmed after all work

| Invariant | State |
|---|---|
| Checkout disabled | "Not open yet", no prices, no retired plan names |
| Beta roster | `[]`, 0 granted |
| Active overrides | **0** (restored after the correction test) |
| Test residue | None — `createdToday: []`, Printify sweep `internalTests: []` |
| Etsy listings created or changed | **0** |
| Health | `healthy: true`, `broken: []` |
