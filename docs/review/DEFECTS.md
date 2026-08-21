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

### D76 · Titles do not describe the design · OPEN
The three designs read SCOTTSDALE / SAVANNAH / TULUM. None of the generated
titles mention any of them, because the bank contains no Scottsdale, Savannah or
Tulum phrase — it has Palm Springs, Nashville, Vegas and New Orleans.

Behaviour is technically correct: the model may only use bank phrases. But the
result is three listings whose titles have nothing to do with the artwork.

**Fix:** when no bank phrase matches the design's own text, say so per row —
*"No phrase in this bank matches this design. Add one, or write the title
yourself."* This is the honest version of the fallback D53-era code used to hide.

### D77 · Fill quality varies wildly across one batch · OPEN
Same batch, same bank, same product:
| Listing | Title | Tags |
|---|---|---|
| 1 | 132/140 | 8/13 |
| 2 | **45/140** | **3/13** |
| 3 | 126/140 | 8/13 |

Listing 2 got roughly a third of the fill for no visible reason. The 8–13 phrase
instruction is not being applied consistently.


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

### D23 · "✓ Approved" appears before anything is approved · **FIXED**
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

### D60 · The title field truncates the thing you are here to review · **FIXED**
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
