# Design handoff — every member-facing route, its states, and what it needs

Written so the approved Sites redesign can be applied without rediscovering
how anything behaves. It describes FUNCTION, not presentation: what each
screen can be in, what a member can do there, and what data it needs to say
anything true.

Two rules this product does not bend on, and a reskin must not break:

1. **A state is never inferred from an absence.** "No data yet", "this
   failed", "this is stale" and "this was refused" are different facts with
   different words. Rendering any of them as an empty region loses the
   difference, and the difference is usually the whole message.
2. **Nothing may look successful that was not.** A failed correction, a
   refused scan and a declined read each have their own visible outcome. If a
   state below has no place in the new design, that is a blocker, not a
   detail to fill in later.

Shared vocabulary already in the markup, safe to restyle and worth keeping
addressable:

| hook | meaning |
|---|---|
| `.p-notice` + `.p-notice-bad` | a notice; the modifier marks the bad kind |
| `.p-badge` | a small status chip |
| `.p-empty` | nothing here yet, said deliberately |
| `[data-state]` | machine-readable state on a container |
| `[data-stale]` | the figure or list is older than its freshness rule |
| `[data-basis]` | `estimated` vs verified money |
| `[data-risk]` | trademark outcome: `high` / `caution` / `clear` |
| `[role="alert"]` | anything a member must not miss |

---

## / (public) and /signup

**Purpose.** The pre-launch door.
**States.** One: closed. Renders `CLOSED_HEADLINE` + `CLOSED_BODY` from
`app/checkout-gate.ts`.
**Controls.** None.
**Data.** None.
**Rule.** Prices and plan names must not appear while `checkoutOpen()` is
false. The same two strings are the single source for /usage too.

---

## /home

**Purpose.** What changed, and the way into each tool.
**Data.** `GET /api/home` → `blocks` (all optional; a block that cannot be
built is dropped, never zeroed).

| state | what shows |
|---|---|
| connections need attention | "Connect your Etsy shop" / "N shops need reconnecting" |
| this month | `$X from N orders · profit unavailable` or a profit figure |
| this month, stale | the above plus `· worked out 15 September` |
| scans | `N of 10 scans left today` |
| register loading | "checks are not complete searches yet" |
| niches moved | "New evidence in …" |

**Controls.** Each status line is a link; the tool grid links onward.
**Rules.** Profit is `null` unless every completeness condition held — never
`0`. Listing Factory carries a `DESKTOP` marker.

---

## /listing-factory

**Purpose.** Design → finished Etsy listings, in bulk.
**Desktop only, by product decision.** Renders the mobile gate below 820px
with a coarse pointer. The 40px touch-target rule is deliberately not applied
here.
**States.** product list · per-product `Finish setup: colors` /
`Finish setup: a keyword bank` · saved bundles · the workflow itself (its own
step machine) · connection expiry · retry · uncertain creation · dialogs.
**Rule.** Never publishes to Etsy. Creates unpublished Printify drafts only.

---

## /design-scanner

**Purpose.** Compare a design against listings that are actually moving.
**Data.** `POST /api/design-scanner/scan` (a scan) · `GET` same path
(history + allowance) · `GET /api/market-watch/niches` (saved niches).

| state | marker | what shows |
|---|---|---|
| no design | `.p-empty` | "Choose a design and…" |
| loading | `.loading` | analysis in progress |
| result | — | verdict, construction notes, readability |
| refused | `.refusal` | e.g. "Not enough verified evidence — only 1 listing in this niche… needs at least 12" |
| error | `.p-notice-bad` | what failed, and that no scan was counted |
| allowance | `.left` | `N scans left today`; at 0 adds `.left-next` "next one in about 3 hours" |
| limit reached | — | Scan button `disabled` |
| history | — | 25 most recent, each reopenable free |

**Controls.** file picker (a 1×1 hidden input behind a styled button — not a
touch target) · niche field · saved-niche chips · Scan.
**Rules.** A failed scan is refunded and says so. A repeat upload of the same
artwork is warm: no provider call, no allowance. Readability notes are
measured from pixels, never a model's opinion, and `unverified` is a real
value that must render.

---

## /trademark

**Purpose.** Screen a phrase before printing it.
**Data.** `GET /api/trademark?phrase=` → `{ risk, hits, summary, register… }`.

| `[data-risk]` | badge | headline | body |
|---|---|---|---|
| `high` | "High risk" | "Do not print this" | owners, classes, each matched span marked in place |
| `caution` | "Partly owned" | "Somebody owns part of this" | as above |
| `clear` | "Nothing found" | **none** | see the three register sentences below |

**The three clear-result sentences — pick by register state, not by taste:**

- register still loading → "No match was found in the trademark records
  currently loaded."
- register final but incomplete → "No exact or contained match was found in
  the trademark records that could be read… A few records could not be loaded
  at all, so this is not the whole register."
- register complete → "No exact or contained match was found in the current
  federal trademark register or the curated risk list."

All three end "This is screening information, not legal clearance."
**Rules.** A clear result has no headline on purpose — the only thing that
would fill the slot is encouragement to print, which this tool cannot give.
Nothing on the page may read as permission.

---

## /market-watch

**Purpose.** What is moving in the niches and shops a member follows.
Two tabs, `?tab=shops` for the second.

**Niche Watch.** `GET /api/market-watch/niches` · `POST …/update`.
States: loading · empty ("Watch a niche and…") · list · `.stale-flag` per row
· `.update-failed` · `.failed` (the list itself could not load).
Controls: watch field, per-row open/update, remove.

**Shop Watch.** `GET /api/shop-watch/brief`.
Sections: GETTING ATTENTION · WHAT BUYERS LOVE · WHAT CHANGED. Each card is
pattern + reasoning + evidence footer + link.
**Rules.** Every card carries its denominator. Reviews are never called
sales. The two counter cards read "Etsy's own shop counter", never a review
count. Counters are thousands-separated.

---

## /shop-map

**Purpose.** The member's own listings, money, and what the shop is made of.
**Data.** `GET /api/shop-map/map` (add `?listingId=` for one listing's
placement) · `POST /api/shop-map/correct`.

| state | marker |
|---|---|
| loading / empty / failed | `.shop-map-state` |
| showing last good after a failed refresh | `.shop-map-stale` — "Showing your last map — the newest refresh didn't finish." |
| money basis | `[data-basis="estimated"]` + an "Estimate" chip |
| money freshness | `.shop-map-freshness` `[data-stale]` |
| needs attention | `.shop-map-attention`, or `.shop-map-clear` when nothing does |
| grouping explanation | `<details class="shop-map-grouping">` |
| listing lookup failed | `.shop-map-lookup-failed` |
| correction failed | `.shop-map-correction-failed` `[role=alert]` |
| a member's own correction | `.shop-map-clear-correction` button |

**Controls.** timezone setup · listing-ID field · "Where is it now?" (a read;
must stay visually quieter than Move) · niche select · "Move listing" · "Use
the automatic placement instead" (only when the placement is the member's).
**Rules.** Every figure reconciles to the whole shop. A correction moves
money, never copies it. No classifier mechanics, prompts, scores or raw
labels reach this page. No buyer information appears anywhere.

---

## /shop-map/costs

**Purpose.** Tell the map what production actually cost.
**States.** loading · empty · rows · `Not known` with the reason ("The
matching Printify order falls outside the period that has been read") ·
editing · saving · error.
**Controls.** "Enter what it cost", amount, currency, confirm.

---

## /batches, /keywords, /connections, /usage, /account/settings, /more

- **/batches** — saved bundles. Partial progress reads "2 OF 4 PRINTIFY
  DRAFTS SAVED" with per-product state, resume, and an explicit permanent
  remove. `.batch-select` is a 44×44 label around a 17px checkbox: the label
  is the target.
- **/keywords** — banks, phrase counts, which products use them, expand,
  edit, delete. `.empty-bank` when a bank has none.
- **/connections** — per-service card, `Publishing here` / `Sales visible`
  badges, last successful sync age, connect / reconnect / disconnect.
- **/usage** — current plan, meters, Etsy fee profile, and **the closed
  purchase panel**. While checkout is closed there are no prices and no
  buttons; the panel shows the same two strings as /signup.
- **/account/settings** — email, access, subscription (verb follows the date
  direction: ended/ends, expired/renews), human-labelled data counts, what is
  kept and why, delete (typed phrase; the owner is refused by a standing
  protection), sign out.
- **/more** — the menu. Entries must not promise more than the page they
  open.

---

## Refusals that can appear on more than one route

Added in the D1728–D1732 security pass. These are member-visible states that
did not exist when the rest of this document was written, and they can appear
on several screens, so they are described once here rather than repeated per
route.

### A file that was not accepted

**Where.** Anywhere a member chooses a file: `/listing-factory` (listing
images), `/design-scanner` (the design), `/mockups` (a scene mask), and the
support form.
**Shape.** `400` with `{ error }`. The message is written for the member and
is safe to render verbatim — no file names are echoed back, and no internal
terms appear.

| what happened | what the member is told |
|---|---|
| not an image, whatever it was called | "That file is not an image we recognise." |
| an SVG | "SVG files are not accepted. Save it as a PNG or JPG." |
| a format we cannot process | "That is a GIF file. Choose PNG, JPG or WEBP." |
| damaged or cut off | "That image is damaged or incomplete." |
| too many pixels to decode | "That image is 50000x50000. Each side must be under 20000 pixels." |
| too large in bytes | "That file is larger than 20 MB." |
| nothing in it | "That file is empty." |

**Rules.**

- This is a **refusal**, not a failure: nothing was saved, nothing was sent to
  a provider, and no allowance was spent. It must not be styled as an error
  the member needs to report, and it must not look like the upload is still in
  progress.
- Choosing several files at once is all-or-nothing. If one is refused, none
  are stored — so the message belongs to the **set**, not to a single row, and
  the design must not imply the others went through.
- The member's next action is to choose a different file. That path must stay
  reachable without reloading the screen.

### Too many requests

**Where.** Any API call, on any screen.
**Shape.** `429` with `{ error }` and a `Retry-After` header in seconds.
**Message.** "That is more requests than this account can make right now. Try
again shortly."

**Rules.**

- This is the only state in the product a member can reach **without doing
  anything wrong** — a stuck retry loop or a tab left open can produce it. The
  tone is "come back in a moment", never "you did something bad".
- `Retry-After` is authoritative. If the design shows a wait, it must come
  from that header, not from a guess.
- It is not a sign-out and not a failure of the underlying action. Whatever
  the member was doing is still there when they return; the screen must not
  discard their work or send them back to a start state.
- In normal use it does not appear. Two full page loads making 12 and 7 API
  calls returned 200 on every call. If a member is seeing this during ordinary
  work, that is a defect to report, not a screen to design around.

---

## Repo state for this reskin

**Frozen at D1733 (`9940d091`).** This is the final functional build. Every
route, state and control below is what is deployed; nothing functional is
expected to change while the reskin is applied.

One state in `/trademark` is still moving, and it moves on USPTO's schedule
rather than ours: the register is at `final-with-skipped-files` pending two
historical files USPTO is rate limiting. The member currently sees the
**still-loading** wording. All three wordings are already documented below and
all three must have a home in the new design — the transition between them is
data-driven and will happen without a deploy.

## Reskin constraints

- Keep every state above individually addressable. Collapsing "failed" and
  "empty" into one treatment is a functional regression.
- Keep `[data-state]`, `[data-stale]`, `[data-basis]`, `[data-risk]` and the
  `.p-notice` / `.p-badge` / `.p-empty` roles, or provide equivalents and
  update the guards that assert them.
- Business logic stays in the routes and the `app/*.ts` modules. Pages render
  sentences the server already built — `freshnessNote`, `explainGrouping`,
  `describePlacement`, the trademark summaries — so a page never has to
  handle internal vocabulary.
- Minimum touch target is 40px on phone-facing surfaces; the product uses 44.
  Listing Factory is exempt by decision.
- Radius scale: 0, 6, 7, 8, 9, 10, 12, 14, 16, 22. Font sizes are whole
  pixels. Brown has been rejected three times.
- Tests enforce a good deal of this. If a guard fails after a reskin, read
  the guard: it names the defect it was written for.
