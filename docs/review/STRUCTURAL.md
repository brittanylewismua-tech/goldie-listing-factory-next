# Structural — the shape of the tool, not the contents of its screens

Everything in `SCREEN-AUDIT.md`, `UX-DIRECTION.md` and `BACKLOG.md` improves the
existing shape. This document questions the shape.

---

## The thing nobody has said out loud

**The Listing Factory is designed for your first batch. Every batch after that
re-asks questions you have already answered.**

Walk it as a returning seller with a saved product:

| Step | What it asks | Did you already answer this? |
|---|---|---|
| Connect | is Printify connected | yes, permanently |
| Choose product | which saved product | yes, if you have one |
| Colours | which colours | yes — `Recipe.defaultColorIds` |
| Designs | **which designs** | **no — this is genuinely new** |
| Pricing | profit goal | yes — same every time |
| Shipping | which profile | yes — `Recipe.etsyShippingProfileId` |
| Description | the shared description | yes — imported from Printify |
| Titles | which keyword bank | yes — `Recipe.keywordListId` |
| Etsy details | 11 attribute fields | yes — they are facts about the blank |
| Photos | which mockups | yes — `Recipe.printifyImageIndices` |
| Publish | approve | **no — this is genuinely new** |

**Two of eleven are real questions.** The other nine are settings wearing the
costume of steps, and they are asked again on every single batch.

This is why steps 1–4 feel like magic and 6–8 feel like work — but it is also why
the *whole thing* feels long even when every individual screen is well made. The
seller is walking through a configuration wizard they already completed, to get to
the two things they actually came to do.

---

## The shape this implies

```
Today:   Connect → Product → Colours → Designs → Pricing → Shipping
         → Drafts → Titles → Etsy details → Photos → Publish

Actual:  Drop designs onto a saved product  →  Review one table  →  Publish
```

Three screens. Not by cramming eleven steps onto one page — by **moving the nine
settings out of the batch flow entirely** and into the saved product, where they
already half live. `Recipe` already has fields for the keyword bank, the colours,
the shipping profile and the photo selection. They are simply not being used as
defaults that skip the step.

**First run for a new product:** you configure it once. That is a real setup task
and deserves real screens — this is the only time those questions are questions.

**Every run after:** designs in, table out, publish. The nine steps do not appear
because there is nothing to ask.

This is the difference between a wizard and a tool. A wizard walks you through
the same path every time. A tool remembers.

---

## S1. Make the batch two inputs

A batch is **a saved product plus a set of designs.** Everything else is a
default that can be overridden.

- Landing screen: your saved products as cards, each a drop target.
  Drag 20 PNGs onto "Gildan Tee" and the batch is fully specified.
- With one saved product, that is a single drop. No product step at all.
- Every default is visible as editable text on the batch, not as a step:
  `4 colours · $10 profit · Standard shipping · BACHELORETTE TEES bank · 8 photos`
  Click any of it to change it for this batch only.

Overriding becomes an exception you reach for, not a corridor you walk through.

**What this replaces:** steps 1, 2, 4, plus the keyword-bank and photo-set
questions inside the Finish phases. Six screens become one line of editable text.

---

## S2. Publish per listing, not per batch

Today publishing is all-or-nothing at the end of the batch. If 17 of 20 listings
are good and 3 have problems, the seller either publishes all 20 including the
bad ones, or publishes none and keeps working.

Neither is what they want. They want the 17 live now and the 3 to stay open.

**Change:** publish is a row action and a bulk action on selected rows, not a
single button at the end of a corridor.
- "Publish the 17 that are ready" as the primary action
- The 3 stay in the batch, still editable, publishable later
- Batch History shows partial states honestly — `17 live · 3 open` — instead of
  the current binary that already mislabels abandoned batches "COMPLETE"

This also removes the pressure that makes the final screen feel heavy. Right now
that button is a one-shot commitment to twenty listings. Made per-row, it is
twenty small reversible decisions.

---

## S3. The review table is the product

Everything else is plumbing. The table described in `ROWS-SPEC.md` should not be
a phase inside a wizard — it should be the screen the seller lands on and lives
in.

- Open the Listing Factory: you see your listings in progress, as a table.
- Drop designs: rows appear and fill themselves in.
- Rows with problems surface at the top.
- Publish rows when they are ready.

The four Finish phases become **column groups in one table**, not four screens.
Titles, Etsy details, photos and readiness are all attributes of a listing —
there is no reason to visit them in four separate visits when they belong to the
same row.

That is not "cramming four screens into one." It is recognising that they were
never four screens; they were four columns.

---

## S4. The tool should learn from what gets corrected

Every edit the seller makes to a generated title is a labelled training signal
that is currently thrown away.

If she deletes the word "shirt" from six generated titles in a row, the tool
should stop adding it. If she always removes the folded-flatlay mockup, stop
pre-selecting it. If she always raises the price above the suggestion, adjust the
suggestion.

**Change:** record the diff between what Goldie generated and what the seller
shipped. Feed the last N corrections into the generation prompt as
"this seller's preferences." Store on `Recipe`.

This is the only item here that would make Goldie meaningfully better than a
competitor copying its feature list. Features can be copied; a tool that has
watched a specific seller work for six months cannot.

---

## S5. Kill the concept of "drafts" as a user-facing step

"Create drafts" is an implementation detail — it is when Goldie calls Printify.
The seller does not care that Printify has a draft object. They care that their
listing exists and is not live yet.

It is currently a rail node (already removed), a confirmation modal, a progress
bar, and a summary line in three places. All of that is exposed plumbing.

**Change:** the listing exists from the moment the design is dropped. It has
states the seller understands — **being built** → **ready to review** → **live**.
Printify draft creation happens inside "being built" and is never named.

---

## What this does to the numbers

| | Today | After |
|---|---|---|
| Screens for a returning seller | 9 | 2 |
| Real questions asked per batch | 11 | 2 |
| Decisions before designs are uploaded | 5 | 0 |
| Publishing granularity | whole batch | per listing |
| Settings re-answered per batch | 9 | 0 |

---

## Honest sequencing

This is a rebuild of the flow, not a sprint of fixes. It should not be attempted
in one pass, and it should not block the defect work — S0.1 in the screen audit
is a dead end that needs fixing this week regardless of any of this.

A sane order:

1. **Fix the defects** (`SCREEN-AUDIT.md`, `UX-DIRECTION.md` Part A). Days.
2. **Make the settings actually default** (`UX-DIRECTION.md` B1–B3 + Part C).
   This is S1 in disguise — once every step arrives pre-filled from `Recipe`,
   skipping the step entirely is a small step further.
3. **Build the table** (`ROWS-SPEC.md`). This is S3's foundation.
4. **Then** collapse the flow to drop → table → publish, and add per-listing
   publishing. By this point most of the work is already done.
5. **S4, learning from corrections**, last — it needs the corrections to be
   captured first, which the table makes possible.

Step 2 is the pivot. Everything before it is maintenance; everything after it is
a different product.
