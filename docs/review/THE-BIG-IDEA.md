# What would make this epic

Grounded in what Etsy's algorithm rewards in 2026 and what POD sellers actually
complain about — not in general UX principles.

---

## The uncomfortable finding

**Goldie is optimising for the 2023 algorithm.**

Its entire pitch is keyword precision: a validated bank, exact phrases only,
"Goldie never adds keywords." That was the right game when Etsy matched strings.

Etsy's 2026 ranking has moved. The dominant signal is now **conversion relative
to impressions** — click-through, add-to-cart, and purchase. A listing with
3 favourites and 2 sales ranks above one with 10 favourites and 0 sales. Listings
with conversion 2× above their category average get boosted; well-optimised
listings that don't convert get pushed down anyway. Etsy also reads queries
semantically now — a listing can surface for "cozy fall decor" without containing
those exact words, which erodes the specific advantage of exact-phrase matching.

**What this means for Goldie:** a perfect title is table stakes and getting
cheaper. The thing that decides whether a listing wins is what happens *after*
it's published — and Goldie currently stops at publish.

Every competitor is a listing creator. That category is commoditising. The
opening is that **nobody is a listing operator.**

---

## The big idea: close the loop

Goldie is the only tool that knows *why* a listing looks the way it does. It
chose the title from a specific bank. It picked photo 1 out of 148 options. It
set the price from a profit rule. It selected the mockup type, the colours, the
attributes.

If Goldie then reads what those listings actually did on Etsy, it can attribute
performance to **specific decisions it made** — which no keyword tool, no mockup
tool, and no bulk editor can do, because none of them know what went in.

> "Your listings using the folded-flatlay as photo 1 convert 2.3× better than the
> on-model shot. Want me to swap it on the 14 listings still using on-model?"

> "Bachelorette tees priced at $23 convert. At $27 they don't. Your last batch
> went out at $26."

> "'Bachelorette shirts' brings impressions but no clicks. 'Bachelorette party
> shirts' brings half the impressions and 4× the sales. It's in your bank —
> want me to rewrite the 9 listings using the weaker phrase?"

That is not a feature. That is a compounding asset: a tool that has watched one
specific shop for six months is not replaceable by a competitor copying a feature
list.

**What it needs:** Etsy's Stats API for impressions/views/favourites/orders per
listing, joined to the choices Goldie already stores per listing. The join is the
whole product — and Goldie is the only tool holding both halves.

---

## Two features sellers will pay for out of fear

These are not delighters. They are "I can sleep now" features, and fear converts
better than convenience.

### 1. Production partner compliance, handled

Failing to disclose a production partner is **one of the most common causes of
Etsy listing deactivations and shop suspensions.** Doing it manually means
opening every listing, finding the Production Partner section, and filling it in
— brutal at 100 listings, impossible at 1,000.

Goldie already knows the provider on every listing it creates (SwiftPOD, in your
current template). It should:

- Set the production partner automatically on every listing it publishes
- **Audit the seller's entire existing shop** and report which listings are
  missing it, including ones Goldie never made
- Fix them in bulk

The audit is the killer half. It gives Goldie a reason to touch a shop's whole
back catalogue on day one, before the seller has created a single new listing —
and it opens with "you have 43 listings at risk of deactivation," which is the
most compelling first impression a tool of this kind can make.

### 2. The shipping ranking guard

**US listings with shipping above $6 get reduced visibility in search.** Most
sellers don't know this, and it silently suppresses their whole catalogue.

Goldie already reads the shipping profile at publish time and — since ChatGPT's
fix — already reconciles what the buyer pays against what Printify charges. It is
one step from saying:

> "This profile charges the buyer $6.50. Etsy reduces visibility above $6.
> Move $2 into the item price and ship free — you keep the same margin and rank
> higher."

Same numbers already on screen. Completely different value: it stops being an
accounting note and becomes a ranking intervention.

---

## The scaling mechanic that's already half-built

Sellers hit an operational ceiling around 50–100 listings. The way past it isn't
making listing creation 20% faster — it's **one design becoming several
listings.**

`ProductBundle` already exists in the codebase. It is currently buried on step 2
as an "OPTIONAL" row in the middle of the flow, labelled "Using this design on
multiple products?"

That is the multiplier, presented as an afterthought. Drop 20 designs onto a
bundle of tee + sweatshirt + tote and you get 60 listings from one upload, each
with product-appropriate titles, mockups and attributes.

**Make bundles the default unit, not an option.** A saved product becomes "Gildan
Tee" *or* "My bachelorette set: tee + crewneck + tote." The batch screen is
identical either way — you're just dropping designs onto three products instead
of one.

Combined with per-listing publishing (`STRUCTURAL.md` S2), the seller reviews 60
rows and publishes the 54 that are ready.

---

## Where the review table should point

`ROWS-SPEC.md` defines "needs attention" as: missing title, no tags, no photos,
low DPI. Those are completeness checks.

Given what actually ranks in 2026, the table should flag **quality**, not just
completeness:

- shipping over $6 (visibility penalty)
- price outside the range that converts for this shop, once there's data
- photo 1 is a mockup type that underperforms for this shop
- fewer than 5 photos (Etsy's own guidance is that more photos help buyers decide)
- missing production partner
- an attribute Etsy uses as a search filter left blank — Materials is a filter,
  and it's currently blank on every listing

That turns "3 of 20 listings need a look" from a form-validation message into a
revenue statement.

---

## What I'd actually build, in order

1. **Production partner audit + auto-set.** Highest fear, lowest effort, and it
   can run against a shop before Goldie has created anything. This is the demo
   that sells the tool.
2. **Shipping ranking guard.** The data is already on screen. It's a copy and
   logic change, not a new system.
3. **Bundles promoted to the default unit.** The code exists; it needs to move
   from an optional row to the centre of the model.
4. **Read Etsy Stats and join to Goldie's own choices.** This is the moat and the
   largest build. Start narrow: one question, "which photo-1 mockup type converts
   best for this shop," because Goldie already stores the mockup indices per
   listing.
5. **Act on it in bulk** — swap photo 1, rewrite weak phrases, adjust prices,
   across existing listings.

Items 4 and 5 turn Goldie from a thing you use when launching into a thing you
open every week. That is the difference between a tool people buy once and a tool
people can't leave.

---

## The positioning shift

Today: *"Create 20 Etsy listings in the time it takes to make one."*

That is a speed claim, and speed claims get matched.

After: *"Goldie makes your listings, then watches them and tells you which
choices are making you money."*

Nobody else can make the second claim, because nobody else knows what went into
the listing in the first place.

---

## Sources

- Etsy algorithm 2026 — conversion weighting, semantic queries, Star Seller lift:
  https://blog.marmalead.com/etsy-algorithm-2026/
- 2026 search changes for POD sellers, conversion vs favourites, $6 shipping
  threshold: https://mydesigns.io/blog/etsy-search-algorithm-update-2026/
- Production partner disclosure as a leading cause of deactivation; the 50–100
  listing operational ceiling:
  https://cedcommerce.com/blog/etsy-seo-2026-pricing-fulfillment-scaling-strategy-for-print-on-demand-products/
- POD rules and disclosure requirements:
  https://www.listadum.com/blog/understanding-etsys-rules-for-print-on-demand-sellers
