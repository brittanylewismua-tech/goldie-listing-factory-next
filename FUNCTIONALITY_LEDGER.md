# Functionality ledger

**Build:** D1733 · commit `1e69f8e3` · live commit matched the local tree at every check.
**Suite:** 3,466 tests — **3,454 passing, 0 failing, 12 skipped.**
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
| **Market Watch** | **Defect found and fixed — see below.** Six of seven niches reported their evidence could not be refreshed, and the figures behind them were 37 hours stale. Now: all seven current, TODAY reporting real movement. |
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

## Market Watch refresh defect — CLOSED (D1733)

**Build:** D1733 · commit `1e69f8e3`. **Suite: 3,466 tests — 3,454 passing, 0 failing, 12 skipped.**

### I had the diagnosis wrong in the previous version of this ledger

I recorded that reference imagery was aging past a 36-hour threshold before
the refresh job cycled back. That was wrong, and it was a guess presented as a
finding.

Measured: **3,758 of 3,758 reference images are inside the six-hour window —
100%.** The image refresh system was working perfectly the whole time. The
evidence was current. Only the brief built from it was old.

### The actual defect

`appendHistory` — the only thing that writes a niche brief — is called in
exactly two places: when a member **opens** a niche, and when they **save**
one. No scheduled job ever wrote one.

So a saved niche aged from the moment it was last opened, crossed the 36-hour
line, and the list then reported that its evidence "could not be refreshed".
Nothing had failed. **Nothing had been attempted.** "girl power" was the one
fresh niche purely because it had been opened 6.5 hours earlier.

### It was worse than a stale label

The briefs were 37 hours out of date, so the figures were not merely old —
they were wrong, and wrong in the direction of making her market look dead.

| niche | moving, before → after | repeated | shops |
|---|---|---|---|
| bachelorette | 73 → **128** | 49 → 85 | 61 → 100 |
| halloween | 18 → **127** | 7 → 75 | 18 → 111 |
| dog mom | 16 → **45** | 12 → 34 | 11 → 39 |
| teacher | 10 → **39** | 5 → 23 | 10 → 36 |
| political protest | 3 → **7** | 2 → 5 | 3 → 6 |
| feminist | 1 → **6** | 1 → 3 | 1 → 6 |
| girl power | 5 → 5 | 1 → 2 | 5 → 5 |

Two consequences worth naming:

- **The TODAY panel said "Nothing new in your watches since yesterday."** That
  was false. It now reads, correctly: halloween 109 listings newly showing
  momentum and 68 now repeating; bachelorette 55 and 36; teacher 29 and 18.
- **"teacher" was being reported as too thin to act on.** The substantial-niche
  bar is 12 listings, 8 shops, 5 repeated. On the stale brief it read 10/10/5 —
  below the bar. Current, it is 39/36/23 — comfortably over. Design Scanner
  uses the same bar, so that niche was being refused there on stale evidence.

### What was built

- **`app/niche-brief.ts`** — `readNiche` lifted out of the route *unchanged*,
  so the scheduled refresh and the member's own page build a brief the same
  way. Two implementations would drift, and the one that drifted would be the
  one nobody was looking at.
- **`app/niche-brief-state.ts`** — the five states kept deliberately apart.
- **`/api/market/niche-brief-tick`** — rebuilds due briefs on the existing
  `*/20` cron. Internal-only by the same proof the other cron routes use.

### The ten items

1. **Measurement.** Reference images: 3,758 held, 3,758 fresh within six hours,
   3,728 usable. Image job: 300 listings per 20-minute run = 5,400 per
   six-hour window against ~3,758 needing refresh — **1.4× headroom**, at 3
   Etsy calls per run (216/day). The brief queue could not be measured because
   **it did not exist**; that was the finding.
2. **Why ~37 hours.** Not queue delay. Briefs are only written when a member
   opens or saves a niche, so 37 hours was simply the time since she last
   opened them. The wait was unbounded, not long.
3. **Prioritisation.** The brief job only ever touches saved member niches, so
   member-supporting work is ahead of unused corpus by construction. Within
   them: never-built first, then oldest, then most-recently-read. The image
   job already prioritised the visible momentum corpus over the rest.
4. **Deduplication.** `GROUP BY niche_key`. A brief belongs to the niche —
   `niche_watch_history` has no user column — and every figure the list shows
   is member-independent, so two members watching "dog mom" share one rebuild.
   The run reports `watchersCovered` so that saving is visible. The single
   per-member figure, "new since you last looked", is deliberately **not**
   stored by a scheduled rebuild (nobody is looking) and is computed live on
   open — confirmed live: bachelorette showed "54 new since you last looked".
5. **The six-hour evidence rule is untouched.** A test asserts the refresh
   module never references display freshness, and that the brief builder still
   applies it.
6. **Distinct terminal states.** `fresh`, `due`, `processing`, `unavailable`,
   `failing`. A rebuild that finds no movement is **unavailable, not failing**,
   so an empty niche neither enters backoff nor looks broken. Three consecutive
   failures back off for six hours, then return to the queue — neither
   recycling every run nor being abandoned. A niche nobody has opened in 30
   days moves to a 24-hour cadence rather than being dropped.
7. **Health accounting.** A `nicheBriefs` probe reports all five separately,
   plus the oldest brief age against the staleness line. This is the gap that
   let the defect hide: `referenceImages` was green while the member's screen
   was not, and no probe could tell them apart.
8. **Completion rate exceeds creation rate.** 25 rebuilds per run × 18 runs per
   six-hour window = **450 completions per window** against a roster of 7 —
   64× headroom. Each niche falls due once per window, so the niche count *is*
   the creation rate. Proven to drain from a cold start with everything due at
   7, 50 and 200 niches.
9. **All seven re-run live.** Every one returned `stale: false`. The list
   renders real counts; the detail page renders listing cards with images
   (129 of 129 carrying an image, 129 of 129 inside the six-hour window) and
   confirmation times of 38 and 47 minutes. Health after: 7 fresh, 0 due,
   0 processing, 0 unavailable, 0 failing.
10. **Cost.** **Zero Etsy calls and zero paid provider calls.** A brief is two
    D1 queries over data already held — which is *why* this can run often
    enough to matter. The run states both figures in its own response rather
    than leaving them to be assumed, and a test asserts no outbound call exists
    on the path.

**No capacity blocker.** The Etsy budget was never the constraint here: the
work that was missing costs nothing at Etsy. No evidence standard was
weakened, no threshold loosened, and no warning hidden.

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

Security is closed. The walkthrough found one material defect — Market Watch's
brief refresh — which is now fixed, deployed and verified live. Every launch
invariant holds. The register is finishing on its own.

**The one remaining item:** the trademark register drains (earliest ~10:00Z,
two files held by USPTO until 07:00Z and 10:00Z), then one live read to confirm
the wording flips to the final-with-skipped-files sentence. That outcome is
already determined and proven by test; what remains is observing it.

After that: the Sites reskin.
