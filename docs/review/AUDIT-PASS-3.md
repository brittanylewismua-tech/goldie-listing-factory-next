# Audit pass 3 — Usage + Plan, Keyword Banks, and a correction

---

## Correction: my bundle quota warning was based on the wrong number

I told Brittany that one bundle batch would consume three months of her plan, and
advised that plan limits had to move before bundles could ship. **That was wrong.**
I was reasoning from her beta account's 20-listing cap, not the real plans.

Actual tiers, from the live billing page:

| Plan | Listing creations | AI mockups | Mockup sets |
|---|---|---|---|
| Free Trial | 10 (3 days) | 6 | 2 |
| Starter · $29/mo | 100/month | 50 | 10 |
| Pro · $59/mo | 300/month | 150 | 30 |
| Scale · $99/mo | 750/month | 300 | 75 |

20 designs × 3 products = 60 listings. That fits comfortably inside Starter and
is routine on Pro. **Bundles do not require a pricing change.**

The one place it does bite: **the free trial is 10 listing creations.** A single
3-product bundle with 4 designs is 12 and blows the trial. So a trial user cannot
try the feature most likely to sell the product. Worth deciding deliberately —
either exclude bundles from trial with a clear message, or size the trial so one
small bundle fits.

Also confirmed on that page, which answers a question I raised earlier:
**"Failed listing attempts and failed AI renders never use your allowance."**
That decision is already made and shipped.

---

## Usage + Plan page

### U1. The plan card contradicts itself and hides the date that matters
It reads "Mastermind beta", "3-day trial", and "Resets August 31, 2026". A 3-day
trial that resets monthly is incoherent, and **the one date a trial user needs —
when the trial ends — is not shown.**
**Fix:** show the trial end date and time remaining. Monthly reset is irrelevant
to someone on a 3-day trial.

### U2. Two different limits both displayed as "/20", side by side
"Listing creations 13 / 20 this month" sits next to "Listings published in 24
hours 0 / 20". One is a monthly quota, the other a daily rate limit. Identical
formatting, adjacent cards, same denominator by coincidence.
**Fix:** label the rate limit as a rate — "0 published today · limit 20/day" —
and visually separate it from allowance.

### U3. "Plenty of room" at 65% used
Every card shows "Plenty of room", including listing creations at 13/20. With
bundles arriving, a seller at 65% who drops a 3-product batch will hit the wall
immediately after being told they had plenty of room.
**Fix:** thresholds. Amber past ~75%, and state what remains in units the seller
thinks in — "enough for 7 more listings, or 2 designs across a 3-product bundle".

### U4. The Etsy fee profile is on the billing page
"Combined percentage fee / Fixed payment fee / Listing renewal fee" — labelled
"SAVED ONCE · USED IN EVERY LISTING SETUP" — lives under Usage + Plan.

It is a pricing input, not a usage stat, and it directly drives every profit
figure on the Pricing step. A seller looking for "why is my profit calculation
wrong" will not look under billing.
**Fix:** move it next to pricing, or surface it from the Pricing step with a link.
It also belongs in the "Everything else" summary on the batch screen, since it is
exactly the kind of set-once value that block is for.

### U5. Sidebar label still inconsistent
"Usage + Plan" here, "Usage" inside the Listing Factory. Unchanged from pass 1.

---

## Keyword Banks page

### K1. The create form occupies the primary position; your existing banks are below it
The page opens with "Create a keyword bank" — an empty name field, an empty
textarea, a file picker — and your saved banks sit underneath.

Creating a bank is something you do occasionally. Choosing or editing one is what
you actually come here for. Same inversion as "+ Add another product" and
"+ Add mockup set": **on all three library pages, the rare action is the loud one.**
**Fix:** banks first, "Create a bank" as a secondary action above the list.

### K2. Banks are not connected to products anywhere on this page
A bank is selected per product via `Recipe.keywordListId`, but this page never
shows which product uses which bank. With several products and several banks, the
seller has no way to see the mapping.
**Fix:** show "Used by: Gildan Tee" on each bank card.

### K3. No indication of what makes a bank good
The page accepts any list of phrases. Given the koozie failure came from a bank
named "BACHELORETTE TEES" containing koozie, sash and sunglasses phrases, the
bank itself is a quality surface worth supporting.
**Fix:** on save, flag phrases that name a product type different from the bank's
apparent subject — "13 of these 50 phrases mention products other than tees".
That is the same denylist logic already added to the title prompt, applied one
step earlier where it can actually be fixed.

---

## Console

No JavaScript errors or warnings on load of the Listing Factory. Clean.

---

## Consolidated: the single most repeated problem in this app

Across every screen audited, the same pattern appears:

| Screen | Loud | Quiet |
|---|---|---|
| Pricing | whole-number checkbox, detached above | the prices it changes |
| Connect | two Disconnect buttons | Next step |
| Choose product | "+ Add another product" | "Choose this product →" |
| Mockup Sets | "+ Add mockup set" | using an existing set |
| Keyword Banks | "Create a keyword bank" form | your existing banks |
| Listing cards (pre-fix) | three optional accordions | the title field |

**The rare, secondary, or destructive action is consistently the most prominent
element on the screen; the common action is a text link.**

This is one design decision made repeatedly, not six separate bugs. Fixing it as
a rule — *the action the seller takes most often gets the filled button; setup
and destructive actions get links* — would resolve all six and prevent the next
six.
