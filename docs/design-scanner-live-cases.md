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

### Still open

Cases 14–16 (stale reference image, changed reference image, provider failure)
need a cold scan each and the allowance is at 10 of 10. One slot returns as
the oldest scan leaves the rolling window.
