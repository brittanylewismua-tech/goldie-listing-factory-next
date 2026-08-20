# Listing Factory — UX direction, translated into specific changes

Two parts. **Part A** is nine defects with exact instructions. **Part B** is the
strategy, converted from principles into per-screen changes.

Read Part B first if you only read one. Part A is maintenance; Part B is the
thing that changes how the tool feels.

---

# Part A — Nine defects

## A1. Pricing step has no forward button (blocking)
**Screen:** Pricing, when revisiting a batch that already has drafts.
**Observed:** the only visible buttons on the entire screen are three `?` icons,
`Edit`, and `← Back`. There is no "Continue to create drafts." Confirmed by
enumerating every visible `<button>` in the DOM.
**Why it happens:** the forward button is conditioned on the batch *not* being
complete, so it disappears once drafts exist — but the summary block below it
still reads "This step creates unpublished Printify drafts," promising an action
that no longer exists.
**Fix:** when the batch already has drafts, show a forward button that continues
to the Finish phases (e.g. "Back to finishing your listings") instead of hiding
the action entirely. Also swap the summary copy in that state so it stops
describing an action that already happened.

## A2. "Create whole-number pricing" sits above the section it controls
**Screen:** Pricing.
**Observed:** the checkbox is pinned top-right, *above* the "1. Item prices"
heading and *above* the "Profit goal" input.
**Why it's wrong:** whole-number pricing and profit goal are the only two
controls that change every number on the screen. They are currently separated by
a heading and three lines of body copy, and the checkbox reads as a page-level
setting rather than a pricing input.
**Fix:** group them. Put "Profit goal" and "Create whole-number pricing" in one
row directly above the variant price rows they modify. Nothing else between them
and the numbers.

## A3. The Finish sub-step connector runs backwards
**Screen:** step rail, whenever you are inside Finish.
**Observed:** the connector drops from the FINISH bubble and terminates on
sub-step **4**; the horizontal line then runs leftward through 3 and 2 to 1. The
sequence reads right-to-left.
**Fix:** land the drop connector on sub-step **1**, or remove the connector and
rely on indentation alone. Do not leave it terminating on the last item.

## A4. Sub-step status text is unreadable
**Screen:** step rail, Finish sub-steps.
**Observed:** "3 titles complete", "2 listings ready", "Complete the prior step"
render at very low contrast against the gradient and are effectively invisible.
**Fix:** raise contrast on `.rail-substep small` to at least 4.5:1 against the
rail background.

## A5. "✓ Approved" appears before anything is approved
**Screen:** Pricing, `.variant-pricing-head`.
**Observed:** the badge is present on arrival.
**Root cause:** `setPricingApproved(true)` does not exist anywhere in
`app/page.tsx`. The state is initialised `false`, set `false` in seven places,
and otherwise only restored from saved state — so no code path can legitimately
produce this badge.
**Fix:** find what is actually setting it (likely server-side saved state), then
either wire a real Approve action or remove the badge. Do not leave a UI element
asserting an approval the code cannot produce.

## A6. "Pricing review" still restates "Review pricing"
**Screen:** Pricing.
**Observed:** the `BATCH SUMMARY` eyebrow was removed, but the card `<h2>`
("Pricing review") still repeats the page `<h1>` ("Review pricing") directly
above it.
**Fix:** the `<h2>` is dynamic — it shows live progress while drafts run. Keep
that behaviour, but when the step is idle, show something that is not a restatement
of the h1, or omit it.

## A7. Three `?` help buttons in one screenful
**Screen:** Pricing (page title, section 1, section 2).
**Fix:** one help affordance per screen, at the page title. Section-level help
becomes inline hint text or moves into the single help panel.

## A8. Bottom summary repeats numbers reconciled 200px above it
**Screen:** Pricing.
**Observed:** "Profit target $10.00" and "Printify fulfillment shipping USD 7.99"
appear in the bottom summary table — the same two figures the new shipping
warning box already reconciled higher up the page.
**Fix:** remove those two rows from the summary, or replace both with the single
reconciled figure ("Net per item after shipping gap: $6.76").

## A9. The pricing summary describes steps that have not happened
**Screen:** Pricing, bottom summary.
**Observed:** rows reading "Keyword bank — Choose after drafts" and "Mockup set —
Choose after drafts".
**Fix:** remove them. A screen about money should not carry placeholder rows for
unrelated future steps.

---

# Part B — The strategy, made specific

## The finding that explains everything

Steps 1–4 feel effortless and steps 6–8 feel like work. That is not because the
later steps require more judgment. It is because **the early steps arrive
pre-filled and the later steps arrive empty.**

| Step | Arrives as | Feels like |
|---|---|---|
| Colours | template colours already selected | confirming |
| Pricing | prices already calculated from a profit goal | confirming |
| Shipping | profile already matched from the template | confirming |
| Description | already imported from Printify | confirming |
| **Titles** | **blank field, nothing generated until you find a button** | **producing** |
| **Etsy details** | **11 dropdowns, 8–9 on "Not applicable"** | **producing** |
| **Photos** | **148 unchecked boxes** | **producing** |

The rule the early steps follow, and the later steps break: **the system does the
work, then asks you to confirm it.** Everything below is that rule applied to the
three steps that break it.

---

## B1. Titles should already be written when you arrive

**Now:** you land on the titles step and every title field is empty. Nothing
happens until you scroll to the Batch Title Builder, choose a keyword bank, and
click "Auto-create all titles." The work is available but you have to go find it.

**Change:** generate on arrival. When the step loads and a keyword bank is known
(from `Recipe.keywordListId`), run the generation immediately and land the seller
on finished titles they can edit.

- Show generation in progress inline per row rather than behind a button.
- "Auto-create all titles" becomes "Regenerate all" — a redo, not the way in.
- If no bank is set on the recipe, *that* is the one question worth asking, and it
  should be the only thing on screen: "Which keyword bank should Goldie use?"
- Keep the per-listing "Create a different title with AI" as the escape hatch.

**Also move off this screen entirely:** "Title capitalization" and "Title style
(with/without commas)" are preferences, not batch decisions. They belong on the
saved product (`Recipe`), set once. They currently sit between the seller and
their titles on every single batch.

## B2. Etsy details should arrive filled, not blank

**Now:** 11 dropdowns per listing, 8–9 sitting on "Not applicable," and the copy
above claims Goldie "pre-filled every product field it could confidently match."
It filled 2–3.

**Change:** fields that are physical facts about the blank — Materials, Sleeve
length, Neckline, Size, Clothing style — come from the Printify blueprint, not
from a vision model looking at artwork. A Gildan Unisex Heavy **Cotton** Tee is
cotton, short sleeve, crew, every time, regardless of what is printed on it.

- Seed those from the blueprint on arrival.
- Store the result on `Recipe.etsyDefaults` (the field already exists on the type;
  it is not wired to anything yet) so the second batch of the same product needs
  no input at all.
- Only Occasion, Holiday and Graphic stay design-derived — those genuinely depend
  on the artwork.
- Then collapse the whole block to a summary line per listing:
  `Etsy details · 9 of 11 set · Cotton, Short sleeve, Crew — edit`
  That turns 33 open dropdowns into three lines of confirmation.

## B3. Photos should arrive with a set already chosen

**Now:** 148 unchecked boxes per listing, no filter, no count, no default.

**Change:** arrive with a recommended set already selected — front flat, folded,
on-model front, on-model side, two lifestyle, size chart — mapped across the
colours the listing actually uses.

- The seller's job becomes deselecting what they dislike, not building from zero.
- Save the chosen set to `Recipe.printifyImageIndices` (also already on the type)
  so the next batch of the same product arrives correct.
- Add filter chips: colour, and shot type (flat / folded / on-model / lifestyle).
- Show a live count against Etsy's limit of **20** photos per listing.
- Move "Apply these photos to every listing" **above** the grid. It currently sits
  2,087px below the top of the accordion, underneath all 148 thumbnails — you find
  it after doing the work it saves. The copy explaining it lives in an
  `<aside class="goldie-insight">` that renders at **0 × 0 pixels**, so nobody has
  ever read it.

---

## B4. One decision per screen

Count the decisions currently on the titles screen: capitalization toggle, title
style toggle, builder mode (Goldie picks / I pick), keyword bank, the generate
action, the shared description, then N listing rows. That is six things competing
before the seller reaches their actual work.

**Change:** two of those move to the saved product (B1). The builder-mode choice
only matters if the seller wants manual control — collapse it behind "I'd rather
pick the phrases myself." What remains on screen: **the titles, and one way to
regenerate them.**

Apply the same count to every screen. If a screen has more than one real decision
plus its content, something on it belongs somewhere else.

## B5. Fewer options at the moment of judgment

Three places currently show a full list where a short list would do:

- **Colours** — 39 swatches in a flat grid. Show the template's colours first
  under "In your template," the rest under "More colours." Add a search field.
- **Shipping profile** — a dropdown of 50+ profiles in raw account order. Show the
  matched profile as the answer with "Use a different profile" beneath it; only
  open the full list on request.
- **Photos** — covered in B3.

## B6. Make saving visible where the risk is felt

"Saved automatically" currently sits as small grey text at the bottom of the
page, far from the action buttons and easy to miss. The moment a seller worries
about losing work is the moment they change something or go back.

**Change:** put the save state next to the forward action, and make it specific —
"All changes saved" with a timestamp on hover. State it in the copy at the two
points where fear is highest: leaving a step, and going back.

## B7. Mark the transition into Finish

Moving from Pricing into the Finish phases is the moment the work changes
character — everything before it was setup, everything after is content. Right
now that transition is silent.

**Change:** when the batch enters Finish, say so:
> Drafts are created. Four quick steps left — titles are already written, photos
> are already picked. Review and publish.

That is only true once B1 and B3 are done. Do those first; this is the payoff
line, not a substitute for them.

---

## Order to build

1. **B2 and B3 pre-fill** — biggest change in felt effort, and both write to
   `Recipe` fields that already exist on the type.
2. **B1 generate-on-arrival** — same principle applied to titles.
3. **A1** — the missing forward button is blocking.
4. **A2, A3, A4** — placement and legibility, all small.
5. **B4, B5** — moving preferences off the batch screens.
6. **A5–A9, B6, B7** — cleanup and copy.
