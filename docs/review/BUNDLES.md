# Bundles — one design, several listings

The multiplier. `ProductBundle { id, name, recipeIds[] }` already exists; it is
currently an "OPTIONAL" row buried mid-flow on step 2.

This spec is about promoting it to the default unit and the five things that have
to be right for that to work.

---

## What a bundle is, in the UI

A saved product and a bundle are the same card. One happens to contain three
products.

```
┌──────────────────────┐   ┌──────────────────────┐
│  Gildan Tee          │   │  Bachelorette Set    │
│  1 product           │   │  Tee · Crew · Tote   │
└──────────────────────┘   └──────────────────────┘
```

Drop designs on either. The batch screen is identical — colours and mockups now
appear once per product inside the bundle, still expanded, still remembered from
last time.

No new concept. A bundle is a saved product with more than one thing in it.

---

## 1. Quota — corrected

> **CORRECTION.** An earlier version of this file said 20 designs on a 3-product
> bundle would consume three months of plan. That was based on the beta account's
> 20-listing cap, not the real plans. Actual tiers are Starter 100/month, Pro
> 300/month, Scale 750/month. **60 listings fits Starter comfortably. Bundles do
> not require a pricing change.** The only pinch is the Free Trial at 10 listing
> creations, where a 4-design 3-product bundle is 12 and blows the trial.

## 1a. Quota still needs to be visible before the drop

20 designs on a 3-product bundle is **60 listings**. On the current plan that is
three times the allowance, consumed in one drop.

This is a business decision before it is a UX one:

- Does a bundle listing cost the same as a single listing? If yes, bundles make
  the plan three times cheaper to use and the pricing needs revisiting.
- If no, the seller needs to see the real number *before* dropping designs, not
  after drafts are created and charged.

**Required in the UI regardless of the answer:** the drop zone states the maths
up front — *"20 designs × 3 products = 60 listings. You have 7 left this month."*
And it blocks, rather than creating 7 and failing the other 53 halfway through.

The current create-drafts confirmation doesn't mention quota at all. With bundles
that becomes a much more expensive omission.

---

## 2. Titles must be product-aware — this is the koozie problem, tripled

A phrase that fits a tee does not fit a tote. Today the title generator already
picks "bachelorette koozies" for a t-shirt because the bank contains phrases for
other products and the prompt had no product-type rule. That rule now exists.

With bundles the same design generates three titles that must each be correct for
their own product. Three failure modes instead of one, from a single upload.

**Required:**
- The product-type rule in `listing-intelligence/route.ts` already takes
  `body.product`. Each product in the bundle must pass its own blueprint — not
  the bundle's first product.
- The keyword bank should be filterable per product type, or a bundle should
  allow a different bank per product. "BACHELORETTE TEES" and "BACHELORETTE
  TOTES" are different banks; forcing one across three products reproduces the
  original bug at scale.

## 3. Print placement differs per product, and this is the real technical risk

A design sized and positioned for a 3692 × 4800 tee print area does not map onto
a tote, a mug, or a crewneck. Different print dimensions, different placement
origin, different safe area.

`TemplateDetails` already carries `maxPrintWidth`, `maxPrintHeight` and
`placementScale`, and the code already has `isRigidPaperProduct()` special-casing
and a DPI check per product. So the pieces exist — but they are currently
evaluated against one product per batch.

**Required:**
- Run the DPI/pixel check **per product**, not per design. The same file can pass
  for a tee and fail for a tote.
- The pre-publish warning must say which product fails, not just which design:
  *"palm-springs.png is below recommended size for the Tote (needs 4500 × 4500).
  Fine for the Tee and Crewneck."*
- Decide the default behaviour when one product in a bundle fails the check —
  skip that product for that design, or block the design entirely. Skipping is
  probably right, but it must be visible, not silent.

## 4. The review table groups by design, not by listing

60 flat rows is unusable. Group by design, expand to the products:

```
▾  palm-springs.png                          3 listings   2 need a look
     Tee        Palm Springs Bachelorette Shirt…    ✓
     Crewneck   Palm Springs Bachelorette Sweat…    ⚠ 2 tags
     Tote       Palm Springs Bachelorette…          ⚠ low resolution
▸  nashville.png                             3 listings   ready
▸  scottsdale.png                            3 listings   ready
```

Collapsed by default, so 20 designs is 20 rows. The "needs a look" count rolls up
to the design so you can see where the problems are without expanding anything.

## 5. Partial failure has to be per listing

If the tote fails to create in Printify but the tee and crewneck succeed, the
batch is not failed — it is 2 of 3. Combined with per-listing publishing, the
seller publishes what worked and retries what didn't.

The current model treats a batch as one unit that succeeds or fails. With bundles
that becomes untenable: one bad product in one bundle should never hold up 59
good listings.

---

## Build order

1. **Quota maths and the up-front block.** Nothing else matters if the first
   bundle batch silently burns a month's allowance.
2. **Per-product title generation** — pass each product's own blueprint.
3. **Per-product DPI and placement checks**, with a warning that names the
   product.
4. **Promote bundles in the UI** — same card as a saved product, not an optional
   row.
5. **Grouped review table** — depends on `ROWS-SPEC.md` landing first.
6. **Per-listing publish and retry.**

Steps 1–3 are correctness. Without them, bundles multiply existing bugs by the
number of products in the bundle. Steps 4–6 are the actual feature.
