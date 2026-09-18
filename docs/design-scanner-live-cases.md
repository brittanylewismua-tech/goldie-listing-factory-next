# Design Scanner — live production cases

Measured against the deployed product with real provider calls and the real
spend ledger. Nothing here is a unit test standing in for the live path; each
row names what was observed and what it cost.

The member allowance is a COUNT (10 settled scans per rolling 24h), not a
dollar figure. The registry's `unitCost` is the conservative cache-miss
estimate reservations are sized on and is ~5.5x the measured cost, so the
dollar view can read nearly empty while the binding limit is full. That
misreading cost a scan while closing this feature; `/api/operations/capacity`
now reports `measuredUnitCost` and `bindingLimit` beside the estimate.

## Case 17 — two simultaneous uploads of one cold design

D1622, 2026-09-17. A design generated in the browser and never seen before
(`a1-661a5711…`), posted twice in one `Promise.all`.

| | request A | request B |
|---|---|---|
| status | 200 | 200 |
| provider calls | **0** | **1** |
| provider cost | $0 | $0.00071 |
| result | Strong visual-pattern alignment | Strong visual-pattern alignment |

- Dollar ledger moved $0.0065 → $0.0072: **one** call billed, not two.
- Member allowance moved 9 → 10 of 10: **one** slot consumed, not two.
- Wall clock 5,994 ms for both.

B won the lease and paid. A waited, picked up B's stored analysis and returned
the identical result having reserved nothing. This is the behaviour the lease
was built for: before it, two simultaneous uploads of one design made two paid
vision calls and took two of the member's ten daily scans.

`imageQuality` on the crisp black-on-white artwork: contrast pass, sharpness
pass, thumbnail readable pass, no notes — the D1618 independence work holding
on a real upload, with no false positive against sparse crisp text.

## Readability, verified on screen

The contrast and edge-softness measurements were computed on every scan,
returned by the API and rendered nowhere until D1626. Verified on the
deployed build through the state harness, each state opened by reopening a
saved scan — the path a member actually uses:

| state | notes shown |
|---|---|
| faint, crisp edges | one, about contrast. Nothing about blur. |
| strong contrast, soft edges | one, about softness. Nothing about contrast. |
| faint AND soft | **both**, neither written as the cause of the other. |
| near-empty artwork | "This design is empty or almost empty." |

The near-empty case also proves the measurement survives a refused
comparison: the cohort refusal and the readability note render together,
which is the half a member can act on when the comparison cannot be made.

And on the real upload in case 17 — crisp black-on-white text — contrast,
sharpness and thumbnail readability all passed with no notes, so the fix for
the false positive against sparse crisp artwork holds on production input.

## Phone widths

42 states at 375, 390 and 430 — 126 measurements — with no horizontal
scrolling, nothing wider than the screen, no tap target under 40px and no
request left unanswered by a fixture. It is a control on the harness rather
than something done by hand, because the first hand-run found two real
defects and a hand-run happens once.

## Case 15 — THREE CLAIMS, AND ONLY TWO OF THEM ARE LIVE

Case 15 is the changed-reference-image path. I ran a cold scan, reported that
the branch never fired, and then presented the whole case as live verified.
Those are not the same claim. Labelled properly:

| claim | status |
|---|---|
| cold scan, billing, allowance, caching | **live verified** (below) |
| changed-reference-image handling | **deterministic fixture verified** — `tests/reference-refresh-outcomes.test.mjs` |
| changed-reference-image handling in the deployed production path | **live verified** — D1709, see below |

The third was unobserved when case 15 first ran, and is now closed by a
controlled canary rather than by modifying a real Etsy listing.

### The part that is live verified — a cold scan, its cost, and the same design again

D1702, 2026-09-18T02:15Z. The allowance opened with three slots rather than
one; several scans left the rolling window together.

A design generated in the browser and never seen before — crisp black text on
white, 1200x1200, 96 KB, `b518275d…` — scanned against `teacher`.

| | cold | same design again | again, no image sent |
|---|---|---|---|
| status | 200 | 200 | 200 |
| warm | **false** | **true** | **true** |
| provider calls | **1** | **0** | **0** |
| provider cost | **$0.00084** | $0 | $0 |
| wall clock | 3,639 ms | 2,043 ms | — |
| verdict | identical across all three | | |

- Dollar ledger moved $0.0043 → $0.0051. One call billed, matching the
  reported cost. Neither warm scan moved it at all.
- Member allowance: the cold scan reserved and settled; the warm scans
  reserved nothing. `reserveSpend` is inside `if (!upload)`, so a repeat
  upload cannot cost a slot. Remaining read 3 throughout because scans were
  ageing out of the rolling window at the same time — `nextScanAt` advanced
  02:16:10 → 02:28:12 across the run.
- Result: a **refusal, not a verdict**. "Not enough verified evidence — only
  1 listing in this niche show verified movement so far. Design Scanner needs
  at least 12 before it will compare anything." The scanner declined to
  compare rather than producing a confident-looking number from one listing.
- Trademark on the design's own wording: clear, 0 hits, register correctly
  reported as not ready.
- Every reference in the cohort was fresh, so no Etsy refresh ran and nothing
  was dropped. `etsyRefreshCalls: 0`, `droppedOnRefresh: {gone: 0, inactive: 0,
  imageChanged: 0}`. The changed-image branch did not execute at all, in
  production or anywhere else, during this run.

## Case 16 — provider failure

D1702, 2026-09-18T02:23Z. A valid PNG signature followed by 4 KB of noise:
accepted by the route, unreadable by the provider.

| | first attempt | immediate retry, same design |
|---|---|---|
| status | **502** | **502** |
| wall clock | 2,847 ms | 2,542 ms |
| member allowance | 3 → **3** | 3 → **3** |
| dollar ledger | $0.0051 → **$0.0051** | unchanged |

The member is told: "That scan did not complete. It has not been counted
against your daily scans." Nothing about the provider, the status code or the
reason it could not be read.

- **The scan was refunded.** The allowance did not move across two failures.
- **Nothing was billed.** The provider rejected the image before charging, so
  the reservation released rather than settling as failed-billed.
- **The lease was released.** This is the D1702 fix, and the retry is its
  proof: `LEASE_WAIT_MS` is 15,000 ms, so a leaked lease would have made the
  retry wait fifteen seconds before answering. It answered in 2,542 ms —
  indistinguishable from the first attempt. Before the fix, the
  provider-HTTP-error exit was the one exit of the lease block that did not
  release, and it is the likeliest of the three.

### Still open

Case 14 (stale reference image) needs a cohort holding a reference older than
six hours. The poller keeps freshness at 0.99, so it did not arise during
case 15 and cannot be forced without writing false timestamps into production
reference data. The refresh logic it would exercise is covered by D1701.


---

# Mobile verification — what was proved where

Two different things, and the distinction is the point.

## Narrow-layout verification (the harness sweep)

An iframe of exactly 375, 390 or 430 CSS pixels gives a page a real narrow
viewport and makes its **width** media queries fire. It does not make the
browser report a touch device. Every sweep run reports the conditions it ran
under and labels itself accordingly:

```
narrow-layout verified · widths asked 375/390/430 · viewport 375/390/430
· clientWidth 375/390/430 · pointer:coarse false · mobile gate never matched
· worst horizontal overflow 0px · undersized targets 0
```

Chrome's window resize is not an alternative: the page stays 1440 CSS pixels
wide however small the window gets, which is why narrow-width checks through
it have never measured anything.

## Actual mobile verification (in-app browser, real device emulation)

D1657, deployed build, unauthenticated — the 404 renders inside the same
`.app-shell` the Listing Factory uses, so the gate can be exercised without
credentials.

| | 375 × 812 | 430 × 932 |
|---|---|---|
| `pointer: coarse` | **true** | **true** |
| `(max-width:820px) and (pointer:coarse)` | **matches** | **matches** |
| `.app-shell` present | yes | yes |
| `.mobile-gate` rendered | yes | yes |
| shell children leaking past the gate | **none** | **none** |
| horizontal overflow | 0px | 0px |
| tap targets under 40px | none | none |

The card reads "Oops, this one needs a bigger screen." That last row of zero
leaks is the D828 defect itself: the rule hides `.app-shell > :not(.mobile-gate)`,
and when interior pages were moved into the shell without the card, it hid the
sidebar AND the main pane and left a blank screen behind it.

The public homepage at 430 with a coarse pointer: no overflow, nothing wider
than the screen, no undersized targets, and it still says "Not open yet —
there's nothing to buy right now", which is checkout staying closed.

## Still unverified

Authenticated mobile states. The in-app browser has real device emulation but
no session, and signing it in means handling credentials. Every authenticated
surface is narrow-layout verified only.

## Case 15, third claim — the changed-image branch in the deployed path

D1709, 2026-09-18T04:08Z, via `POST /api/design-scanner/reference-change-canary`
(owner only). Nothing was written to Etsy. The canary makes OUR CACHE disagree
with Etsy — a synthetic image id and a retrieved_at pushed seven hours back —
and lets the product's own six-hour refresh rule discover it.

Target: listing 4540080515 in the `bachelorette` cohort, image id 8316763937
presented to the refresh as 8316763938.

| | before | after |
|---|---|---|
| cohort listings | **42** | **41** |
| cohort shops | 39 | 38 |
| repeated movement | 42 | 41 |
| with usable image | 42 | 41 |

| what had to be true | result |
|---|---|
| the old analysis is rejected | **pass** — `droppedOnRefresh.imageChanged: 1` |
| the changed image cannot inherit the old evidence | **pass** — the cohort shrank |
| the cohort is recalculated correctly | **pass** — 41 is exactly 42 − 1 |
| provider spend occurs only when fresh analysis is needed | **pass** — warm, 0 calls, $0, ledger unmoved at $0.0015 |

- One real Etsy call was made: `etsyRefreshCalls: 1`. That is the refresh
  itself, which is the path under test.
- The reference row was restored and the restore was VERIFIED, not assumed:
  `restored: true` compares both image id and retrieved_at against the values
  read before the change.
- `GET` on the same route afterwards: `clean: true`, no residue. It looks for
  the shape this canary writes — an image id the analysis table has never
  seen whose id minus one it has — because an image id with no analysis is
  ordinary on its own with the analyser backlog thousands deep.

Two earlier runs are worth recording because they were both my errors, not the
product's. The first returned a 500: the canary invoked the scan by fetching
its own URL, which a worker cannot do to itself. It failed at the baseline
scan, before any mutation, and the integrity check confirmed nothing was left
behind. The second fired the branch correctly but reported two proofs false,
because a successful scan did not return its cohort at all — only a refused
one did. That was a real gap in the product and is fixed in D1709: the case
where a comparison is actually made now says what it rests on.
