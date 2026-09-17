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

### Still open

Cases 14–16 (stale reference image, changed reference image, provider
failure) need a cold scan each and the allowance is at 10 of 10. The next
slot returns at 2026-09-18T02:15Z as the oldest scan leaves the rolling
window; the three cases need three slots, which arrive over several hours.
