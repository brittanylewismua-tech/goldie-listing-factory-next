# Changes applied — clarity pass

Backup of every touched file: `.goldie-backup-20260819-165453/` in the repo root.

## Shipped

### New file: `app/clarity-pass.css` (+ one import line in `layout.tsx`)

Loaded last so it wins over earlier overrides. **Deleting this file and its import reverts every visual change** — nothing else was touched in the existing stylesheets.

| Fix | Before | After |
|---|---|---|
| Listing card hierarchy | title input, tags input and both optional accordions all rendered at 10px / weight 850 / 304px — literally indistinguishable | title 15px/550, tags 13px/500, optional actions become quiet 10px underlined links |
| Back button | redefined 7 times in `approved-functional.css`, ending on the same dark gradient as the primary button | transparent text link, 12.5px |
| Type scale | H1 34px, H2 36px — page title smaller than the card title restating it | card H2 clamped to 21–27px, section H3 to 18px |

All three were prototyped live in the browser and screenshot-verified before being written to the file.

### `app/page.tsx` — four surgical edits

1. **Scroll reset.** `useEffect` only fired `scrollTo(0,0)` when `workflowStep === "finish"`, so every other transition kept your old scroll offset. Now fires on all step and phase changes, and uses `behavior:"auto"` instead of `"smooth"` so it's deterministic.

2. **Photo validation error.** The modal rendered `"listings: , ."` because it labelled drafts with `draft.title || draft.name`, both of which come back empty from the create-drafts response. Now resolves the label from the `files` array via `clientId`, with a `Listing N` fallback.

3. **Removed four redundant eyebrows** — `BATCH SUMMARY`, `PRICING`, `ETSY LISTING DETAILS`, `STEP 8 · IMAGES + MOCKUPS`. Each duplicated the H1 directly above it.

4. **Stepper contradiction.** Rail said "0 variants approved" while the drafts modal said "All 20 enabled variants reviewed and approved" — same variable, `pricedVariants.length`, read at a moment when `templateDetails` had been cleared. Now falls back to "Pricing approved" rather than printing a stale zero.

### `app/factory-tools.tsx` — `etsyDefaults` on `Recipe`

```ts
export type RecipeEtsyDefaults = Record<string, string | number | null>;
export type Recipe = { …; etsyDefaults?: RecipeEtsyDefaults };
```

Type only — the field is additive and optional, so nothing breaks. Wiring it into the Etsy details step and `/api/product-recipes` is the next move, and it needs the API routes (see blocked).

---

### `app/api/listing-intelligence/route.ts` — the koozie fix

The file finished syncing. Root cause confirmed from source, three problems in one function:

**1. The prompt never asked for enough phrases.** It said "select only the most visually relevant exact phrases" with no count and no length target, at `temperature: 0`. Gemini returned 2. The packing loop then fills a title up to 140 characters — but it only had 2 phrases to work with. That is why titles were 25–42 characters *and* why tags were 2 of 13: `tags` are derived from the same array. One cause, both symptoms.

**2. The title prompt had no product-type guard.** Compare the two prompts in this file — the *Etsy details* prompt says "The artwork, design wording, title, and tags must never change the product category, age group, garment type." The *title* prompt said nothing equivalent, so nothing stopped it selecting "bachelorette koozies" for a t-shirt.

**3. The alphabetical fallback was real after all.** I told you mid-review that my alphabetical theory was wrong. It wasn't — I just couldn't see the code. Line 26 read:

```ts
chosen = selected.length ? selected : keywords.slice(0,13)
```

If the model returned nothing usable, it silently took the **first 13 phrases in bank order** — and banks are stored alphabetically. That produces a confident-looking title from arbitrary phrases with no signal to you that anything went wrong. It didn't fire on the koozie listing (the model really did pick those), but it is a live trap on any design the model can't match.

Fixes applied:

- Prompt now names the product-type rule first and explicitly rejects koozie / coozie / sash / sunglasses / tapestry / tattoo / sticker / mug / tumbler / cup / banner / decor / poster / print / blanket for garment products
- Prompt now asks for 8–13 phrases ordered most-relevant-first, and states the 140-character target so it fills the title
- The silent fallback is replaced with a real error: *"Goldie could not find phrases in this bank that match this design. Pick a different keyword bank, or build this title yourself."* (HTTP 422)

### Typecheck

`tsc` can't run against the project because `node_modules` is still un-synced. Instead I ran a standalone TypeScript 5.9.3 syntax and type pass over the changed files, and the same pass over the untouched backup:

- `route.ts` — clean
- `factory-tools.tsx` — clean
- `page.tsx` — 5 errors, **identical to the 5 in the original backup file**, all artifacts of checking in isolation without resolved imports

So the edits introduce zero new type errors. Not a substitute for `pnpm build`, but the changes are sound.

---

## Not shipped, and why

### The 5-step rail — needs a local dev run

I found why it's structurally messy. There are **two parallel step models**:

```ts
const WORKFLOW_STEPS   = [connect, setup, designs, review, finish]        // the real machine
const PROGRESS_STEPS   = [Connect, Product, Designs, Pricing, Drafts,
                          Titles+tags, Etsy details, Photos, Publish]     // the displayed rail
```

The 9-node rail is a separate hardcoded array. Collapsing it means changing `progressStatus(index)` (indexed 0–8), the `progressIndex` computation, and `canOpenStep()` — which is the gating that stops someone skipping a required step.

I'm not shipping unverified navigation math into a flow that publishes live listings and charges Etsy fees. Get a dev server up and this is maybe 30 minutes with eyes on it.

### Sticky action bar — same reason

Back-as-a-link is done and verified. Making the footer `position: sticky` risks overlapping content on short steps, and I can't check all nine screens without running the app.

### A real bug I found but did not touch

**`setPricingApproved(true)` does not exist anywhere in `page.tsx`.** The state is initialised `false`, set to `false` in seven places, and otherwise only restored from saved state. There is no code path that approves pricing.

That means the "✓ Approved" badge and the "N variants approved" rail label should be unreachable — yet I saw both during the walkthrough. Something is setting it server-side or through a path I can't see, and I'd rather flag it than guess at a fix. **Worth checking whether the Approve action is wired at all.**

### Blocked: the koozie fix

`app/api/**` is still un-downloaded from iCloud — every file there returns "Resource deadlock avoided". `app/api/listing-intelligence/route.ts` holds the prompt that causes the short titles, the 2-of-13 tags, and the wrong-product title. That's finding #1 and it's the highest-value fix in the whole review.

Same blocker stopped `tsc --noEmit` — `node_modules` is partly un-synced too, so **I could not typecheck or build.**

---

## Before you deploy

1. Let iCloud finish syncing, then `pnpm dev` and click through steps 3, 4, 6, 7, 8 — the CSS changes are presentational but I want the type scale checked on the pricing and photos steps specifically.
2. `pnpm build` to confirm the four `page.tsx` edits typecheck. They're small and brace-balanced, but they are unverified by a compiler.
3. Test the photo error: leave one listing without photos on step 8 and confirm the modal now names it.

If anything looks off, `.goldie-backup-20260819-165453/` has the originals.
