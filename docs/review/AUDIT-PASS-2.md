# Audit pass 2 — against the build deployed 20 Aug 2026

Walked live after ChatGPT's "Simplify batches around saved products" work.
Supersedes the step 1–2 findings in `SCREEN-AUDIT.md`.

---

## Landed and working — do not rebuild

The `PRODUCT-MODEL.md` layout is live and it reads well:

- Page `<h1>` is now **"Build this batch"** — one clean heading for the screen
- **"Adjust what changed. Keep everything else."** with "Goldie started with the
  choices from your last batch"
- Colours shown as named chips (Sand, Natural, Light Pink, Azalea) with
  "From your last batch — change any"
- **"Everything else"** collapsed to a single summary row with an Edit link
- Product card copy: "Choose it once. Goldie remembers the product details,
  pricing, shipping, keywords, and Etsy settings for every future batch"
- "Rename / reconnect" instead of the vaguer "Edit"

---

## Step 1 — Connect

### C1. For a returning seller this step contains no decisions
Both accounts are connected. The entire screen is two green confirmations and a
Next button. It occupies a slot in "Step 1 of 5" to tell the seller that nothing
changed since last time.
**Fix:** move connection status to the sidebar. Only interrupt the flow when a
connection is actually broken. That takes the flow to four steps for the common
case without removing anything.

### C2. Connecting copy shows in the connected state
"Connecting usually takes about 2 minutes" is displayed underneath two
already-connected accounts.
**Fix:** swap the copy on state.

### C3. Two Disconnect buttons outrank the forward action
Both render as solid white buttons above "Next step", which is a soft gradient.
The two destructive controls are the most prominent things on the screen.
**Fix:** Disconnect becomes a text link inside each row.

### C4. The heading still only names Printify
`<h1>` is "Connect Printify"; the card handles Printify **and** Etsy.
**Fix:** "Connect your accounts".

---

## Step 2 — Build this batch

### P1. Mockups break the promise the same screen makes *(highest priority here)*
The headline says "Goldie started with the choices from your last batch." The
mockups block says **"Not chosen"** and the control defaults to **"Choose later."**

Colours remembered; mockups didn't. On the one screen whose entire premise is
"we remembered," half of it didn't. That is worse than not making the claim.
**Fix:** default the mockup set to the last one used for this product — the same
way colours already do. `Recipe.printifyImageIndices` exists for this. If it must
stay optional, the headline needs to stop promising otherwise.

### P2. The "Everything else" summary hides an unfinished task among settled ones
The row reads:
`$10 profit · Standard shipping · Choose a keyword bank · description from Printify · Etsy details 3 saved`

Four of those are values. **"Choose a keyword bank" is a to-do**, formatted
identically to the settled items and buried in the middle of them. It is also the
one that causes title generation to fail two steps later.
**Fix:** unfinished items must not look like finished ones. Pull anything
outstanding out of the summary and show it as an action: *"Pick a keyword bank so
Goldie can write your titles."*

### P3. "Etsy details 3 saved" has no denominator
3 of 11 fields are set. "3 saved" reads as complete.
**Fix:** "3 of 11 set" — same change recommended for the collapsed summary in
`UX-DIRECTION.md` C2.

### P4. No forward action anywhere on the screen
Enumerated every visible button: there is no Next, Continue, or Create. Only
"Back". Presumably uploading designs advances the flow, but the screen never says
so, and this is now the **third** screen found with no forward path (see S0.1).
**Fix:** an explicit disabled-until-ready forward button that states its own
condition — "Add designs to continue".

### P5. Every section eyebrow restates the heading directly beneath it
`COLORS FOR THIS BATCH` → "Choose the colors you want to offer"
`MOCKUPS FOR THIS BATCH` → "Choose the look you want"
`NEW BATCH · Gildan Tee` → "Adjust what changed. Keep everything else."
**Fix:** the page now has one good `<h1>`. Drop the eyebrows; the headings are
doing the work.

### P6. Three `<h2>`s of equal weight on one screen
"Choose a saved product", "Adjust what changed. Keep everything else.", "Drop
your designs here" — all the same size, so nothing indicates which is the current
task.
**Fix:** once a product is selected, collapse its card to a single line. The
active task should be the only thing at full weight.

### P7. "+ Add another product" is still the loudest element
Unchanged from pass 1. The dark filled button is the rare action; "Choose this
product →" — the common one — is a small text link.

### P8. Unlabelled `×` beside "Rename / reconnect"
Unchanged from pass 1. A destructive control with no label and no confirmation,
at the same weight as a safe one.

### P9. The bundle row is still sandwiched mid-flow
It sits between the product list and the "PRODUCT SELECTED" confirmation, so the
reading order is: choose → unrelated optional feature → what you chose.
Given bundles are the strategic priority, this placement now actively works
against the roadmap.

### P10. "20 designs maximum" appears with no quota context
The quota bar only shows after uploading. Before you drop anything, the only
number on screen is the batch cap — which is not the binding constraint.
**Fix:** state the real limit before the upload, not after.

---

## Status of earlier findings

| Finding | Status |
|---|---|
| S0.1 no forward button on completed batches | **still open**, and now also present on the new batch screen |
| Design thumbnails / filenames / Remove | fixed |
| Quota on the upload step | fixed (but only after upload — see P10) |
| Shipping shortfall warning | fixed |
| Developer jargon in UI copy | fixed |
| 5-step rail | fixed |
| Scroll reset | fixed |
| Whole-number checkbox placement (A2) | still open |
| "✓ Approved" before approval (A5) | still open |
| Three `?` buttons on Pricing (A7) | still open |

---

## Note on test verification

I attempted to statically check the test suite for stale assertions twice and
produced false positives both times — the test file binds the same variable names
to different source files, so a naive map mis-attributes them. Those reports were
wrong and should be ignored. The suite can only be verified by running it.
