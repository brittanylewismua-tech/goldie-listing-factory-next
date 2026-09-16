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
export const BUILD_MARKER = "D1588";
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
