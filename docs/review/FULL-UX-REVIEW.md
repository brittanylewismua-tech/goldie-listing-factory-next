# Listing Factory — full walkthrough review

Ran the whole flow as a real user on 8/19/2026. Gildan Tee, 4 colors (Sand, Natural, Light Pink, Azalea), 3 test designs, BACHELORETTE TEES keyword bank. Went through all 9 steps and stopped at the final "Publish all live on Etsy" button without pressing it.

Batch ID `9a78b187-dce9-4513-81c6-14a515657d83`. It's sitting in Batch History and there are 3 unpublished drafts in Printify to delete. Usage went 7/20 → 10/20.

---

## Part 0 — What the source code says

Added after reading the repo. Three findings that change earlier conclusions.

### The alphabetical-fallback theory was wrong

I inferred from behavior that title selection was falling back to the top of the bank. It isn't. `autoTitleForDesign` in `app/page.tsx` posts the **design image plus the full keyword list** to `/api/listing-intelligence` with `mode:"title"`:

```ts
const response = await fetch("/api/listing-intelligence", {
  method: "POST",
  body: JSON.stringify({
    mode: "title",
    image: await safeImagePreviewDataUrl(design.file, 1200, false),
    product: { blueprintTitle, brand, model },
    keywords, useCommas
  })
});
```

So it's a vision model looking at the artwork with all 50 phrases available. The koozie title is a **model/prompt quality problem**, not a sort-order bug. My alphabetical story was a plausible read of the output that turned out to be coincidence — "bachelorette koozies" and "bachelorette coozies" being #4 and #1 alphabetically was luck.

That makes it harder to fix than I said, and it means the denylist idea matters *more*, not less — you can't guarantee prompt behavior, but you can guarantee that a garment listing never ships a phrase containing "koozie."

I couldn't read `app/api/listing-intelligence/route.ts` — everything under `app/api/` is still an un-downloaded iCloud placeholder. That file holds the actual prompt and is where the fix goes. Worth opening it in Finder once so it syncs down.

### Tags and short titles are the same bug, not two bugs

`buildBatchTitle` sets tags like this:

```ts
tags: tagsFromTitle(item.result.keywords.join(", "))
```

And `tagsFromTitle` in `app/seo-utils.ts` splits on commas, filters to 1–20 chars, dedupes, and caps at 13. It **generates nothing** — it only reshapes what the model returned.

So tags can never exceed the number of phrases the model hands back. It returned 2 phrases → 25-character title *and* 2 tags. One root cause, one fix: get the model to return enough phrases. Fixing "tags" separately would be wasted work.

### `missingPublishFields()` confirms why step 9 says "complete"

```ts
if (files.some(file => !file.title.trim())) missing.push("Titles");
if (files.some(file => !file.tags.length))  missing.push("Tags");
```

Pure emptiness checks, exactly as the UI suggested. One tag passes. One character passes. This is the line to change if you want `2 of 13 used` instead of `Tags are complete` — and it's genuinely a one-liner.

### You already built the recipe. It just has one field missing.

This is the important one. `app/factory-tools.tsx` line 5:

```ts
export type Recipe = {
  id; name; templateUrl; description; defaultTitle;
  keywordListId?;           // default keyword bank
  printifyImageIndices?;    // saved photo selection
  normalizePadding?;
  etsyShippingProfileId?;   // shipping profile
  defaultColorIds?;         // default colors
};
```

Saved to `/api/product-recipes`. So the "product recipe" I spent two rounds proposing **already exists** — it's your saved product, and it already remembers the keyword bank, the colors, the shipping profile, and the Printify photo selection. You were right to push back; I was describing your own feature back to you.

What the type does *not* have is any field for the Etsy attributes. There's no `etsyDefaults`. That's why materials/sleeve/neckline/occasion get re-inferred by AI on every listing of every batch instead of being remembered like colors and photos already are.

So the step-7 fix is not a new screen and not a new step for the user. It's **one more optional field on a type you already ship**, remembered the same way `defaultColorIds` is remembered. The user experience is that the dropdowns are simply already correct next time, with no new UI at all.

That fully answers your objection — there's no extra step to confuse anyone, because there's no extra step.

---

## Corrections after Brittany's review

Three things in my first draft were wrong or overstated. Correcting them here rather than quietly editing, because the corrections change the priority order.

**1. The 10-photo limit doesn't exist.** Etsy raised the cap from 10 to 20 in August 2025. My 12-photo selection was fine and the app was right to allow it. This was my #1 "critical bug" and it isn't one. The only thing left here is whether the app hard-stops at 20 — worth a check, but it's a minor guardrail, not a live-listing risk.

**2. "Apply these photos to every listing" does exist.** Brittany was right, I missed it. It's a real button, and it also offers "Preselect these photos whenever you use this saved product again." My claim that you must repeat 148 checkboxes per listing was wrong. See the revised finding below — there's still something real here, but it's about placement, not absence.

**3. Underfilled titles and tags are the seller's call, not a bug.** Brittany's point stands: nobody has to use 140 characters or all 13 tags, and the tool shouldn't force it. I've rewritten that finding to be about the *word* "complete" rather than about enforcement.

---

## Part 1 — Bugs, worst first

### 1. The "Apply these photos to every listing" button is 2,087px below where you need it

The feature works. The problem is purely where it sits.

Measured on step 8: the button is inside the collapsed "Choose Printify flatlays" accordion, **2,087 pixels below the accordion's top edge**, underneath all 148 thumbnails. So the discovery sequence is: expand accordion → scroll through 148 checkboxes → tick your selections → keep scrolling → *then* find out you didn't have to do that per listing.

By the time you see the button that saves you the work, you've already done the work. On my run I never saw it at all, which is why my first draft said it didn't exist.

Compounding it: the one piece of copy that explains the concept — "The Printify preview is the placement reference. Apply one flatlay selection to the batch when the listings use the same product setup" — lives in an `<aside class="goldie-insight">` that measures **0 × 0 pixels**. It's in the DOM and renders at zero size, so nobody has ever read it.

Fix: move the button above the grid, and phrase it as the default path rather than an afterthought — something like "Pick photos once, use for all 3 listings" sitting right under the accordion summary. Then fix or delete the invisible aside.

This one stays at #1 not because it's severe but because it's cheap: it's a DOM reorder that removes most of the perceived complexity of the step, and it's the difference between the feature existing and the feature being used.

### 2. Auto-created titles are drastically underfilled, and one was for the wrong product

I picked the BACHELORETTE TEES bank (50 validated phrases) and hit "Auto-create all titles." All three results:

| Design | Generated title | Length | Tags |
|---|---|---|---|
| Palm Springs | Palm Springs Bachelorette | 25/140 | 2/13 |
| Nashville | Nashville Bachelorette Shirts | 29/140 | 2/13 |
| Scottsdale | **Bachelorette Koozies, Bachelorette Coozies** | 42/140 | 2/13 |

I pulled the actual BACHELORETTE TEES bank to check whether the AI had better options available. It did, and the selection logic looks broken in a specific, diagnosable way.

**The bank is stored alphabetically, and the AI picked the alphabetically-first matches.** Here are the first four phrases in the bank, in order:

1. bachelorette coozies
2. bachelorette girls gone mild
3. bachelorette koozie
4. bachelorette koozies

The generated title was "**Bachelorette Koozies, Bachelorette Coozies**" — entries #4 and #1. That is very unlikely to be a relevance ranking. It looks like it's taking the top of the list.

Supporting evidence: the bank contains "**palm springs bachelorette**" and "**nashville bachelorette shirts**" — and those are exactly the two titles it produced for the Palm Springs and Nashville designs. Those are single-phrase exact matches on the design text. So the logic appears to be: find an exact phrase match against the design; if none, fall back to the top of the list. For the Scottsdale design there was no "scottsdale" phrase in the bank, so it fell through to koozies.

So: you were right that it depends on the bank, and right that this is partly bank hygiene. But you were being generous to the AI. It had "last rodeo bachelorette," "coastal cowgirl bachelorette," "final fiesta bachelorette," "girls gone mild," "she said yes," "off the market" — all tee-appropriate and all better fits for a desert bride design than koozies. It didn't consider them.

**Bank hygiene, separately.** The bank is named BACHELORETTE TEES but 13 of its 50 phrases are for other products: koozies, coozies, sashes, sunglasses, a tapestry, tattoos, decor, decorations, a hoodie, two sweatshirts. That's a raw eRank export that was never filtered to tees. Cleaning that would have prevented this specific failure — but it wouldn't fix the underlying "falls back to alphabetical" behavior, which will keep producing odd titles on any design that doesn't exact-match.

Two fixes, in order:
- **Rank by relevance, don't fall back to position.** If nothing matches the design, that's a signal to flag the listing for review, not to grab the first thing in the list.
- **Filter against the Printify product type.** A tee listing should never be able to pull a phrase containing koozie / mug / sticker / tumbler / tapestry / sash. This is a cheap denylist and it makes bad banks safe.

### 3. "Titles are complete" and "Tags are complete" are the wrong words

Revised from my first draft — you're right that nobody should be forced to use 140 characters or 13 tags. That's the seller's call.

But that's not quite what the screen is doing. Step 9 makes a factual claim: "✓ **Tags are complete**" on a listing with 2 tags, and "✓ **Titles are complete**" on a 25-character title. "Complete" means *finished, nothing left to do*. What it actually means here is *not empty*.

The distinction matters because you told me yourself: "if they genuinely missed some tags, that's important to know." Right now there's no way to know. The word "complete" actively tells you the opposite.

Fix is informational, not enforcement — just report the number:

- `✓ Titles set — 25/140, 29/140, 42/140 characters`
- `✓ Tags set — 2 of 13 used on all 3 listings`

Same green checkmark, nothing blocked, seller still decides. But now a seller who *meant* to fill 13 tags can see at a glance that something went wrong upstream, which in this batch it did.

### 4. The "which listings need photos" error message is broken

I hit Next with 2 of 3 listings missing photos. The modal said:

> Add at least one photo to each of these listings: , .

The names aren't rendering — just the commas and the period. With 3 listings you can find them by scrolling. With 20 you cannot. It's blocking you and refusing to say why.

### 5. The tab crashed going from step 8 → step 9

I got a full "This page couldn't load" browser crash on that transition, with all three flatlay grids expanded. Almost certainly memory — 444 full-size mockup images live in the DOM at once.

Two follow-on findings, one bad and one good:

- **Bad:** after reloading, the Listing Factory dropped me at Step 1 of 9 with a fresh empty wizard. It says "Saved automatically" on every screen, but the main entry point gives you no indication that you have a batch in progress. If I hadn't gone looking in Batch History I'd have assumed I lost everything — and I'd already been charged the 3 listings.
- **Good:** the data was all intact. Batch History restored me to step 8 with all 12 + 3 + 3 photo selections preserved. The persistence layer is solid; only the discoverability is broken.

Fix: lazy-load / virtualize the mockup grid (it's also just slow), and put a "You have a batch in progress — resume?" banner on the Listing Factory landing screen.

### 6. Changing steps doesn't scroll you back to the top

Every single step transition preserves your scroll position. Going into step 3, into step 4, into step 7 — I landed mid-page every time, and once (going into step 7) I landed in a completely blank pink void below the content, because the new step was shorter than my old scroll offset. For about two seconds I was sure the app had broken.

Same issue on step 2: after you click "Choose this product," the color picker appears *below the fold* with no auto-scroll and no motion. It looks like nothing happened.

One-line fix, big perceived-quality win: `window.scrollTo(0,0)` on every step and phase change.

### 7. Your "$10 profit" doesn't account for the shipping shortfall

Step 4 shows, on the same screen:

- Etsy shipping profile: **US buyer pays $4.75** first item
- Printify fulfillment shipping: **USD 7.99 cost**

So you're eating $3.24 per US order. But "Lowest estimated profit" says $10.00 and the copy says "Shipping is handled separately." Actual margin is closer to $6.76.

To be clear, the item-price math itself is correct — I checked it. At $22.37 with a $9.79 product cost: 6.5% transaction + 3% + $0.25 processing + $0.20 listing = $2.575 in fees, leaving exactly $10.00. Whole-number pricing also works correctly (rounds up, $22.37 → $23.00, profit rises to $10.58). The engine is right; it's just solving for the wrong number.

Fix: show net profit after the shipping delta, or at minimum flag "your shipping profile collects $4.75 but fulfillment costs $7.99" as a warning right there. It doesn't currently include Etsy's regulatory operating fee or offsite ads either, which is fine to omit but worth a footnote.

### 8. Smaller stuff

- **Designs are not visible on the upload step.** Step 3 reports "3 of 20 designs ready" with no thumbnails, no filenames, and no way to remove one. They *are* shown later on the titles step — but that is after Printify drafts are created and quota is spent, so a wrong file only becomes visible once it has already cost a listing. The DPI modal compounds it by saying "Go back and review" when the screen it returns you to has nothing to look at.
- **Four separate widgets on step 3 tell you the same fact.** "3 of 20 designs ready," "Upload updated — 3 designs were added," "All 3 designs are ready 3/3," "3/20 designs — 17 spaces remaining." Pick one.
- **"17 spaces remaining" vs. 13 listings left on your plan.** The batch cap (20) and the quota (13 remaining) are different numbers and the app only shows you the one that lets you overcommit. The "Create 3 product drafts?" confirmation doesn't mention quota at all.
- **Step 1 is titled "Connect Printify"** but it handles Etsy too.
- **Usage flashes wrong data on load** — showed "0 / 100 listings" for a beat before correcting to "7 / 20."
- **Step 6's three chips don't match its body.** Chips say 1. Create titles + tags / 2. Review each listing / 3. Confirm description. Body says 1. Create titles and tags / 2. Edit description, with the per-listing review unnumbered in between.
- **Etsy attribute pre-fill is inconsistent** across identical listings — listing 1 had Occasion blank, listing 3 had "Bachelorette party."
- **Batch History labels an abandoned batch "COMPLETE."** Mine stopped at step 8, never published. Also every batch is named identically ("Unisex Heavy Cotton Tee / Gildan Tee · 3 designs") — only the timestamp distinguishes them. And the button says "Open results" when the page headline says "Continue where you left off."
- **Sidebar says "Usage" in the wizard, "Usage + Plan" in Batch History.**
- **Blocked below 820px**, which locks out iPad portrait (768px). A lot of Etsy sellers work on an iPad.
- **"Remember these colors for future batches" and "Auto Caps on"** don't read as toggles and give no feedback when clicked.
- **The Back button stays enabled** while drafts are being created in Printify.

---

## Part 2 — The complexity problem

**Your pushback on the Product Recipe was right and I'm dropping most of it.**

Your argument: designs change, colors change, mockups change, titles and descriptions change. So a "recipe" that has to be edited in five places every time isn't a recipe — it's a form with defaults, and calling it a recipe just adds a concept without removing work. That's correct, and it's the part of my proposal that was doing the most hand-waving.

So here's the narrower version, which I think survives your objection.

Sort the decisions by whether they're a function of **the product** or **the batch**:

| Decision | Varies by | Currently asked |
|---|---|---|
| Etsy category | product only — a Gildan tee is always a t-shirt | per listing |
| Materials, Sleeve length, Neckline, Clothing style, Size, Sustainability | product only — physical facts about the blank | per listing |
| Personalization on/off | product, basically | per listing |
| Shipping profile | product | once ✓ |
| Pricing rule / profit goal | product | once ✓ |
| Size guide | product | once ✓ |
| Colors | **batch** — you were right | once per batch ✓ |
| Mockups | **batch** — you were right | per listing, with an apply-to-all |
| Designs | batch | once ✓ |
| Title, tags | **listing** | per listing ✓ |
| Description | listing-ish | batch default + per-listing override ✓ |

Most of this is already correct. Colors, pricing, shipping, size guide, designs, description — all already batch-or-once. You built that right.

**Step 7 — the recipe idea is dead here too.** Brittany's objection: these fields are auto-filled by AI, so nobody is actually typing 220 dropdowns. Moving them to a product-level config screen adds a step for something users never touch. That's correct and I'm dropping the proposal.

But I went and measured what the auto-fill actually produces, and the premise doesn't survive. Here is every field, across all three listings:

| Field | Listing 1 | Listing 2 | Listing 3 |
|---|---|---|---|
| Materials | Not applicable | Not applicable | Not applicable |
| Primary color | Not applicable | Not applicable | Not applicable |
| Secondary color | Not applicable | Not applicable | Not applicable |
| Size | Not applicable | Not applicable | Not applicable |
| Sustainability | Not applicable | Not applicable | Not applicable |
| Sleeve length | Short sleeve | Short sleeve | Short sleeve |
| Neckline | Crew | Crew | Crew |
| Clothing style | Not applicable | Not applicable | Not applicable |
| Occasion | **Not applicable** | Bachelorette party | Bachelorette party |
| Holiday | Not applicable | Not applicable | Not applicable |
| Graphic | Not applicable | Not applicable | Not applicable |

Two real problems:

**Materials is blank on a cotton tee.** The product is literally named "Unisex Heavy **Cotton** Tee." I confirmed `Cotton` is an available option in that dropdown. The AI left it on "Not applicable" for all three. Materials is a filterable facet on Etsy — buyers narrow by it — so this is a free field being thrown away on every listing.

**Occasion is non-deterministic.** Same product, same batch, same bachelorette theme, and it filled Occasion on listings 2 and 3 but not listing 1. Nothing distinguishes them. Whatever call it's making, it isn't stable across a single batch.

So the fill rate is 2–3 of 11, not "auto-filled anyway." The fix isn't relocation, it's:

- Seed the fields Printify already knows from the blank (Materials = Cotton, Sleeve = Short, Neckline = Crew) rather than asking the AI to infer them.
- Make Occasion deterministic across a batch — if it's confident enough for two listings it should be confident for the third.

**And the UI point survives independently of the recipe idea.** If these fields really are meant to be auto-filled and rarely touched, they shouldn't be rendered as 11 open dropdowns per listing — 33 on screen for a 3-design batch, 220 for a 20-design batch. Collapse each listing to a summary line:

> **Etsy details** · 3 of 11 set · Cotton, Short sleeve, Crew — *edit*

Expands on demand. Nothing added, nothing taken away, one screen instead of a scroll — and the "3 of 11" makes the Materials gap visible instead of hiding it in a wall of "Not applicable."

### One thing worth keeping from the original: the review table

Step 6 stacks three full-page listing cards vertically. At 20 designs that's a very long scroll where you can't compare anything, and where a bad title 14 screens down is invisible.

A table does the same job in one screen:

| | Design | Title | Chars | Tags | Photos | Print |
|---|---|---|---|---|---|---|
| ▣ | palm-springs.png | Palm Springs Bachelorette | 25 | 2 | 12 | 243 DPI ⚠ |
| ▣ | nashville.png | Nashville Bachelorette Shirts | 29 | 2 | 3 | 243 DPI ⚠ |
| ▣ | scottsdale.png | Bachelorette Koozies, Bachelorette Coozies | 42 | 2 | 3 | 243 DPI ⚠ |

Editable inline. Not to force anyone to fill 140 characters — just so that if the generator produces something odd (like the koozie title), you see it in the first screenful instead of scrolling to find it. This is exactly the view that would have caught the koozie title in two seconds.

---

## Part 2.5 — Clarity (the actual UX layer)

Not "remove features." This is about *where am I, did I already do that, what do I do next.* Everything below is measured, not vibes.

### 1. The step numbers are fiction, and that's the root of "what step am I on"

From `app/page.tsx`:

```ts
type WorkflowStep = "connect" | "setup" | "designs" | "review" | "finish";
type FinishPhase  = "details" | "etsy" | "mockups" | "final";
```

**The app is a 5-step machine wearing a 9-step costume.** Mapping the stepper onto the real state:

| Stepper says | Actually |
|---|---|
| 1 Connect | `connect` |
| 2 Product | `setup` |
| 3 Designs | `designs` |
| 4 Pricing | `review` |
| **5 Drafts** | **doesn't exist** — an action at the end of `review` |
| 6 Titles + Tags | `finish` · details |
| 7 Etsy Details | `finish` · etsy |
| 8 Photos | `finish` · mockups |
| 9 Publish | `finish` · final |

Two things fall out. Step 5 is an invented node — that's why it auto-checked itself and I never saw a step-5 screen. And steps 6–9 are one step wearing four numbers, which is why the Back button behaves oddly there and why "am I done with titles?" is genuinely ambiguous: internally you never left `finish`.

**Solution — and to be clear, this does not merge any screens.** Titles, Etsy details, photos and publish stay four separate screens. What changes is the *map*, not the content.

Today the rail is nine equal peers:

```
CONNECT — PRODUCT — DESIGNS — PRICING — DRAFTS — TITLES+TAGS — ETSY DETAILS — PHOTOS — PUBLISH
  01        02        03        04       05         06             07           08       09
```

Instead, five peers, with the fourth expanding in place when you're inside it:

```
CONNECT ─── PRODUCT ─── DESIGNS ─── PRICING ─── FINISH
  ✓           ✓           ✓           ✓          ●
                                                 ├─ ● Titles + tags      ← you are here
                                                 ├─ ○ Etsy details
                                                 ├─ ○ Photos
                                                 └─ ○ Publish
```

Header reads **"Finish · Titles + tags (1 of 4)"** instead of "Step 6 of 9."

Three concrete changes to get there:

1. **Delete the "Drafts" node.** It isn't a step, it's the outcome of Pricing. Move it to a completion line under Pricing: "✓ 3 Printify drafts created."
2. **Nest the four `finish` phases** as sub-items that only expand when `workflowStep === "finish"`. The rail stays short the rest of the time.
3. **Renumber to 5.** The number now matches what the state machine actually does, so "am I done with titles?" has an answer: you're on 1 of 4 inside Finish.

The win is that a user who's been at this for ten minutes can see they have four small things left inside one phase, rather than four unrelated-looking steps out of nine.

### 1b. The senior-UX read: you built a wizard for a job that's half wizard, half worksheet

Worth naming the structural thing, because it explains why this keeps feeling awkward no matter how the steps get renumbered.

A wizard is the right pattern when each screen holds **one decision** and the user goes through once. Wizards work by disclosing only what's relevant to the current stage, and they prevent decision paralysis by keeping each screen to a single decision point. Steps 1–4 are a textbook wizard: connect, pick product, add designs, set pricing. One decision each. That part is well built.

Steps 6–8 are not a wizard. They're a **worksheet**: the same three fields repeated N times, where the user's real job is scanning for the one row that's wrong. The tools in this category that scale — Vela, and Etsy bulk editors generally — converge on a spreadsheet/table view for exactly this reason: [Vela presents listings as rows and offers CSV import/export so sellers can work across hundreds of listings at once](https://getvela.com/help/videos/bulk-edit).

So the answer to "should 6–9 be one screen or four?" is: **neither, exactly.** Keep them as separate screens — you're right that cramming them together would be worse. But change what's *on* them from stacked cards to rows. A row per listing, scannable, with the per-listing detail expanding in place. Four screens, each of which is a focused table rather than a scroll of repeated cards.

The rule of thumb: **wizard for decisions you make once, table for data you make N times.** Right now both halves use the wizard chrome, and the second half is the part that hurts.

### 2. Your H2 is bigger than your H1 and says the same thing

Measured on step 7:

- `H1` — "Etsy listing details" — **34px**
- `H2` — "Review your Etsy listing details" — **36px**

The page title is *smaller* than the card title that restates it. This repeats on every step, and it stacks deeper elsewhere. Step 4 has five layers of the same idea before you reach a control:

> Review pricing → BATCH SUMMARY → Pricing review → Review item prices and shipping → 1. Item prices · Gildan Tee

Step 8 has three, including a redundant eyebrow:

> Images + mockups → STEP 8 · IMAGES + MOCKUPS → Review placement and choose listing images.

When four things all look like the headline, none of them is. Your eye can't find the one thing to do, so the screen reads as an undifferentiated block — which is exactly the word you used.

**Solution — concretely, for step 4.** Delete three of the five layers:

| Layer | Now | Do |
|---|---|---|
| Page H1 | Review pricing | **keep** |
| Eyebrow | BATCH SUMMARY | delete |
| Card H2 | Pricing review | delete — restates the H1 |
| Section | Review item prices and shipping | delete — restates it again |
| Section | 1. Item prices · Gildan Tee | **keep** |
| Section | 2. Shipping · Gildan Tee | **keep** |

Result: `Review pricing` → `1. Item prices` → `2. Shipping`. Two levels, and the first control is roughly 300px higher up the page.

Same rule everywhere else: **one H1 per screen, sections beneath it, no eyebrow that repeats the H1.** Step 8's "STEP 8 · IMAGES + MOCKUPS" eyebrow sitting under an H1 that already says "Images + mockups" is the same deletion.

And fix the type scale so the H1 is actually the largest text on the page — right now the H2 is 36px against the H1's 34px.

### 3. The weight hierarchy is inverted — this is the real density problem

I said opacity was the cause of the "it's a lot" feeling. Brittany pushed back, correctly. It isn't a figure/ground problem — the cards do read as separate from the background. I measured the wrong thing.

Here's the actual cause, measured on step 6:

| Element | Font size | Weight | Width |
|---|---|---|---|
| **Title input** — the one thing you must fill | **10px** | 850 | 304px |
| **Tags input** | **10px** | 850 | 304px |
| "Create a different title with AI" *(optional)* | **16px** | 400 | 666px |
| "Build this title yourself…" *(optional)* | **16px** | 400 | 666px |
| "2. Edit description" *(optional)* | **16px** | 400 | 666px |

**The primary control is 10px. The optional escape hatches are 16px and more than twice as wide.** Importance and visual prominence run in exactly opposite directions.

That's why the cluster reads as an undifferentiated block: there is no dominant element. Your eye lands on three big grey bars of equal weight, and the actual work — the title field — is the smallest thing in the group. Add `font-weight: 850` on 10px text and every label is shouting at a whisper's size, which reads as noise rather than emphasis.

**Solution — invert it:**

| | Now | Change to |
|---|---|---|
| Title input | 10px / 850 / 304px | **16px / 500 / full column width** |
| Tags input | 10px / 850 / 304px | **14px / 500 / full column width** |
| The three accordions | 16px / 400 / 666px each, stacked | **one 13px text link: "More options"** — expands to reveal all three |

Same features, nothing removed. The card goes from six competing full-width elements to two obvious fields and one quiet link. That's the change that makes a 20-listing batch scannable.

**On opacity:** dropping my blanket recommendation. Brittany's version is better — keep the translucent treatment on Connect and the landing screens where it's setting a tone, and let the working surfaces firm up once you're actually doing data entry. That's a tone-shift that supports the task rather than a global flattening of the aesthetic.

### 4. Back is as loud as Next

Measured on step 7:

- **Back** — `linear-gradient(145deg, #5B304F, #45263C)`, white text, 150px — a solid dark maroon slab
- **Next step** — `linear-gradient(115deg, #9F6FD0, #D67F…)`, white text, 210px

Both are saturated filled gradients. The recessive action is one of the heaviest objects on the page, and on several screens it's the *first* thing your eye lands on at the bottom.

**Fix:** Back becomes a quiet text link. Only one filled button per screen.

### 5. The primary action moves and changes costume on every step

- Step 2: **no Next button at all** — you advance by clicking a text link *inside* a card ("Choose this product →")
- Steps 3, 6, 8: pale lavender pill, centered, mid-page
- Step 4: dark full-width bar ("Continue to create drafts")
- Step 9: dark full-width bar ("Publish all live on Etsy")

Three different treatments and three different positions for "the thing that moves me forward." Every screen you have to re-find it.

**Fix:** one sticky action bar at the bottom of the workspace. Same position, same style, label changes. This also solves the below-the-fold problem — the action is always visible, so you never wonder whether you've finished a step.

### 6. Completion is asserted in too many places, and they disagree

This is the "did I already do that?" one. What I hit:

- Step 4 showed a **"✓ Approved"** badge on Pricing before I had touched anything
- The stepper tooltip said **"Pricing ✓ Review pricing · 0 variants approved"** while the drafts modal said **"✓ All 20 enabled variants reviewed and approved"** — flatly contradicting each other about the same batch at the same moment
- Step 3 had **four** separate widgets reporting the same fact ("3 of 20 designs ready", "Upload updated — 3 designs were added", "All 3 designs are ready 3/3", "3/20 designs — 17 spaces remaining")
- Batch History labeled a batch I abandoned at step 8 as **"COMPLETE"**

When the app tells you you're done in four places and one of them is wrong, you stop trusting all four. That's worse than not saying anything.

**Fix:** one status per thing, derived from one source. A step is complete or it isn't. Say it once, in the stepper.

### 7. Two small ones that punch above their weight

- **Scroll never resets between steps.** Covered earlier, but it belongs here: landing mid-page (or in blank space) is a direct hit to "where am I."
- **Revealed content doesn't announce itself.** On step 2 the entire color picker appears below the fold with no scroll and no motion. Nothing tells you the page changed.

### What I'd do first, purely for clarity

Ordered by impact per hour of work. None of it removes a single choice from the flow.

| # | Change | Why it's first | Effort |
|---|---|---|---|
| 1 | **Invert the weight hierarchy** — title input 10px→16px, three accordions → one "More options" link | The primary control is currently the smallest thing on screen. This is the density fix. | small |
| 2 | **Five steps, not nine.** Delete the fake Drafts node, nest the four `finish` phases | "What step am I on" stops being a fair question | small |
| 3 | **One H1 per screen.** Delete the duplicate H2s and eyebrows; fix the type scale so H1 > H2 | Removes ~300px of throat-clearing above the first control on several steps | small |
| 4 | **Sticky bottom action bar.** Same position every screen, Back demoted to a text link | The forward action stops moving and stops being outshouted | medium |
| 5 | **`scrollTo(0,0)` on step change** | One line | trivial |
| 6 | **One status per thing**, from one source | Kills the "✓ Approved before I did anything" and the 0-vs-20 variants contradiction | medium |
| 7 | **Rows instead of stacked cards** on the finish phases | The structural fix; do it after 1–6 land | large |

Items 1–5 are a day of work and they address most of what you're feeling. Item 7 is the one that makes a 20-design batch pleasant rather than merely survivable.

### Aside: "recipe" vs. Printify template

You said you never understood the difference. That's because **"recipe" is never shown to you** — I searched every user-visible string in `page.tsx` and the word appears zero times in the UI. It's internal-only vocabulary.

The distinction, from the type:

```ts
export type Recipe = { id; name; templateUrl; …; keywordListId?;
  printifyImageIndices?; etsyShippingProfileId?; defaultColorIds? };
```

- **Printify template** = Printify's object. The blueprint, variants, print placement. `templateUrl` is a *field inside* the recipe.
- **Recipe** = that template **plus your Goldie defaults** — which keyword bank, which colors, which Printify photos, which shipping profile.

So a recipe is a template with your preferences wrapped around it. In the UI you experience it as "saved product: Gildan Tee." Nothing is wrong with the concept; it just got two names, one of which you never see, which is why it's felt like an unexplained extra thing this whole time.

---

## Part 3 — If you only fix five things

Reordered after your pushback.

1. **The prompt in `app/api/listing-intelligence/route.ts`.** It's returning 2 phrases when it should return enough to fill a title, and it picked koozie phrases for a tee. This one file causes the short titles, the 2-of-13 tags, and the wrong-product title — all three. Add a product-type denylist around it so a garment listing can never ship "koozie" regardless of what the model does.
2. **Move "Apply these photos to every listing" above the 148-thumbnail grid**, and fix the 0×0 aside that explains it. Cheapest big win in the app — pure DOM reorder.
3. **Add an `etsyDefaults` field to the existing `Recipe` type.** No new screen, no new step. Materials stops being blank on a cotton tee and Occasion stops flickering between listings, because it's remembered instead of re-inferred.
4. **`scrollTo(0,0)` on every step change.** One line, removes most of the "did this break?" feeling.
5. **Fix the empty listing names in the "needs a photo" error**, and add a "resume your batch in progress" banner on the landing page.

Dropped: the 10-photo cap (doesn't exist — Etsy allows 20), forcing full titles/tags (seller's call), and the whole "build a product recipe" proposal (you already built it).

---

## What's genuinely good, for the record

Worth saying, because it's a lot: the DPI comparison modal is excellent — real numbers, per file, clear choice. The pricing math is correct and the "all Etsy fees included" framing is the right one. Step 9's two-stage publish confirmation, and disclosing Etsy's $0.20 listing fee up front, is more honest than most tools in this category. The persistence layer held everything through a browser crash without losing a single checkbox. And the design language is genuinely lovely. The problems here are structural, not aesthetic.
