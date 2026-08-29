# How to work in this repo

Read this before touching anything. It exists because the same four mistakes have
been made repeatedly, each one caught by Brittany rather than by me, and each one
costing her a round trip she should not have had to spend.

Every rule below is written from a real incident in this repo. They are not
general good practice; they are the specific ways this codebase has been broken.

---

## 1. Print the value before building on it

**The rule: if a fix depends on what a field contains, print that field first.**

Every long debugging chain here started by assuming a value instead of reading it.

- D697/D701/D704 — three commits and three wrong answers because `draft.batchId`
  was assumed to be the batch that owns the draft. It is the batch the draft was
  FIRST created in. Both products carried `3c6ac387`, neither of the two current
  batch ids. One `console.log` on day one would have replaced all three commits.
- D686/D693 — `setup_name` was assumed to hold the name the seller typed. It holds
  whichever recipe was active at one autosave. "Gildan Hoodie" on a sweatshirt.
- D655/D657 — caching was assumed to work for two commits. Its own counter said
  `catalogFetches: 4` and `cache: miss` on six identical requests.

## 2. Fix the rule, not the instance

**The rule: before adding a CSS override, find what is currently winning and
change that.**

- D679/D680/D681 — three deploys failed to close one 66px gap by adjusting
  margins. The cause was a grid row sized by a sibling in another column. No
  margin on a grid item can shrink that row.
- D692 — a heading stayed serif through a targeted override because
  `.app-shell .workflow-stage h3` carries `!important` and governs every card
  title in the app. Fixing headings one at a time could never finish.
- D695/D696 — a rule added to "align" two cards was itself the misalignment.
  Every child already matched; `margin-top:auto` introduced the 22px difference.

Corollary: a selector that loses is not a fix. Verify the computed value changed.

## 3. One sweep, one batch, one deploy

**The rule: after a deploy, verify everything before fixing anything.**

Verifying and immediately fixing the first defect found is what produces
one-line deploys. D691 was a proper sweep — eight panels, six defects, one
commit. D690, D692 and D692b immediately after were one fix each, and D692's
own verification already showed the finding that became D692b.

Do not ask for a deploy for a single small fix. Hold it.

## 4. Look at it. Screenshots, not measurements

**The rule: any change to something visible ends with looking at the rendered
result.**

- Mockup placement was verified by counting generated files. The placement was
  badly wrong. Her words: "why would you not look at them first of all?"
- D694 added a listing name that the card already displayed, printing it twice.
  The measurement said one name because it queried one class; the screenshot
  showed two.
- Tiles reported as loaded looked blank on screen: 104px white garments on a
  white tile.

## 5. Move a test's intent, never loosen it

Tests here encode defects that reached her. When markup moves, rewrite the
assertion against the new structure and keep the reason in the comment. If a
guard no longer applies, say why in the commit.

D150 protected a button being readable rather than 9px. The button still exists,
renamed. Deleting that guard as "dead" would have dropped a live protection.

## 6. Correctness must not depend on a migration having run

D697 shipped a count that required a backfill to have populated. It did not.
Every published batch read zero, and Batch History offered "Resume" on listings
that were already live on Etsy. Write the query so it is correct either way.

---

## Deploying

Brittany does not run builds. Every response that produces code ends with a
clearly separated block naming the exact commit to build and deploy, and any
migration it needs. Do not bury it in prose.

Prototype visual changes by injecting CSS or editing the DOM in her live page so
she can approve them before they are written to source. Do not create preview
branches or preview URLs.

## 7. End every response with ONE line for ChatGPT.

A single section, a single line, at the very bottom. Not a paragraph, not a
checklist, not a block she has to read to find out there is nothing in it.

She has asked for this more times than any other instruction in this file, which
means the cost is not the formatting - it is that she has to ask again.

  Nothing to do:  🚀 CHATGPT: Nothing to do — <sha> pushed, Vercel building.
  Something to do: 🚀 CHATGPT: <the one action>.
