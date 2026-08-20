# Backlog — everything still recommended

Ordered by what costs money first, then what costs patience.
Full reasoning and evidence for every item is in `FULL-UX-REVIEW.md`.

Each item says **what**, **where**, and **why**. Do them one at a time and build
between each — several touch the same files.

---

## Tier 1 — costs real money or ships wrong listings

### 1. Shipping shortfall is invisible in the profit number
**Where:** pricing step, `app/page.tsx`, `app/pricing.ts`
**What:** the Etsy shipping profile collects **$4.75** for the first item while
Printify charges **$7.99** to fulfil. The screen shows "Lowest estimated profit
$10.00" and says "shipping is handled separately." Real margin is ~$6.76.
**Fix:** show net profit after the shipping delta, or warn next to the profile
picker: "This profile collects $4.75 but fulfilment costs $7.99 — you absorb
$3.24 per order."
**Note:** the item-price math itself is correct and was verified. It is solving
for the wrong number, not miscalculating.

### 2. Etsy attributes are guessed from the artwork instead of the product
**Where:** `app/api/listing-intelligence/route.ts` (details mode), Etsy details step
**What:** only 2–3 of 11 fields get filled. Materials is blank on a product
literally named "Unisex Heavy **Cotton** Tee" — and `Cotton` is in the options
list. Occasion filled on 2 of 3 identical listings in the same batch.
**Fix:** seed the physical fields (Materials, Sleeve length, Neckline, Size,
Clothing style) from the Printify blueprint instead of asking a vision model to
infer them. Persist to `Recipe.etsyDefaults` — the optional field already exists
on the type in `app/factory-tools.tsx`, it is just not wired to anything yet.
Only Occasion / Holiday / Graphic should stay design-derived.

### 3. `setPricingApproved(true)` does not exist
**Where:** `app/page.tsx`
**What:** the state is initialised `false`, set to `false` in seven places, and
otherwise only restored from saved state. There is no code path that approves
pricing — yet the "✓ Approved" badge and the "N variants approved" rail label
both appeared during testing.
**Fix:** find what is actually setting it (possibly server-side saved state) and
either wire the Approve action properly or remove the badge. Right now the UI
claims an approval the code cannot produce.

### 4. Batch cap and plan quota are different numbers, and only the generous one shows
**Where:** designs step, create-drafts confirmation modal
**What:** the upload step says "17 spaces remaining" (batch cap of 20) while the
plan may have far fewer listings left. The "Create N product drafts?" modal never
mentions quota at all.
**Fix:** show the binding constraint, not the batch cap. Add the quota line to the
confirmation modal.

---

## Tier 2 — the batch is painful at real volume

### 5. Move "Apply these photos to every listing" above the grid
**Where:** photos step, `app/page.tsx`
**What:** the button exists but sits **2,087px** below the top of a collapsed
accordion, under all 148 thumbnails. You find it after doing the work it saves.
**Fix:** put it directly under the accordion summary, phrased as the default path
("Pick photos once, use for all N listings"). Also fix or delete the
`<aside class="goldie-insight">` that explains this — it renders at **0 × 0
pixels**, so nobody has ever read it.

### 6. Replace stacked listing cards with rows
**Where:** the four finish phases, `app/page.tsx`
**What:** step 6 stacks a full-page card per listing. At 20 designs that is an
unusable scroll where nothing can be compared and a bad title 14 screens down is
invisible.
**Fix:** one row per listing — thumbnail, title, character count, tag count, photo
count, print quality — editable inline, detail expanding in place. Keep the four
screens; change what is on them.
**Why it matters:** the single largest remaining UX win, and the view that would
have caught the koozie title in two seconds.
**Rule behind it:** wizard for decisions you make once, table for data you make N
times. Steps 1–4 are a correct wizard. Steps 6–8 are a worksheet wearing wizard
chrome.

### 7. Show designs on the upload step
**Where:** designs step, `app/page.tsx`
**What:** counts and a progress bar only. Thumbnails first appear on the titles
step — *after* Printify drafts exist and the quota has been charged, so a wrong
file is only visible once it has already cost a listing.
**Fix:** thumbnails + filenames + a remove control on the upload step. This also
makes the DPI modal's "Go back and review" mean something; right now it returns
you to a screen with nothing to review.

### 8. Photo grid needs filters and a count
**Where:** photos step
**What:** 148 unfiltered checkboxes per listing, no filter by colour or shot type
(flat / folded / on-model / lifestyle), no count, no "pick N recommended."
**Fix:** filter chips, a live count, a recommended-set button. Etsy allows **20**
photos per listing (raised from 10 in Aug 2025) — a soft counter is useful, a hard
block at 20 is correct.

### 9. Collapse the duplicate status widgets
**Where:** designs step
**What:** four widgets report the same fact — "3 of 20 designs ready", "Upload
updated — 3 designs were added", "All 3 designs are ready 3/3", "3/20 designs —
17 spaces remaining".
**Fix:** one status line.

---

## Tier 3 — polish

### 10. Sticky action bar
`position: sticky` on `.workflow-footer-actions` did not take because the element
sits inside a `display: contents` wrapper. Needs a running app to verify it will
not cover content or trap the primary button. **Do not ship this blind.**

### 11. Batch History
Abandoned batches are labelled **COMPLETE**. Every batch is named identically
("Unisex Heavy Cotton Tee / Gildan Tee · 3 designs") so only the timestamp
distinguishes them. The headline says "Continue where you left off" while the
button says "Open results."

### 12. The 820px cutoff locks out iPad portrait
`@media (max-width: 820px)` shows a "needs a bigger screen" gate. iPad portrait is
768px. Many Etsy sellers work on an iPad.

### 13. Small stuff
- Usage widget flashes wrong data on load ("0 / 100" before correcting)
- Step 6's three chips do not match its body numbering (chip 2 is "Review each
  listing", body 2 is "Edit description")
- "Remember these colors for future batches" and "Auto Caps on" do not read as
  toggles and give no feedback when clicked
- The Back button stays enabled while drafts are being created in Printify
- Step 1 is titled "Connect Printify" but handles Etsy too

---

## Tier 4 — infrastructure

### 14. Move hosting so there are preview URLs
**Why:** every change currently has to be deployed to production to be looked at.
That is how two bugs shipped in this batch — a second step counter 900 lines from
the first, and stale test assertions. Neither would have survived thirty seconds
against a running app.
**Recommendation: Cloudflare, not Vercel.** The database (`DB`, a D1 instance) and
artwork storage (`ARTWORK`, an R2 bucket) already use that model, so it means
recreating two resources rather than swapping the database for Postgres and the
storage for Blob. Those resources currently live in ChatGPT's account, not
Brittany's — that is the real work here, not the code.
**Payoff:** connect GitHub to the host and every push gets its own preview URL,
which ends the deploy-to-look-at-it loop.
Her Vercel team is `goldrush-coach` and is currently empty.

---

## Already done — do not redo

Commits `8ed8374`, `223f19b`, `67b63db`, `3f391c8`, `c024654`, `0375d81`, `893a353`:

- Title generation: product-type rule, 8–13 phrase target, silent alphabetical
  fallback replaced with a real error
- Listing card weight hierarchy, Back demoted to a text link, H1/H2 scale
- Step bar reduced from 9 to 5 with the finish phases nested; both step counters
- Scroll reset on every step and phase change
- Photo validation error now names the listings
- Four duplicate eyebrow headings removed
- Five strings rewritten out of developer-speak
- `Recipe.etsyDefaults` added to the type
- Test assertions updated to match all of the above

## Do not propose these — already ruled out

- Forcing full 140-character titles or all 13 tags. Seller's call.
- Building a "product recipe" concept. `Recipe` already exists in `factory-tools.tsx`.
- A 10-photo Etsy limit. It is 20.
- iCloud as a way to move files, or copying folders between laptops.
