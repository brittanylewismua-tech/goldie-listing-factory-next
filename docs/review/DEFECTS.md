# DEFECTS — running list

**This is the working list. Add to it, mark items fixed, do not delete them.**

Every item has: where it is, what is wrong, and what to do. Items are numbered so
they can be referenced in commits (`fixes D14`).

Status key: `OPEN` · `FIXED` · `WONTFIX`

Last verified against the live site and `main`: 20 Aug 2026.

---

## Blocking

### D53 · A resumed batch cannot reach its own drafts · OPEN · **WORST DEFECT FOUND**

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


### D1 · No forward button once a batch has drafts · OPEN
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

### D2 · Section order is wrong — designs must come first · OPEN
**Wrong:** Colours and Mockups sit above the designs drop zone. Both are decisions
*about* the designs. You cannot judge which shirt colours suit artwork that has
not been uploaded, and a mockup picker rendered before any design exists can only
show blank garments.
**Fix:** `Product → Designs → Colours → Mockups → Saved for this product`.
Remembered defaults still pre-fill; they simply appear below the designs as
something to confirm rather than choose cold.
**Unlocked by this:** mockup thumbnails can render the seller's actual design
instead of a stock blank.

### D3 · "✓ Ready for this batch" is unreadable · OPEN
**Where:** the selected product card. Class **`.recipe-use`**.
**Wrong:** text colour `rgb(101, 67, 98)` on a dark plum filled pill. Dark purple
on dark purple. The button was promoted to a filled style and kept its old dark
text colour.
**Fix:** white text on the filled pill, or revert to an unfilled state. Contrast
must be ≥ 4.5:1.
**Introduced by:** `feb73c2`.

### D4 · "+ Add another product" disappears once a product is selected · OPEN
**Corrected 20 Aug:** the button *is* present before selection — my first report
said it was gone entirely, which was wrong. It vanishes **after** you pick a
product, so you cannot add a second product without first clearing the batch.
**Fix:** keep it visible in both states.

### D5 · No way to unselect a product · OPEN
**Wrong:** nothing matching unselect / change product / choose a different. Once
selected, the only escape is Back or "Clear batch + start over".
**Fix:** a "Change product" link on the selected card.
**Introduced by:** `feb73c2`.

### D6 · "Rename / reconnect" — reconnect is meaningless · OPEN
**Wrong:** the Printify link is stored on the saved product. There is nothing to
reconnect, and the word implies something is broken.
**Fix:** label it **"Rename"**. If a re-link path is genuinely needed for a
replaced Printify product, put it inside that flow with an explanation, not in
the label.

### D7 · "Everything else" reads as a junk drawer · OPEN
**Fix:** **"Saved for this product"**, with the hint "usually no changes needed".
Contents are pricing, shipping, description, Etsy attributes and keyword bank —
not leftovers.

### D8 · Section headings are sentences, not labels · OPEN
| Now | Fix |
|---|---|
| Adjust what changed. Keep everything else. | **delete** — the `<h1>` already says "Build this batch" |
| Choose the colors you want to offer | **Colours** |
| Choose the look you want | **Mockups** |
| Choose a saved product | **Product** |

Keep "From your last batch — change any" — that line tells the seller something
they did not know.

### D9 · Mockup thumbnails show internal filenames · OPEN
**Wrong:** each thumbnail is captioned "ChatGPT Image Aug 14, 2026, 10_42_04 A…".
**Fix:** no caption, or a meaningful one. Never expose upload filenames.

### D10 · Mockup block shows 4 of 10 with no indication there are more · OPEN
**Fix:** "+6 more" or a count.

### D11 · "BACH TEES" appears twice · OPEN
Once as a label top-right of the block, once in the dropdown below it.

### D12 · The bundle row is sandwiched mid-flow · OPEN
**Wrong:** "Using this design on multiple products? · OPTIONAL" sits between the
product list and the confirmation of what was just selected. Reading order is
choose → unrelated optional feature → what you chose.
**Fix:** move below the selected-product confirmation. Bundles are the strategic
priority; this placement works against that.

---

## "Saved for this product" panel — expanded state

*These only appear after clicking Edit. Found by opening the panel, not by
reading the page at rest.*

### D13 · The shipping profile row is broken · OPEN
**Wrong:** "Shipping profile" wraps onto two lines inside a collapsed ~60px label
column, and its helper text renders as a vertical ribbon beside the dropdown —
"The am… cus… pays… separate from item profit." — one or two words per line.
Every other field in the panel is full-width and stacked; this row alone uses a
two-column layout whose left column has collapsed.
**Fix:** make it match the other fields — label above, control below, full width.

### D14 · Product description textarea clips its own content · OPEN
**Wrong:** text runs off the bottom mid-word ("…personalized appare"), with no
visible scrollbar and no resize affordance.
**Fix:** taller default, visible scroll, or auto-grow.

### D15 · "Listing photos" is a status shaped like a control · OPEN
**Wrong:** "Listing photos — Choose after previews are created" renders as a tile
identical to "Etsy details — 3 product facts remembered", which *is* actionable.
Same treatment, different behaviour.
**Fix:** status text must not look like a button.

### D16 · Etsy details described two different ways on one screen · OPEN
**Wrong:** "3 product facts remembered" inside the panel, "Etsy details 3 of 11
set" in the summary chip below it. The first hides the denominator.
**Fix:** one phrasing, always with the denominator.

---

## Connect (step 1)

### D17 · Etsy shows a white Disconnect bar, Printify does not · OPEN
Reported by Brittany. Needs verification and a matching treatment.

### D18 · The step contains no decisions for a returning seller · OPEN
Both accounts connected — the screen is two green confirmations and a Next
button, occupying a slot in "Step 1 of 5".
**Fix:** move connection status to the sidebar; interrupt the flow only when a
connection is broken. Common case becomes four steps.

### D19 · "Connecting usually takes about 2 minutes" shows while connected · **FIXED**
Now reads "Both connections are verified. Goldie will remember them for future batches."

### D20 · Two Disconnect buttons outrank the forward action · OPEN
Both are solid white above a soft-gradient "Next step".
**Fix:** Disconnect becomes a text link inside each row.

### D21 · `<h1>` says "Connect Printify" but the screen handles Etsy too · **FIXED**
Now reads "Connect your accounts".

---

## Pricing (step 4)

### D22 · Whole-number pricing checkbox is detached from the prices it changes · OPEN
Pinned top-right, above the "1. Item prices" heading and above "Profit goal".
**Fix:** group Profit goal and this checkbox in one row directly above the
variant price rows.

### D23 · "✓ Approved" appears before anything is approved · OPEN
**Root cause:** `setPricingApproved(true)` **does not exist anywhere in the
codebase.** The state is initialised `false`, set `false` in seven places, and
otherwise only restored from saved state — so no code path can legitimately
produce this badge.
**Fix:** find what is setting it, then either wire a real Approve action or remove
the badge.

### D24 · "Pricing review" restates "Review pricing" directly above it · OPEN

### D25 · Three `?` help buttons in one screenful · OPEN
**Fix:** one help affordance per screen, at the page title.

### D26 · Bottom summary repeats figures reconciled 200px above it · OPEN
"Profit target $10.00" and "Printify fulfillment shipping USD 7.99" appear again
below the warning box that already explains the gap between them.

### D27 · Pricing summary carries rows for steps that have not happened · OPEN
"Keyword bank — Choose after drafts", "Mockup set — Choose after drafts".

---

## Designs (step 3)

### D28 · Four status readouts for one fact · OPEN
`✓ 3 loaded` badge · "3 of 20 designs ready · 1.1 MB selected" · "All 3 designs
are ready 3/3" with a progress bar · "3/7 designs available this batch".
**Fix:** one line. The quota version is the useful one.

### D29 · Two different maximums stated 400px apart · OPEN
"20 designs maximum" in the limits row versus the plan quota below it.
**Fix:** state only the binding constraint.

### D30 · The upload card stops saying what it does · OPEN
Its title becomes "3 of 20 designs ready" after upload while the adjacent card
still reads "Choose individual images".

### D31 · Design thumbnails are ~40px circles · OPEN
Too small to tell twenty similar designs apart.
**Fix:** square, ~72px, artwork edge to edge.

### D32 · "Remove" has no confirmation once drafts exist · OPEN

---

## Photo validation

### D33 · The error no longer names the listings · OPEN
Now reads "2 listings need at least one photo". The old `, .` bug is gone but at
20 designs you cannot tell which two.
**Fix:** name them, resolving the label from `files` via `clientId`.

---

## Usage + Plan

### D34 · The trial end date is never shown · OPEN
Card says "Mastermind beta", "3-day trial", "Resets August 31, 2026". A 3-day
trial that resets monthly is incoherent, and the one date a trial user needs is
missing.

### D35 · Two different limits both rendered as "/20", side by side · OPEN
"Listing creations 13 / 20 this month" beside "Listings published in 24 hours
0 / 20". One is a monthly quota, the other a daily rate limit.

### D36 · "Plenty of room" at 65% used · OPEN
**Fix:** amber past ~75%, and state what remains in units the seller thinks in.

### D37 · The Etsy fee profile lives on the billing page · OPEN
It drives every profit figure on the Pricing step. Nobody debugging a wrong
profit number will look under Usage + Plan.
**Fix:** surface it from Pricing, and include it in "Saved for this product".

### D38 · Sidebar label inconsistent · OPEN
"Usage + Plan" on that page, "Usage" inside the Listing Factory.

---

## Keyword Banks

### D39 · The create form occupies the primary position · OPEN
Empty name field, empty textarea and file picker at the top; your saved banks
below. Creating is occasional; choosing is why you came.

### D40 · Banks never show which product uses them · OPEN
**Fix:** "Used by: Gildan Tee" on each bank.

### D41 · Bank contents are unvalidated · OPEN
A bank named "BACHELORETTE TEES" contained koozie, coozie, sash, sunglasses,
tapestry and hoodie phrases — 13 of 50 for other products. That is what produced
the koozie title.
**Fix:** on save, flag phrases naming a different product type. Same denylist
already in the title prompt, applied one step earlier where it can be fixed.

---

## Mockup Sets

### D42 · A set containing 10 mockups displays zero mockups · OPEN
"BACH TEES / 10 mockups" above ~200px of empty white. A visual library showing no
visuals.
**Fix:** thumbnail strip of the first 4–5 on the card face.

### D43 · Four heading levels for one page · OPEN
"YOUR SAVED MOCKUP LIBRARY" → "Manage your mockup sets." → "SAVED SETS" → "Your
mockup sets".

### D44 · Naming does not match the Listing Factory · OPEN
This page says "Mockup Sets"; the Photos step says "Add Your Own Mockups
(Optional)". A seller will not connect the two.

---

## Systemic

### D45 · The rare or destructive action is the loudest on six screens · OPEN
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

### D46 · Finish sub-steps unreachable from outside Finish · OPEN
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

### D47 · Printify and Etsy "Disconnect" render completely differently · OPEN
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

### D48 · "Pick a keyword bank to continue" is unreadable · OPEN
**Where:** batch screen, the disabled forward button.
**Wrong:** pale grey text on a pale lavender gradient. Verified by zoom — the
label is barely distinguishable from its own background.
**Note:** the *behaviour* here is right and worth keeping — a disabled button
that states its own unblock condition is good design. It just cannot be read.
**Fix:** disabled state needs a darker label or a more muted background.

### D49 · Five status readouts on the designs section, with conflicting numbers · OPEN
All on screen simultaneously:
- "7 designs available for this batch · 7 listings remain on your plan"
- "**3 of 20 designs ready** · 1.9 MB selected"
- "Upload updated / 3 designs were added"
- "All 3 designs are ready · 3/3" with a progress bar
- "**3/7 designs available this batch** · 4 more available · 7 left on your plan"

**Wrong:** two of these state different maximums — **20 and 7** — roughly 250px
apart. Worse than the four-readout version originally logged as D28.
**Fix:** one line, using the binding constraint.

### D50 · The "Everything else" chips float outside their own card · OPEN
The header row ("Everything else · Edit") is a card; the chips beneath it
($10 profit, Standard shipping, Description ready, Etsy details 3 of 11 set) sit
on the page background below it, visually orphaned.
**Fix:** chips belong inside the card they summarise.

### D51 · `?step=connect` silently redirects to `step=setup` · OPEN
Deep-linking to the connect step is impossible; the URL rewrites itself. Other
steps deep-link fine.

### D52 · The forward button sits above the section it depends on · OPEN
"Pick a keyword bank to continue" renders above the designs area, so the action
that advances the flow appears before the content it is waiting on.


### D54 · A blocked upload still created a batch record · OPEN
Uploading 9 designs against a 7-listing allowance reported `0 uploaded` in the
UI, but Batch History now shows a batch with **9 designs** at that timestamp.
The batch row is created and the design count persisted before the quota check
rejects the upload, leaving junk in history from an action that was refused.

### D55 · Every batch in history has the same name · OPEN
Four rows all read "Gildan Tee / Unisex Heavy Cotton Tee". Only the timestamp
and design count differ. Design filenames exist (`austin-bach.png`, …) and would
distinguish them.
**Fix:** name batches after their designs, and show a thumbnail — the page is a
visual product showing no visuals.

### D56 · "Remove from history" sits next to the primary button · OPEN
A permanent delete, styled as a small text link, immediately beside the large
filled "Resume batch". No confirmation.

### D57 · Two button labels for the same action, one of which lies · OPEN
Rows show either "Resume batch →" or "Open results →" depending on status. The
split is reasonable, but "Open results" lands on step 3 (see D53).


---

## Shipping — two different things share one name

### D58 · "Shipping profile" means two unrelated things and the labels don't say which · OPEN

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

### D59 · A status badge is 171px tall; the content it sits beside is 70px · OPEN
The DPI pill renders "243 DPI · review before printing" stacked over four lines,
plus "Medium resolution · 300 DPI recommended" beneath it. At **171px tall** it
sets the row height single-handedly — the row is 193px while its actual content
is 70px. **123px of every row is empty space created by a status badge.**

At 20 listings that is ~2,500px of nothing.

**Fix:** one-line inline badge — `243 DPI ⚠` — around 60px wide, sitting with the
other counts. Row height drops to roughly 80px. Twenty listings goes from
~3,900px of scroll to ~1,600px.

### D60 · The title field truncates the thing you are here to review · OPEN
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

### D61 · "Auto Caps on" is a toggle that neither reads as one nor is legible · OPEN
Pale lavender pill, pale text, no on/off affordance and no state change feedback.
Same class of problem as D3 and D48.
**Also:** per D8 this is a preference, not a batch decision — it belongs on the
saved product.

### D62 · "BATCH TITLE BUILDER" eyebrow above "Create titles for the whole batch" · OPEN
Another instance of D8 on a different screen. The eyebrow restates the heading.

### D63 · "Upload or manage keyword banks ↗" navigates out mid-batch · OPEN
An external-arrow link inside the bank picker, positioned where a seller lands
when they have no bank selected — which is exactly when they are most likely to
click it and lose their place.
**Fix:** open bank management in a panel or new tab, never in-place mid-flow.
