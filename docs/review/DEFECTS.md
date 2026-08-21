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

### D73 · Resumed batches cannot move through Finish · **FIXED**
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

### D79 follow-up · The carried-designs path kept the old tag behaviour · **FIXED HERE**

`428074d` separated tags from the title correctly in the API and wired two of
the three client paths. The third — designs carried into a new batch — still
called `tagsFromTitle(result.keywords.join(", "))`, so those listings silently
kept the collapsed 4–7 tag behaviour while the other two got 13.

Three call sites, one changed rule, one missed. Same shape as D90.

**Fixed:** all three paths use the ranked `tags` the API returns. Guarded by a
test that fails on any `tagsFromTitle(result.…)` call.

### D80 follow-up · `scrollIntoView` is swallowed by an `overflow-x:clip` ancestor · **FIXED HERE**

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

### D77 follow-up · The fix failed 2 of 3 real listings · **FIXED HERE** · **BLOCKER**

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

### D77 — resolved, measured

| | title chars | tags |
|---|---|---|
| original defect | 132 / **45** / 126 | 8 / **3** / 8 |
| after `842c8ba`+`3906b1c` | **1 built, 2 hard-failed** | — |
| after `16f0f8d` | **139 / 130 / 137** | **13 / 13 / 13** |

> "✓ 3 unique titles and separately ranked Etsy tags created."

Zero row errors. Zero tags over 20 characters, zero fragments (D75 holding).
Zero wrong-product phrases in any title or tag (D74/D78/D90 holding).

### D76 — resolved, confirmed by screenshot

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

### D23 / A5 — "✓ Approved" before approval — **fixed, confirmed**

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

<<<<<<< Updated upstream
### D109 · Signed-in account without access has no way to switch accounts · **FIXED HERE** · **HIGH**

Refreshing the Listing Factory with a valid session for an account that does
not own a plan rendered the pricing page and only said “Signed in securely.”
The sign-in link disappeared, no account identity was shown, and there was no
way to leave that account. The screen now names the signed-in email and offers
“Use a different account,” which signs out both app and platform sessions and
returns directly to the Listing Factory sign-in screen.

### D110 · Owner testing account was treated as an expired 20-listing beta · **FIXED HERE** · **BLOCKER**

The Chrome account used for live testing, `shesawolfclothing@gmail.com`, was
missing from the owner allowlist. Refresh therefore sent it to plan selection,
and its saved beta plan still imposed the 20-listing ceiling. The account is now
recognized as an owner everywhere, and owner testing uses a separate 10,000
listing allowance without deleting draft records or changing customer plans.
=======
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
>>>>>>> Stashed changes

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
