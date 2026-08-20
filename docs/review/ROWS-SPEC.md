# Spec — rows instead of stacked cards on the Finish phases

This is the largest remaining change and the one that decides whether a 20-design
batch is pleasant or merely survivable. Pre-filling titles and photos (B1–B3)
makes twenty cards *correct*; it does not make twenty cards *scannable*. Both are
needed, and this one should land alongside them, not after.

---

## The problem, concretely

Step 6 renders one full-page card per listing, stacked vertically. Each card is
roughly 340px tall. At 20 designs that is ~6,800px of scroll — about fourteen
screenfuls.

Consequences, all observed:

- You cannot compare two listings. A 25-character title looks fine in isolation;
  it only looks wrong next to a 130-character one.
- A bad row fourteen screens down is invisible. The "Bachelorette Koozies" title
  on a t-shirt sat in the third card and was only caught by reading every card.
- There is no overview. Nothing on screen answers "is this batch ready?" without
  scrolling the whole thing.
- The same six controls repeat 20 times, so the page is 120 controls with no
  hierarchy between them.

---

## The change

Replace the stack of cards with a **table of rows**, one row per listing, on all
four Finish phases. Same four screens; different content.

### Row anatomy — Titles phase

| col | content | width | behaviour |
|---|---|---|---|
| thumb | design artwork, square | 56px | click opens large preview |
| title | editable text input | flexible, ~45% | inline edit, autosave on blur |
| chars | `128/140` | 64px | amber under 80, red at 0 |
| tags | `13` with tag count | 56px | click expands the tag editor inline |
| photos | `10` | 56px | read-only here; links to Photos phase |
| print | `243 DPI` or `✓` | 80px | amber if below recommendation |
| — | `⋯` overflow menu | 32px | regenerate this one, restore Goldie's version, open in Printify |

### Row anatomy — Etsy details phase

| col | content |
|---|---|
| thumb | 56px |
| listing | title, truncated to one line |
| category | the Etsy category, editable inline |
| fields | `9 of 11 set` — click expands the full field set in place |
| — | overflow menu |

### Row anatomy — Photos phase

| col | content |
|---|---|
| thumb | 56px |
| listing | title, truncated |
| photos | a strip of the first 6 selected thumbnails, `+4` if more |
| count | `10 / 20` against Etsy's cap |
| — | "Choose photos" opens the picker for that row |

### Row anatomy — Publish phase

Already close to this shape. Keep it, and add the character and tag counts so the
final review shows the same numbers the Titles phase did.

---

## Behaviour rules

**Expansion happens in place.** Clicking a row expands it downward into the
detailed editor — it does not navigate away or open a modal. Only one row expands
at a time. Collapsing returns you to the same scroll position.

**Editing is inline and autosaves on blur.** No Save button per row. The existing
"Saved automatically" indicator moves next to the forward action (see
`UX-DIRECTION.md` B6) so it is visible while editing.

**Sorting.** Default is upload order — sellers think in the order they made the
designs. Allow sorting by "needs attention" so problem rows come to the top.

**"Needs attention" is a real computed state**, not a vibe. A row needs attention
when any of these are true:
- title is empty
- title contains a phrase for a different product type (the koozie case)
- tag count is 0
- photo count is 0, or above Etsy's 20
- print quality is below the Printify recommendation
- Etsy details have 0 fields set

Show the count at the top of the table: **"3 of 20 listings need a look."** That
single line replaces the entire scroll-and-hope review that exists today.

**Bulk selection.** Checkbox per row plus a header checkbox. With rows selected,
a bar appears offering the actions that make sense for that phase — regenerate
titles, apply photos, set a category. This is what "Apply these photos to every
listing" should have been: a bulk action on an explicit selection, not a hidden
button under 148 thumbnails.

**Keyboard.** Tab moves between editable cells across rows. Enter commits and
moves down. This is the difference between twenty listings taking two minutes and
taking twenty.

---

## What this replaces

| Today | Becomes |
|---|---|
| Per-listing "Create a different title with AI" accordion | overflow menu → "Regenerate this one" |
| Per-listing "Build this title yourself from a keyword bank" | overflow menu → "Build from keyword bank" |
| Per-listing "Customize this listing's description · Same as batch" | overflow menu → "Custom description" |
| "Choose Printify flatlays (0 selected)" accordion, 148 checkboxes | row → "Choose photos", opens picker with the recommended set pre-ticked |
| "Apply these photos to every listing" buried below the grid | bulk action on selected rows |
| Scrolling 14 screens to find a bad title | "3 of 20 listings need a look" |

Nothing is removed. Every capability that exists today still exists — it moves
from "always visible, competing for attention" to "one click away, where you'd
look for it."

---

## Interaction with the pre-fill work

Build order matters. Rows without pre-fill is a table of empty inputs, which is
worse than cards — it makes the emptiness more obvious. Pre-fill without rows is
twenty correct cards you still can't scan.

**Recommended sequence:**
1. `B2` Etsy details pre-fill (smallest, proves the `Recipe` persistence pattern)
2. `B3` photos pre-fill
3. `B1a` + `B1` title edit-state and generate-on-arrival
4. **This spec** — rows, once every phase has something real to put in them
5. `B7` the transition message, which is only truthful after all of the above

---

## Edge cases

**Long titles in a narrow column.** Truncate with ellipsis at rest; expand to a
textarea on focus. Never wrap a 140-character title across three lines in a table
row — it destroys the scan.

**Row height must stay constant.** A row whose height changes based on content
defeats the purpose. Fix the row height and let content truncate.

**Failed rows.** A listing whose draft or generation failed shows in the table
with an error state and an inline retry — it must not be visually identical to an
empty row. This is the current failure mode where "N titles created, M need
retrying" appears above the list and you cannot tell which is which.

**Small screens.** The app is gated at 820px so there is no phone case, but at
900–1100px the table needs columns to drop in priority order: print quality
first, then photos, then tags. Title and thumbnail never drop.

**Twenty rows of thumbnails is twenty image loads.** Lazy-load below the fold.
The current photo grid already causes a browser crash at 444 images; do not
repeat that pattern.
