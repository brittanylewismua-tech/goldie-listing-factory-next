# The saved product — one concept, not two

Answers the open question: template vs recipe, and what the batch screen looks
like once the settings move onto the product.

---

## Rule one: the seller never sees two concepts

There is no "template" and no "recipe" in the interface. There is **a saved
product.** The Printify template URL is a field inside it — pasted once when the
product is created, never named again.

`Recipe` stays as the internal type name in the code. It never appears in the UI.

Two names for one thing is the confusion you predicted, and it is avoidable by
just not shipping the second name.

---

## Rule two: everything is saved, two things expect to be adjusted

This is the correction. The settings are not split into "saved" and "asked every
time." They are **all saved.** Two of them are simply expected to change from
batch to batch, so they surface differently.

| Setting | Changes per batch? | Where it lives |
|---|---|---|
| Printify template link | never | product, hidden after setup |
| Profit goal / pricing rule | rarely | product |
| Shipping profile | rarely | product |
| Description | rarely | product |
| Keyword bank | rarely | product |
| Etsy attributes | never — facts about the blank | product |
| **Colours** | **often** | product default, adjusted per batch |
| **Mockups** | **often** | product default, adjusted per batch |
| Designs | always | the batch itself |

Colours and mockups are not unsaved. The product remembers what you chose last
time, because your next batch of bachelorette tees is more likely to reuse Sand
and Light Pink than to start from 39 blank swatches. You adjust from a remembered
starting point rather than choosing from nothing.

---

## The batch screen

Product card selection stays exactly as it is — that part works. What changes is
what happens after you pick one.

```
┌────────────────────────────────────────────────────────┐
│  Gildan Tee                                            │
│  Unisex Heavy Cotton Tee · SwiftPOD                    │
└────────────────────────────────────────────────────────┘

   Colours for this batch                    4 selected   ▾
   ┌──────────────────────────────────────────────────┐
   │  ● Sand   ● Natural   ● Light Pink   ● Azalea    │
   │  From your last batch. Change any.               │
   │  + Add colours                                    │
   └──────────────────────────────────────────────────┘

   Mockups for this batch                    8 selected   ▾
   ┌──────────────────────────────────────────────────┐
   │  [thumb][thumb][thumb][thumb][thumb][thumb] +2    │
   │  From your last batch. Change any.               │
   │  + Choose mockups                                 │
   └──────────────────────────────────────────────────┘

   ────────────────────────────────────────────────────

   Everything else                                       ▸
   $10 profit · Standard shipping · BACHELORETTE TEES
   · description from Printify · Etsy details 9 of 11

   ────────────────────────────────────────────────────

   Drop your designs here
   ┌──────────────────────────────────────────────────┐
   │              ⬆  20 designs max                   │
   └──────────────────────────────────────────────────┘
```

**Colours and mockups are expanded by default** because they are the two you came
to change. They show what is currently selected, with the reassurance that it
came from last time.

**Everything else is one collapsed row**, and its summary line shows every value
in plain text. You can see your whole configuration without expanding anything.
Click it and it opens into the seven settings, each collapsible in turn.

This is the "one page, collapsible sections" you described — with the ordering
fixed so the two things you actually touch are not buried among six you don't.

---

## Editing: batch-only versus permanent

This is the question that would otherwise force two concepts back into existence.

**Every edit is batch-only by default.** Change the profit goal to $12 and it
applies to this batch.

**When a value differs from the product's saved default, a link appears next to
it:** `Save $12 as the default for Gildan Tee`.

One place to edit. One click to make it stick. No separate "edit product" screen
to get lost in, and no ambiguity about which of two objects you just changed.

For colours and mockups the same link appears, but it should fire automatically
after publish: whatever you shipped with becomes the new default. That is what
makes "from your last batch" true without asking.

---

## What this removes from the flow

| Today | After |
|---|---|
| Step 1 Connect | gone — status moves to the sidebar, shown only when broken |
| Step 2 Choose product | the batch screen |
| Colours section | expanded block on the batch screen |
| Step 4 Pricing | inside "Everything else" |
| Shipping section | inside "Everything else" |
| Keyword bank question on Titles | inside "Everything else" |
| Etsy details step | inside "Everything else", pre-filled from the blank |
| Photos step | expanded block on the batch screen |
| Step 3 Designs | the drop zone at the bottom of the batch screen |

Nine screens become one screen with three visible blocks and one collapsed
summary. The Finish phases become the review table
(`ROWS-SPEC.md`), and publish becomes per-listing (`STRUCTURAL.md` S2).

**Flow for a returning seller:** open the app → drop designs on Gildan Tee →
adjust colours if needed → review the table → publish the ready ones.

---

## First run is different, and should be

A brand-new product has no defaults, so the seven settings under "Everything
else" are genuinely questions. That is the only moment they deserve real screens.

Set up a new product as its own guided flow — paste the Printify link, confirm
what Goldie imported, set a profit goal, pick a keyword bank, choose mockups. Then
it never asks again.

Selling that honestly matters: *"Set up a product once. After that, every batch is
drop, review, publish."* That is a stronger promise than any number of steps.

---

## Two things to decide before building

**1. What happens when the Printify template changes upstream?**
If the seller edits the product in Printify — adds a colour, changes the print
area — the saved defaults may reference variants that no longer exist. Needs a
re-sync path that reports what changed rather than silently dropping colours.
Codex's `fac2f80` already handles part of this for inactive templates; extend it.

**2. Should mockup defaults be per-colour?**
Mockups are colour-specific in Printify. If the default set was chosen while
offering Sand and Natural, and this batch offers Black, the saved indices may not
map. The default should be stored as **mockup types**, not raw indices, so it can
be re-resolved against whatever colours the batch uses.
This is the same problem as `UX-DIRECTION.md` C4 and should be solved once.
