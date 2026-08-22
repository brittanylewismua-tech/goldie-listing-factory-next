# DEFECTS — running list

**This is the working list. Add to it, mark items fixed, do not delete them.**

Every item has: where it is, what is wrong, and what to do. Items are numbered so
they can be referenced in commits (`fixes D14`).

Status key: `OPEN` · `FIXED` · `WONTFIX`

Last verified against the live site and `main`: 20 Aug 2026.

---

## Blocking

### D74 · Wrong garment type in titles — the koozie bug, mutated · **FIXED** · **HIGH**

Live run, 3 fresh designs on the **Gildan Tee**, bank = BACHELORETTE TEES:

> Listing 3 title: *"Fresh Off The Market, Off The Market, She Said Yes, Shes Off
> The Market, **Wifey Sweatshirt, Future Mrs Sweatshirt, Bride Hoodie**"*

A t-shirt listing containing **sweatshirt** twice and **hoodie** once.

**Why the existing guard missed it.** The PRODUCT TYPE RULE denylist I wrote
covers non-garments — koozie, coozie, sash, sunglasses, tapestry, tattoo,
sticker, mug, tumbler, cup, banner, decor, poster, print, blanket. Sweatshirt
and hoodie are garments, so they pass. But they are the **wrong** garment.

**Fix:** the rule is not "reject non-garments", it is **"reject any product noun
that is not this product"**. For a t-shirt that must also exclude sweatshirt,
hoodie, crewneck, sweater, tank top, long sleeve, and vice versa for every other
blank. Derive the excluded set from `templateDetails.blueprintTitle` rather than
a fixed list.

### D75 · Tags are being shredded into meaningless fragments · **FIXED** · **HIGH**

Same run. Generated tags for listing 1:

> `bachelorette girls, gone mild, girls gone mild, girls gone, mild bachelorette,
> fresh off the market, fresh off the, market bachelorette`

**Six of eight are fragments**, not keywords: *"gone mild"*, *"girls gone"*,
*"bachelorette girls"*, *"mild bachelorette"*, *"fresh off the"*,
*"market bachelorette"*. Listing 3 produces *"future mrs"*, *"mrs sweatshirt"*,
*"off the"*.

**Cause:** `splitLongPhrase` in `app/seo-utils.ts`. Etsy caps a tag at 20
characters, so any bank phrase longer than that gets chopped into ≤20-char word
groups. *"fresh off the market bachelorette"* is 33 characters, so it becomes
*"fresh off the"* + *"market bachelorette"*.

Etsy matches tags as whole phrases. *"fresh off the"* is worth nothing, and it
occupies a slot that a real keyword could hold. **The tag count going from 2/13
to 8/13 is not an improvement if six of them are noise.**

**Fix:** never fabricate a tag by splitting. If a bank phrase exceeds 20
characters, drop it from tags (keep it in the title, where 140 characters
applies) and fill the slot from the next phrase that fits. Better: ask the model
for tag-length phrases directly rather than deriving them from the title.

### D76 · Titles do not describe the design · **FIXED AND VERIFIED LIVE**
The three designs read SCOTTSDALE / SAVANNAH / TULUM. None of the generated
titles mention any of them, because the bank contains no Scottsdale, Savannah or
Tulum phrase — it has Palm Springs, Nashville, Vegas and New Orleans.

Behaviour is technically correct: the model may only use bank phrases. But the
result is three listings whose titles have nothing to do with the artwork.

**Fix:** when no bank phrase matches the design's own text, say so per row —
*"No phrase in this bank matches this design. Add one, or write the title
yourself."* This is the honest version of the fallback D53-era code used to hide.

Verified on the live three-design batch: the warning rendered on the affected
listing with the exact copy above. The browser console remained clean.

### D77 · Fill quality varies wildly across one batch · **FIXED AND VERIFIED LIVE**
Same batch, same bank, same product:
| Listing | Title | Tags |
|---|---|---|
| 1 | 132/140 | 8/13 |
| 2 | **45/140** | **3/13** |
| 3 | 126/140 | 8/13 |

Listing 2 got roughly a third of the fill for no visible reason. The 8–13 phrase
instruction is not being applied consistently.

The API now requires eight selected title phrases whenever at least eight valid
bank candidates exist, and all available eligible tags up to Etsy's 13 slots.
It retries one thin response once and rejects that row after a second thin
response. The live three-design run produced one complete 139/140, 13/13 row
and explicitly rejected the other two after both returned only 7 of 8 required
title phrases. Rejected rows now block the forward gate until the seller edits
the title or successfully regenerates it; editing clears the row error.


### D73 · Nothing advances past the first Finish phase on a resumed batch · **FIXED**
Verified live on batch `9a78b187`:

| Clicked | Step counter before | after |
|---|---|---|
| "Etsy details" sub-step (enabled) | Finish · Titles + tags (1 of 4) | unchanged |
| "Publish" sub-step (enabled) | Finish · Titles + tags (1 of 4) | unchanged |
| "Next step" button | Finish · Titles + tags (1 of 4) | unchanged |

The **Photos** sub-step does not render at all. No error is shown in any case.

Same shape as D53 — an enabled control that silently does nothing — moved down
one level. D53 fixed getting *into* Finish; nothing moves *through* it, so a
resumed batch lands on titles and stops there permanently. D64, D67 and the
whole publish screen are unverifiable while this holds.

---

### GUARD · `app/workflow-gates.ts` + `tests/workflow-traversal.test.mjs` · **ADDED**

Every navigation blocker shipped so far came from one place: gate logic defined
inline in `listing-factory-app.tsx` and read by three callers — the step rail,
the Next button, and the URL handler. Changing a condition for one silently
closed the path for the others.

`app/workflow-gates.ts` extracts `canOpenStep`, `canOpenPhase`,
`blockedReasons` and `resumeStep` as pure functions over an explicit
`GateState`. `tests/workflow-traversal.test.mjs` asserts the properties that
must always hold.

**Wiring required:** `listing-factory-app.tsx` must import these instead of
defining its own copies, so all three callers share one source of truth. Until
that happens the guard protects the module but not the app.

**Verified:** 7/7 pass against the corrected logic. Reintroducing D53's
condition fails 4 of 7 with:
> *A batch with real Printify drafts cannot open "finish". The seller has
> already paid for these listings and must always be able to reach them.*

**Two rules the guard encodes:**
1. **Completion overrides everything.** Once drafts exist, every step and phase
   stays open. No condition may close a completed batch.
2. **No silent no-ops.** If `blockedReasons` is non-empty the control must be
   disabled and show the reason. Never render it enabled and inert.


### D53 · A resumed batch cannot reach its own drafts · **FIXED** · **WORST DEFECT FOUND**

**Symptom.** Open a batch from Batch History that already has Printify drafts:
- The card's button says **"Open results"** — it lands you on **step 3, "Add your designs."**
- The **Finish** node in the rail is **enabled** (`disabled: false`) and clicking it
  **does nothing**. Step counter stays "Step 3 of 5". No error, no message.
- Navigating directly to `?step=finish&phase=details` **rewrites the URL back to
  `step=designs`** on load.

The drafts are fine — forcing the route client-side renders
"Finish · Publish (4 of 4)" correctly. **The data exists; the navigation to it is
broken.** From the seller's side their work has vanished, on a page headed
"Continue where you left off."

**ROOT CAUSE — corrected 20 Aug.** My first diagnosis blamed the IndexedDB
design-file cache. That was wrong. Forcing the route reveals a blocking modal
that names it exactly:

> **Finish all sections first.**
> Fix these items: *Review and approve every enabled variant price.*

The Finish step is gated on `pricingApproved`. Counting every call site in
`app/listing-factory-app.tsx`:

```
 1 x  setPricingApproved(Boolean(state.pricingApproved))   <- restore from saved state
 9 x  setPricingApproved(false)
 0 x  setPricingApproved(true)                             <- DOES NOT EXIST
```

**Nothing in the codebase can ever set pricing to approved.** Saved state is
therefore always `false`, so every restore restores `false`, so the Finish gate
can never pass on a resumed batch. This is the same bug as **D23** — the badge
and the gate share one unreachable flag.

Going *forward* through the wizard in a single session still works, because the
flow advances without consulting the gate. **Resuming is what is broken**, which
is exactly the path Batch History advertises.

**Fix:**
1. Wire a real approve action, or drop `pricingApproved` from the Finish gate
   entirely — prices are already validated on the pricing step.
2. Remove the "✓ Approved" badge until it reflects something real (D23).
3. When a required step blocks navigation, the blocked control must say so
   inline. Today the Finish rail button looks enabled, does nothing on click,
   and only reveals the reason if you force the route.

**Also fix the label:** "Open results" must open the results, not step 3.

**Fixed:** Created drafts now establish that their validated pricing was
approved, including after restoration. Batch History carries an explicit
results intent; completed draft runs open their saved Finish phase, while an
unfinished batch safely discards that intent and resumes its saved step.


### D1 · No forward button once a batch has drafts · **FIXED**
**Where:** Pricing, Designs, and the new batch screen — verified on all three by
enumerating every visible `<button>`.
**Wrong:** the only controls are help icons, Edit, and Back. The forward action is
conditioned on the batch *not* being complete, so it disappears once drafts
exist. The summary block still says "This step creates unpublished Printify
drafts," promising an action that no longer exists.
**Fix:** the forward button's label changes with state, it never disappears. When
drafts exist it reads "Back to finishing your listings" and returns to the Finish
phase last visited. **No screen may render without a forward path.**

---

## Batch screen (step 2)

### D2 · Section order is wrong — designs must come first · **FIXED**
**Wrong:** Colours and Mockups sit above the designs drop zone. Both are decisions
*about* the designs. You cannot judge which shirt colours suit artwork that has
not been uploaded, and a mockup picker rendered before any design exists can only
show blank garments.
**Fix:** `Product → Designs → Colours → Mockups → Saved for this product`.
Remembered defaults still pre-fill; they simply appear below the designs as
something to confirm rather than choose cold.
**Unlocked by this:** mockup thumbnails can render the seller's actual design
instead of a stock blank.

### D3 · "✓ Ready for this batch" is unreadable · **FIXED**
**Where:** the selected product card. Class **`.recipe-use`**.
**Wrong:** text colour `rgb(101, 67, 98)` on a dark plum filled pill. Dark purple
on dark purple. The button was promoted to a filled style and kept its old dark
text colour.
**Fix:** white text on the filled pill, or revert to an unfilled state. Contrast
must be ≥ 4.5:1.
**Introduced by:** `feb73c2`.

### D4 · "+ Add another product" disappears once a product is selected · **FIXED**
**Corrected 20 Aug:** the button *is* present before selection — my first report
said it was gone entirely, which was wrong. It vanishes **after** you pick a
product, so you cannot add a second product without first clearing the batch.
**Fix:** keep it visible in both states.

### D5 · No way to unselect a product · **FIXED**
**Wrong:** nothing matching unselect / change product / choose a different. Once
selected, the only escape is Back or "Clear batch + start over".
**Fix:** a "Change product" link on the selected card.
**Introduced by:** `feb73c2`.

### D6 · "Rename / reconnect" — reconnect is meaningless · **FIXED**
**Wrong:** the Printify link is stored on the saved product. There is nothing to
reconnect, and the word implies something is broken.
**Fix:** label it **"Rename"**. If a re-link path is genuinely needed for a
replaced Printify product, put it inside that flow with an explanation, not in
the label.

### D7 · "Everything else" reads as a junk drawer · **FIXED**
**Fix:** **"Saved for this product"**, with the hint "usually no changes needed".
Contents are pricing, shipping, description, Etsy attributes and keyword bank —
not leftovers.

### D8 · Section headings are sentences, not labels · **FIXED**
| Now | Fix |
|---|---|
| Adjust what changed. Keep everything else. | **delete** — the `<h1>` already says "Build this batch" |
| Choose the colors you want to offer | **Colours** |
| Choose the look you want | **Mockups** |
| Choose a saved product | **Product** |

Keep "From your last batch — change any" — that line tells the seller something
they did not know.

### D9 · Mockup thumbnails show internal filenames · **FIXED**
**Wrong:** each thumbnail is captioned "ChatGPT Image Aug 14, 2026, 10_42_04 A…".
**Fix:** no caption, or a meaningful one. Never expose upload filenames.

### D10 · Mockup block shows 4 of 10 with no indication there are more · **FIXED**
**Fix:** "+6 more" or a count.

### D11 · "BACH TEES" appears twice · **FIXED**
Once as a label top-right of the block, once in the dropdown below it.

### D12 · The bundle row is sandwiched mid-flow · **FIXED**
**Wrong:** "Using this design on multiple products? · OPTIONAL" sits between the
product list and the confirmation of what was just selected. Reading order is
choose → unrelated optional feature → what you chose.
**Fix:** move below the selected-product confirmation. Bundles are the strategic
priority; this placement works against that.

---

## "Saved for this product" panel — expanded state

*These only appear after clicking Edit. Found by opening the panel, not by
reading the page at rest.*

### D13 · The shipping profile row is broken · **FIXED**
**Wrong:** "Shipping profile" wraps onto two lines inside a collapsed ~60px label
column, and its helper text renders as a vertical ribbon beside the dropdown —
"The am… cus… pays… separate from item profit." — one or two words per line.
Every other field in the panel is full-width and stacked; this row alone uses a
two-column layout whose left column has collapsed.
**Fix:** make it match the other fields — label above, control below, full width.

### D14 · Product description textarea clips its own content · **FIXED**
**Wrong:** text runs off the bottom mid-word ("…personalized appare"), with no
visible scrollbar and no resize affordance.
**Fix:** taller default, visible scroll, or auto-grow.

### D15 · "Listing photos" is a status shaped like a control · **FIXED**
**Wrong:** "Listing photos — Choose after previews are created" renders as a tile
identical to "Etsy details — 3 product facts remembered", which *is* actionable.
Same treatment, different behaviour.
**Fix:** status text must not look like a button.

### D16 · Etsy details described two different ways on one screen · **FIXED**
**Wrong:** "3 product facts remembered" inside the panel, "Etsy details 3 of 11
set" in the summary chip below it. The first hides the denominator.
**Fix:** one phrasing, always with the denominator.

---

## Connect (step 1)

### D17 · Etsy shows a white Disconnect bar, Printify does not · **FIXED**
Reported by Brittany. Needs verification and a matching treatment.

### D18 · The step contains no decisions for a returning seller · **FIXED**
Both accounts connected — the screen is two green confirmations and a Next
button, occupying a slot in "Step 1 of 5".
**Fix:** move connection status to the sidebar; interrupt the flow only when a
connection is broken. Common case becomes four steps.

### D19 · "Connecting usually takes about 2 minutes" shows while connected · **FIXED**
Now reads "Both connections are verified. Goldie will remember them for future batches."

### D20 · Two Disconnect buttons outrank the forward action · **FIXED**
Both are solid white above a soft-gradient "Next step".
**Fix:** Disconnect becomes a text link inside each row.

### D21 · `<h1>` says "Connect Printify" but the screen handles Etsy too · **FIXED**
Now reads "Connect your accounts".

---

## Pricing (step 4)

### D22 · Whole-number pricing checkbox is detached from the prices it changes · **FIXED**
Pinned top-right, above the "1. Item prices" heading and above "Profit goal".
**Fix:** group Profit goal and this checkbox in one row directly above the
variant price rows.

### D23 · "✓ Approved" appears before anything is approved · **FIXED — verified on a never-approved batch**
**Root cause:** `setPricingApproved(true)` **does not exist anywhere in the
codebase.** The state is initialised `false`, set `false` in seven places, and
otherwise only restored from saved state — so no code path can legitimately
produce this badge.
**Fix:** find what is setting it, then either wire a real Approve action or remove
the badge.

### D24 · "Pricing review" restates "Review pricing" directly above it · **FIXED**

### D25 · Three `?` help buttons in one screenful · **FIXED**
**Fix:** one help affordance per screen, at the page title.

### D26 · Bottom summary repeats figures reconciled 200px above it · **FIXED**
"Profit target $10.00" and "Printify fulfillment shipping USD 7.99" appear again
below the warning box that already explains the gap between them.

### D27 · Pricing summary carries rows for steps that have not happened · **FIXED**
"Keyword bank — Choose after drafts", "Mockup set — Choose after drafts".

---

## Designs (step 3)

### D28 · Four status readouts for one fact · **FIXED**
`✓ 3 loaded` badge · "3 of 20 designs ready · 1.1 MB selected" · "All 3 designs
are ready 3/3" with a progress bar · "3/7 designs available this batch".
**Fix:** one line. The quota version is the useful one.

### D29 · Two different maximums stated 400px apart · **FIXED**
"20 designs maximum" in the limits row versus the plan quota below it.
**Fix:** state only the binding constraint.

### D30 · The upload card stops saying what it does · **FIXED**
Its title becomes "3 of 20 designs ready" after upload while the adjacent card
still reads "Choose individual images".

### D31 · Design thumbnails are ~40px circles · **FIXED**
Too small to tell twenty similar designs apart.
**Fix:** square, ~72px, artwork edge to edge.

### D32 · "Remove" has no confirmation once drafts exist · **FIXED**

---

## Photo validation

### D33 · The error no longer names the listings · **FIXED**
Now reads "2 listings need at least one photo". The old `, .` bug is gone but at
20 designs you cannot tell which two.
**Fix:** name them, resolving the label from `files` via `clientId`.

---

## Usage + Plan

### D34 · The trial end date is never shown · **FIXED**
Card says "Mastermind beta", "3-day trial", "Resets August 31, 2026". A 3-day
trial that resets monthly is incoherent, and the one date a trial user needs is
missing.

### D35 · Two different limits both rendered as "/20", side by side · **FIXED**
"Listing creations 13 / 20 this month" beside "Listings published in 24 hours
0 / 20". One is a monthly quota, the other a daily rate limit.

### D36 · "Plenty of room" at 65% used · **FIXED**
**Fix:** amber past ~75%, and state what remains in units the seller thinks in.

### D37 · The Etsy fee profile lives on the billing page · **FIXED**
It drives every profit figure on the Pricing step. Nobody debugging a wrong
profit number will look under Usage + Plan.
**Fix:** surface it from Pricing, and include it in "Saved for this product".

### D38 · Sidebar label inconsistent · **FIXED**
"Usage + Plan" on that page, "Usage" inside the Listing Factory.

---

## Keyword Banks

### D39 · The create form occupies the primary position · **FIXED**
Empty name field, empty textarea and file picker at the top; your saved banks
below. Creating is occasional; choosing is why you came.

### D40 · Banks never show which product uses them · **FIXED**
**Fix:** "Used by: Gildan Tee" on each bank.

### D41 · Bank contents are unvalidated · **FIXED**
A bank named "BACHELORETTE TEES" contained koozie, coozie, sash, sunglasses,
tapestry and hoodie phrases — 13 of 50 for other products. That is what produced
the koozie title.
**Fix:** on save, flag phrases naming a different product type. Same denylist
already in the title prompt, applied one step earlier where it can be fixed.

---

## Mockup Sets

### D42 · A set containing 10 mockups displays zero mockups · **FIXED**
"BACH TEES / 10 mockups" above ~200px of empty white. A visual library showing no
visuals.
**Fix:** thumbnail strip of the first 4–5 on the card face.

### D43 · Four heading levels for one page · **FIXED**
"YOUR SAVED MOCKUP LIBRARY" → "Manage your mockup sets." → "SAVED SETS" → "Your
mockup sets".

### D44 · Naming does not match the Listing Factory · **FIXED**
This page says "Mockup Sets"; the Photos step says "Add Your Own Mockups
(Optional)". A seller will not connect the two.

---

## Systemic

### D45 · The rare or destructive action is the loudest on six screens · **FIXED**
| Screen | Loud | Quiet |
|---|---|---|
| Pricing | whole-number checkbox | the prices it changes |
| Connect | two Disconnect buttons | Next step |
| Choose product | "+ Add another product" | "Choose this product" |
| Mockup Sets | "+ Add mockup set" | using an existing set |
| Keyword Banks | "Create a keyword bank" form | your existing banks |
| Listing cards | three optional accordions | the title field |

**One design decision made six times, not six bugs.**
**Rule to adopt:** the action taken most often gets the filled button; setup and
destructive actions get links.

### D46 · Finish sub-steps unreachable from outside Finish · **FIXED**
They only render when `workflowStep === "finish"`, so from Designs you cannot
jump to Photos.

---

## Process notes for whoever is building

- **Three changes this session introduced new problems.** The `31501ac` refactor
  dropped a shipped fix; the mockup work left "Choose later" contradicting its own
  headline; and `feb73c2` produced D3, D4 and D5 on a single card.
- **After every change, re-check the screen you touched for:** unreadable text,
  actions you removed, and states you cannot reverse.
- **Defects hide in interaction states, not at rest.** D13–D16 were only visible
  after expanding a panel. Open every collapsible and select every option before
  calling a screen done.


---

## Visual pass — 20 Aug, found by looking rather than querying

### D47 · Printify and Etsy "Disconnect" render completely differently · **FIXED**
**Where:** Connect step. **Both buttons share the class `.disconnect-link`.**
**Wrong:** computed styles differ — Printify `background: rgba(0,0,0,0)` with
colour `rgb(123,82,110)`; Etsy `background: rgba(255,255,255,0.72)` with colour
`rgb(75,40,62)`. Printify renders as bare text, Etsy as a white pill. Same
action, stacked directly on top of each other, two treatments.
**Cause:** a more specific selector is matching only one of them — likely
positional (`:nth-child` / `:last-of-type`) or a parent class. This is a CSS
specificity bug, not a markup difference.
**Fix:** find the overriding rule and make both match. Both should be text links
(see D20).

### D48 · "Pick a keyword bank to continue" is unreadable · **FIXED**
**Where:** batch screen, the disabled forward button.
**Wrong:** pale grey text on a pale lavender gradient. Verified by zoom — the
label is barely distinguishable from its own background.
**Note:** the *behaviour* here is right and worth keeping — a disabled button
that states its own unblock condition is good design. It just cannot be read.
**Fix:** disabled state needs a darker label or a more muted background.

### D49 · Five status readouts on the designs section, with conflicting numbers · **FIXED**
All on screen simultaneously:
- "7 designs available for this batch · 7 listings remain on your plan"
- "**3 of 20 designs ready** · 1.9 MB selected"
- "Upload updated / 3 designs were added"
- "All 3 designs are ready · 3/3" with a progress bar
- "**3/7 designs available this batch** · 4 more available · 7 left on your plan"

**Wrong:** two of these state different maximums — **20 and 7** — roughly 250px
apart. Worse than the four-readout version originally logged as D28.
**Fix:** one line, using the binding constraint.

### D50 · The "Everything else" chips float outside their own card · **FIXED**
The header row ("Everything else · Edit") is a card; the chips beneath it
($10 profit, Standard shipping, Description ready, Etsy details 3 of 11 set) sit
on the page background below it, visually orphaned.
**Fix:** chips belong inside the card they summarise.

### D51 · `?step=connect` silently redirects to `step=setup` · **FIXED**
Deep-linking to the connect step is impossible; the URL rewrites itself. Other
steps deep-link fine.

### D52 · The forward button sits above the section it depends on · **FIXED**
"Pick a keyword bank to continue" renders above the designs area, so the action
that advances the flow appears before the content it is waiting on.


### D54 · A blocked upload still created a batch record · **FIXED**
Uploading 9 designs against a 7-listing allowance reported `0 uploaded` in the
UI, but Batch History now shows a batch with **9 designs** at that timestamp.
The batch row is created and the design count persisted before the quota check
rejects the upload, leaving junk in history from an action that was refused.

### D55 · Every batch in history has the same name · **FIXED**
Four rows all read "Gildan Tee / Unisex Heavy Cotton Tee". Only the timestamp
and design count differ. Design filenames exist (`austin-bach.png`, …) and would
distinguish them.
**Fix:** name batches after their designs, and show a thumbnail — the page is a
visual product showing no visuals.

### D56 · "Remove from history" sits next to the primary button · **FIXED**
A permanent delete, styled as a small text link, immediately beside the large
filled "Resume batch". No confirmation.

### D57 · Two button labels for the same action, one of which lies · **FIXED**
Rows show either "Resume batch →" or "Open results →" depending on status. The
split is reasonable, but "Open results" lands on step 3 (see D53).


---

## Shipping — two different things share one name

### D58 · "Shipping profile" means two unrelated things and the labels don't say which · **FIXED**

**Traced through the code, both numbers are real and come from different systems.**

**$4.75 — what the buyer pays.** Read live from **Etsy**:
`GET /shops/{shopId}/shipping-profiles` -> `domestic.primary_cost`
(`app/api/etsy/shipping-profiles/route.ts`). Not from Printify, not from the
saved product.

**$7.99 — what Printify charges to fulfil.** From Printify's catalogue:
`/catalog/blueprints/{id}/print_providers/{id}/shipping.json`, filtered to US
profiles covering the enabled variants, then
`standardShipping = Math.max(...rates)/100` (`app/api/printify/route.ts`).
It is the **highest** first-item rate across those profiles — hence "up to".

**Why they differ:** Printify creates Etsy shipping profiles when it syncs
products, so the Etsy profile was probably created *by* Printify. After that the
two drift independently — Printify's fulfilment rates change, the Etsy profile
stays where it was set. Nothing syncs them. Both figures are current and correct;
the gap is real.

**The defect is naming.** Three places, three vocabularies, none saying which
system it means:
| Where | Says | Actually |
|---|---|---|
| Pricing dropdown | "Shipping profile", helper "Selected automatically from your product template" | an **Etsy** profile — but the helper implies Printify |
| Batch summary | "Printify fulfillment shipping USD 7.99 cost" | Printify's cost |
| Warning box | "Your Etsy profile" vs "Printify's current estimate" | correct, but the only place it is stated |

**Fix:** name them everywhere.
- **"Etsy shipping profile — what buyers pay"**
- **"Printify shipping cost — what you pay"**

That alone makes the warning self-explanatory rather than alarming.

**Secondary:** since $7.99 is a *maximum* across variants, the warning overstates
the loss for variants that ship cheaper. `shippingByVariant` is already computed
in the same function — use it to show a range, or the figure for the variants
actually in this batch.


---

## Titles phase — rows have landed, the column widths are inverted

The row layout from `ROWS-SPEC.md` is live. Measured on a real listing row:

```
row            668 x 193 px
grid-template  56px  442px  116px      (thumb | fields | quality pill)
fields block   442 x  70 px            <- actual content
quality pill   116 x 171 px            <- a two-word status
title input    222 px wide, 15px font
```

### D59 · A status badge is 171px tall; the content it sits beside is 70px · **FIXED**
The DPI pill renders "243 DPI · review before printing" stacked over four lines,
plus "Medium resolution · 300 DPI recommended" beneath it. At **171px tall** it
sets the row height single-handedly — the row is 193px while its actual content
is 70px. **123px of every row is empty space created by a status badge.**

At 20 listings that is ~2,500px of nothing.

**Fix:** one-line inline badge — `243 DPI ⚠` — around 60px wide, sitting with the
other counts. Row height drops to roughly 80px. Twenty listings goes from
~3,900px of scroll to ~1,600px.

### D60 · The title field truncates the thing you are here to review · **REOPENED → FIXED**
The title input is **222px** — it shares the 442px fields column with tags. Etsy
titles run to 140 characters; 222px at 15px shows roughly 30. Every row reads
"Palm Springs Bachelor…", "Nashville Bachelorette …", "Bachelorette Koozies, …".

**You cannot review a title you cannot read**, and reviewing titles is the entire
purpose of this screen. It is also how the koozie title survived — at a glance
all three rows look similar.

**Fix:** give the title the full row width on its own line, tags beneath it.
`ROWS-SPEC.md` called for truncate-at-rest with expand-on-focus; there is
currently no expansion, so the text is simply unreachable.

**Note:** with the pill fixed (D59) there is 116px of width to reclaim, and the
row can be a full-width title with a counts strip underneath.

### D61 · "Auto Caps on" is a toggle that neither reads as one nor is legible · **FIXED**
Pale lavender pill, pale text, no on/off affordance and no state change feedback.
Same class of problem as D3 and D48.
**Also:** per D8 this is a preference, not a batch decision — it belongs on the
saved product.

### D62 · "BATCH TITLE BUILDER" eyebrow above "Create titles for the whole batch" · **FIXED**
Another instance of D8 on a different screen. The eyebrow restates the heading.

### D63 · "Upload or manage keyword banks ↗" navigates out mid-batch · **FIXED**
An external-arrow link inside the bank picker, positioned where a seller lands
when they have no bank selected — which is exactly when they are most likely to
click it and lose their place.
**Fix:** open bank management in a panel or new tab, never in-place mid-flow.


---

## Etsy details, Photos and Publish phases

### Landed and working — do not rebuild
- **Etsy details collapsed to summary rows** with a working denominator:
  "Etsy details · 3 of 11 set · Short sleeve, Crew, T-shirt" + Edit. (B2)
- **"Apply these photos to every listing" moved above the grid** — measured at
  **71px** from the top of the accordion, was 2,087px. (D-original, fixed)
- **Per-listing publish selection** with checkboxes and "Choose exactly which
  listings to publish". (`STRUCTURAL.md` S2)
- **Publish rows grouped by design filename** with real counts:
  "25/140 characters · 2/13 tags · 12 photos". (`BUNDLES.md` grouping)

### D64 · The publish screen shows the evidence and ignores it · **FIXED** · **HIGH**
On one row, verbatim:

> **Bachelorette Koozies, Bachelorette Coozies**
> 42/140 characters · 2/13 tags · 3 photos
> **✓ Ready for final publish**

The counts are now displayed correctly — and the readiness verdict directly
above them ignores every one. A koozie title on a t-shirt with 2 of 13 tags is
marked Ready. The checklist at the top of the same screen adds "✓ Titles are
complete" and "✓ Tags are complete".

This is the sharpest form of the original problem: the data proving a listing is
weak is now rendered two lines below the badge saying it is fine.

**Fix:** readiness must read the same numbers it displays. Under ~100 characters
or under 13 tags is not "complete" — amber, not green. Do not block publishing
(that stays the seller's call, per earlier decisions) but stop asserting the
opposite of what is on screen.

### D65 · "✓ Every enabled variation and price was reviewed" is unreachable · **FIXED**
Same root cause as **D53/D23** — `pricingApproved` can never be true, so this
checkmark either renders from stale saved state or is hardcoded. Either way it
claims a review that the code cannot record.

### D66 · The loudest control on the photos screen is an exit · **FIXED**
"Open all listings to review in Printify" is a large dark filled button at the
top of the phase — the most prominent element on the screen sends the seller out
of Goldie. "Choose size guide" beside it is also dark filled, so two filled
buttons compete before any listing content appears.

### D67 · No count against Etsy's 20-photo limit · **FIXED**
The flatlay picker still holds **148 checkboxes** and shows no running count and
no cap. One listing in this batch carries 12 photos with nothing indicating how
many are allowed.

### D68 · Tag chips are clipped on the photos phase · **FIXED**
The chip row beside each draft preview is cut off at the right edge with a dark
sliver visible where it overflows its container.

### D69 · Three eyebrow/heading duplications on these phases · **FIXED**
- `OPTIONAL · APPLY TO THE WHOLE BATCH` above "Add one size guide to every Etsy listing"
- `PRINTIFY DRAFT CREATED` above the listing title
- `EVERY LISTING IN THIS BATCH` above "Choose exactly which listings to publish"

Same pattern as D8 and D62.

### D70 · Three size-guide controls on one screen · **FIXED**
A batch-level "Choose size guide", a per-listing "Size guide for this listing ·
Using the batch size guide", and "Use a different size guide". The hierarchy is
correct but three controls for one concept on one screen needs collapsing.

### D71 · Etsy attribute fill is still non-deterministic across identical products · **FIXED**
Three listings, same Gildan tee:
- "3 of 11 set · Short sleeve, Crew, T-shirt"
- "3 of 11 set · Short sleeve, Crew"   ← count says 3, two values listed
- "4 of 11 set · Short sleeve, Crew, T-shirt"

Different fill states for the same blank, and on the middle row the count and the
listed values disagree. Confirms the earlier finding and adds a count/label
mismatch. Fixed by seeding from the Printify blueprint (`UX-DIRECTION.md` B2).

### D72 · The reassurance box overclaims · **FIXED**
"Titles, tags, descriptions, sizes, colors, and prices are set." shown above
listings with 25-character titles and 2 tags. Same category as D64 — "set" is
doing the work "complete" was doing.

### Verification for D73 · Resumed batches can move through Finish · **FIXED**
**Duplicate follow-up record for the blocker above.** Kept here for history;
the canonical status is the D73 entry in Blocking.
On a resumed completed-draft batch, the Finish sub-step rail and Next buttons
look enabled but phase navigation is rejected by a different gate. Photos never
renders and the seller receives no inline reason. One shared navigation gate
must drive control availability, its displayed reason, and the click path.

---

## Deep-scan pass — 21 Aug 2026

Every page and interaction state walked visually and measured in the live DOM,
after ChatGPT's `b826386`. Findings D78–D91.

---

### D78 · D74 is not actually fixed — plurals walk straight through · **FIXED HERE** · **BLOCKER**

`namesExcludedProduct` matched whole words only, so the denylist blocked
`koozie` but not `koozies`, and `coozie` but not `coozies`. Sellers write
keyword banks in the plural far more often than the singular, so the common
case was the unguarded one.

Measured against the real **BACHELORETTE TEES** bank (50 phrases, Gildan Tee):

| | before | after |
|---|---|---|
| wrong-product phrases caught | 8 | **12** |
| still reaching a tee title | `bachelorette coozies`, `bachelorette koozies`, `bachelorette sunglasses`, `bachelorette tapestry`, `bachelorette tattoos`, `camp bachelorette decorations` | none |

Three of the five nouns Brittany originally named — sunglasses, tapestry,
tattoo — were not in the list at all.

**Fixed:** `nounForms()` adds plural forms (`y→ies`, `s/x/z/ch/sh→es`, else
`+s`) and singularises entries already stored plural. Added an `accessory`
group covering the party goods that share bachelorette banks with apparel.
Pinned by `tests/product-nouns.test.mjs` — 4 tests, including every plural by
name, plus a check that no product family ever excludes its own noun.

### D79 · Tags collapse to a third of the bank · **FIXED** · **HIGH**

The D75 fix stopped fragmenting long phrases — correct — but tags are still
derived from *the title only*, and only phrases ≤20 chars survive.

Her bank, for a tee, after the D78 filter: **43 phrases → 31 usable → 13 tag-eligible.**

So the model must pick exactly those 13, in a title capped at 140 characters,
to fill Etsy's 13 tag slots. In practice it selects 8–13 phrases by relevance
and only the short ones become tags, so she lands on **4–7 tags out of 13.**
Etsy tag slots left empty are pure lost surface area.

**Fix:** stop deriving tags from the title. Title and tags are separate Etsy
fields with separate limits. Select tags from the **whole bank** — every phrase
≤20 chars that fits the design and passes the product-noun filter — ranked by
fit, take 13. All seller-researched, none fragmented, slots full every time.

### D80 · "Edit bank" appears to do nothing · **FIXED HERE** · **HIGH**

Keyword Banks. Clicking **Edit bank** loads the bank into the compose form,
then calls `window.scrollTo({top:0})`.

The K1 fix moved the form *below* the library (`.bank-library{order:1}`,
`.management-create{order:2}`). The scroll call was written for the old order.
Measured live: after clicking, the populated form sits **779px down, entirely
below the fold**, and the page scrolls to the top — away from it. The heading
correctly reads "Edit saved keyword bank"; she never sees it.

A fix that broke a different fix. Exactly the pattern she asked how to stop.

**Fixed:** `.management-create` is now scrolled into view directly, so it
cannot drift again if the visual order changes.

### D81 · `npm test` never ran the traversal guard · **FIXED HERE** · **HIGH**

The test script was `node --test tests/rendered-html.test.mjs` — one file.
`workflow-traversal.test.mjs`, written specifically to stop D53/D73 recurring,
**was never executed by the test command.** The guard against the regressions
she is most frustrated by was not guarding anything.

**Fixed:** `node --test 'tests/**/*.test.mjs'`. Now 161 tests across 4 files.

### D82 · Three baseline tests were red · **FIXED HERE** · **HIGH**

`approved-visual-baseline.test.mjs` had 3 failures pinned to copy that earlier
fixes deliberately changed (the 9→5 step rail, and C1/C2/C4 on Connect). None
were real defects — but a suite that is habitually red is a suite whose real
failures get ignored, which is the mechanism behind every regression on this
list.

**Fixed:** rewritten against current behaviour, and strengthened — the Connect
test now asserts the *conditional* timing note and state-swapped copy rather
than pinning a literal string. **161/161 green.**

### D83 · Mockup thumbnails are 27×27px · **FIXED** · **HIGH**

`/mockups`, collapsed state. Measured: thumbnails **27×27px**; the page `<h1>`
is **64px**. On the one page whose entire purpose is looking at mockups, the
mockups are less than half the height of the heading, and only 5 of 10 show.

The card is 234px wide inside a 1044px container — **810px of empty space** to
its right. Expanded is fine (175×218). The default state is the broken one.

**Fix:** show mockups at a usable size by default and let the grid use the
width it already has.

### D84 · The two library pages disagree with themselves · **FIXED** · **MEDIUM**

`/mockups` is labelled four ways: sidebar **"Mockup Sets"** (5 files) vs
**"Mockup Library"** (1 file), page `<h1>` **"Your mockup library"**, section
`<h2>` **"Saved mockups"**, card eyebrow **"MOCKUP SET"**.
`/usage` is **"Usage + Plan"** (6) and **"Usage + plan"** (1).

Cause: nav markup is hand-copied into each page rather than shared.
**Fix:** one nav component, one label per destination.

### D85 · "+ 38 more" looks like a control and is inert · **FIXED** · **MEDIUM**

Keyword bank cards show 12 phrases, then `+ 38 more` as a bare `<small>` —
`cursor: auto`, no handler. On a 50-phrase bank she cannot see 76% of her own
keywords without opening the editor.
**Fix:** make it expand, or say "50 phrases · open to view all".

### D86 · Keyword bank cards misalign · **FIXED** · **LOW**

Grid cards size to content, so the two **Edit bank** buttons sit **57px apart**
vertically and the shorter card has dead space beneath its button.
**Fix:** `align-items: stretch` and push the action to the card foot.

### D87 · "Delete set" is styled like "Rename set" · **FIXED** · **MEDIUM**

`/mockups` expanded. Identical size, shape and position; the only difference is
a faint pink tint. Same loud-destructive pattern catalogued in `AUDIT-PASS-3`.
Keyword banks confirm properly (`window.confirm`) — mockup sets should match.

### D88 · Batch History says COMPLETE for batches that published nothing · **FIXED** · **MEDIUM**

Two batches badged **COMPLETE**; a third badged **PRINTIFY DRAFTS**. All three
have only unpublished Printify drafts — **zero listings live on Etsy.**
"Complete" means "finished the Goldie workflow"; it reads as "listings are up".
Same category as D64 and D72.
**Fix:** badge the actual state — `DRAFTS READY · 0 PUBLISHED`.

---

### Clean on this pass

No overflow, clipping, off-screen elements, unnamed controls, duplicate IDs or
sub-24px targets found on: **Finish · Etsy details**, **Keyword Banks**,
**Usage + Plan**, **Batch History**. Console clean throughout.

Remaining geometry issues: 4 title inputs on **Titles + tags** (570px visible
against up to 1032px of content — see D60 follow-up) and 2 clipped titles on
**Finish · Publish** (295px against 735px).

### D89 · The workflow overflows the window below ~1400px · **FIXED HERE** · **HIGH**

`.steps-column`, `.launch-panel` and `.workflow-footer-actions` were sized
`width:min(720px,72vw)`. They live inside `.app-shell`, which is inset by a
**288px sidebar** — but `vw` measures the whole viewport and knows nothing
about that inset.

Measured at an 860px window:

| | before | after |
|---|---|---|
| column width | 619px | 572px |
| page scroll width | 883px (viewport 860) | **860px** |
| elements past the right edge | 4 | **0** |

So the page scrolled sideways and the **Back button sat off-screen**. The
footer was affected too, through a separate `!important` rule carrying the same
value.

It is not only a small-screen bug — the arithmetic fails from about **1400px
down**, a few pixels at a time, which is why it survived every audit at 1440.

**Fixed:** all four occurrences now use `min(720px,100%)`, matching the pattern
already used correctly elsewhere in the same file. Verified live by injecting
the rule before committing: horizontal scroll gone, zero off-screen elements.
Guarded by a test that fails on any `vw`-based width for these columns.

**Not a defect (checked):** the step cards still carry `01`–`09` in the markup
after the nine-to-five rail change, but `font-size:0` renders them as icons, so
no stale number is visible next to "4 of 4".

### D90 · The same rule implemented twice, differently · **FIXED HERE** · **HIGH**

Wrong-product detection existed in two places that disagreed:

| | `app/keywords/page.tsx` | `app/product-type-utils.ts` |
|---|---|---|
| form | hand-written `NON_SHIRT_PRODUCT` regex | `PRODUCT_NOUN_GROUPS` |
| plurals | yes | **no** (D78) |
| sunglasses / tapestry / tattoo | yes | **no** |
| runs when | saving a bank | generating a title |

So `bachelorette koozies` was blocked at save time and **allowed into a title**.
Two implementations of one rule always drift; this is the mechanism behind most
of this list.

**Fixed:** the page now imports `excludedProductNouns` / `namesExcludedProduct`.
One list, both paths. A test fails if `NON_SHIRT_PRODUCT` ever reappears.

### D91 · Her existing bank is locked and cannot be edited · **FIXED HERE** · **BLOCKER**

The save-time validation shipped in `b826386` only guards *new* saves. Her
**BACHELORETTE TEES** bank was saved before it existed, so opening it now shows:

> **13 wrong-product phrases** — Remove: bachelorette coozies, bachelorette
> koozie, bachelorette koozies, bachelorette party sash, …

…with **Save changes permanently disabled.** To change anything at all — even a
typo — she must hand-delete 13 specific lines from a 50-line textarea, hunting
each one by name, with the warning only listing the first four.

Verified live: `saveButtonDisabled: true`, `50 valid phrases found`.

Combined with D80 this was near-invisible: click **Edit bank**, get scrolled to
the top, see nothing, and the form you cannot see is the one refusing to save.

**Fixed:** the warning now carries a **"Remove all 13 and keep the rest"**
button. The app already knows exactly which phrases are wrong — asking her to
find them by hand was the wrong ask.

### Follow-up for D79 · The carried-designs path kept the old tag behaviour · **FIXED HERE**

`428074d` separated tags from the title correctly in the API and wired two of
the three client paths. The third — designs carried into a new batch — still
called `tagsFromTitle(result.keywords.join(", "))`, so those listings silently
kept the collapsed 4–7 tag behaviour while the other two got 13.

Three call sites, one changed rule, one missed. Same shape as D90.

**Fixed:** all three paths use the ranked `tags` the API returns. Guarded by a
test that fails on any `tagsFromTitle(result.…)` call.

### Follow-up for D80 · `scrollIntoView` is swallowed by an `overflow-x:clip` ancestor · **FIXED HERE**

The first D80 fix replaced `window.scrollTo({top:0})` with
`scrollIntoView({block:"start"})` on the compose form. Verified live: **it did
nothing.** Ten scroll samples over four seconds, all `scrollY: 0`.

Cause: `app/management-aesthetic.css:102` sets `overflow-x:clip!important` on
`.management-page`. `clip` makes that element a clipping container, so
`scrollIntoView` resolves against it instead of the document — and it cannot
scroll, so the call is a silent no-op. No error, nothing in the console.

**Fixed:** an explicit `window.scrollTo` computed from the form's own position,
inside a `requestAnimationFrame` so it runs after React commits. Immune to the
clip container. Guarded by a test that rejects both `scrollIntoView` and
`scrollTo({top:0})` on this page.

Worth knowing generally: **any `scrollIntoView` under `.management-page` is
already broken**, on every management screen.

### D92 · Every `scrollIntoView` on a management screen is dead · **FIXED HERE** · **MEDIUM**

Generalised from the D80 follow-up. `.management-page` carries
`overflow-x:clip!important`, and all five management screens use that class.
Any `scrollIntoView` inside them resolves against a container that cannot
scroll and does nothing — silently, with no console output.

Found and verified live:

| Call site | Effect |
|---|---|
| `keywords/page.tsx` — "Edit bank" | **broken** — form stayed below the fold (D80) |
| `mockups/page.tsx` — "+ Add mockup set" | **dead but harmless** — panel opens at top 119px, already in view |

The mockup one is latent: it does nothing today only because the panel happens
to open where you are already looking.

**Fixed:** both use `window.scrollTo` computed from the element's own offset. A
test now fails if `scrollIntoView` appears in any management screen.

### D93 · Smooth scrolling silently does nothing on management screens · **FIXED HERE** · **HIGH**

Caught only because I tested the D80 fix on the live page instead of trusting
it. **My first two D80 fixes were both non-fixes**, for two different reasons:

1. `scrollIntoView` — swallowed by `overflow-x:clip` (D92).
2. `window.scrollTo({top, behavior:"smooth"})` — **also does nothing.**

Measured on `/keywords`:

| call | result |
|---|---|
| `window.scrollTo({top:600, behavior:"smooth"})` | `scrollY` **0** after 2.5s |
| `window.scrollTo({top:600})` | **600**, immediately |
| `window.scrollTo(0,600)` | **600**, immediately |
| `document.scrollingElement.scrollTop = 700` | **700** |

`prefers-reduced-motion` is `false`, `scroll-behavior` is `auto`, and the
document is scrollable (`scrollHeight 1461`, `clientHeight 643`). Smooth
scrolling specifically is dead — no error, no console output, the page just
never moves.

**Fixed:** both call sites scroll instantly. Tests reject `scrollIntoView` and
`behavior:"smooth"` anywhere in the management screens.

**The lesson worth keeping:** a fix that compiles, passes review and reads
correctly can still do nothing at runtime. Twice in a row here. Scroll,
focus and visibility changes have to be measured on the live page — asserting
the code is right is not the same as asserting the behaviour is right.

### D94 · D60 was marked FIXED while still truncating · **FIXED HERE** · **HIGH**

Caught by re-measuring an item the list already called fixed.

Measured live, Titles + tags, real batch:

| field | chars | visible width | content width | readable |
|---|---|---|---|---|
| title 1 | 132 | 570px | 1032px | **55%** |
| title 2 | 135 | 570px | 856px | **67%** |

The D60 fix widened the field from 222px to 570px and added
`text-overflow:ellipsis`. But titles grew from ~25 characters to ~132 in the
same period, so the field still cannot show one. **Ellipsis makes truncation
tidier, not readable.** Reviewing the title is the entire purpose of this
screen.

**Fixed:** the title is now a 3-row wrapping textarea, so all 140 characters
are visible at once. `white-space:pre-wrap`, no ellipsis. Guarded by a test.

**Process note:** D60 was closed against the change that was made, not against
the outcome it was supposed to produce. Worth re-measuring anything on this
list whose numbers moved after it was closed — D77's fill figures are the
obvious next candidate.

### D95 · The step rail was invisible · **FIXED HERE** · **BLOCKER**

Found by measuring contrast on a screen the list already called clean. **This
is the primary navigation on the main workflow screen.**

`approved-functional.css:10` deliberately sets `.workflow-progress` to
`background:transparent`, moving the rail out of a dark card and onto the page.
`lilac-theme.css:238` still carried the text colours written for that dark card.
Nobody updated the text when the background changed.

Measured on the live page:

| element | colour | on | ratio | needs |
|---|---|---|---|---|
| "Titles + tags" | `#fff9fc` | `#e9e7e4` | **1.19:1** | 4.5 |
| "3 titles complete" | `#c2b2be` | `#e9e7e4` | **1.64:1** | 4.5 |
| "Etsy details" | `#fff9fc` | `#e9e7e4` | **1.19:1** | 4.5 |
| "3 listings ready" | `#c2b2be` | `#e9e7e4` | **1.64:1** | 4.5 |

Near-white on near-white. Confirmed by screenshot: the four Finish sub-steps
and every status line beneath them were effectively invisible.

**Fixed:** dark-on-light rail text in `clarity-pass.css` (imported last), and
sub-labels raised 8.5px → 11px. Verified by injecting the rule on the live page
before committing — rail low-contrast elements went 11 → **0**, and the labels
are legible in the screenshot. Guarded by a test that also fails if the rail
background goes dark again without the text following it.

**Same root cause as D94:** a change was made correctly, and the thing that
depended on it was never re-checked.

### Follow-up for D77 · The fix failed 2 of 3 real listings · **FIXED HERE** · **BLOCKER**

`842c8ba` / `3906b1c` enforced D77 by requiring at least 8 title phrases and
every available tag, retrying once, then rejecting the row.

**Measured on a live 3-design batch:**

> "1 titles created. 2 need another try; each affected listing explains why below."

The row error:

> "It found **7 of 8** required title phrases and **13 of 13** available Etsy tags."

Seven phrases and a complete tag set is a good listing. The gate rejected it for
being one phrase under an arbitrary count. **Before the fix, D77 meant some
listings came out thin. After it, listings failed to generate at all** — 2 of 3,
on the same bank and product that previously produced 3 usable titles.

The count was never the thing that mattered. D77's actual symptom is a title
that comes out at **45 of 140 characters** while its siblings hit 130.

**Fixed:** the retry still fires on phrase count — cheap and harmless — but the
row is rejected only when the *assembled title* comes in under **90 of 140
characters** and the bank had 8+ phrases fitting the product. A 7-phrase,
130-character title now passes, which is correct. The error names real numbers:
*"Goldie built only 45 of 140 title characters for this design from 2 phrases."*

**This is the third time today a fix was verified by reading the code rather
than running it.** It passed review, passed its own tests, and broke two thirds
of a batch on first contact.

---

## Launch verification — 21 Aug 2026

Ran the real workflow rather than reading diffs. **Auto-create all titles** on
the live 3-design batch, BACHELORETTE TEES bank, Gildan Tee.

### Verification for D77 — resolved, measured

| | title chars | tags |
|---|---|---|
| original defect | 132 / **45** / 126 | 8 / **3** / 8 |
| after `842c8ba`+`3906b1c` | **1 built, 2 hard-failed** | — |
| after `16f0f8d` | **139 / 130 / 137** | **13 / 13 / 13** |

> "✓ 3 unique titles and separately ranked Etsy tags created."

Zero row errors. Zero tags over 20 characters, zero fragments (D75 holding).
Zero wrong-product phrases in any title or tag (D74/D78/D90 holding).

### Verification for D76 — resolved, confirmed by screenshot

Row 1 renders: *"No phrase in this bank matches this design. Add one, or write
the title yourself."* Row 2, whose design does match the bank, correctly shows
no warning. Advisory rather than blocking, which is right — it still builds the
best title it can and tells her why it may be off.

### D96 · The tags field truncated at 37% · **FIXED HERE** · **HIGH**

Found in the same screenshot. D79 raised tags from 4–7 to a full 13 — correct —
but 13 phrases is **238 characters** going into the same 570px single-line
input, against **1521px** of content. **37% visible: 5 of 13 tags.**

The field never changed; what it had to hold tripled. Identical to D60/D94, one
field further down the same card, introduced by the fix immediately above it.

**Fixed:** wrapping textarea. Verified live before committing — 238 characters
and all 13 tags render in 81px with zero overflow.

### Standing pattern

Four times today a change was correct and the thing depending on it was never
re-checked: D60 (field widened, titles grew), D95 (rail background changed,
text colours stayed), D77 (gate enforced a count, not the symptom), D96 (tags
tripled into an unchanged field). Worth checking the *neighbours* of any fix,
not just the fix.

### D97 · 477 images load eagerly on the photos phase · **FIXED HERE** · **HIGH**

Found on a physical walkthrough of Finish, which had not been done before.

Measured on **Images + mockups**, real 3-design batch:

| | |
|---|---|
| rendered `<img>` tags | **477** |
| lazy-loaded | **1** |
| outside the viewport on load | **441 (92%)** |
| per listing | ~159 |
| projected at the 20-design batch limit | **~3,180 images** |

Every Printify colour × angle for every listing is requested immediately, whether
or not the seller ever scrolls to it. At three designs it is merely slow. At
twenty — which the product advertises — it is thousands of simultaneous requests
on one page.

**Fixed:** `loading="lazy" decoding="async"` on all six repeated image tags in
the listing flow. 92% of requests on this batch become deferred. Guarded by a
test that fails if any of them loses the attribute.

### Walkthrough notes — not defects, recorded for context

- **Recovery works.** Regenerating a title correctly invalidates that listing's
  Etsy details ("Etsy details still need to be created"), and **Try this listing
  again** repaired both affected rows.
- **Transient status lag.** Immediately after the retries the rail read
  "2 of 3 ready" with no retry control visible and phases 3–4 locked — it
  settled to "3 listings ready" within a few seconds. Not a dead end, but the
  intermediate state looks like one.
- **Phase 2 sub-label contradicts phase 1.** "Etsy details · Complete the prior
  step" while phase 1 reads "3 titles complete" and is ticked. Cosmetic.
- **Two `<h1>`s on the Etsy phase** — "Oops, this one needs a bigger screen." is
  present but hidden (0×0). Semantics only, not visible.

### D98 · The publish screen showed 38% of each title · **FIXED HERE** · **HIGH**

**The last screen before listings go live on Etsy.** Titles were clipped to a
single `nowrap` line: 295px visible against up to 781px of content.

| row | chars | visible |
|---|---|---|
| 1 | 130 | **41%** |
| 2 | 139 | **38%** |
| 3 | 137 | **39%** |

"Choose exactly which listings to publish" — while showing two fifths of what
each one says. Verified after the fix: all three render fully in 50px, zero
overflow.

**Fourth instance of one shape** — D60, D94, D96, D98 are all a field sized for
short titles that never grew when titles reached 140 characters. Worth a sweep
for any remaining `white-space:nowrap` + `text-overflow:ellipsis` pair on
seller-authored content.

### D99 · Shipping profile name truncated with ".." in the DOM · **FIXED HERE** · **LOW**

Publish checklist reads:

> "✓ Standard: SwiftPOD, Kids clothes, Long-sleeve, T-Shirt, Tank Top, V-neck,
> Bags, Trous**..** will be applied automatically"

Truncated mid-word in the string itself, with a two-dot ellipsis, not CSS.
Cosmetic, but it is on the final confirmation screen.

### Walkthrough result — Finish phases end to end

Walked all four phases on the live batch. **Did not publish.**

| phase | result |
|---|---|
| 1 · Titles + tags | 139/130/137 chars, 13/13/13 tags, 0 errors |
| 2 · Etsy details | retry recovered both invalidated rows; settled at "3 listings ready" |
| 3 · Images + mockups | photo select works; counter correct at "3 selected · 17 of 20 photo slots"; **Apply these photos to every listing** correctly disabled until a photo is picked, then applied 3 → 9 across all listings |
| 4 · Review + publish | checklist all green; "Nothing is published until you use the final button"; 3 of 3 selected |

The publish gate copy is honest and the flow completes. Stopped at the publish
button by design.

### D100 · My D96 fix made the tags field worse · **FIXED HERE** · **HIGH**

Caught by re-measuring the field I had just "fixed", on the deployed build.

Swapping the tags `<input>` for a `<textarea>` (D96) took it out of the only
rule that gave the field its width — `.design-fields input{width:100%}` matches
`input` only. The tags `<label>` is a two-column grid (**139px / 427px**), so
the unsized textarea auto-placed into the **narrow** column.

| | width | content | visible |
|---|---|---|---|
| before D96 (input) | 570px | 1521px | 37% |
| after D96 (textarea) | **138px** | 219px tall in 69px | **32%** |
| after D100 | 570px | fits in 69px | **100%** |

**My fix made the thing it was fixing worse.** The title textarea was unaffected
because its label is single-column, which is why it looked fine and this did not.

**Fixed:** both listing textareas get `grid-column:1/-1` and `width:100%`.
Verified on the deployed page: all three tag fields and all three title fields
render at 570px with zero overflow, and the phase reports **0 truncated
elements**.

**Rule for this grid:** any `input` → `textarea` swap inside `.design-fields`
must carry the width and grid-column with it. Pinned by a test.

### Truncation sweep — clean

After `55dcbdb` and this fix, measured on the deployed build:

| screen | truncated elements |
|---|---|
| Titles + tags | **0** |
| Etsy details | **0** |
| Images + mockups | **0** |
| Review + publish | **0** |

Publish-screen titles read 100% at 130/139/137 characters. Zero
`white-space:nowrap` + `text-overflow:ellipsis` pairs remain in any stylesheet.

---

## Full live run — 21 Aug 2026

Fresh batch started from the beginning as a real user would, on the deployed
build. Findings D101 onward.

### Working, verified on this run

- **Connect is skipped** when both accounts are already connected. Fresh batch
  opens at "Step 2 of 5". (C1)
- **Weight hierarchy is correct** on Choose product: "Choose this product →" is
  the filled button; "+ Add another product", "Rename" and "Delete" are quiet
  text links. (D45, D4)
- **"✓ Ready for this batch" is legible.** (D3)
- **"Change product" exists** — a selected product can be unselected. (D5)
- **"Everything else" is now "Saved for this product".** (D7)
- **Section order is Product → Designs → Colours → Mockups**, measured by
  vertical offset: 315 / 926 / 1445 / 2185. This is the order Brittany asked
  for and it is correct on screen, not just in the DOM.
- **Bundles disabled with a real reason** — "Save 2 products first".

### D101 · An unfinished task is formatted as a settled value · **FIXED HERE** · **HIGH**

The collapsed summary read:

> Saved for this product · **$10 profit · Standard shipping · Choose a keyword
> bank · description from Printify · Etsy details 5 saved**

Four settled values and one **to-do**, in the same size, colour and separator,
buried in the middle of the list. It is also the single item whose absence makes
title generation fail two steps later with "Choose a keyword bank before asking
Goldie to build the title."

Logged as **P2 in `AUDIT-PASS-2.md`** and never given a defect number, so it was
never fixed. The full run surfaced it again.

**Correction to my own fix.** My first version printed the full instruction
*"Pick a keyword bank so Goldie can write your titles"* under the summary. Then
I measured the live page: a dedicated **720 × 66px** alert already sits **169px
below** that summary carrying exactly that sentence. My fix would have shown the
same instruction twice, 169px apart.

The real defect is narrower than I first wrote it: the to-do does not need more
prominence — it already has an alert — it just must not appear in the settled
list as though it were done.

**Fixed:** unfinished items are removed from the settled values and the summary
ends with a short status — *"keyword bank still to set"*. The existing alert
below keeps the instruction. Pinned by a test that fails if the summary starts
repeating it.

---

## Older-review label reconciliation

Audited `AUDIT-PASS-2.md`, `AUDIT-PASS-3.md`, `SCREEN-AUDIT.md`, and
`UX-DIRECTION.md` after D101 exposed that P2 had never entered this numbered
list. This table is the permanent cross-reference; a finding is not considered
tracked merely because it remains in an older narrative review.

| Older label | Numbered coverage |
|---|---|
| C1, C2, C3, C4 (`AUDIT-PASS-2`) | D18, D19, D20, D21 |
| P1 | D102 |
| P2 | D101 |
| P3 | D16 |
| P4 | D1 |
| P5 | D8 |
| P6 | D2 + D45 |
| P7 | D45 |
| P8 | D45 (label, confirmation, and destructive-action hierarchy) |
| P9 | D12 |
| P10 | D29 + D49 + D54 |
| U1, U2, U3, U4, U5 | D34, D35, D36, D37, D38 |
| K1, K2, K3 | D39, D40, D41 |
| S0.1 | D1 |
| A2, A5, A7 | D22, D23, D25 |
| C1 (`UX-DIRECTION` Part C) | D103 |
| C2 (`UX-DIRECTION` Part C) | D71 |
| C3 (`UX-DIRECTION` Part C) | D104 |
| C4 (`UX-DIRECTION` Part C) | D105 |

### D102 · Saved mockups were not restored with the saved product · **FIXED**

Formerly P1. Saved products now load `defaultMockupTheme`, and the selection
used at publish becomes the next saved default. This matches the remembered
colour behavior instead of showing “Not chosen” under a promise that Goldie
started with the last batch's choices.

### D103 · Changing Etsy category discards fields without warning · **FIXED** · **MEDIUM**

Formerly `UX-DIRECTION.md` Part C, C1. The category change correctly requests
the new taxonomy and replaces the old category-specific property collection,
so invalid fields are not retained. What never shipped is the required warning
before populated fields disappear. A seller can change category and silently
lose reviewed values.

**Fix:** before changing taxonomy, compare populated property IDs with the new
category, state how many values will be cleared, and require confirmation when
the count is nonzero. Preserve values whose property and allowed value still
exist in the new category.

**Verified live:** changed a restored Gildan Tee listing toward Adult Bibs. The
dialog correctly reported that five completed fields would be cleared. Choosing
“Keep current category” closed the dialog and the row still read **6 of 11 set ·
Cotton, Unisex, Short sleeve**. The restored category list contained 2,503 real
options, so the D106 fallback is no longer a one-option dead end.

### D104 · Collapsed Etsy-detail summaries had no durable editing path · **FIXED**

Formerly `UX-DIRECTION.md` Part C, C3. Each listing summary expands in place to
the full Etsy field set, remains open while keyed row updates render, and its
`x of y set` summary updates from the current properties.

### D105 · Photo recommendations are still T-shirt-specific · **FIXED HERE** · **MEDIUM**

Formerly `UX-DIRECTION.md` Part C, C4. The Images + mockups phase still displays
a fixed recommendation — three lifestyle model mockups, flatlays for each
colour, and a size guide — regardless of whether the saved product is a shirt,
mug, poster, tote, or another blueprint.

**Fix:** derive recommendation copy and defaults from the available Printify
mockup types for the selected blueprint. Use a ranked preference list that
degrades to the best available images and never produces zero recommended
photos merely because a product has no on-model scenes.

**Fixed:** the recommendation now follows the saved product family (apparel,
poster, drinkware, tote, sticker, or a product-safe fallback), reports the real
number of available Printify views, and preselects up to five of the best
available views only when the seller has not already chosen or cleared photos.
No product is told to use a T-shirt model or clothing flatlay unless it is an
apparel blueprint.

### Blank first paint — watch, not yet reproducible

The first navigation to a deep Finish link rendered **nothing but background**
for ~10s, with four `[vinext] RSC prefetch setup error: TypeError: d is not a
function` errors from `link-*.js`. A reload recovered it fully. Most likely a
mid-deploy state serving new HTML against a stale chunk. Recorded because a
blank first paint is what a new trial user would see; if it recurs outside a
deploy window it needs a defect number.

Also: on that reload the sub-rail showed **"Choose a saved product"** on all
four Finish phases for several seconds before the batch restored. The batch was
intact — but the transient copy states the opposite of the truth.

**Outside-deploy retest:** three fresh navigations from Batch History to the
deep Titles + tags URL mounted in **941ms / 946ms / 883ms**. No blank paint, no
`[vinext]` prefetch warning, and no console error occurred. This remains a watch
item rather than a numbered defect unless it recurs outside a deployment window.

### Full-flow sweep — all five steps clean

Every step walked on the deployed build, scrolled top to bottom, then measured.

| step | truncated | off-screen | sideways scroll | duplicate IDs |
|---|---|---|---|---|
| 2 · Choose product / Build this batch | **0** | 0 | no | 0 |
| 3 · Add your designs | **0** | 0 | no | 0 |
| 4 · Review pricing | **0** | 0 | no | 0 |
| Finish 1 · Titles + tags | **0** | 0 | no | 0 |
| Finish 2 · Etsy details | **0** | 0 | no | 0 |
| Finish 3 · Images + mockups | **0** | 0 | no | 0 |
| Finish 4 · Review + publish | **0** | 0 | no | 0 |

### Confirmed fixed on this run

- **Step 3 states the binding limit, not the batch cap.** "Build one focused
  batch of up to **4** finished designs" and "3 of 4 designs ready · 1 more
  available · 4 listings remain on your plan" — at 16/20 the real constraint is
  4, and that is the number shown. (D29 / P10)
- **Design rows carry filename, pixel dimensions and Remove**, thumbnails at
  76×76. (D31, D9)
- **Pricing headings are ordered and named**: "1. Item prices · Gildan Tee",
  "2. Etsy shipping profile — what buyers pay · Gildan Tee". (D58)
- **One help button on Pricing**, not three. (D25 / A7)
- **Profit goal sits beside the prices it changes**, with "Prices update
  automatically". (D22 / A2)

### Still untestable from here

- **A5 / D23 — "✓ Approved" before approval.** The badge is correct on this
  batch because its pricing genuinely was approved. Confirming the defect needs
  a batch that has never been approved, which requires uploading fresh artwork.
- **Quota ceiling behaviour.** The counts display correctly at 16/20, but what
  happens when a batch is submitted that exceeds the remaining 4 has not been
  exercised. Needs an upload to test.

Both are blocked on adding designs, which cannot be done from this session —
file upload is unavailable here.

### D106 · The Etsy category dropdown is blank on every restored batch · **FIXED HERE** · **HIGH**

Found while trying to reproduce D103. Confirmed by screenshot on the live build.

The **Etsy category** select renders **zero options and displays nothing**,
while every attribute beneath it shows a value — Materials "Cotton", Sleeve
length "Short sleeve", Neckline "Crew", Occasion "Bachelorette party" — and the
caption reads *"These are Etsy's actual fields for the selected category."*

A category **is** set. The seller simply cannot see which one, and cannot change
it.

**Cause:** `etsyCategories` is populated only by the taxonomy fetch that runs
during auto-detection. A restored batch loads `details.taxonomyId` and
`details.category` from saved state, but nothing refetches the list, so
`categories` is `[]`. The existing markup renders a placeholder option only when
`taxonomyId` is falsy — so with an id set and an empty list, the select has no
options at all.

This affects **every batch reopened from Batch History**, which is the normal
way a seller returns to work.

**Fixed:** when the set `taxonomyId` is not present in the loaded list, the
select renders an option for it using the saved `details.category` path. The
category is visible again and the control is usable.

**D103 retested after D106 deployed — it is fixed.** With 2,503 categories now
loading, changing the category on a listing with filled attributes raises a
proper `role="alertdialog"`:

> **Change this listing's Etsy category?**
> 5 completed fields do not exist in the new category and will be cleared. Any
> compatible values will stay filled.
> [ Keep current category ] [ Change category and clear 5 ]

It names the count, says what survives, and the non-destructive option is first.
Chose "Keep current category" and confirmed all four attributes — Cotton, Short
sleeve, Crew, Bachelorette party — survived intact. D103 marked FIXED.

---

## The two "untestable" items — tested · 21 Aug 2026

I claimed both needed Brittany to upload artwork. That was wrong: real
4500 × 5400 PNGs can be generated in-page with canvas, wrapped in `File`
objects, and injected into the file input via `DataTransfer`. Both tested on the
live build against a fresh batch.

### Quota ceiling — **correct, no defect**

Account at 16/20, so 4 listings remain. Selected **5** designs:

> **That batch can't be added.**
> This selection contains 5 new designs, but this batch has room for 4. Choose
> 4 or fewer so nothing is partially added.

Right behaviour on every count: it names both numbers, rejects the **whole**
selection rather than partially adding, says what to do, and consumes nothing —
0 design rows created, usage unchanged at 16/20. This is the D54 principle
(a blocked upload must not leave a partial record) applied correctly.

Re-ran with 4 designs: accepted cleanly, "4 designs ready".

### Verification for D23 / A5 — "✓ Approved" before approval — **fixed, confirmed**

This could only ever be judged on a batch that had never been approved, which is
why it stayed open. On the fresh batch:

- **No "✓ Approved" badge anywhere on the Pricing step**
- Instead an enabled **"Approve prices and shipping"** button
- Finish step **disabled**, reason: "Approve prices and buyer-paid shipping"

The badge appears only after approval. Marked FIXED.

### Also surfaced on this run — working as intended

The shipping shortfall warning fires with real figures:

> "Your Etsy buyer charge is $3.24 below Printify's current shipping cost.
> Printify may charge up to $7.99 while the buyer pays $4.75."

Both numbers are the ones traced earlier — $4.75 read live from Etsy
`domestic.primary_cost`, $7.99 the `Math.max` of Printify first-item rates.

### Cleanup note

A test batch `15370225-5a86-4676-9446-35b98dfa33d8` with four generated PNGs
(`01-palm-springs-test.png` … `04-miami-test.png`) is in Batch History. No
Printify drafts were created and no quota was consumed. Safe to remove from
history whenever convenient — left in place rather than deleted, since it is a
live account.

---

### D107 · Uploading designs spawns a second forward button that skips Colours and Mockups · **FIXED HERE** · **BLOCKER**

**Brittany found this, after a full day of my testing. I should have caught it.**

> "I just chose my saved listing, and then I uploaded my designs and hit next.
> And it took me to titles and tags when I hadn't even been able to fill out
> colors yet."

Reproduced exactly on the live build. Measured vertical positions on the setup
step, before and after uploading designs:

| control / section | before upload | after upload |
|---|---|---|
| "Drop your designs here" | 934 | 934 |
| **"Review this batch →"** *(enabled)* | — | **1548** |
| **Colours** | 1445 | **1725** |
| **Mockups** | 2185 | **2464** |
| "Pick a keyword bank to continue →" *(disabled)* | 2884 | 3164 |

The moment designs finish preparing, an **enabled** forward control appears
**177px above the Colours heading**. Press it and you skip Colours and Mockups.

The correct control is the one at the bottom — `.setup-forward` — which gates on
`selectedColorIds.length && autoTitleBankId && mockupTheme` and names whichever
is missing ("Choose product colors to continue" / "Pick a keyword bank to
continue"). The designs-block button calls `continueFromDesigns` and bypasses
all three gates.

**Cause:** that button was correct when Designs was its own step. Moving the
designs block onto the setup screen — above Colours and Mockups — turned a valid
forward control into a trap. Nothing re-checked it after the layout changed.
**Fifth instance of the same root cause:** a change was correct, and the thing
that depended on it was never re-checked (D60, D95, D96, D100, D107).

**Fixed:** the designs-block forward button no longer renders on the setup step.
The single gated control at the bottom is the only way forward.

**Rule, now pinned by a test:** *a step may present one forward control, and it
must sit after every section it depends on.*

**Why my testing missed it:** I navigated between steps by clicking the rail,
not by pressing the forward button a seller would press. Rail clicks call
`goToStep`, which runs the gates; the in-page button calls its own handler,
which does not. Auditing navigation without using the actual forward control
cannot find this class of defect.

### D108 · Restored batch state overwrites an explicit return to setup · **FIXED HERE** · **BLOCKER**

Found while verifying D107 through the live seller path. After using the one
correct setup control, requesting `?step=setup` still redirected to the batch's
saved `?step=designs`. The duplicate button was gone, but Colours and Mockups
became unreachable again after the first forward navigation.

**Cause:** batch restoration always replaced the requested URL with
`payload.batch.step`. It never considered whether the seller was deliberately
returning to an earlier safe step.

**Fixed:** restoration now honors a valid requested step when it is the saved
step or any earlier step. An unfinished batch still cannot deep-link forward
past its saved progress; a completed batch keeps D53/D73's ability to reopen
any Finish phase.

### D113 · Signed-in account without access has no way to switch accounts · **FIXED HERE** · **HIGH**

Refreshing the Listing Factory with a valid session for an account that does
not own a plan rendered the pricing page and only said “Signed in securely.”
The sign-in link disappeared, no account identity was shown, and there was no
way to leave that account. The screen now names the signed-in email and offers
“Use a different account,” which signs out both app and platform sessions and
returns directly to the Listing Factory sign-in screen.

### D114 · Owner testing account was treated as an expired 20-listing beta · **FIXED HERE** · **BLOCKER**

The Chrome account used for live testing, `shesawolfclothing@gmail.com`, was
missing from the owner allowlist. Refresh therefore sent it to plan selection,
and its saved beta plan still imposed the 20-listing ceiling. The account is now
recognized as an owner everywhere, and owner testing uses a separate 10,000
listing allowance without deleting draft records or changing customer plans.

### D109 · "Change it anytime" with no way to change or remove · **FIXED HERE** · **HIGH**

**Brittany found this too.**

> "There's four mockups saved to the saved product, and it says change these
> anytime, but there's no option to remove the mockups or change them anywhere."

Reproduced on the live setup step. The Mockups section renders:

- the copy **"From your last batch — change it anytime"**
- 4 mockup thumbnails and **"+6 more"**
- exactly **one** control: a `<select>` containing **"Loading mockup sets…"** and
  **"BACH TEES"**

Three separate failures in one small block:

1. **`"Loading mockup sets…"` is a permanent option**, not a loading state. It
   stays in the list forever as `value=""` — so the only way to clear the
   selection is to pick something that reads like a bug.
2. **No way to remove the mockups.** With one saved set there is nothing to
   change *to*, and no "none" choice.
3. **No route to the Mockup Library** from the place that invites you to change
   sets — creating or editing one is only reachable from the sidebar.

The copy makes a promise the UI cannot honour.

**Fixed:** once sets have loaded the placeholder becomes a real choice, **"No
mockups for this batch"**, so the selection can be cleared; "Loading mockup
sets…" now only shows while actually loading. Added a **"Create or edit mockup
sets ↗"** link beside the control.

**Same class as D101** — copy that describes a capability the surrounding
controls do not provide.

### Promise-vs-control sweep — the class D101 and D109 belong to

Rather than wait for the next one to be found by hand, I swept every screen for
the underlying pattern: **copy that claims something can be changed, removed or
managed, with no control nearby that does it.**

Method: find every leaf text node matching a promise phrase ("change it
anytime", "edit them", "remove these", "manage…", "…later"), walk up to the
nearest container holding interactive elements, and count enabled controls.

| screen | promises found | unbacked |
|---|---|---|
| Step 2 · Build this batch | 3 | **1** → D109 (mockups) |
| Step 4 · Review pricing | 1 | 0 (63 controls) |
| Finish · Etsy details | 0 | 0 |
| Finish · Images + mockups | 1 | 0 (979 controls) |
| Finish · Publish | 0 | 0 |

**The mockup block was the only unbacked promise in the workflow.** The colours
section, checked directly, offers 43 toggleable swatches with 4 selected — it
honours its copy.

This sweep is worth re-running whenever section copy changes; it is cheap and it
catches the exact class of defect that Brittany has had to report twice.

### D110 · The mockup selection cannot be cleared — an effect undoes it · **FIXED HERE** · **HIGH**

**Found by operating the control instead of reading it.** D109 relabelled the
empty option to "No mockups for this batch"; that alone would have shipped a
label that still did nothing.

Measured live, same technique on two selects:

| control | set to `""` | result after 4s |
|---|---|---|
| keyword bank | `""` | **stays `""`** ✓ |
| mockup set | `""` | **reverts to "BACH TEES"** ✗ |

Cause, in `MockupSetSelector`:

```js
useEffect(()=>{ if(!value&&themes.length) onChange(savedValue&&themes.includes(savedValue)?savedValue:themes[0]) },[value,savedValue,themes.join("|")]);
```

It runs **every time `value` is empty**, so a deliberate clear is reverted within
a frame. The effect exists to seed a starting set — good intent, but it makes
"none" permanently unreachable.

**Second half of the same defect:** the forward control was disabled on
`!mockupTheme`. Even if clearing had worked, choosing "no mockups" would have
disabled the only way forward — so the option could never have been used.

**Fixed:** the default seeds **once** via a ref, so a deliberate clear survives;
and `mockupTheme` is removed from the forward gate, since mockups are optional —
the Finish step selects listing images separately. `.setup-forward` still
requires colours and a keyword bank.

**This is the lesson from today, concretely.** D109 was found by reading the
screen and looked fixed. D110 was only visible by clicking the control and
checking the state four seconds later. Rendering was never the problem.

### D111 · The workflow had no visible, safe restart path · **FIXED HERE** · **HIGH**

The old “Clear batch + start over” control lived inside a progress header that
the approved layout hides, so sellers had no visible exit once a batch was in
progress. A subtle “Start a new batch” control now stays in the fixed workflow
sidebar on every step, including while a long step is scrolled. It offers Cancel, Save to Batch History + start new, and Discard this
batch + start new. Saving preserves the batch record and files; both restart
paths preserve saved products, defaults, keyword banks, mockup sets, and any
Printify drafts already created.
---

## Functional pass — operating controls, not reading them · 21 Aug 2026

Every control below was **clicked or changed**, then the resulting state was
measured. All values were restored afterwards.

| control | test | result |
|---|---|---|
| Colour swatch | toggle on, toggle off | 4 → **5** → 4 ✓ |
| Product description | edit, leave step, return | marker survived ✓ |
| Remove design | click Remove | 2 rows → **1** ✓ |
| Profit goal | $25 → $10 | profit $25.00 → **$10.00**, costs unchanged ✓ |
| Whole-number pricing | toggle on at goal $11.37 | retail **$23.88 → $24.00**, **$25.93 → $26.00** ✓ |
| Listing title | edit, change phase, return | survived ✓ |
| Listing tags | edit, change phase, return | survived ✓ |
| Etsy attribute | set Primary color = Beige | summary **5 of 11 → 6 of 11** ✓ |
| Mockup set | set to empty | **reverted** ✗ → **D110** |

### D112 · The Etsy details summary invents work that does not exist · **FIXED HERE** · **UX**

Measured on a Gildan tee: **all 11 Etsy attribute fields are optional.**
`required` is false on every one. The summary nonetheless read:

> "Etsy details **5 of 11 set** · Cotton, Unisex, Short sleeve"

A completion fraction over a set with nothing to complete. It reads as 45%
done, six things outstanding. Across a 20-listing batch that is **120 chores
that do not exist** — on the screen whose entire promise is doing less work.

This is why "3 of 11 set" kept getting reported as a status contradiction (D16,
P3): the number was never wrong, the framing was.

**Fixed:** when a category genuinely has required attributes the summary counts
those — *"2 of 3 required set"*. When it has none it states what was added and
that the rest are optional — *"5 added · all optional"*.
### Functional pass, round 2 — Finish phase controls

| control | test | result |
|---|---|---|
| Photo checkbox | select one, change phase, return | 9 → **10** → **10** ✓ |
| "Clear this listing's selections" | click | 10 → **6** (cleared 4) ✓ |
| Photo restore | re-check snapshot | back to 10 ✓ |
| Etsy attribute revert | set back to blank | 6 of 11 → **5 of 11** ✓ |

### Verification for D110 — pending deploy, not yet confirmed

The D109 half is live: the option now reads **"No mockups for this batch"**.
Clearing still reverts to "BACH TEES" on the deployed build — but the D110 fix
(seed-once ref, and removing `mockupTheme` from the forward gate) shipped in
`f1fc3ee`, and **D111 in `44cc3b6` is confirmed NOT deployed**, so the running
build predates part of the fix.

**Do not read the current revert as "D110 is still broken."** Re-test once the
Etsy details summary reads *"5 added · all optional"* — that string is the
marker that everything through `44cc3b6` is live. If the mockup selection still
reverts at that point, the cause is a component remount resetting the ref, and
the seed guard needs to move up to the parent's state instead.

### D115 · "Edit bank" still does not scroll — the fourth attempt · **FIXED HERE** · **HIGH**

D80 → D92 → D93 → **D115**. Four attempts at one behaviour, each verified by a
different method, each revealing the previous fix was insufficient:

| attempt | approach | why it failed |
|---|---|---|
| D80 | `scrollTo({top:0})` | K1 had moved the form *below* the library |
| D92 | `scrollIntoView` | swallowed by `overflow-x:clip` on `.management-page` |
| D93 | `scrollTo({behavior:"smooth"})` | smooth scrolling never fires on these screens |
| **D115** | `scrollTo` inside the **click handler** | **lost to React's re-render** |

Measured on the deployed build, from `scrollY: 0`: five samples over 2s, all
**0**, while the bank loaded correctly and the editor sat at **797px** — below
an 812px viewport. Proof the handler itself was live: repeating the click from
`scrollY: 678` left the form visible at 119px, because no scroll was needed.

**Cause:** the handler sets three pieces of state (`setName`, `setRaw`,
`setSavedId`) and then scrolls. React commits the re-render after the handler
returns, and the scroll is discarded. `requestAnimationFrame` was not late
enough.

**Fixed:** the handler now sets `scrollToEditor`, and a `useEffect` keyed on
that flag performs the scroll after the commit. Instant, not smooth (D93).

**The pattern worth keeping:** every one of these four fixes was correct against
the cause it was written for, and every one shipped without being operated on
the deployed build. Only clicking the control and sampling `scrollY` afterwards
found each next layer.

### Functional pass, round 3 — library CRUD and history

Every control operated on the deployed build. All test data removed afterwards;
no real bank, set or batch was modified.

| control | test | result |
|---|---|---|
| Batch History badge | read after D88 | "DRAFTS READY · 0 PUBLISHED" ✓ |
| **Resume batch** | click on a completed batch | restored to Finish · Images + mockups with 3 designs, 20 variants, 3 drafts ✓ |
| Keyword bank **create** | name + 3 phrases + Save | 2 banks → **3**, "3 valid phrases found" ✓ |
| Keyword bank **edit + save** | 3 phrases → 5, Save changes | card shows **5 phrases**, no duplicate created ✓ |
| Keyword bank **delete** | Delete → confirm | 3 → **2**, prompt named the bank: *Delete "ZZ TEST BANK"?* ✓ |
| Mockup **Delete set** | click | `role="alertdialog"`: *"Delete 'BACH TEES'? This permanently removes the set and every saved mockup inside it."* — **"Keep this set" first** ✓ |
| Delete set **cancel** | click "Keep this set" | dialog closed, set intact ✓ |
| Mockup **Rename set** | click | dialog prefilled with "BACH TEES", Cancel + Save new name ✓ |
| Rename **cancel** | click Cancel | dialog closed, name unchanged ✓ |
| "Choose size guide" | click | opens a hidden native file picker — **not observable to automation, not a defect** |

**D87 is properly fixed** — the mockup delete confirmation names the set, states
exactly what is lost, and offers the safe option first. It is a better
confirmation than the keyword bank's `window.confirm`.

### D116 · Shipping profile names show raw HTML entities · **FIXED HERE** · **MEDIUM**

Measured live on the Pricing step dropdown:

> "Kid**&#39;**s Hero Tee 1598202917"

Etsy returns profile titles HTML-escaped; they were printed straight into an
`<option>`, so the seller reads the entity instead of an apostrophe. Two of her
94 profiles are affected, and any profile with a quote, ampersand or angle
bracket would be too.

**Fixed:** `decodeProfileTitle()` decodes numeric, hex and named entities, and
is applied both in the dropdown and in `friendlyShippingProfileTitle`, which
feeds the "Saved for this product" summary and the publish checklist.

### D117 · The shipping profile dropdown lists 94 unrelated profiles · **FIXED HERE** · **HIGH · UX**

The Pricing step asks the seller to confirm the Etsy shipping profile for a
**T-shirt** batch, and offers **94 options** in one flat list, including:

> Printful Bean-bag (default) Flat Rate · Printful Canvas (24×36) Flat Rate ·
> Printful Framed-poster (18×24) Flat Rate · Kiss-Cut Stickers 1 / 2 / 3 ·
> Mug 11oz · iphone cases · Premium Matte vertical posters · Cropped Hoodies

These are every shipping profile the shop has ever created, across every
product type and print provider. Choosing the right tee profile means reading
94 lines, most of which cannot apply to the product in the batch.

This is the single largest remaining friction point in the flow, and it is on
the screen where a wrong choice costs real money — pick a poster profile for a
tee and the buyer is charged the wrong postage.

**Recommendation, in order of value:**

1. **Sort by relevance, not alphabetically.** The profile already attached to
   the Printify product should be first and labelled "Currently attached".
2. **Group the list** — `Used by this product` / `Other apparel` / `Everything
   else` — using the profile title and the blueprint's product family, which
   `product-type-utils.ts` already computes.
3. **Make it searchable** once past ~20 entries.

**Fixed without hard filtering:** the profile already attached to the saved
product stays first and is explicitly labelled. Clearly matching product-family
profiles follow, then related apparel, then every remaining profile. Lists over
20 gain search, and every option shows first-item and additional-item charges.
Unknown or unmatched profiles remain reachable; Goldie never changes the saved
selection automatically. Choosing a profile whose name does not clearly match
the product shows a review warning before approval.

### D127 · Colours are editable, sizes are invisible and unexplained · **FIXED HERE** · **MEDIUM · UX**

Raised by Brittany: *"we're not telling people to choose what sizes in the
Printify template, and there is no ability to select sizes in the listing
factory."* Verified — she is right on both counts.

Measured on the setup step:

| | control | where |
|---|---|---|
| Colours | **43 toggle buttons**, own section | Step 2 |
| Sizes | **none, anywhere in the app** | — |

Sizes are inherited from the Printify product. The only mention in the entire
flow is one line in the product confirmation — *"Product, placement, sizes, and
shipping profile imported"* — and sizes do not become visible until the Pricing
step, as cost groups:

- **16 variants** · Light Pink / L · Light Pink / M · +14 more · cost **$9.79**
- **4 variants** · Light Pink / 2XL · Natural / 2XL · +2 more · cost **$11.64**

**This is not a money bug.** Per-group pricing gives each cost group its own
retail price, so the $1.85 2XL difference does not erode the profit goal.
Confirmed by the whole-number and profit-goal tests.

**It is an expectation gap.** A seller who just toggled 43 colours will expect
sizes to work the same way. Nothing on screen says they do not, or where to go
instead — the answer is "edit the product in Printify", which the app never
states.

**Fixed:** a line under the colour swatches — *"Sizes come from your Printify
product and apply to every listing. To offer different sizes, change them on
the product in Printify."*

**Deliberately not built:** size selection inside Goldie. The Printify product
is the source of truth for variants, and adding a second place to enable or
disable them invites the two lists drifting apart — the same failure mode as
D90's duplicated denylist. If sellers ask for it, it should replace the Printify
setting, not shadow it.

---

### D128 · Choosing a product removes the bundle option · **FIXED HERE** · **BLOCKER**

Brittany: *"I added a crew neck product, and it automatically chose that
product. And the option to create a batch disappeared."*

Reproduced exactly. `approved-functional.css:1496`:

```css
.app-shell[data-product-selected="true"] .bundle-library{display:none!important}
```

Measured: with nothing selected the bundle CTA is present and enabled
("＋ Create a product bundle"). After clicking "Choose this product" the
control count drops to **zero** and the words "product bundle" leave the page
entirely.

Adding a saved product auto-selects it, so **the act of creating the second
product needed for a bundle is what removes the bundle option.** The only
escape is to unselect the product you just made.

Presumably added to answer D12/P9 ("the bundle row is sandwiched mid-flow") —
but that asked for it to be *moved*, not deleted. It is a collapsed `<details>`,
one summary line, so it costs nothing to leave visible.

**Fixed:** `display:block`. Test asserts it.

### D118 · The bundle prompt asked about a design that does not exist yet · **FIXED HERE** · **UX**

> "Using this design on multiple products?"

Shown on the **product** step, before any design has been uploaded. Brittany:
*"why are you talking about this design? I haven't even uploaded anything yet."*
Changed to **"Want one batch to cover several products?"**

### D119 · The product name has to be typed when Goldie already knows it · **FIXED HERE** · **UX**

Connecting the Printify product imports the brand, model and blueprint title —
then asks the seller to name the product from scratch. The name field now
pre-fills from `brand + model` (e.g. "Gildan 5000") the moment the product
verifies, and only while the field is untouched and empty. Typing anything sets
`nameTouched` and Goldie never overwrites it. Editing an existing product is
excluded.

### D120 · The arrow wrapped onto its own line · **FIXED HERE** · **LOW**

"Choose this product →" in the saved-product tiles broke after "product",
leaving the arrow alone on line two in all three cards. `.recipe-use em` is now
an inline-flex with `white-space:nowrap`.

### D121 · Two help bubbles on one screen, saying different halves of one idea · **FIXED HERE** · **UX**

Brittany: *"connect your accounts, the main headline of step one — there's a
question mark by it. And then connect your accounts, the headline on the actual
card — there's a question mark by it. All of the information on both is
important, but why is it in two separate ideas?"*

Confirmed. The Connect step rendered **two** `ContextHelp` bubbles within a few
hundred pixels:

| bubble | content |
|---|---|
| step headline (`WORKFLOW_HELP[0]`) | Printify connection · Etsy connection · Nothing publishes here |
| card headline ("Explain account connections") | Printify creates the products · Etsy finishes and publishes · **Use matching accounts** · **Your publishing safeguard** |

Overlapping on the first two points, and each holding something the other did
not. A seller has to open both to get the whole answer, and has no way to know
that.

**Fixed:** the two ideas unique to the card bubble — *Use matching accounts* and
*Your publishing safeguard* — moved into the step-level help, and the duplicate
bubble removed. Connect now has **one** "?".

**The rule, now pinned by a test:** the step headline carries the screen's help.
A second bubble is only justified for a genuinely separate subject. Pricing
keeps two — item pricing and buyer-paid shipping are different topics with
different money consequences — and every other screen has one.

Count across the workflow went from 4 `ContextHelp` instances to **3**: one
page-level (all five steps) plus the two on Pricing.

---

### D122 · A new product silently inherits another product's mockups · **FIXED HERE** · **BLOCKER**

Brittany: *"I uploaded a new product, which is the crew neck, and instead of
starting from... like, it was a fresh batch, it just loaded the T shirt recipe."*

The cause, in the mockup seed effect:

```js
onChange(savedValue && themes.includes(savedValue) ? savedValue : themes[0])
```

`savedValue` is the **recipe's own** saved default. For a brand-new product it
is empty — so the fallback `themes[0]` assigned **whichever mockup set happens
to be first in the library**. Saving a crew neck produced a product card already
wearing the tee's BACH TEES mockups, captioned *"From your last batch"* for a
product that has never had a batch.

`startNewProduct()` does clear state correctly (`clearCurrentBatch(true)` nulls
the recipe and empties `mockupTheme`). The seed effect then re-filled it.

**Fixed:** a product adopts only the set it saved. No library fallback. Where a
product has no set, the block now says *"No mockup set chosen for this product
yet."* instead of claiming a previous batch.

### D124 · The Etsy fee profile appeared under Mockups on the product step · **FIXED HERE** · **UX**

Brittany: *"why is Etsy fee profile randomly below mockups? Nothing about that
product's pricing. Just a random Etsy fee section?"*

It rendered **twice**: `fee-profile-summary` on **Pricing**, beside the profit
figures it actually affects, and `fee-profile-product-summary` on the **product
step**, under Mockups, related to nothing around it.

The fee profile is an **account-level** input — Etsy's percentages are the same
for every product — so it is not a product property at all. Removed from the
product step; the Pricing copy stays.

### D123 · Mockups can only be chosen as a whole set, never per product · **FIXED HERE** · **HIGH**

Brittany: *"it's about selecting the specific mockups you wanna use for that
specific listing recipe... it's still not letting me edit the mockups I'm using
as if they're inside the recipe."*

She is right, and the D109 "Create or edit mockup sets ↗" link does **not**
address it — that opens the library, which edits the set for every product that
uses it.

What exists today:

| where | granularity |
|---|---|
| Product step (recipe) | **whole set only** — pick "BACH TEES" or nothing |
| Finish → Images + mockups | **per mockup** — `toggleTemplate`, up to 8 per listing |

So the granular control exists, but only after designs are uploaded and only for
that one batch. A saved product cannot record *which* of its set's 10 mockups it
uses, so a crew neck and a tee sharing a set must share all ten scenes.

**Fixed:** `Recipe.mockupIds` is stored with the product's existing persisted
extras, beside `defaultMockupTheme`. The product step renders every scene in
the chosen set as a visible toggle, limits the selection to Etsy's eight-scene
workflow, and lets the seller remove and re-add individual scenes before saving
them as this product's default. The exact `{theme,ids}` selection seeds Finish.
Legacy products remain valid: their existing whole-set default resolves once
to the first eight scenes, and is not written back until the seller saves it.

### D125 · Saving a new product drops you into a returning-product screen · **FIXED HERE** · **HIGH · UX**

Brittany: *"when a new product is saved, what you enter should not be what looks
like the saved recipe. It should look like a new product setup flow."*

Saving a product auto-selects it and lands on the same "Build this batch" view a
returning seller sees — colours, mockups and "Saved for this product" all
pre-populated, with copy about a last batch that never happened. Nothing marks
this as first-time setup.

**Fixed:** newly created products are persisted with `setupComplete:false` and
open in an explicit **Set up <product name>** state. Nothing is inherited from
another saved product. The seller chooses the product's colours and exact
mockup scenes, then uses one filled **Save these as <product>'s defaults**
button. The forward button explains why it is unavailable until that save.
Existing products and legacy records remain in the returning-batch state.

### D126 · "Saved for this product" was five problems in one block · **FIXED HERE** · **HIGH · UX**

Reported wholesale, and correctly:

> *"why is there a weird purple rectangle outline around the top of this card…
> why is keyword bank still to set brown… why does it jump from profit goal to
> keyword bank to shipping profile to product description… there's weird things
> that look like buttons but aren't."*

| # | problem | cause |
|---|---|---|
| 1 | Nested purple frame | `.everything-else` carried its own border, radius, panel background and shadow **inside** the product card — a card in a card |
| 2 | Brown warning text | `#8a5a12`, which **I chose in D101**. Mud on lavender, matching nothing else in the app |
| 3 | No order | Profit · Keyword bank · Shipping · Description · Etsy details — alternating between money and listing content |
| 4 | Contradiction | `summary span:after` printed *"Usually no changes needed"* directly beneath an outstanding-item warning |
| 5 | Status read as controls | the summary line was styled at control weight rather than as information |

**Fixed together, because it was one problem — no hierarchy, no grouping:**

- the block is now a section of the product card (top rule only, transparent, no shadow)
- the outstanding item is a quiet plum chip `#8a3f66`, matching the existing `.keyword-bank-required` alert it refers to
- grouped **money** (Profit goal, Shipping profile) → **listing content** (Keyword bank, Description, Etsy details) → **connection**, via `order` so no JSX moved
- "Usually no changes needed" is suppressed whenever something is outstanding
- the summary line is set at 11.5px/500 in muted plum, clearly information

Verified live before committing: transparent background, no shadow, chip
`rgb(138,63,102)`, and measured visual order Profit goal → Shipping profile →
Keyword bank → Product description → Etsy details → Product connection.

**Note on D101.** The brown was mine. I added an outstanding-item line without
giving it a colour from the existing palette, and it shipped looking like a
defect. Colour choices need to come from what the app already uses for that
meaning — here, the plum of the alert directly below it.

### Numbering correction

D117, D122 and D123 were each assigned twice, by ChatGPT and me working in
parallel. The two older entries are renumbered **D127** (sizes come from
Printify) and **D128** (choosing a product removed the bundle option). The open
items keep the numbers already quoted in conversation. 132 entries, no
duplicates.

### D131 · Selecting a product crashes in the Colours block · **FIXED HERE** · **BLOCKER**

Live verification of D123/D125 caught `ReferenceError: productFirstRun is not
defined` immediately after selecting the saved crewneck. The first-run value
was declared inside `ListingFactoryApp` but read inside the separate
`ProductColorSelector` component, where it did not exist. The production error
boundary replaced the workflow with the startup-problem screen.

**Fixed:** first-run framing is owned by the product setup container and the
reusable colour selector no longer depends on parent-only state. A regression
test scopes the selector source and fails if that value becomes undeclared
again. This defect was found by clicking the live control after deployment;
the prior build and render checks did not catch the runtime scope error.

### D132 · A contaminated crewneck record still displays tee-only scenes · **FIXED HERE** · **BLOCKER**

After D131 was repaired live, the saved crewneck still opened with `BACH TEES`.
That value had already been written by the old D122 fallback before D122 was
fixed. Preventing new contamination did not repair existing product records,
and the product-step picker was not checking each scene's garment type.

**Fixed:** mockup sets and scenes are now filtered against the selected saved
product before they render. A tee-only saved set cannot appear as valid for a
crewneck, sweatshirt, or hoodie; an incompatible legacy value clears from the
batch without silently overwriting the saved product. Compatible legacy
whole-set preferences resolve once to their first eight visible scenes so the
seller can see, remove, re-add, and explicitly save the exact selection.

---

### D129 · Selecting a bundle opens a chain of native browser dialogs · **FIXED HERE** · **BLOCKER**

Found by pressure-testing bundles for the first time, which only became possible
once three saved products existed.

Clicking **"Choose this bundle →"** fired, in sequence:

1. `window.prompt` — *"How many designs are in this ZZ TEST BUNDLE batch? Enter 1–20 so Goldie can show the exact listing total before you begin."*
2. `window.alert` — if the number was not 1–20
3. `window.confirm` — *"You're about to create N listings… There is no bundle discount. Do you want to proceed?"*
4. `window.confirm` — *"Start '…' and clear the current batch?"*

**Symptom during testing:** every automated call timed out at 45s and the tab
appeared frozen. It was not a hang — a native `prompt` blocks the renderer, and
nothing in the page could respond until it was dismissed by hand.

**The prediction was worse than redundant.** `bundlePlannedDesignCount` stored
the answer for exactly one purpose — to compare against the real upload count
and then refuse:

> "The bundle total changed. 20 designs were confirmed before setup, but 3 are
> uploaded now. Go back and restart."

So Goldie asked the seller to guess a number before she had opened her design
folder, then blocked the batch when the guess was wrong.

Meanwhile the upload-time guard already does the job properly, in the page:

> "This batch is larger than your remaining plan allowance. **3 designs × 2
> products = 6 listings**… 4 listings remaining this month."

**Fixed:** no prompt, no alert, no quota confirm. Choosing a bundle selects it.
The one remaining `confirm` is the destructive "clear the current batch" case,
which matches the single-product path. `bundlePlannedDesignCount` and the
"total changed" refusal are deleted. Quota protection is unchanged — it was
never in the prompt.

**Why this mattered and was never caught:** bundles could not be exercised
without two saved products, so every audit and every test run to this point
walked around this path. The moment it was walked, the first click froze the
page.

### D130 · In-card buttons were heavier, smaller and tighter than the ones outside · **FIXED HERE** · **UX**

Brittany: *"the dark purple buttons and the font in the buttons and how
unformatted they are sometimes are not it… the ones inside the steps or cards.
Outside them for whatever reason is fine."*

Measured, which shows exactly why the inside ones read worse:

| | font | padding | height |
|---|---|---|---|
| outside a card (`.workflow-restart-button`) | 10px / **650** | 7px 11px | **34px** |
| inside a card (`.recipe-use em`) | 10px / **850** | 5px 9px | **25px** |

A full 200 weight heavier, 9px shorter and tighter — white on dark plum, so it
reads dense rather than crisp.

**Two traps found while fixing it, both caught in the browser, not the editor:**

1. The quiet in-card buttons (`.edit-recipe`, `.delete-recipe`) use
   **`font-size:0` with a `::after` supplying the label**. Setting any
   font-size on them un-hides the original text — the first attempt rendered
   **"Rename / reconnectRename"** in every tile.
2. The primary pill lives in a **117px** column. "Choose this product →" cannot
   fit at any reasonable size — and D120's `white-space:nowrap` had converted
   the old wrap into an overflow past the card edge. **The label had to shorten,
   not the type.**

**Fixed:** one in-card system — primary and save actions on the same plum
gradient, 700 weight, 30–38px tall, pill radius, soft lift; quiet actions as
outlined pills with **no type changes**; destructive stays a text link. The tile
CTA is now **"Choose →"** and **"✓ Ready"**, which fit the column with no
clipping. Verified live: 0 tiles overflowing, product name still on its own
line, pill 30px at 10.5px/700.

### D123 — verified live, 21 Aug 2026

Measured on the product step, Gildan Tee, after the D129 prompt removal:

| | |
|---|---|
| mockups rendered as toggles | **10** |
| selected on load | **8** (the per-listing maximum) |
| toggle one off | **7** |
| toggle a second off | **6** |
| save control | **"Save these 6 mockups as this product's default"** |

Copy reads *"Saved for this product — remove or add any scene."* Restored to 8
without saving, so the product default is untouched.

Implementation note worth keeping: `mockupIds` is stored inside the existing
`pricingJson` blob on `product_recipes`, so no migration was needed and the
standing rule about not touching `db/` or `drizzle/` held.

---

### D135 · A product bundle cannot be selected at all · **FIXED** · **BLOCKER**

**Root cause confirmed live:** D129 removed `bundlePlannedDesignCount` state but
left `setBundlePlannedDesignCount(0)` in `clearCurrentBatch`. Bundle selection
is the first path that calls `clearCurrentBatch(true)`, so it threw a synchronous
`ReferenceError` before loading either product. The old regression test missed
the orphaned setter because its match was case-sensitive. The call is removed
and the check is now case-insensitive.

Found by pressure-testing bundles after Brittany added a third saved product.
D129 (the native-dialog gauntlet) was masking this — once the prompt was gone,
the real failure was visible underneath.

**Reproduction:** create a bundle of two saved products, click
"Choose this bundle →".

**Measured, repeatedly:**

| observation | value |
|---|---|
| tile label on click | flashes **"Loading bundle…"** |
| reverts to "2 products · Choose this bundle →" after | **2 ms** |
| `data-product-selected` | stays **`false`** for 18s+ |
| rail Designs / Pricing / Finish | **disabled**, reason *"Choose a saved product."* |
| on-page error message | **none** |
| dialogs fired (confirm/prompt/alert stubbed and logged) | **none** |
| network requests | **none** — 2ms is synchronous |

**Not the data.** `/api/product-bundles` returns both recipe ids and both
resolve in `/api/product-recipes`:

```
bundle ZZ TEST BUNDLE -> 02f90230… (Gildan Hoodie), e8bc2932… (Gildan Tee)
```

The tile subtitle correctly reads "Gildan Hoodie · Gildan Tee", and the button
is not disabled — so `included.length >= 2` at render time.

**Not the product.** Gildan Hoodie selected on its own works normally:
"Loading Gildan Hoodie…" for ~4s, then `data-product-selected: true`, "✓ Ready".

**Lead.** A 2ms synchronous `false` with no dialog and no request leaves only an
early return in `useBundle`. The first is:

```js
if(recipes.length<2){stopWith("This product bundle needs attention.",[…]);return false}
```

That fits the timing exactly — and note **`stopWith` produced no visible
message**, so even when it fires the seller sees nothing at all. Two things to
check: why the `recipes` array reaching `useBundle` is shorter than the
`included` array the tile rendered from, and why `stopWith` is silent here.

**Impact:** bundles are unusable end to end. Nothing downstream of selection —
per-product colours, the bundle progress rail, carrying designs across products
— has ever been exercised, because selection is the first step and it fails.

### D136 · The same bundle renders twice with contradictory state · **FIXED** · **MEDIUM**

The product step shows each bundle in two places:

| location | class | label when selected |
|---|---|---|
| top grid, beside products | `.recipe-tile.bundle-as-product` | **"2 products · Choose this bundle →"** |
| bundle library below | `.bundle-tile.selected` | **"✓ Ready for this batch"** |

The top-grid card has **no selected branch** in its JSX — it always renders the
call to action — so one card claims the bundle is ready while the other invites
you to choose it, on the same screen.

---

### D137 · A separator dot dangles at the end of the batch-limits line · **FIXED HERE** · **LOW**

`.batch-limits` is a wrapping flex row of three facts with `<i>` dots between
them. At the real card width it wraps after the second fact, so the dot that
should separate items ends a line instead:

> 20 designs available for this batch • 9984 listings remain on your plan **•**
> 100 MB per design · original print quality preserved

**Fixed:** the two quota facts share a row that carries the dot between them;
the file-size guidance is its own muted line that never needs a separator.

### D138 · The product-step mockup grid: blank tiles, raw filenames, half a card of whitespace · **FIXED HERE** · **HIGH · UX**

Found by scrolling the product step and looking, rather than measuring.

**Three problems in one block:**

1. **Tiles paint blank and fill in late.** My **D97** change added
   `loading="lazy"` to every repeated image. That is correct for the Printify
   photo picker — 477 images, 92% off-screen — and **wrong here**: ~10 images,
   all on screen, so the seller watches empty rectangles resolve as she scrolls.
   Screenshotted twice: the first pass showed all ten blank, the second showed
   the top two filled and the rest still empty.
2. **Raw upload filenames as labels** — *"ChatGPT Image Aug 14, 2026, 10_42_04
   AM (4)"* under every scene. This is D9 reappearing in a grid built after it
   was closed.
3. **Two columns in a ~670px card** (`340px 290px`), leaving the right half of
   the block empty while the pictures stayed small.

**Fixed:** these ten images load eagerly; the label is now **"Scene 1…10"**; the
grid is `auto-fill minmax(132px,1fr)` so it fills the card, with 4:5 covers.

**The lesson, which is the same one as D96 → D100:** a fix that is correct for
one surface is not automatically correct for another. D97 was measured against
the 477-image picker and applied globally without checking the small grids.

### D139 · Status chips were styled exactly like secondary buttons · **FIXED HERE** · **HIGH · UX**

Brittany: *"there's weird things that look like buttons but aren't… ten dollar
profit, shipping profile needed, description ready, Etsy details zero of eleven
set. If you're gonna do that, then colour code to let people know that those
aren't buttons, they're notifications."*

Measured side by side, and she is exactly right:

| | background | border | radius | weight | height |
|---|---|---|---|---|---|
| `.saved-settings-summary span` — **status** | white | 1px | 999px | 750 | 31px |
| `.edit-recipe` — **a real button** | white | 1px | 999px | 650 | 30px |

The same box, so "$10 profit" and "Description ready" invite a click that does
nothing.

**Fixed, and written down as a rule:** a **control** is white with a border and
a pill radius. A **status** is tinted, borderless, lighter and squarer —
`rgba(107,58,88,.07)` at 8px radius, 600 weight, `cursor:default`. Anything
outstanding keeps the plum treatment so one thing on the block asks for
attention. Verified live: status now 0px border / 8px radius / 600, button still
1px / 999px / 850.

**Nothing that cannot be clicked gets a button's box.** That is the check to run
whenever a chip or badge is added.

### D140 · Product names split across a heading's line break · **FIXED HERE** · **LOW**

Pricing headings carry the product name in a `<span>`:

> "2. Etsy shipping profile — what buyers pay **· Gildan Tee**"

The span wrapped as normal text, so at the real card width the heading broke
mid-name and left **"Tee"** alone on its own line. The heading is allowed to
wrap; a product name is not. `white-space:nowrap` on the name span in both
pricing headings. Verified live: name now stays on one line.

### Pricing step — otherwise clean

Walked and screenshotted at the real width:

- "1. Item prices · Gildan Tee" with the profit goal and whole-number toggle
  grouped to its right
- A green confirmation line explaining what the numbers include
- Two cost groups rendered clearly — **16 variants at $9.79 → $22.37** and
  **4 variants at $11.64 → $24.41**, each showing "Lowest estimated item profit
  $10.00 · Shipping not included"
- Per-group "View included variants or edit one separately" disclosure
- "See how Goldie calculated these prices" disclosure
- "2. Etsy shipping profile — what buyers pay · Gildan Tee" beneath

No nested frames, no orphaned controls, no status styled as buttons.

### D141 · The publish checklist splits into two grids, and a warning looks like a tick · **FIXED HERE** · **HIGH · UX**

Found by screenshotting the Publish phase rather than measuring it.

**Two problems on the last screen before listings go live:**

1. **Inconsistent layout.** `.final-checklist` is a single **642px** column of
   five ticks; `.final-safety-readiness` is a **separate 316px + 316px grid**
   holding the final two. Five full-width rows, then two half-width ones, for no
   reason visible to the seller.
2. **A warning styled as a tick.** *"! Etsy details and personalization still
   need review"* rendered at `rgb(99,67,94)` on a transparent background —
   **exactly** the same as every "✓" row. The only difference was the character.

**Fixed:** the readiness row is one column matching the checklist, and the two
items now carry `ready` / `needs-review` classes so an outstanding item gets the
plum attention treatment (`#8a3f66` on `#fdf2f8` with a tinted border) while
settled items stay quiet. Verified live — both rows now 642px, warning renders
`rgb(138,63,102)` on `rgb(253,242,248)`, tick unchanged.

Same family as **D139**: state has to be legible from the styling, not from a
single character.

### Finish phases — walked and screenshotted

| phase | result |
|---|---|
| 1 · Titles + tags | titles wrap fully (139/130/137 of 140), tags wrap fully, **13/13/13** after regeneration, DPI chips present |
| 2 · Etsy details | **"6 added · all optional"** (D111 live), full category path (D106 live), clean two-column field grid |
| 3 · Images + mockups | 477-image picker still correctly lazy-loaded |
| 4 · Publish | titles fully readable, per-listing "130/140 characters · 13/13 tags · 4 photos", "Nothing is published until you use the final button" |

**One false alarm I checked before reporting:** row 1 showed 6/13 tags against
row 2's 13/13. Regenerating produced **13/13/13**, so it was stale data from
before the D79 fix, not a live defect.

### D142 · Batches named after machine-generated filenames · **FIXED HERE** · **MEDIUM · UX**

Seen in Brittany's own Batch History while reviewing the page:

> **"ChatGPT Image Aug 21, 2026, 05 32 41 PM (2) + 3 more"**

`designLabel()` cleaned up the first design's filename, and that result took
precedence over both `setup_name` and `product_title`. So the batch name is
whatever the file happened to be called — which for AI art, phone cameras and
screenshots is a timestamp.

This is not an edge case. Sellers making print-on-demand art overwhelmingly
upload files named `ChatGPT Image …`, `IMG_4821`, `Screenshot 2026-08-21` or
`20260821_113244`.

**Fixed:** a filename is only used when a human plausibly chose it. Generic
prefixes (ChatGPT, DALL·E, Midjourney, Gemini, Firefly, Stable Diffusion, IMG,
DSC, PXL, Screenshot, Untitled, Download, Export, Scan, Capture) and names with
fewer than four letters fall through to the product name instead.

Verified against real cases:

| filename | result |
|---|---|
| `scottsdale-bachelorette.png` | **kept** → "scottsdale bachelorette" |
| `palm-springs-desert-disco.png` | **kept** → "palm springs desert disco" |
| `ChatGPT Image Aug 21, 2026, 05_32_41 PM (2).png` | dropped → product name |
| `IMG_4821.png` · `DSC_0031.jpg` · `Screenshot 2026-08-21.png` | dropped → product name |
| `20260821_113244.png` · `untitled-1.png` | dropped → product name |

### Management pages — walked and screenshotted

- **Mockup Library** — thumbnails now **172×214** in a five-across grid with all
  ten visible (D83 fixed), heading matches the sidebar (D84 fixed).
- **Usage + Plan** — four uniform cards, each limit distinctly labelled with its
  own denominator and remaining count; the 24-hour cap reads as a rate, not a
  quota (D34, D35, D36 all holding).
- **Batch History** — every badge reads "DRAFTS READY · 0 PUBLISHED" (D88
  holding); 16 batches, mostly test artefacts from today.

### D143 · My D130 fix made unselected products the loudest thing on screen · **FIXED HERE** · **HIGH · UX**

Found by clicking a real pixel with a mouse instead of calling `.click()` on a
selector — the first genuinely user-shaped pass.

Choosing a product collapses the product grid from three columns to one
(pre-existing, and fine). But **D130** had set the tile CTA to `width:100%`,
which in a 642px single column made every button **553px wide**:

| tile | state | CTA | width | fill |
|---|---|---|---|---|
| Gildan Tee | **chosen** | "✓ Ready" | 553px | pale tint — read as a *disabled input* |
| Gildan Hoodie | not chosen | "Choose →" | **553px** | **dark gradient** |
| gildan crewneck | not chosen | "Choose →" | **553px** | **dark gradient** |

So after choosing a product, the two loudest elements on the screen were the two
products she **did not** choose, and her actual selection looked disabled. That
is the D45 inversion, reintroduced by me.

`width:100%` was only ever needed because the label was "Choose this product →"
in a 117px column. D130 also shortened it to **"Choose →"**, so the constraint
no longer applies.

**Fixed:** `width:fit-content; max-width:100%`. Verified in both layouts —
single column: "✓ Ready" 71px, "Choose →" 81px, nothing clipped; narrow
three-column: still fits.

**Why this took a real click to find.** Every previous pass drove the app with
`querySelector(...).click()` and measured the DOM. That reaches the same
handlers but never asks *what does this look like once state changes*. The
inversion only exists in the post-selection layout, which no measurement I ran
had rendered and looked at.

### D144 · The chosen-product confirmation was wedged inside the bundle section · **FIXED HERE** · **MEDIUM · UX**

Seen by scrolling the product step with a wheel and reading the screen. The
order was:

1. `3 SAVED PRODUCTS` — the product cards
2. `1 SAVED PRODUCT BUNDLE` — the bundle cards
3. **`Unisex Heavy Cotton Tee · SwiftPOD · 20 selected variants · PRODUCT SELECTED`**
4. `Want one batch to cover several products?` — the bundle prompt
5. `Drop your designs here`

So the confirmation of the product she had just chosen sat **between the two
halves of the bundle section**, and the bundle prompt appeared *after* the
bundle list it introduces.

This is the D12 / P9 complaint — "the bundle row is sandwiched mid-flow" — in a
new arrangement: now it is the bundle section that is split, by something
unrelated to it.

**Fixed:** `{activeId&&props.selectedSummary}` now renders directly beneath the
saved-product grid, so choosing a product confirms itself where the choice was
made. Bundle list and bundle prompt are contiguous again. Guarded by a test that
asserts the source order.

### D145 · The mockup scene grid was trapped in a 340px column · **FIXED HERE** · **MEDIUM · UX**

D138 set `.product-mockup-scenes` to `repeat(auto-fill,minmax(132px,1fr))` and
it *still* rendered two columns. The rule was applied correctly — I checked the
cascade and both my declarations were winning. **The container was the problem.**

`.batch-default-block.mockup-default-block` is a two-column grid — `340px 290px`
— and its five children auto-place:

| child | lands in | width |
|---|---|---|
| heading | spans | 644px |
| "Mockup set" select | column 1 | 340px |
| "Create or edit mockup sets ↗" | column 2 | 290px |
| **scene grid** | **column 1** | **340px** |
| "8 of 8 selected…" caption | column 2 | 290px |

So the pictures were squeezed into 340px while the right half of the card stayed
empty, and the caption floated *beside* the tiles rather than beneath them.

**Fixed:** the scene grid and its caption take `grid-column:1/-1`. Measured after
— grid **340px → 644px**, **two columns → four**, tiles 152px, caption below.

**Worth noting for the next one of these:** the declaration being applied is not
the same as the layout being right. I verified `grid-template-columns` was
winning the cascade and concluded the fix had shipped; it had, and the result
was still wrong because the parent constrained it. Check the rendered width, not
just the computed property.

### D146 · Smooth scrolling never fires anywhere in the app · **FIXED HERE** · **HIGH**

D93 established that `behavior:"smooth"` was dead on the management pages. I
scoped the fix to those screens and assumed the listing factory was fine. It is
not.

Measured on **both** surfaces:

| page | `scrollTo({top:1200, behavior:"smooth"})` | `scrollTo(0,1200)` |
|---|---|---|
| `/keywords` (`.management-page`) | **0** | 1200 |
| `/listing-factory` (`.app-shell`) | **0** | 1200 |

Every smooth scroll in the app is a silent no-op — no error, nothing in the
console, the page simply never moves.

**Found by clicking the thing a seller clicks.** The prompt *"Pick a keyword
bank so Goldie can write your titles"* is a button. Clicking it opened the
"Saved for this product" section (`opened: true`) and then **did not scroll** —
six samples, all `scrollY 3577`. So it expands a section below the fold and
leaves the seller exactly where she was, looking at an unchanged screen.

**Fixed:** that handler now scrolls instantly to the section, and every
remaining `behavior:"smooth"` in the app is gone — **5 in
`listing-factory-app.tsx`** (including the step-change scroll-to-top, the
missing-photo jump, and the mockup phase advance) and **1 in `support-chat.tsx`**
(the message autoscroll). A test now fails on `behavior:"smooth"` anywhere.

**The lesson, and it is the same one as D97 → D138:** I measured a problem on
one surface, fixed it there, and assumed the rest of the app differed. It did
not. When a browser-level behaviour is broken, check whether it is broken
everywhere before scoping the fix.

### D147 · A requested Finish phase is discarded on load · **FIXED HERE** · **HIGH**

D108 fixed this for **steps**. Phases were never covered, and I only noticed
because I navigated to a phase by URL the way a bookmark would.

Measured on the deployed build, fresh page loads:

| requested | landed on |
|---|---|
| `?phase=details` | **`final`** |
| `?phase=etsy` | **`details`** |

Restoration overwrote the requested phase with whatever the batch last saved, so
the destination changes depending on where the seller happened to stop last
time. In-app phase navigation works fine — this only bites on a reload, a
bookmark, or a link.

**Fixed:** `restoredFinishPhase()` mirrors `restoredWorkflowStep()` exactly — a
completed batch may open any phase, an unfinished one any phase up to the
furthest it reached. Pinned in the traversal guard alongside the D53/D73 tests.

**Worth noting:** D108's commit message said "preserve explicit backward
navigation", and it did — for steps. The phase equivalent sat one line below the
line that was changed. When a fix is about a navigation rule, check every axis
the app navigates on.

### D148 · Every listing thumbnail is the same blank white square · **FIXED HERE** · **MEDIUM · UX**

Seen by scrolling the Titles + tags phase and looking at the three listings side
by side: all three thumbnails were **identical blank white squares**.

Not broken images — they load fine at **1200×1200**. They are the *Printify
preview*: a white garment photographed on white, cropped to **54px**. At that
size a cream tee is a blank square, and it is the same blank square for every
design in the batch.

The thumbnail's only job in this list is telling one listing from another, and
the garment cannot do that — the **artwork** can.

**Fixed:** `draftPreview` now prefers `design.previewUrl` (the uploaded artwork)
and falls back to the Printify preview when the file cache is unavailable, e.g.
a batch restored on another machine. Artwork is typically a transparent PNG, so
the thumbnail gets a soft tinted background and `object-fit:contain` instead of
`cover`, so the art is visible rather than cropped into. The Printify garment
preview is still one click away via **Enlarge**.

**Also checked and NOT a defect:** the D76 warning *"No phrase in this bank
matches this design"* appears above a listing that has a complete 139-character
title. That reads oddly but is correct and is the entire point of D76 — the
title is built from real bank phrases, none of which describe the SCOTTSDALE
artwork. Leaving as is.

## D149 — the 13th tag chip painted on top of the "Open in Printify" button
**Where:** Finish · Images + mockups, any listing whose tags fill all 13 slots.
**Found by:** real-user pass (screenshot showed the button overlapping chips), then measured.
**Measured before:** `.draft-card-top .tag-row` clientHeight 80, scrollHeight 118, computed
`overflow-y: visible`. Chip "mermaid bachelorette" occupied 269–301; `.edit-draft-button`
top 280 — the chip painted over the button.
**Cause:** `.app-shell .draft-card-top .tag-row` (approved-functional.css:133) sets
`max-height:82px; overflow-y:scroll` with a painted scrollbar. A later, broader rule at
line 1470, `.app-shell .draft-card .tag-row{...overflow:visible!important...}`, was added to
stop chips being clipped horizontally and took the vertical scroll down with it — the
`max-height` still applied, so the box stayed 80px while its content escaped.
**Fix:** dropped `overflow:visible!important` from the broad rule; kept `display:flex`,
`max-width`, `flex-wrap`.
**Measured after:** computed `overflow-y: scroll`, row bottom 264, button top 280, 16px gap.
`elementFromPoint` over the chip returns the card, not the chip (clipped, not painted), and
scrolling the row brings the chip fully inside it.
**Guard:** `tests/approved-visual-baseline.test.mjs` — "the 13th tag chip cannot escape its row".
**Pattern (again):** a fix that is correct for one axis is not automatically correct for the
other. The broad rule needed horizontal overflow; it used the shorthand and reset both.

## D150 — the main Printify placement button rendered at 9px
**Where:** Finish · Images + mockups, every listing card.
**Measured:** `.edit-draft-button` computed font-size **9px**, its `<small>` sub-line 8.5px,
against a 16px baseline for every other button on the page (the smallest legitimate label
anywhere else is 11px). Source: `app/theme.css:24`, the original gold-era rule. The lilac
re-theme (`lilac-theme.css:117`) recoloured this button and never resized it.
**Fix:** `.app-shell .edit-draft-button{font-size:12.5px!important}`, sub-line 10.5px.
**Guard:** "the Printify placement button is readable — D150".

## D151 — six buttons were relabelled in CSS over hidden DOM text
**Pattern:** `font-size:0!important` on the element + `::after{content:"real label"}`.
Someone renamed buttons by overwriting them in the stylesheet instead of editing the JSX.
**Instances found:** `.open-all-button` (relabelled **twice**, lines 246 and 1468),
`.draft-mockups>summary`, `.recipe-card .edit-recipe`, `.recipe-card .delete-recipe`,
`.top-nav a[href="/usage"]`, `.approved-usage>b`.
**Measured consequences:**
- `.draft-mockups>summary` lost its ▶ disclosure marker (`font-size:0` collapses `::marker`),
  so "Create lifestyle mockups…" read as inert text beside "▶ Choose Printify flatlays".
  That is exactly why it did not look clickable in the screenshot.
- DOM text and visible text disagreed completely: the DOM said "Add Your Own Mockups
  (Optional)" while the screen said "Create lifestyle mockups from your Mockup Library".
  Accessible name, find-in-page and every text assertion read the hidden string.
- `.approved-usage-card` was targeted by one of these rules and does not exist in any TSX —
  dead CSS.
**Fix:** real labels moved into the TSX; all `font-size:0!important` relabels deleted.
**Guard:** "no button is relabelled by CSS over hidden DOM text".

## D152 — the bundle's "Edit bundle" button rendered as "Rename"
**Cause:** `.app-shell .recipe-card .edit-recipe{font-size:0}` +
`:after{content:"Rename"}` was written for the saved-product card, but the bundle grid
(`.recipe-grid.unified-bundle-grid`) sits **inside** the same `.step-card.recipe-card`, so the
bundle's Edit button matched too.
**Proven, not inferred:** injected a `<button class="edit-recipe">Edit bundle</button>` into the
live `.unified-bundle-grid` → computed font-size `0px`, `::after` content `"Rename"`.
**Also caught:** the saved-product button's DOM text was "Rename / reconnect" but it displayed
as "Rename". Reconnecting a Printify template has no other control on that card, so the only
route to it was hidden behind a label that did not mention it.
**Fix:** "Edit" (with `title="Rename this product or reconnect its Printify template"`) and
"Edit bundle" as real text; `×` delete buttons now read "Delete" in the DOM too.
**Pattern (again):** a rule written for one card matched a second card nested inside it.

## D153 — the publish checklist's "needs review" chip was still gold-era brown
**Where:** Finish · Review + publish. Every unmet checklist item
("! One or more titles need review", "! Prices and buyer-paid shipping need review").
**Measured:** `.final-checklist .content-review` = border `#dfbd7f`, background `#fff5dd`,
text `#7a5010`; `.final-listing-card .content-review` = `#8a5a12`. These sat directly beside
the plum "✓" chips from `.final-checklist span` (`#63435e` on a lavender gradient).
**Why it survived:** Brittany rejected this brown once already, and D101/D126 replaced it —
but only on `.everything-else summary .setup-todo`. The publish checklist is a different
surface and kept the whole gold chip.
**Not dead CSS:** `.content-review` is applied live in `listing-factory-app.tsx` via
`className={pricingApproved?"":"content-review"}` and two siblings.
**Fix:** the plum "needs attention" language already in the app — border
`rgba(157,80,130,.32)`, background `#fdf2f8`, text `#8a3f66`.
**Guard:** "the publish checklist's needs-review chip is plum, not gold". The D64 test that
pinned the amber hex was updated: D64's point is a distinct non-blocking state, not amber.
**Pattern (again):** fixed on one surface, not the other.

## D154 — open steps told you to "Complete the prior step"
**Where:** the Finish rail (and the top rail, same code path).
**Measured live** on batch `103d12f0` with all three listings drafted and photos chosen —
label vs. the button's own `disabled` property:
| viewing | step | label | disabled |
|---|---|---|---|
| Titles + tags | Images + mockups | "Complete the prior step" | **false** |
| Titles + tags | Review + publish  | "Complete the prior step" | **false** |
| Etsy details  | Images + mockups | "Complete the prior step" | **false** |
| Etsy details  | Review + publish  | "Complete the prior step" | **false** |
| Images+mockups| Review + publish  | "Complete the prior step" | **false** |
Clicking "Review + publish" opened it instantly, and the rail *then* flipped to
"Ready to publish" and marked Images + mockups "Listing images reviewed". The gate was
never closed; the label was.
**Cause:** both rails render `` issues[0] || progressStatus(...) ``, so `progressStatus`
is only reached when `progressGateIssues()` returned **empty** — i.e. the step is open.
Its fallback still returned "Complete the prior step" for any step that was not `active`.
**Fix:** `progressStatus(index, active, done, blocked)` with `const live = active || !blocked`;
every branch now keys off `live`, so an open step reads its real state.
**Impact:** this is the "I'm stuck and can't tell why" failure — the user hunts for missing
work on a step that was ready the whole time.
**Guard:** `tests/workflow-traversal.test.mjs` — "an open step never claims you must
complete the prior one".

## D155 — the Publish checklist was nine "all fine" rows in two type systems
**Measured** on Finish · Review + publish, all three listings ready. One 642px column:
- `.final-checklist span` × 5 — `text-align:start`, 11px, weight 400, lavender chip
- `.final-safety-readiness>span.ready` × 2 — **centred**, 12px, weight **750**, white chip

Five left-aligned rows followed by two centred bolder ones, for no reason a seller can see.
(Two further `.final-checklist` rows are `display:none` — they duplicate the readiness rows
verbatim; hidden in CSS rather than removed.)
**Fix:** the readiness rows now take the checklist's alignment, size and weight. The
`.needs-review` variant keeps its louder plum treatment on purpose — a warning must not
look like a tick.
**Verified live:** all 7 visible rows now report `642px | 11px | 400 | rgb(99,67,94)`.

## D156 — three different success languages on the Publish screen
**Measured**, on one screen:
| element | treatment |
|---|---|
| `.final-checklist` / `.final-safety-readiness` ticks | plum `#63435e` |
| `.step-success-banner` | green text `#245d3b`, ✓ circle `#3f9a63`, green border/shadow |
| `em.ready` chip, `.ready` text | green `#286340` on `#e7f5ea`, `#34704c` |
**Why this is a defect, not taste:** `DESIGN_SYSTEM.md` is the frozen baseline and its palette
contains **no green whatsoever**. It also states the signature gradient is "reserved for
primary actions, active navigation, the current step, selected cards, and completion
moments", and that changes "must not introduce a second version of an existing component".
The green is gold-era residue in `globals.css` that the lilac re-theme never reached.
**Fix:** banner recoloured to the plum surface; its tick now uses
`linear-gradient(145deg,#e8b7e1,#c990d0)` — the exact gradient the rail's completed step
uses. `.ready` chips take the plum.
**Verified live:** a full-page scan for green foreground/background returned 7 elements
before and **0** after.
**Guard:** "the Publish screen uses one success language, not three". One existing test
pinned the green border hex; updated — its point is that the banner is styled, not that it
is green.

## D157 — generated titles repeated phrases they already contained
**Where:** every title the title builder produces. Found on Finish · Review + publish.
**Measured — all three live titles in batch `103d12f0`:**
| title | chars | redundancy |
|---|---|---|
| "Vegas Bachelorette, … Off The Market, Fresh Off The Market" | 130 | "off the market" inside "fresh off the market" |
| "Bachelorette Girls Gone Mild, **Girls Gone Mild**, Fresh Off The Market, **Off The Market**, She Said Yes, **Shes Off The Market**, …" | 139 | "girls gone mild" ×2, "off the market" ×3 |
| "Bachelorette Girls Gone Mild, **Girls Gone Mild**, Bikinis And Martinis, **Bikinis And Martinis Bachelorette**, …" | 137 | "girls gone mild" ×2, "bikinis and martinis" ×2 |
One title literally reads "Bachelorette Girls Gone Mild, Girls Gone Mild," back to back.
**Cause:** `selected` is built with `[...new Set(...)]`, which removes only **exact**
duplicates. "girls gone mild" and "bachelorette girls gone mild" are different strings, so
both were appended. Nothing checked containment.
**Why it matters:** Etsy gives 140 title characters. Repeating a phrase spends them twice for
one keyword and reads as stuffing — the opposite of what this tool is sold to do.
**Fix:** before assembly, drop any phrase wholly contained in a longer selected phrase. The
longer phrase still carries the shorter as a substring, so keyword coverage is unchanged and
the freed characters let a genuinely new phrase in.
**Re-ran the three real cases through the fix:** 7→6 phrases (114 chars), 7→5 (106), 6→4 (98)
— all still clear `TITLE_FILL_FLOOR` (90), and every dropped phrase survives inside a kept one.
**Guard:** `tests/rendered-html.test.mjs` — "a title never repeats a phrase it already contains",
which asserts both the source predicate and the behaviour on the live data.

## D158 — keyword phrases rendered at 9px on the Keyword Banks page
**Where:** `/keywords`, every phrase chip — i.e. the actual content of the page.
**Measured:** all 17 chips of "JANE AUSTEN TEE" and all 50 of "BACHELORETTE TEES" compute to
`font-size: 9px`, chip height 24px.
**Cause:** `globals.css:11` — `.bank-grid article span{background:#eee5d5;...;font-size:9px}`,
a gold-era rule (that background is a tan). `management-aesthetic.css:53` recoloured it to
plum and never touched the size. Exactly the same miss as D150 in `theme.css`.
**Fix:** 11px in the lilac layer, matching the other secondary labels in the system.
**Guard:** "keyword phrases are readable".

## D159 — the sidebar jumped 72px between management pages
**Measured**, top edge of the first nav link ("Listing Factory") at 1440×812:
| page | nav top |
|---|---|
| /keywords | 146 |
| /mockups | 146 |
| **/batches** | **218** |
| **/usage** | **218** |
So the whole sidebar shifts down as you move from Keyword Banks to Batch History and back.
**Cause:** `:is(.management-page,.usage-page)>.management-nav a:first-of-type{margin-top:72px}`
applied to all four pages, and a later `!important` reset returned it to 0 for
`:is(.keyword-page,.mockupFactory.managementOnly)` **only**. Batch History and Usage were
never added to the reset, so they kept the offset.
**Fix:** removed the stray 72px rule — line 16 of the same file already sets `margin-top:0` —
plus the two now-redundant per-page resets.
**Verified:** /usage moved 218 → 146, matching the pages that were already right.
**Pattern (again):** a fix applied to the surfaces someone happened to be looking at.

## D160 — Batch History's "complete" chip was the last green in the app
**Measured:** `.management-page .batch-status.complete` = `rgba(206,239,218,.72)` /
`#286547` — green — while its three siblings in the same rule are all in-palette
(`base` pale plum, `processing` lavender, `needs_attention` rose `#8a3650`).
Same root cause as D156, one page further on; a full-page green scan of `/batches` returned
this one element.
**Fix:** the completion gradient, matching D156 —
`linear-gradient(145deg,rgba(232,183,225,.62),rgba(201,144,208,.5))` on `#4b283e`.
**Verified live:** green count on `/batches` 1 → 0.

## D161 — the Printify photo picker shows blank tiles for the first second
**Measured** on the 148-photo Gildan Tee, opening "Choose Printify flatlays":
- 117 thumbnail requests, **1.97MB** total
- median load **508ms**, slowest **994ms**
- source images are **1200×1200**, rendered into **88×88** tiles
- 1.2s after opening: 16 tiles in the viewport, **0** painted; at 7s all 16 complete

`.printify-photo-expand` (the tile button) and its `img` are both transparent, so an
unloaded tile is a blank white square with a lone checkbox floating in it — which is
exactly what a screenshot at t+1s shows. The picker is not broken; it reads as broken,
and a seller choosing photos sees empty boxes.
**Fix:** a pending plum tint on the tile and the image, the same remedy as D148, so an
unloaded photo looks like it is arriving.
**Not fixed here:** the tiles still download full 1200×1200 files for an 88px slot. Serving
a smaller source would cut ~2MB per open, but that needs a Printify CDN resize parameter
which I could not verify, so I did not guess at one.
**Guard:** "an unloaded Printify thumbnail looks pending, not missing".

## D162 — saved-product tiles staggered by whichever name wrapped
**Where:** Step 2 · Choose product, the saved-products grid.
**Measured** with "Gildan Tee", "Gildan Hoodie", "gildan crewneck" (the third wraps to two
lines). All three tiles were identical — top 473, height 215 — but their insides were not:
| | Gildan Tee | Gildan Hoodie | gildan crewneck |
|---|---|---|---|
| `.recipe-use` top | 480 | 480 | **474** |
| `.recipe-use` height | 138 | 138 | **162** |
| Edit row top | 643 | 643 | **649** |
The tile's grid rows resolve to `161.5px 45px`; the two-line name made its button 162px, so
the button overflowed its own row **upward** by 12px while the footer dropped 6px. The
result is three side-by-side cards whose Choose buttons and Edit/Delete rows each sit at two
different heights.
**Fix:** `grid-template-rows:1fr auto` pins the footer, `height:100%` makes the button fill
its row instead of overflowing it, and the name reserves two lines (`min-height:3em` —
line-height is 24px on a 16px font). The name is clamped to two lines, so the button now
carries `title={recipe.name}` and the bundle equivalent, keeping longer names reachable.
**Measured after:** `.recipe-use` 474/474/474, Choose pill 589/589/589, Edit 649/649/649 —
every tile identical.
**Guard:** "saved-product tiles line up regardless of name length".

## D163 — eight text styles failed contrast, including an enabled control that looked disabled
**Method:** composited every text node against its actually-painted background — walking up
the tree for the first opaque layer and averaging gradient stops. Worth noting: a first pass
that read only `background-color` reported a 1.11:1 "invisible" bundle CTA, which turned out
to be white on a plum **gradient** pill and perfectly legible. I checked that against a
screenshot before reporting it, and fixed the scanner instead.
**Genuine failures (WCAG AA for the given size):**
| element | ratio | needed |
|---|---|---|
| `.delete-recipe` "Delete" | **3.00** | 4.5 |
| `.hero-step-count` "Step 2 of 5" | 3.14 | 4.5 |
| usage count "16 / 10000 listings" | 3.45 | 4.5 |
| `.account-link` "Sign out" | 3.46 | 4.5 |
| "Powered by", "© 2026 Be A Wolf Biz", `.etsy-api-disclosure` | 3.46 | 4.5 |
| `.progress-bubble-label` | 4.21 | 4.5 |
"Delete" is the one that matters most: it is an **enabled** button that read as disabled,
which is why it looks inert next to the white "Edit" pill.
**Palette limitation found:** the sidebar is painted on pink `rgb(232,177,200)`. Against that,
the app ink `#4a2a3e` reaches only **4.43:1 at alpha 0.80** — it cannot pass AA at any alpha
below ~0.95. Those tokens are now near-opaque; lightening the ink there is not an option
without changing the sidebar colour, which is a design-system decision, not a bug fix.
**Measured after:** 0 of 8 failing.
**Guard:** "small text meets AA against the surface it is painted on".

## D164 — sizes are now chosen in Goldie, per saved product, exactly like colours
**Why:** colours had a picker and sizes did not, so a seller had to remember to set their
size range in the Printify template. D123 had already noticed this and settled for a note in
the Colours card pointing at Printify; that note's own rationale was "a seller who can change
colours here will reasonably expect to change sizes here too". This does the real thing.

**Governing safety property:** *default behaviour is identical to before.* This is the code
path that feeds pricing and Printify draft creation, so only an explicit user action may
change which variants go live. Every piece below is built around that.

**How it is made safe**
| risk | how it is handled |
|---|---|
| Blueprint with no size axis (mug, sticker) | `sizeIds` stays empty, every expression collapses to the previous colour-only behaviour, and the selector renders `null` |
| Other axes (style, paper, cut) | still gated to the template via `enabledOtherIds` — they are not selectable in Goldie, so offering combinations would produce variants the seller cannot price |
| Existing saved products | seeding falls through to "what the template had enabled", i.e. exactly today's set |
| Batches saved before this change | their restored `templateDetails` has no `sizeOptions` and their variants no `sizeId`, so they skip the size filter entirely |
| An empty size selection | `pricedVariants` returns the colour-filtered set instead. An empty variant set would price nothing and enable nothing on the draft — the one failure here that costs money rather than looks wrong |
| A partial recipe save | `pricingJson` used to be rebuilt from scratch on every POST, so any caller that omitted a field wiped it. It now **merges** — an omitted key survives, an explicit `[]` still clears |
| The card promising something the gate ignores | the step gate and the forward button both check sizes, conditional on `sizeOptions` existing — otherwise it would be a D154-class lie |

**Verified against the live Printify product before building:** "Unisex Heavy Cotton Tee"
returns 195 selectable variants, 21 template-enabled, 174 not — and **every non-enabled
variant carries a cost** (`notEnabledMissingCost: 0`). So pricing beyond the template is
safe; this was the question that decided whether the feature was buildable at all.

**Seeding precedence** (identical to colours): saved product default → this browser's last
choice → what the Printify template had enabled → every available size. The last step means
the selection can never be empty.

**Also fixed in passing:** the colour card's "saved" pill was green (`#78a98a`/`#e8f5ec`/
`#276543`) — the last of the D156 leftovers in this flow.

**Guards:** `tests/product-sizes.test.mjs`, 11 tests covering axis detection and its
fallback, other-axis gating, the empty-selection guard, old-batch passthrough, seeding
precedence, persistence across reload/restore/bundle-hop, merge semantics (behavioural, not
just source-matched), and gate/UI agreement. Three older tests that pinned the previous
behaviour were updated rather than deleted, including D123's note test which now asserts the
note is gone.

## D165 — contrast sweep of the four management pages
D163 covered the workflow shell. Running the same compositing method over
`/batches`, `/keywords`, `/mockups` and `/usage` found six more, measured against their
painted beds:
| element | ratio | note |
|---|---|---|
| `.mini-label` `#744d69` | **3.84** | the eyebrow on **every** management page — "BATCH HISTORY", "YOUR LIBRARY", "MOCKUP SET", "PLANS + BILLING" |
| shared secondary-text token `.78` | 4.24 | one rule covering all four pages at 12px |
| `h3 small` "/month" | **3.28** | sits directly beside $29 / $59 / $99 |
| `.usage-plan-fineprint` | 4.19 | the text explaining what a credit is |
| `.usage-plan-heading>p:last-child` | 4.42 | plan section intro |
Four of those are on **Usage + Plan**, which is the billing screen — the worst place in the
app to have text a buyer cannot read.
**Fixed at source** where a shared token was responsible (`.mini-label` → `#653f5c`, 4.78:1;
the secondary token `.78` → `.86`) rather than layering more overrides, and in
`clarity-pass.css` for the three Usage-only cases.
**Measured after:** `/batches` 0 failing.

### D157 verified on live data
Regenerated all three titles in batch `103d12f0` against the deployed fix.
**Before:** 139/130/137 characters, six redundancies —
"Girls Gone Mild" ⊂ "Bachelorette Girls Gone Mild", "Off The Market" inside both
"Fresh Off The Market" and "Shes Off The Market", "Bikinis And Martinis" ⊂
"Bikinis And Martinis Bachelorette".
**After:** 128/114/111 characters, **zero** redundancies, all above the 90-character floor —
and the freed characters pulled in genuinely new phrases ("Bikinis And Martinis",
"Last Splash Bachelorette") rather than repeats. That is the whole point of the fix.

*Process note: two real pixel clicks on "Auto-create all titles" produced no request and no
state change, which looked like a dead button. A synthetic click on the same element flipped
it straight to "Creating 3 titles…" — so the handler was fine and my clicks were not
reaching the page. Checked before filing it as a defect.*

