# Handoff — Goldie Listing Factory

Written for whoever picks this up next (likely a new Claude session on the other laptop).
Read this before doing anything.

---

## Who you're working with

Brittany. Runs the shop, built this with ChatGPT, is **not a developer**.

Rules that matter, learned the hard way:

- **Be brief.** Short answers. No preamble, no explaining how things work unless asked.
- **No jargon.** Not "pnpm install," not "dev server," not "remote." If a term needs a sentence of explanation, find a different term or don't mention it.
- **Never suggest iCloud** as a way to move files. Never suggest copying a folder between laptops. Both have been ruled out and re-raising them makes things worse.
- **Don't propose things you haven't verified.** Test first, then speak. Several hours were burned on confident suggestions that turned out to be impossible.
- **She wants to see changes, not read about them.** Screenshots of the real UI beat descriptions.

---

## The setup

- **Source of truth:** https://github.com/brittanylewismua-tech/goldie-listing-factory-next (private)
- **Production:** thegoldiesuite.com/listing-factory
- **Deploys from:** a local Codex project folder on her *other* laptop, via ChatGPT. Not from GitHub, not from iCloud.
- **Stack:** React 19, Vinext, Vite, Cloudflare Workers, D1 (`DB`), R2 (`ARTWORK`), Supabase auth, Stripe, Printify + Etsy APIs, FAL for mockups.

**The core friction:** she edits/reviews on one laptop, deploys from another, and this Cowork session was *local* so it couldn't travel. If you're a cloud session, you can follow her — but you still only reach local files while the desktop app is open on the machine holding them.

**Preview mode is free.** `localPreview` auto-enables when the hostname is `localhost` or `127.0.0.1`. It bypasses all Printify/Etsy/login gating (`requiredForStep()` returns `[]`, `canOpenStep()` returns `true`) and there's a "Load a complete poster demo" button on step 2. So a local run needs **no secrets at all**.

---

## What's been pushed (4 commits, all on `main`)

| Commit | What |
|---|---|
| `8ed8374` | clarity pass + the koozie fix |
| `223f19b` | 5-step rail |
| `67b63db` | trailing rail line + jargon removal |

Diff against the last ChatGPT commit: `fce20e3...HEAD`

### The koozie fix — `app/api/listing-intelligence/route.ts`

Three real bugs in one function, all confirmed from source:

1. **Prompt never asked for enough phrases.** No count, no length target, `temperature: 0`. Gemini returned 2 phrases → 25-character titles. Tags come from the same array (`tagsFromTitle(result.keywords.join(", "))`), which is why tags were 2 of 13. **One cause, both symptoms.**
2. **No product-type guard.** The Etsy-details prompt in the same file says "the artwork must never change the garment type." The title prompt had no equivalent, so nothing stopped it picking "bachelorette koozies" for a t-shirt.
3. **Silent alphabetical fallback.** `chosen = selected.length ? selected : keywords.slice(0,13)` — when the model returned nothing, it grabbed the first 13 phrases in bank order (banks are stored alphabetically) and built a confident-looking title from them. Now returns a real 422 error.

### Everything else

- `app/clarity-pass.css` (new, loaded last in `layout.tsx`) — delete the file + its import to revert every visual change. Listing card hierarchy (title input was 10px, same as everything else in the card), Back demoted from a dark slab to a text link, H1/H2 scale, rail grid fixed from 9 hardcoded columns to 5.
- `app/page.tsx` — scroll resets on every step *and* phase change (was gated to `finish` only); photo-validation error names listings via `files`/`clientId` instead of the empty `draft.title||draft.name` that rendered "listings: , ."; four eyebrows removed that duplicated their own H1; stepper no longer prints a stale "0 variants approved"; five strings rewritten out of developer-speak.
- `app/factory-tools.tsx` — optional `etsyDefaults` added to `Recipe`.

---

## Full review

`docs/review/FULL-UX-REVIEW.md` — the complete walkthrough (514 lines). Everything
below is a summary; that file has the evidence, the measurements, and the reasoning.

Findings in it that are NOT repeated below:

- **Shipping loses money on every US order.** The Etsy profile collects $4.75 first
  item; Printify charges $7.99 to fulfil. The pricing screen says "$10.00 profit"
  and "shipping is handled separately" — real margin is closer to $6.76. The item
  pricing math itself is correct; it is solving for the wrong number.
- **Photo picking is 148 checkboxes per listing** (2,960 for a 20-design batch).
  "Apply these photos to every listing" exists but sits 2,087px below the top of a
  collapsed accordion, under all 148 thumbnails — you find it after doing the work
  it saves. The copy explaining it renders at 0x0 pixels.
- **Designs are not visible on the upload step** — counts and a progress bar only,
  no thumbnails, no filenames, no way to remove one. Thumbnails do appear later on
  the titles step, but that is *after* Printify drafts exist and the listings have
  been charged against the plan quota, so a wrong file is only visible once it has
  already cost you. The DPI modal also says "Go back and review" when the screen it
  returns you to has nothing to review.
- **Four widgets report the same fact** on the designs step.
- **Batch cap (20) vs plan quota** are different numbers; only the permissive one
  is shown. The create-drafts confirmation never mentions quota.
- **Batch History** labels abandoned batches "COMPLETE" and names every batch
  identically, so only the timestamp distinguishes them.
- **Blocked below 820px**, which locks out iPad portrait.
- Step 6's three chips do not match its body numbering.
- Usage flashes wrong data on load ("0 / 100" before correcting to the real number).

It also contains the UX analysis: the wizard-vs-worksheet framing (steps 1-4 are a
proper wizard, 6-8 are a worksheet wearing wizard chrome), the measured weight
hierarchy problem, and the clarity fixes ranked by impact per hour.

`docs/review/UX-DIRECTION.md` — **nine defects with exact fixes, plus the UX strategy translated into per-screen changes. Read this first.**
`docs/review/BACKLOG.md` — **every remaining recommendation, prioritised and ready to work from.** Start here for what to do next.
`docs/review/CHANGES-APPLIED.md` — what was changed and why, with before/after.
`docs/review/STACK-NOTES.md` — stack and repo reference.

---

## Still open

**Sticky action bar.** Prototyped on the live site; `.workflow-footer-actions` sits inside a `display:contents` wrapper so `position:sticky` doesn't bite. Needs a running app to verify it won't cover content.

**Etsy attribute auto-fill.** Only fills 2–3 of 11 fields. Materials is blank on a product literally named "Unisex Heavy **Cotton** Tee" (and `Cotton` is in the options list). Occasion filled on 2 of 3 identical listings in the same batch. Fix is to seed from the Printify blank instead of asking the AI to infer, and store it in the new `Recipe.etsyDefaults`.

**`setPricingApproved(true)` does not exist anywhere in `page.tsx`.** Initialised `false`, set `false` in seven places, otherwise only restored from saved state. So the Approve action appears unwired — yet the "✓ Approved" badge showed during the walkthrough. Worth investigating.

**Rows instead of stacked cards** on the finish phases. Step 6 stacks a full-page card per listing; at 20 designs that's an unusable scroll. A table (thumbnail, title, chars, tags, photos, print quality) is what makes a 20-design batch scannable. This is the biggest remaining UX win and the largest job.

**Hosting migration.** She wants off ChatGPT hosting. Recommend **Cloudflare over Vercel** — D1 and R2 already exist in that model, so it's recreating two resources rather than swapping the database for Postgres and storage for Blob. The payoff she cares about: connecting GitHub to a real host gives automatic preview URLs per push, which ends the screenshot-and-redeploy loop she hates. Her Vercel team is `goldrush-coach` (currently empty).

---

## Corrections made mid-review — don't repeat these

- **Etsy allows 20 photos per listing, not 10.** Raised in Aug 2025. A "12 photos exceeds the limit" finding was wrong.
- **"Apply these photos to every listing" exists.** It's real — just buried 2,087px below the top of a collapsed accordion, under 148 thumbnails. Placement problem, not a missing feature.
- **Short titles / few tags are the seller's call.** Don't propose forcing 140 characters or 13 tags. The fix was the word "complete" on a listing with 2 tags, not enforcement.
- **The "product recipe" idea already exists** as `Recipe` in `factory-tools.tsx`. Don't propose building it.
- **The listing card wasn't an inverted hierarchy** — everything in it was uniformly 10px/850. Measure before claiming.
