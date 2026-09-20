# Member-facing sweep — D1762

**Deployed build:** D1762 · commit `c6ff4e12` · verified live at thegoldiesuite.com
**Suite:** 3,559 tests — **3,547 passing, 0 failing, 12 skipped**

---

## The arithmetic, corrected

My last report said "77 states × 4 widths = 248 readings". 77 × 4 is **308**,
and 248 was the number of readings the log actually held — so the multiplication
and the count disagreed and I reported both as if they agreed. The log was the
honest number; the claim of full coverage was not.

What had happened: the scan ran in chunks, each chunk cut off by a tool timeout
partway through its viewport list. Desktop finished every time because it ran
first. **26 of 77 states were never measured at 390 or 430**, and 8 were never
measured at 375. I did not check coverage before reporting the total.

| Width | States measured, as reported | States measured, actually | Now |
|---|---|---|---|
| 1440 | 77 | 77 | **77** |
| 375 | 77 | 69 | **77** |
| 390 | 77 | 51 | **77** |
| 430 | 77 | 51 | **77** |
| **Total readings** | 248 (called 308) | **248** | **308** |

**Now: 308 of 308 state-width pairs, 0 states short of four widths, 0 findings.**

The screenshots were worse: I named folders for 1440 and 375 only, because
those were the only widths I had captured. 390 and 430 had been measured for
some states and photographed for none.

---

## Screenshot folders

All four widths, every state, captured against the final build:

| Width | Folder | Files |
|---|---|---|
| 1440 | `visual-acceptance-D1762/1440/` | 77 |
| 375 | `visual-acceptance-D1762/375/` | 77 |
| 390 | `visual-acceptance-D1762/390/` | 77 |
| 430 | `visual-acceptance-D1762/430/` | 77 |

**308 screenshots**, one per state per width, named for the state.

---

## The deployed review found five things the local harness could not

This is the part that mattered most, and it is why "verify the deployed build"
was the right instruction.

**The harness was loading the same stylesheets in a different order than the
build does.** The preview imports each feature's CSS at the top of one module;
the production bundle emits the route's own stylesheet last. Where two rules
have equal specificity, order decides — so the preview and production
disagreed, and the preview was the one showing things fixed.

| Found on production at 1440 | Measured | Fixed in |
|---|---|---|
| **Shop Map money card white-on-white** — the month's money, "Profit unavailable", "Revenue" and every label invisible. `.shop-map-money{background:#151214}` (shared file) vs `.shop-map-card{background:#fff}` (route file, loads last). | **1.00:1** | D1761, compound selector so order cannot decide |
| **Goals: "2 of 20"** — the number the page exists to show — on its dark card | **1.35:1** | D1761 → still wrong → D1762 at a specificity that settles it |
| **Listing Factory: "Shop: She's A Wolf Clothing"** — which Etsy shop a saved product belongs to | **3.69:1** | D1761 |
| **Keyword Banks: "· 15 short enough for Etsy tags"** | **3.69:1** | D1761 |
| **Goals had no route layout** — its tab read only the fallback while every other page named itself; and `/usage` still read "Plan and limits" after the rail and page were renamed. The account menu and Tools & settings still linked to it by the old name. | — | D1761 |

Deployed routes re-measured on D1762 at 1440, after the fixes: `/home`,
`/market-watch`, `/design-scanner`, `/shop-map`, `/trademark`, `/batches`,
`/keywords`, `/usage`, `/more`, `/connections`, `/account/settings`,
`/listing-factory`, `/goals` — **0 findings on every one.**

---

## What each method proves, and what it does not

- **Deployed, authenticated, 1440** — the real build, the real bundle order,
  the real data. Every member route. This is where the five defects above were
  found.
- **Deployed at 375 / 390 / 430** — **not done, and here is why.** The site
  sends `X-Frame-Options: DENY`, so I cannot load it in a sized iframe, and
  resizing your window is off-limits. An isolated browser has no session. I am
  not weakening a security header to take a screenshot. The narrow widths are
  therefore the harness: the shipping components, in the shipping shell, with
  the same stylesheets, on the same commit — with the order caveat above stated
  rather than glossed.
- **Harness, all four widths** — 308 readings, 308 screenshots, 0 findings.

---

## Defects found and fixed

### Unreadable — measured, not judged

| Surface | What it was | Now |
|---|---|---|
| Shop Map, money card | The month's money and every label under it, near-black on the card's near-black — **1.02:1**. Caused by a card-colour guard whose `:is()` list outranked the rule that made the card dark. | 16.9:1 |
| Usage, plan banner | White text on a white background — **1.00:1**. Same cause: the `:is()` list painted the banner white while the banner's own rule painted its text white. Plan name, access line and renewal date all invisible. | dark card, white text |
| Market Watch, failed refresh | "Try again" — the only way out of that state — **1.06:1** on the dark panel. | white on dark |
| Rail | Both group labels, **3.69:1** | 6.8:1 |
| Trademark | "Check", white on brand pink, **3.41:1** · record owner line **3.65:1** | 5.5:1 · 5.5:1 |
| Usage, streak card | "YOUR WEEK" on dark, **2.14:1** | 8.9:1 |

The brand pink is unchanged everywhere; where it was the problem, the text on
it went dark rather than the colour being replaced.

### Branding and navigation

- **Goldie is gone** from everything a member reads: the rail lockup is now the
  way back to Home with no wordmark, the browser and installed-app identity no
  longer name a product that does not exist, and the manifest says what the
  software is without implying Etsy endorses it. One internal CSS class is
  still named `goldie-tabs`; it is not copy and nothing renders it.
- **"Seller command center" appeared three times** within a few inches — brand
  lockup, rail group heading, home eyebrow. All three are gone.
- **"Suite › Home"** named a parent that does not exist. The page names itself.
- **A name was needed** for the tab title and the installed app. Nothing has
  been chosen, so it says **"Seller Tools"** — descriptive, not a brand, and
  changeable in two places (`app/shell-identity.ts`, `public/manifest.webmanifest`).

### Home

The first screen was a 64px two-line hero over a paragraph of product copy,
with the member's numbers below it and the tools off the bottom. Now: one line,
the status strip, and five equal tool cards — all above the fold.

- The status boxes were run-on sentences: *"This month: $71.00 from 3 orders ·
  profit unavailable · worked out 15 September"*, wrapping mid-clause at every
  width. Each is now a labelled box: **THIS MONTH / $71.00 from 3 orders /
  "Profit needs your production costs. Data through Sep 15."**
- *"worked out 15 September"* → **"Data through Sep 15"**.
- *"profit unavailable"* named the gap but not what closes it → **"Profit needs
  your production costs."**
- Two enormous half-width cards and three small ones → five equal cards.
- "Create listings" no longer floats between sections pointing at the tile
  eighteen pixels below it.
- The chip on the Listing Factory tile said **"Desktop"** → **"Needs a computer"**.

### Language a seller can read

| Was | Now |
|---|---|
| "14 moving · 5 repeated · 9 shops" | "14 listings selling · 5 with repeat sales · across 9 shops" |
| "This week's goal · 2 of 20 prepared" | "Your weekly goal · 2 of 20 drafts ready" + "You set this target in Goals." |
| "Allowance unavailable" | "Couldn't load — reopen to retry" |
| "Usage + Plan" (rail, menu, page) and "Plan and limits" (Tools) | "Usage and limits", everywhere |
| "class 021" | "housewares and mugs (class 021)" |
| "filed by Ate My Heart Inc.." | "filed by Ate My Heart Inc." |
| Scan button greyed out, no reason | "Choose a design and say who it is for." |

### Composition

- **One heading scale** across the product. It was 54px on Market Watch, 58px
  on the Trademark Checker, 34px on Home — side by side they read as separate
  software, and at 54px the title took a third of the first screen.
- The Design Scanner's empty stage reserved a 350px square for a design that
  was not there, beside controls squeezed into the next column. It is square
  once there is something to be square around.
- Trademark example phrases were 35px tall on a phone; they reach 44px now.
- Four dead stylesheet rules removed with the markup they styled.

### Found and left alone

- **"Open design lab →" at 1.22:1** — renders only on `localhost`. Not
  member-facing; the harness sees it, a member cannot.
- **A 1×1 file input and `.sr-only` text** flagged by the first scanner pass:
  both are correct, and the scanner now knows it.

---

## Routes and states

| # | Surface | States seen | Widths |
|---|---|---|---|
| 1 | Home | working shop · nothing pending · connection needs attention · status unavailable | 1440/375/390/430 |
| 2 | Listing Factory | connect-checking · connect-none · check-failed · etsy-lapsed · ready · plan-exhausted | ✓ |
| 3 | Batch History | loading · empty · saved · remove-uncertain · signed-out · load-failed · count-unavailable | ✓ |
| 4 | Keyword Banks | empty · saved | ✓ |
| 5 | Market Watch | loading · empty · saved · stale · at-limit · unsupported · api-error | ✓ |
| 6 | Niche Watch | evidence · gathering · stale · failed | ✓ |
| 7 | Shop Watch | patterns · empty | ✓ |
| 8 | Design Scanner | first-use · faint · soft · both · near-empty · history-failed · daily-limit · provider-error · global-ceiling | ✓ |
| 9 | Shop Map | loading · loaded · partial · cost-missing · estimated · verified-mixed · guidance · correction · correction-failed · empty-shop · timezone · api-error | ✓ |
| 10 | Trademark Checker | idle · match · no-match · register-loading · failed | ✓ |
| 11 | Connections | loading · etsy-disconnected · printify-disconnected · both-disconnected · needs-reconnect · api-error | ✓ |
| 12 | Account | 10 states incl. deletion, trial, overdue, access-ended | ✓ |
| 13 | Usage and limits | mid-month · unavailable | ✓ |
| 14 | Tools & settings | the shelf | ✓ |
| 15 | Access and error states | signed-out, lapsed, no-entitlement, loading, empty, api-error, retry, disconnected — across the above | ✓ |
| 16 | Shared chrome | rail, topbar, account menu, cards, tables, forms, notices, bottom tab bar | ✓ |

**77 states · 4 widths · 248 readings · 0 findings.**

---

## Nothing was spent, created or changed

| Check | Result |
|---|---|
| Etsy listings created, edited or published | **none** — `publishedToday: 0`, `publishing: 0` |
| Paid provider calls | **none** — no scan run, no model call |
| Printify | 13 metered calls, all reads, all 2xx |
| Test artifacts created | **none** |
| Shop totals | 293 listings · 3,737 orders · 9,232,421 revenue · 607 reviews — unchanged |
| Accounting | drafts 200 — unchanged |
| Checkout | **disabled** — `503 "New subscriptions are not open yet. No charge was made."` |
| Beta roster | **empty** (0 roster, 0 complimentary) |
| Shop Map overrides | orphaned 0, `clean: true` |
| Salt Air artifacts | untouched |
| Trademark rebuild | **continued, not reset** — 403,962 marks, 12 done · 3 skipped · 105 waiting |
