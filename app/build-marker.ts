/* D479 - three times now a fix has been described as live when it was still
   sitting on GitHub, and the only way to tell was to guess from behaviour or
   go hunting for a CSS class in the built stylesheet. This string is bumped
   with every deployable commit and served from /api/version, so "is my fix
   actually live" is one request with a yes or no answer. */
/* D868 removes the redundant autosave label from every workflow action bar. */
/* D1372 asks Etsy for one currency and records whether a listing is made to
   order, so the board can be read down and is about printing a design. */
/* D1373 names the missing field on a product that is not set up yet. */
/* D1374 converts the price column to USD here, because Etsy accepts the
   conversion parameter and ignores it. */
/* D1375 stops the board recommending somebody else's trademark. */
/* D1376 gives the trademark checker the real federal register, loaded from
   USPTO's bulk files a piece at a time. */
/* D1376 lets mastermind access be paused without deleting anyone's Printify
   connection. */
/* D1377 starts Goldie's own history: every look at a listing is a snapshot,
   every difference an event, and a shop sensor says where to look. */
/* D1378 inspects the shop that just sold something, explains what it can from
   listing evidence, and leaves the rest honestly unresolved. */
/* D1379 repairs the discovery insert, which had been throwing on every
   scheduled sweep since favourites were added to it. */
/* D1380 adopts the intervals that had no inspection job, and counts Etsy
   calls off the meter the whole application shares. */
/* D1381 enumerates every listing in every monitored shop, so a shop's sales
   stop being unexplainable by construction. */
/* D1382 polls the monitored listings directly every ten minutes, and uses the
   shop counter as corroboration and a cap rather than as a score. */
/* D1383 fixes the upsert SQLite would not parse, and takes the whole-shop
   backfill off the clock. */
/* D1384 sizes the sweep and its lock against what a full pass measured. */
/* D1385 lets a member watch a competitor's shop, resolved to one Etsy id and
   collected once however many members are watching it. */
/* D1386 asks for Etsy sales permission only when Shop Map needs it, and never
   drops a working connection to get it. */
/* D1387 stops the poller starving the twenty-minute queue, and gives each
   watched shop its own due time instead of refreshing all of them. */
/* D1388 stops one unreadable file blocking the whole register queue. */
/* D1389 parks every documentation file at once instead of one a firing. */
/* D1390 creates a new column's index after the column exists. */
/* D1391 gives Shop Map a link that asks Etsy for sales permission, and asks
   Printify which of its shops is the Etsy one. */
/* D1392 stops a wrong header being recorded as a refused permission. */
/* D1393 authorises sales access for one saved shop without moving the shop
   the Listing Factory publishes to. */
/* D1394 stops a sales authorisation falling into the add-a-shop path, where
   it moved the active shop and then blamed the member's Etsy account. */
/* D1395 reads the live connection schema so a missing shop can be explained
   with evidence instead of a guess. */
/* D1396 scopes the connection diagnostic to the account being diagnosed. */
/* D1397 retires an Etsy connection instead of deleting it, and records every
   removal so a missing shop never has to be explained by elimination again. */
/* D1398 proves the connection diagnostic's ownership filter by running it,
   not by reading it. */
/* D1399 matches a month of real Etsy sales to what they cost to make, in
   whole minor units, and refuses to call the result profit while anything is
   missing. */
/* D1400 finds the Etsy receipt id where Printify actually keeps it, nested
   in the order metadata, and matches on it exactly. */
/* D1401 stops the reconciliation mixing one cohort's revenue with another
   cohort's costs, and pages Printify to the start of the window. */
/* D1402 makes Goldie installable on a phone, with a bottom bar, safe-area
   spacing, and a Listing Factory that says it is a desktop tool. */
/* D1403 keeps the artwork a design was published with, so a sale two years
   from now still points at something real. */
/* D1404 gives Scan the centre of the mobile bar and names every moment worth
   capturing a design at. */
/* D1405 asks whether the image Etsy says a buyer saw is still there. */
/* D1406 makes artwork capture a durable job with retries and a visible
   failure state, accounts for every product, and keeps the original file. */
/* D1407 lets no successful publish leave the evidence pipeline, and links a
   captured design to its listing only on evidence that can carry a claim. */
/* D1408 stops a permanent capture failure becoming an endless retry, and
   links captured designs to listings only on evidence that carries a claim. */
/* D1409 asks Etsy what an image id actually means, on a draft of its own
   making that it deletes afterwards. */
/* D1410 makes the image-id test a download draft, so it needs nothing of the
   seller's shipping setup. */
/* D1411 deletes the test draft at the endpoint Etsy deletes from, and builds
   its own test images instead of fetching itself. */
/* D1412 refuses to create a test draft it would not be able to delete. */
/* D1413 measures image identity against a draft that already exists, creating
   and deleting nothing. */
/* D1414 lets the existing draft be measured without the creation gate. */
/* D1415 ranks captured print files against current listing mockups on free
   signals alone, so a paid vision pass only looks at what is worth looking at. */
/* D1572 gives the print-on-demand listing fields one definition, after the
   dry run was found answering "i_did" while the delivery path forced
   "someone_else" — two payload builders that never had to agree. */
/* D1573 claims an artwork before paying to analyze it, so two requests for
   one design cannot both be billed, and adds the second charge to the record
   instead of discarding it. Also stops the dry run implying a cache can warm
   up when nothing writes it. */
/* D1574 stops the register hammering an API that is rate limiting it, and
   makes a stalled queue say so instead of reporting "88 waiting" for two
   days while every firing was refused with a 429. */
/* D1575 puts Market Watch, Shop Map, Design Scanner and the Trademark Checker
   inside the product: the same rail, wordmark, navigation and footer as the
   Listing Factory, none of the factory's own batch controls, and no desktop
   gate on the features built for a phone. The rail's hand-maintained height
   budget is replaced by a pinned footer. */
/* D1576 makes the workflow's rail render the same navigation list as every
   other page, after the two rails drew apart for a third time and the Listing
   Factory showed four of Goldie's eight destinations. */
/* D1577 connects the layered flow to production: the design and family-copy
   layers now actually run, leased so two requests pay once, settled through
   the spend guard, with the family-copy table the plan had costed since it
   was written but which had never existed. */
/* D1578 adds an owner-only read of one of the member's own listing images, so
   the layered flow can be measured against real artwork rather than a
   synthetic swatch or somebody else's design. */
/* D1584 prices the two Listing Factory workloads from measured production
   calls. Both sat at a unitCost of 0, which meant their dollar ceilings could
   never stop anything: an unpriced workload is an uncapped one. */
/* D1585 stops "Gift for none" reaching a member's title. The first real
   seven-product run composed it into all seven: a cue that says it is empty
   is still a non-empty string, so the absence has to be spelled out. */
/* D1586 makes a Shop Watch card state its finding rather than a raw count.
   Every attention card read "9 of the last 496 reviews in this shop are for
   this listing" — true, and unusable without the denominator the selection
   rule had already computed. "3 new reviews since yesterday" is gone. */
/* D1587 makes what a card SAYS part of the brief's cache identity. D1586
   rewrote every Shop Watch card and deployed cleanly, and the live page kept
   showing the old sentences all day: only refreshed evidence invalidated a
   stored brief, never a change to the wording. */
/* D1588 takes the old product name out of the shared interface. The umbrella
   product has not been named, so the rail carries no wordmark, the footer
   names nothing, tab titles say what each page is, the manifest carries no
   name or icon, and the Listing Factory's wordmark appears only on the
   Listing Factory's own pages. Assets, storage keys, event names and the
   domain are untouched. */
/* D1591 puts the layered flow in the member's actual workflow. The route the
   Listing Factory calls twice per listing now branches on the canary: the
   design is analysed once per artwork and reused for both modes, the title
   stops being a paid call, and the category and attributes come from tables
   rather than a model looking at a picture. The legacy path stays for
   everybody else, which is what makes the flag a rollback. */
/* D1592 gives an artwork one identity. The member route hashed the image and
   the canary route used the stored provenance hash — same design, two cache
   keys, two paid analyses, and a "cold" run that made no call because the warm
   entry was under the other key. */
/* D1593 drops a model's refusal where the answer arrives rather than where it
   is printed. "Gift for none" was fixed in the title composer, which left the
   word "none" in stored design intelligence for the description, the tags and
   the bank ranking to use next. */
/* D1594 makes a confirmation request a window event instead of a module-level
   variable. Measured: the identical call opened a dialog on Batch History and
   silently returned false inside the Listing Factory workflow, so every
   guarded control there — including the only way out of a paused batch — was
   a button that did nothing. It fails closed and says so now. */
/* D1598 stops counting a failed draft object as a draft, and shows WHY a
   listing was not created instead of a bare Retry button. A refused attempt
   reported draft_count 1, which reads like a success and is what sent an
   audit hunting a Printify product that never existed. */
/* D1600 stops two simultaneous uploads of one design being billed twice. The
   scan route claimed its reservation fingerprint collapsed them into one job;
   measured, it made two paid calls and took two of ten daily scans for a
   single design. It leases the work now, like the Listing Factory does. */
/* D1602 measures contrast, tonal range, blur and emptiness from the pixels and
   lets those measurements decide whether Goldie may call a design readable or
   high contrast. A vision model had said both about a 7px-blurred design and a
   near-invisible one. An image-only design is now "unknown" on subject rather
   than off-subject. */
/* D1603 takes the old product name out of member-facing copy across the
   product — notices, errors, access states, connections, emails, the account
   footer. Code identifiers stay: a Stripe plan key, CSS class names, a
   User-Agent. The guard now detects the word used as PROSE rather than
   maintaining an allowlist of identifiers that kept needing new entries. */
/* D1604 gives the suite one active design system taken from the Listing
   Factory — its pink, its grid, its corners and depth — and points Market
   Watch, Design Scanner, the Trademark Checker and Shop Map at it. Market
   Watch had a private palette including a legacy gold; Shop Map's loading
   state was one sentence on white. */
/* D1606 stops the shared sign-in page calling itself the Listing Factory.
   It carried that wordmark and read "Sign in to your Listing Factory" for
   every member, whichever feature they were heading for — somebody bounced
   from Market Watch was told they were signing in to something else. */
/* D1608 redesigns Tools & settings. It was a page called "More" — a
   navigation label promoted to a hero heading over four oversized cards in a
   full-height black field with a decorative gear. It is compact grouped rows
   at the Listing Factory's own density now, on the same paper as every
   feature page, and it says what it holds. */
/* D1609 stops Connections telling a member their shop is disconnected while
   it is still looking. For about six seconds it showed "No Etsy shop
   connected yet" on an account publishing to that very shop: the empty state
   and the not-yet-asked state were the same screen. An empty state is a claim.
   Plan and limits, and two tab titles, fixed in the same pass. */
/* D1611 adds the owner-only state-preview harness: the shipping components
   rendered against fixtures with the network closed, so a state is inspected
   instead of waited for. And Tools & settings now explains itself when a
   member is redirected there for lacking access — it ignored ?needs=
   entirely, which is a door closing with no sign on it. */
/* D1616 fixes a false positive worse than the defect it replaced: contrast
   was read as the 5th against the 95th percentile of the whole image, so on a
   design whose ink covers a few per cent BOTH landed on the background and
   crisp black text on white measured 1.0:1 — the member was told good artwork
   could not be read. Ink against ground now, and sharpness measured on actual
   transitions in both directions. */
/* D1618 makes contrast and edge softness fail independently. A heavily
   blurred black-on-white design failed CONTRAST and passed SHARPNESS, so the
   member was told their tones were too close together when the real problem
   was softness — the ink was found by looking for one histogram bucket, and
   blur spreads a stroke across many. The ink is a population now. When both
   are wrong, both are said. */
/* D1619 completes the deletion path: scoped plan execution, an append-only
   audit opened before the first statement and closed after the last, idempotent
   retry, and per-step counts as evidence. Exercised against a seeded store and
   a disposable identity; the owner's own account is refused while the product
   is being finished. */
export const BUILD_MARKER = "D1705";
/* D1336's deployment artifacts are built only after the release commit exists,
   so every public version endpoint identifies the exact source it serves. */

/* D629 - and then it went stale for two deploys running, which is the exact
   failure D479 built it to prevent: D627 and D628 both shipped while this file
   still said D626, so /api/version answered D626 for code that was not D626.
   Verifying a deploy meant fetching the minified chunk and grepping it for a
   string literal.
   The cost is not only mine. NewBuildNotice compares this value against the
   server's to tell a seller her tab is behind - so every deploy where the bump
   is forgotten is a deploy where nobody working in an open tab is ever told to
   reload, which is D542 all over again.
   Vercel sets this on every build. It cannot be forgotten, because nobody types
   it. The hand-written marker stays as the readable label; the commit is the
   part that has to be right. Empty when the variable is absent, in which case
   the comparison falls back to the marker and behaves exactly as it did. */
/* D630 - D629 read VERCEL_GIT_COMMIT_SHA. This project builds with Vinext on
   Vite and deploys to Cloudflare; nothing sets that variable, so production
   answered {"build":"D629","commit":""} and the half of D629 meant to remove the
   human step did nothing at all. The build resolves the commit now - git first,
   CI variables after - and Vite inlines it here. Read through `typeof` so a
   context without the define gets "" instead of a ReferenceError, which is the
   same empty string D629 already degrades safely from. */
export const BUILD_COMMIT: string =
  typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : (process.env.VERCEL_GIT_COMMIT_SHA ?? "");
