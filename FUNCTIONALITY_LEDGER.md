# Functionality ledger

**Build:** D1732 · commit `b0ecd7a4` · live commit matched the local tree at every check.
**Suite:** 3,451 tests — **3,439 passing, 0 failing, 12 skipped.**
**Presentation:** frozen. No visual work in this pass.

---

## Full-product walkthrough

Walked on the deployed site, signed in as the owner account. Each surface was
driven, not just loaded.

| Surface | Result |
|---|---|
| **Listing Factory** | Renders the three-step rail on Setup. Saved products load with real Printify imagery (iphone case, Gildan Tee, Gildan 18500 hoodie), each showing its option and colour/size counts. Usage reads 199 / 10,000; weekly goal 1 of 20. No regression. |
| **Design Scanner** | Renders its empty state deliberately — "No design yet", with the reason and the next action, not a blank region. No regression. |
| **Trademark Checker** | Ran a real check ("moody mics"). Returned "Nothing found" with the incomplete-register qualification in **both** places it matters — see below. No regression. |
| **Market Watch** | Renders. Today's line is honest: "Nothing new in your watches since yesterday. Market Watch is still watching." Seven niches with real counts. One freshness observation below — not a regression. |
| **Shop Watch** | Renders real evidence with its caveat intact: "Reviews are not sales, and a buyer can leave one up to a hundred days after delivery", then the concrete basis — "9 of the last 500 reviews in this shop are for this one listing, against an average of 1.3". No regression. |
| **Shop Map** | The strongest honesty surface. Profit is **withheld, not guessed**: "Profit unavailable — production costs missing for 1 of 1 orders", with revenue ($25.00) and Etsy fees (−$5.07) still shown, Production as "Not available", and a repair path — "Add the missing production cost". The freshness note is dated: "Worked out from your sales up to 15 September. Anything sold since then is not in this figure yet." Direction is refused rather than invented: "No clear direction yet. Only 15 orders in the last 90 days across every niche — too few to say where the shop is pointed." No regression. |

**No material regressions were found, so none were fixed.**

One note on method: Listing Factory and Connections appeared to hang during
the walkthrough. They had not. The pages hold long-running provider requests
open, so the browser never reaches `document_idle` and the automation waits
on it. Measured directly, the endpoints behind those screens answered
**200 in 86–850 ms**. The pages render completely.

## Launch invariants

| Invariant | Evidence |
|---|---|
| **Checkout disabled** | `/usage` → "PLANS + BILLING · **Not open yet** — The Listing Factory is still in private testing. There's nothing to buy right now, and no plans or prices are available yet." No prices anywhere; no Starter / Pro / Scale; no retired $14.99 / $24.99 / $39.99. |
| **Beta roster empty** | `/api/operations/beta` → `{"roster":[],"complimentary":0,"capacity":{"granted":0,"target":20}}` — nobody granted. |
| **Canary-only access** | `/api/access/status` → `{"signedIn":true,"active":true}`; plan is `owner_test`, price 0. |
| **No test data in her shop** | Override audit: **0 active** (2 stored, 2 reversed), 0 orphaned, 0 money-in-two-places, 0 unreadable, no duplicated rows. |
| **No Etsy listing created or changed** | `publishedToday: 0`, `publishing: 0`. The 199 drafts are unpublished Printify drafts, not Etsy listings. |

## Trademark register

Still advancing under its own server-side cron. No supervision, no app open.

**Now:** 228,136 marks · 109 done · 1 partial · 3 skipped · 6 waiting · queue
advancing. Two files are held by USPTO rate limiting until 07:00Z and 10:00Z —
waiting on USPTO, not stuck.

**Terminal state, determined rather than guessed.** Readiness requires no file
`waiting` *and* none `partial`; completeness additionally requires no `skipped`
file holding records. Run against the live counts:

| | ready | complete |
|---|---|---|
| now | false | false |
| when the queue drains, 3 skipped remaining | **true** | **false** |
| only if those 3 ever load | true | true |

So unless the three skipped files become readable, the register settles as
**final-with-skipped-files** — not complete. That state has its own member
wording, already implemented and distinct from the other two:

> "No exact or contained match was found in the trademark records that could
> be read, or the curated risk list. **A few records could not be loaded at
> all, so this is not the whole register.** This is screening information, not
> legal clearance."

**Verified live today** (register still loading), in both places a member
sees it:

- in the result — "No match was found in the trademark records **currently
  loaded**. This is screening information, not legal clearance."
- in the explainer, bolded — "**The register is still loading, so treat a
  clean result as incomplete today.**"

13 tests cover the three states, including that `partial` blocks readiness and
that only a register with nothing left out is allowed to name the whole
register.

**Outstanding — the one open item in this ledger:** a single live read after
the queue drains (earliest ~10:00Z), to confirm the wording flips to the
final-with-skipped-files sentence. The outcome is proven; what remains is
observing it. This line gets updated in place rather than issued as a second
ledger.

## One observation, not a regression

Six of seven niche watches display "Last update could not be refreshed —
showing the last confirmed reading". That message is correct and the
underlying data is real: the detector is healthy (17,652 monitored listings,
100% baselined, 90.6% fresh, oldest poll 30 minutes old, 0 unavailable), and
the counts shown come from it.

What is stale is the **reference imagery**, which is marked stale past 36
hours. Six niches were last imaged ~37 hours ago; one, 6.5 hours. The image
refresh job runs on cron and is working — it simply cycles slowly enough that
most niches sit just past the display threshold.

This is the honest-labelling design doing its job, not a failure. It is
recorded because a member would see that line on nearly every niche, which is
a poor first impression even though nothing is wrong. **Deliberately not
changed here** — altering the refresh cadence or the 36-hour threshold is a
product decision, and presentation is frozen.

## Design handoff

`DESIGN_HANDOFF.md` updated for the approved Sites reskin. The security pass
introduced two member-visible states that did not exist when the handoff was
written, and the handoff's own rule is that a state with no place in the new
design is a blocker rather than a detail to fill in later:

- **A file that was not accepted** — seven distinct messages, all safe to
  render verbatim. The design point: this is a refusal, not a failure —
  nothing stored, nothing sent to a provider, no allowance spent — and a
  multi-file choice is all-or-nothing, so the message belongs to the set
  rather than to one row.
- **Too many requests** — 429 with an authoritative `Retry-After`. The only
  state a member can reach without doing anything wrong, so the tone is "come
  back in a moment", and it must not discard their work.

The three trademark register sentences were already documented and needed no
change.

---

## Where this leaves the product

Security is closed. The walkthrough found no regressions. Every launch
invariant holds. The register is finishing on its own and its terminal
behaviour is proven.

The remaining gate is the register draining, and then one look at it.
