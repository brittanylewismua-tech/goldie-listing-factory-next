# Screen-by-screen audit

Every screen walked on the live site, 20 Aug 2026, against the deployed build
that already includes the clarity pass and ChatGPT's fixes.

Format per finding: **what's on screen** → **why it's wrong** → **fix**.

Findings are numbered `S<step>.<n>` so they can be referenced individually.

---

## Systemic — affects every step, fix once

### S0.1 No forward button anywhere once a batch has drafts
Confirmed on Pricing **and** Designs by enumerating every visible `<button>`:
the only controls are help icons, `Edit`, and `← Back`. There is no way forward
except the step rail.

This is not a Pricing bug. **Every step loses its forward action once
`complete === true`.** A seller revisiting a finished batch to change one price
hits a dead end on every screen.

**Fix:** the forward button's label should change with state, not disappear.
When the batch already has drafts, it reads "Back to finishing your listings"
and returns to the Finish phase they were last on. Never render a step with no
forward path.

### S0.2 The Finish sub-steps can't be reached from outside Finish
The four sub-steps (Titles, Etsy details, Photos, Publish) only render when
`workflowStep === "finish"`. From Designs or Pricing you cannot jump to Photos —
you must click Finish first, then the sub-step.

**Fix:** either always render the sub-steps under the Finish node once the batch
is complete, or make clicking Finish return to the last phase you were on rather
than the first.

### S0.3 The step rail's sub-connector runs backwards
The drop line from FINISH terminates on sub-step **4**, and the horizontal line
then runs leftward through 3 and 2 to 1. The sequence reads right-to-left.
**Fix:** land the connector on sub-step 1, or remove it and rely on indentation.

### S0.4 Sub-step status text is illegible
"3 titles complete", "2 listings ready", "Complete the prior step" render at very
low contrast on the gradient. **Fix:** raise `.rail-substep small` to ≥ 4.5:1.

---

## Step 2 — Choose product

### S2.1 The weakest action is the primary one
"**+ Add another product**" is a solid dark filled button. Choosing the product
you already saved is a small text link, "Choose this product →", inside the card.

The common path (use my saved product) is the quietest element on screen; the
rare path (create a new one) is the loudest. This is the same inversion as the
pricing checkbox.

**Fix:** make the product card itself the click target with a filled "Use this
product" action. Demote "Add another product" to a secondary button or a link.

### S2.2 A destructive control sits at the same weight as an edit control
The card footer has `Edit` and `×` side by side, same size, same weight. `×` has
no label and no visible confirmation.
**Fix:** label it ("Delete"), separate it visually, and confirm before deleting a
saved product — deleting one presumably breaks any batch history referencing it.

### S2.3 An optional advanced feature sits in the middle of the primary flow
"Using this design on multiple products? — Create or choose a product bundle
(OPTIONAL)" is placed between the product list and the confirmation of what you
just selected.
**Fix:** move it below the selected-product confirmation, or behind a link.

### S2.4 The confirmation of your choice appears after the optional feature
Selecting a product reveals "Unisex Heavy Cotton Tee · PRODUCT SELECTED" — but it
renders *below* the bundle row. The reading order becomes: choose → unrelated
optional thing → oh, here's what you chose.
**Fix:** the confirmation belongs immediately under the thing you clicked.

### S2.5 Two different "Choose…" headings on one screen
Page `<h1>` is "Choose product". The colours section heading is "Choose the colors
you want to offer". Same verb, same visual weight, two unrelated tasks.
**Fix:** the colours block is really its own decision. Either give it a distinct
heading ("Which colours will you offer?") or split it onto its own step.

### S2.6 39 colour swatches, flat, no grouping, no search
No way to find a colour except scanning. **Fix:** group by family (neutrals,
brights, darks), and put the template's own colours first under "In your
template" — the copy already claims Goldie starts from the template but nothing
on screen marks which those are.

### S2.7 The selected-count is far from the select-all controls
"4 of 39 selected" sits top-right of the colours block; "Select all available"
and "Clear all" sit at the very bottom, past 10 rows of swatches.
**Fix:** put the count next to the controls that change it.

### S2.8 "Remember these colors for future batches" doesn't read as a control
It is styled as a button but gives no feedback and no indication of current
state. **Fix:** make it a labelled toggle showing on/off state.

---

## Step 3 — Add your designs

Note: thumbnails, filenames, Remove links, and the quota bar have **already been
added** since the original review. Those findings are resolved.

### S3.1 Four separate status readouts for one fact
On screen simultaneously:
- `✓ 3 loaded` badge, top right
- "3 of 20 designs ready · 1.1 MB selected" in the upload card
- "All 3 designs are ready · 3/3" with a progress bar
- "3/7 designs available this batch · 4 more available · 7 left on your plan"

**Fix:** one line. The quota version is the most useful; the other three are
noise.

### S3.2 Two different maximums stated 400px apart
The limits row says "**20 designs maximum**". The quota bar below says
"**3/7 designs available this batch**". Both are true — one is the batch cap, one
is the plan remainder — but presented as if they contradict.
**Fix:** state only the binding constraint. "You can add 4 more designs to this
batch (7 left on your plan this month)."

### S3.3 The upload card stops saying what it does
Before upload the left card reads "Choose a folder". After upload its title
becomes "3 of 20 designs ready" — so the card no longer describes its own action,
while the right card still reads "Choose individual images".
**Fix:** keep the action as the title; put status underneath.

### S3.4 Design thumbnails are too small to tell designs apart
They render as ~40px circles. With 20 similar bachelorette designs you cannot
identify one at a glance.
**Fix:** square thumbnails at ~72px, showing the artwork edge to edge.

### S3.5 "Remove" has no confirmation
A text link, no dialog. After drafts exist, removing a design has consequences.
**Fix:** confirm when the batch already has drafts; plain remove before that.

---

## Step 4 — Pricing

See `UX-DIRECTION.md` Part A, findings A1–A9. Summary: whole-number pricing
checkbox is detached from the numbers it changes; "✓ Approved" appears before
anything is approved; the `<h2>` restates the `<h1>`; three `?` buttons in one
screenful; the bottom summary repeats figures reconciled 200px above it and
carries placeholder rows for steps that haven't happened.

**Now fixed since the original review:** the shipping shortfall warning is live
("Your Etsy profile charges $3.24 less than Printify's current estimate"), and
"Shipping not included" is stated on the profit figure.

---

## Mockup Sets page

### S5.1 A set containing 10 mockups shows zero mockups
The card reads "BACH TEES / 10 mockups" above roughly 200px of empty white. The
only way to see what is in a set is a small unlabelled chevron in the corner.
**Fix:** show a thumbnail strip of the first 4–5 mockups on the card face. This
is a visual library; it currently shows no visuals.

### S5.2 Four heading levels for one page
"YOUR SAVED MOCKUP LIBRARY" → "Manage your mockup sets." → "SAVED SETS" → "Your
mockup sets". Two eyebrows and two headings, all saying the same thing.
**Fix:** one `<h1>`, one section label if genuinely needed.

### S5.3 Same inversion as step 2
"+ Add mockup set" is the loudest element; using an existing set has no action at
all on this page.

### S5.4 The naming doesn't match the Listing Factory
This page calls them "Mockup Sets". The Photos step calls the same thing "Add
Your Own Mockups (Optional)". A seller will not connect the two.
**Fix:** one name everywhere. "Mockup sets" on both, and on the Photos step show
the seller's actual saved sets by name rather than a generic accordion.

### S5.5 Sidebar navigation is inconsistent between pages
In the Listing Factory the sidebar has icons and a Usage card, and the item reads
"Usage". Here there are no icons, no Usage card, and the item reads "Usage +
Plan".
**Fix:** one sidebar component everywhere.

---

## What is already fixed — do not re-report

- Design thumbnails, filenames and Remove on the upload step
- Plan quota shown on the upload step
- Shipping shortfall warning on Pricing
- Developer jargon in UI copy ("transparent padding detected", "Calculating
  Printify DPI", etc.)
- Step rail reduced from 9 nodes to 5 with the Finish phases nested
- Scroll resets on step change
- Photo validation error names the listings
