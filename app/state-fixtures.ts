/**
 * CONTROLLED STATES FOR THE REAL COMPONENTS.
 *
 * Every feature has a dozen states a member can land in — no entitlement,
 * expired, disconnected, rate limited, provider down, stale, empty — and until
 * now each one was verified, if at all, by waiting for it to happen or by
 * reading the code and hoping. That is why the same class of defect kept
 * surfacing one page at a time: Connections claiming a shop was disconnected
 * while it was still looking, four separate pages using a sentence as their
 * whole loading state.
 *
 * THIS DOES NOT DUPLICATE ANY MARKUP. The preview mounts the real production
 * component and answers its network calls from the table below, so what is on
 * screen is the shipping interface, not a mock of it.
 *
 * READ-ONLY BY CONSTRUCTION. The interceptor that consumes this refuses any
 * request the table does not answer, so a preview cannot reach Etsy, Printify,
 * Stripe or a provider even by accident, and cannot write anything anywhere.
 *
 * Pure data, so the table is testable without a browser.
 */
export type FixtureReply = {
  /* Matched against the start of the request path. */
  path: string;
  /*
    AND OPTIONALLY THE METHOD.

    Without this, one path could only have one answer. So a fixture for "the
    niche you tried to add was refused" — a 400 on POST /api/market-watch/niches
    — also answered the GET that loads the saved list, and the preview showed
    "your saved niches could not be loaded" instead of the refusal it was
    built to show. A write state could not be previewed at all without
    breaking the read beside it.

    Omitted means any method, which is what every existing fixture wants.
  */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  status: number;
  body: unknown;
  /* Milliseconds before answering, for watching a loading state on purpose. */
  delayMs?: number;
};

export type StateFixture = {
  key: string;
  label: string;
  /* Which component the preview should mount. */
  surface: "connections" | "market-watch" | "design-scanner" | "shop-map" | "account"
    | "batches" | "listing-factory";
  /*
    Which sub-view of that surface the state lives in. Two shop fixtures
    rendered Market Watch's niche tab and were called verified: the state they
    described was one click away and nobody had made the click.
  */
  at?: string;
  what: string;
  replies: FixtureReply[];
};

/*
  TIMESTAMPS ARE COMPUTED WHEN THE PREVIEW RUNS, NOT WHEN IT IS BUILT.

  A first version called `Date.now()` at module scope. The resulting number was
  frozen into the client bundle — so "an hour ago" meant an hour before the
  deploy, drifting further from the truth every day, and one of those baked
  digits tripped an unrelated guard that scans the homepage payload for prices.
*/
const secondsAgo = (seconds: number) => Math.floor(Date.now() / 1000) - seconds;

const etsyConnected = (): FixtureReply => ({
  path: "/api/shop-map/connections", status: 200,
  body: { connections: [{ shopId: 16538900, shopName: "a-connected-shop",
    activeForListingFactory: true, canReadSales: true, needsReconnect: false,
    lastSyncAt: secondsAgo(3600), authorizeSalesUrl: "" }] },
});
const printifyConnected = (): FixtureReply => ({
  path: "/api/connections/printify", status: 200,
  body: { connected: true, shopId: 1, shopName: "", lastSyncAt: secondsAgo(7200) },
});

export const stateFixtures = (): StateFixture[] => [
  /* ---------------------------------------------------------- connections */
  { key: "connections-loading", label: "Loading", surface: "connections",
    what: "Both endpoints slow. The page must not claim anything yet.",
    replies: [{ ...etsyConnected(), delayMs: 60_000 }, { ...printifyConnected(), delayMs: 60_000 }] },

  { key: "connections-etsy-disconnected", label: "Etsy disconnected", surface: "connections",
    what: "No Etsy shop. The empty state is the truth here, not a guess.",
    replies: [{ path: "/api/shop-map/connections", status: 200, body: { connections: [] } },
      printifyConnected()] },

  { key: "connections-printify-disconnected", label: "Printify disconnected", surface: "connections",
    what: "Etsy fine, Printify gone — the Listing Factory cannot build without it.",
    replies: [etsyConnected(),
      { path: "/api/connections/printify", status: 200, body: { connected: false } }] },

  { key: "connections-both-disconnected", label: "Both disconnected", surface: "connections",
    what: "A brand new account, or one that revoked everything.",
    replies: [{ path: "/api/shop-map/connections", status: 200, body: { connections: [] } },
      { path: "/api/connections/printify", status: 200, body: { connected: false } }] },

  { key: "connections-needs-reconnect", label: "Etsy access lapsed", surface: "connections",
    what: "The token expired. Reconnecting must not look like connecting for the first time.",
    replies: [{ path: "/api/shop-map/connections", status: 200,
      body: { connections: [{ shopId: 1, shopName: "a-connected-shop",
        activeForListingFactory: true, canReadSales: false, needsReconnect: true,
        lastSyncAt: secondsAgo(400_000), authorizeSalesUrl: "" }] } },
      printifyConnected()] },

  { key: "connections-api-error", label: "API failure", surface: "connections",
    what: "Both endpoints fail. The member must be told nothing changed.",
    replies: [{ path: "/api/shop-map/connections", status: 500, body: { error: "upstream" } },
      { path: "/api/connections/printify", status: 500, body: { error: "upstream" } }] },

  /* --------------------------------------------------------- market watch

     THESE TWO POINTED AT A PATH THE PAGE NEVER CALLS.

     Both named `/api/market/shop-watch`, the worker's refresh route. The
     client calls `/api/shop-watch/brief`. The interceptor refuses anything
     unfixtured, so the shops request threw on every preview — and the page
     swallowed it into an empty list, which is exactly the defect these
     fixtures exist to catch. A fixture aimed at the wrong door proves
     nothing, twice over.
  */
  { key: "market-watch-loading", label: "Loading", surface: "market-watch",
    what: "Nothing may claim the member has no watches while the answer is still in flight.",
    replies: [
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] }, delayMs: 60_000 },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] }, delayMs: 60_000 },
      { path: "/api/market-watch/update", status: 200, body: { lines: [] }, delayMs: 60_000 }] },

  { key: "market-watch-empty", label: "Nothing watched", surface: "market-watch",
    what: "A member who has not started. The page has to invite, not apologise.",
    replies: [{ path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 200,
        body: { lines: [], message: null } }] },

  { key: "market-watch-saved", label: "Saved niches", surface: "market-watch",
    what: "The ordinary loaded state: watches with evidence, and today's lines.",
    replies: [
      { path: "/api/market-watch/niches", status: 200, body: { watches: [
        { key: "bachelorette", phrase: "bachelorette", moving: 14, repeated: 5, shops: 9,
          lastCheckedAt: secondsAgo(5_400), stale: false },
        { key: "dog-mom", phrase: "dog mom", moving: 6, repeated: 2, shops: 4,
          lastCheckedAt: secondsAgo(9_000), stale: false }] } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [
        "3 listings in bachelorette moved again today.",
        "dog mom has 1 new shop showing repeated movement."], message: null } }] },

  { key: "market-watch-stale", label: "Refresh failed (stale reading)", surface: "market-watch",
    what: "Today's update could not be built. The last confirmed reading is labelled, not hidden.",
    replies: [
      { path: "/api/market-watch/niches", status: 200, body: { watches: [
        { key: "bachelorette", phrase: "bachelorette", moving: 14, repeated: 5, shops: 9,
          lastCheckedAt: secondsAgo(190_000), stale: true }] } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 500, body: { error: "upstream" } }] },

  { key: "market-watch-shop-patterns", label: "Shop Watch patterns", surface: "market-watch", at: "shops",
    what: "A shop brief with a finding, its reasoning and its evidence — not a bare count.",
    replies: [
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [], message: null } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [{
        shopId: 4471, shopName: "a-watched-shop", etsy: "https://www.etsy.com/shop/a-watched-shop",
        gettingAttention: [{ pattern: "One listing is drawing most of this shop's recent reviews.",
          because: "9 of the last 496 reviews are for it, where an average listing here draws 2.",
          evidence: "9 reviews", window: "last 30 days",
          listing: { id: 1234567890, url: "https://www.etsy.com/listing/1234567890" } }],
        whatBuyersLove: [{ pattern: "Buyers repeatedly mention the print quality.",
          because: "Named in 31 of 44 five-star reviews, more than any other subject.",
          evidence: "31 reviews", window: "last 90 days", listing: { id: null, url: "" } }],
        whatBuyersDislike: [], whatChanged: [] }] } }] },

  { key: "market-watch-shop-empty", label: "Shop watched, nothing confirmed", surface: "market-watch", at: "shops",
    what: "A shop is followed but has no confirmed pattern. Silence has to be explained.",
    replies: [
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [], message: null } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [{
        shopId: 4471, shopName: "a-quiet-shop", etsy: "", gettingAttention: [],
        whatBuyersLove: [], whatBuyersDislike: [], whatChanged: [] }] } }] },

  { key: "market-watch-niche-evidence", label: "Niche detail — evidence", surface: "market-watch",
    what: "Open 'bachelorette'. Listings are the subject, each with what confirmed it and when.",
    replies: [
      { path: "/api/market-watch/niches?key=", status: 200, body: {
        key: "bachelorette", phrase: "bachelorette",
        summary: { meaningfulMomentum: true, moving: 14, repeated: 5,
          newSinceLastBrief: 3, shops: 9 },
        window: "last 14 days",
        visualPatterns: ["Script lettering on a plain ground.",
          "The date set below the name, much smaller."],
        listings: [
          { listingId: 1234567890, title: "Bachelorette Party Shirt · Custom Name",
            imageUrl: "", etsyUrl: "https://www.etsy.com/listing/1234567890",
            state: "moving", label: "Moving", confirmedAt: secondsAgo(4_200),
            reviewsOnThisListing: 3, displayFresh: false },
          { listingId: 1234567891, title: "Last Disco Bachelorette Tee",
            imageUrl: "", etsyUrl: "https://www.etsy.com/listing/1234567891",
            state: "repeated", label: "Moving again", confirmedAt: secondsAgo(90_000),
            reviewsOnThisListing: 0, displayFresh: false }] } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [
        { key: "bachelorette", phrase: "bachelorette", moving: 14, repeated: 5, shops: 9,
          lastCheckedAt: secondsAgo(4_200), stale: false }] } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [], message: null } }] },

  { key: "market-watch-niche-gathering", label: "Niche detail — still gathering", surface: "market-watch",
    what: "Watched, nothing confirmed yet. Silence is explained and counted, not left blank.",
    replies: [
      { path: "/api/market-watch/niches?key=", status: 200, body: {
        key: "dog-mom", phrase: "dog mom", listings: [],
        gathering: "Market Watch has not confirmed movement in this niche yet.",
        candidates: { watching: 412, shops: 37 } } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [
        { key: "dog-mom", phrase: "dog mom", moving: 0, repeated: 0, shops: 0,
          lastCheckedAt: secondsAgo(3_000), stale: false }] } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [], message: null } }] },

  { key: "market-watch-niche-stale", label: "Niche detail — refresh failed", surface: "market-watch",
    what: "Today's refresh failed. The last confirmed reading is shown and labelled as old.",
    replies: [
      { path: "/api/market-watch/niches?key=", status: 200, body: {
        key: "bachelorette", phrase: "bachelorette", stale: true, listings: [],
        summary: { meaningfulMomentum: true, moving: 11, repeated: 4,
          newSinceLastBrief: 0, shops: 7 },
        lastCheckedAt: secondsAgo(190_000) } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [
        { key: "bachelorette", phrase: "bachelorette", moving: 11, repeated: 4, shops: 7,
          lastCheckedAt: secondsAgo(190_000), stale: true }] } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [], message: null } }] },

  { key: "market-watch-niche-failed", label: "Niche detail — could not open", surface: "market-watch",
    what: "The evidence read failed outright. The saved list must stay intact behind it.",
    replies: [
      { path: "/api/market-watch/niches?key=", status: 500, body: { error: "upstream" } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [
        { key: "bachelorette", phrase: "bachelorette", moving: 14, repeated: 5, shops: 9,
          lastCheckedAt: secondsAgo(4_200), stale: false }] } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [], message: null } }] },

  { key: "market-watch-unsupported", label: "Niche refused", surface: "market-watch",
    what: "A phrase with nothing to search on. The refusal says what is wrong with it.",
    replies: [
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
      { path: "/api/market-watch/niches", method: "POST", status: 400,
        body: { error: "That niche needs at least one meaningful word." } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [], message: null } }] },

  { key: "market-watch-at-limit", label: "Watch limit reached", surface: "market-watch",
    what: "The cap is a standing limit with a way out, not a dead end.",
    replies: [
      { path: "/api/market-watch/niches", status: 200, body: { watches: [
        { key: "bachelorette", phrase: "bachelorette", moving: 14, repeated: 5, shops: 9,
          lastCheckedAt: secondsAgo(5_400), stale: false }] } },
      { path: "/api/market-watch/niches", method: "POST", status: 400,
        body: { error: "You can watch 10 niches at once. Remove one to add another." } },
      { path: "/api/shop-watch/brief", status: 200, body: { shops: [] } },
      { path: "/api/market-watch/update", status: 200, body: { lines: [], message: null } }] },

  { key: "market-watch-api-error", label: "API failure", surface: "market-watch",
    what: "Evidence unavailable. Must not read as 'nothing is moving' or 'you watch nothing'.",
    replies: [{ path: "/api/market-watch/niches", status: 500, body: { error: "upstream" } },
      { path: "/api/shop-watch/brief", status: 500, body: { error: "upstream" } },
      { path: "/api/market-watch/update", status: 500, body: { error: "upstream" } }] },

  /* ------------------------------------------------------- design scanner */
  { key: "scanner-quality-faint", label: "Readability — faint only", surface: "design-scanner",
    what: "Low contrast, crisp edges. ONE note, about contrast. Nothing about blur.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 200,
        /* The same result in the saved list, so the state is reachable the
           way a member reaches it — by reopening a scan — rather than only
           by uploading a file the preview cannot supply. */
        body: { scansLeftToday: 6, scans: [{ id: "q-faint", niche: "bachelorette",
          artworkHash: "a1-preview", createdAt: secondsAgo(7_200),
          result: {
          ok: true, niche: "bachelorette", overall: "Partial visual-pattern alignment",
          scansLeftToday: 6, warm: false, trademark: null,
          imageQuality: { contrast: "fail", sharpness: "pass", thumbnailReadable: "fail",
            notes: ["The design's light and dark areas are too close together to read "
              + "easily (measured 2.1:1; around 4.5:1 is where text stays comfortable)."] },
          working: ["Script lettering, which most of the moving listings use."],
          opportunity: "The moving listings set the date much smaller than the name.",
          evidence: "Compared with 23 listings confirmed moving in the last 14 days." } }] } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
      { path: "/api/design-scanner/scan", method: "POST", status: 200, body: {
        ok: true, niche: "bachelorette", overall: "Partial visual-pattern alignment",
        scansLeftToday: 6, warm: false, trademark: null,
        imageQuality: { contrast: "fail", sharpness: "pass", thumbnailReadable: "fail",
          notes: ["The design's light and dark areas are too close together to read "
            + "easily (measured 2.1:1; around 4.5:1 is where text stays comfortable)."] },
        working: ["Script lettering, which most of the moving listings use."],
        opportunity: "The moving listings set the date much smaller than the name.",
        evidence: "Compared with 23 listings confirmed moving in the last 14 days." } }] },

  { key: "scanner-quality-soft", label: "Readability — soft edges only", surface: "design-scanner",
    what: "Strong contrast, soft edges. ONE note, about softness. Nothing about contrast.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 200,
        /* The same result in the saved list, so the state is reachable the
           way a member reaches it — by reopening a scan — rather than only
           by uploading a file the preview cannot supply. */
        body: { scansLeftToday: 6, scans: [{ id: "q-soft", niche: "dog mom",
          artworkHash: "a1-preview", createdAt: secondsAgo(7_200),
          result: {
          ok: true, niche: "dog mom", overall: "Strong visual-pattern alignment",
          scansLeftToday: 6, warm: false, trademark: null,
          imageQuality: { contrast: "pass", sharpness: "fail", thumbnailReadable: "pass",
            notes: ["The edges in this design are soft. At the size buyers first see it, "
              + "that reads as a blurry picture rather than a soft style."] },
          working: ["Heavy slab lettering, like the listings that keep moving."],
          opportunity: "Most moving listings put the animal above the words, not beside them.",
          evidence: "Compared with 31 listings confirmed moving in the last 14 days." } }] } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
      { path: "/api/design-scanner/scan", method: "POST", status: 200, body: {
        ok: true, niche: "dog mom", overall: "Strong visual-pattern alignment",
        scansLeftToday: 6, warm: false, trademark: null,
        imageQuality: { contrast: "pass", sharpness: "fail", thumbnailReadable: "pass",
          notes: ["The edges in this design are soft. At the size buyers first see it, "
            + "that reads as a blurry picture rather than a soft style."] },
        working: ["Heavy slab lettering, like the listings that keep moving."],
        opportunity: "Most moving listings put the animal above the words, not beside them.",
        evidence: "Compared with 31 listings confirmed moving in the last 14 days." } }] },

  { key: "scanner-quality-both", label: "Readability — faint AND soft", surface: "design-scanner",
    what: "Both measurements fail. BOTH notes appear. Neither is written as the cause of the other.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 200,
        /* The same result in the saved list, so the state is reachable the
           way a member reaches it — by reopening a scan — rather than only
           by uploading a file the preview cannot supply. */
        body: { scansLeftToday: 6, scans: [{ id: "q-both", niche: "teacher",
          artworkHash: "a1-preview", createdAt: secondsAgo(7_200),
          result: {
          ok: true, niche: "teacher", overall: "Partial visual-pattern alignment",
          scansLeftToday: 6, warm: false, trademark: null,
          imageQuality: { contrast: "fail", sharpness: "fail", thumbnailReadable: "fail",
            notes: ["The design's light and dark areas are too close together to read "
              + "easily (measured 1.8:1; around 4.5:1 is where text stays comfortable).",
              "The edges in this design are soft. At the size buyers first see it, "
              + "that reads as a blurry picture rather than a soft style."] },
          working: [], opportunity: "",
          evidence: "Compared with 18 listings confirmed moving in the last 14 days." } }] } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
      { path: "/api/design-scanner/scan", method: "POST", status: 200, body: {
        ok: true, niche: "teacher", overall: "Partial visual-pattern alignment",
        scansLeftToday: 6, warm: false, trademark: null,
        imageQuality: { contrast: "fail", sharpness: "fail", thumbnailReadable: "fail",
          notes: ["The design's light and dark areas are too close together to read "
            + "easily (measured 1.8:1; around 4.5:1 is where text stays comfortable).",
            "The edges in this design are soft. At the size buyers first see it, "
            + "that reads as a blurry picture rather than a soft style."] },
        working: [], opportunity: "",
        evidence: "Compared with 18 listings confirmed moving in the last 14 days." } }] },

  { key: "scanner-quality-empty", label: "Readability — near-empty artwork", surface: "design-scanner",
    what: "Almost nothing on the canvas. Said plainly rather than measured into a verdict.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 200,
        /* The same result in the saved list, so the state is reachable the
           way a member reaches it — by reopening a scan — rather than only
           by uploading a file the preview cannot supply. */
        body: { scansLeftToday: 6, scans: [{ id: "q-empty", niche: "teacher",
          artworkHash: "a1-preview", createdAt: secondsAgo(7_200),
          result: {
          ok: false, niche: "teacher", overall: "Not enough verified evidence",
          scansLeftToday: 6, warm: false, trademark: null,
          refusal: { kind: "thin-cohort",
            because: "Only 4 listings in this niche have confirmed movement, which is "
              + "too few to compare against." },
          imageQuality: { contrast: "fail", sharpness: "unverified", thumbnailReadable: "fail",
            emptiness: "fail",
            notes: ["This design is empty or almost empty."] } } }] } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
      { path: "/api/design-scanner/scan", method: "POST", status: 200, body: {
        ok: false, niche: "teacher", overall: "Not enough verified evidence",
        scansLeftToday: 6, warm: false, trademark: null,
        refusal: { kind: "thin-cohort",
          because: "Only 4 listings in this niche have confirmed movement, which is "
            + "too few to compare against." },
        imageQuality: { contrast: "fail", sharpness: "unverified", thumbnailReadable: "fail",
          emptiness: "fail",
          notes: ["This design is empty or almost empty."] } } }] },

  { key: "scanner-first-use", label: "First use", surface: "design-scanner",
    what: "No design chosen and no saved scans. The page invites rather than looking broken.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 200,
        body: { scans: [], scansLeftToday: 7 } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },
    ] },

  { key: "scanner-history-failed", label: "Saved scans failed to load", surface: "design-scanner",
    what: "History unavailable. Must not read as a member who has never scanned.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 500, body: { error: "upstream" } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } }] },

  { key: "scanner-daily-limit", label: "Daily limit reached", surface: "design-scanner",
    what: "The allowance is spent. Saved results stay open and reopening is free.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 200,
        body: { scans: [], scansLeftToday: 7 } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },{ path: "/api/design-scanner/scan", method: "POST", status: 429,
      body: { error: "You have used all 10 scans for today. One becomes available again "
        + "in about 6 hours. Your saved results stay open and reopening them is free.",
        limited: true } }] },

  { key: "scanner-provider-error", label: "Provider failure", surface: "design-scanner",
    what: "The model failed. Nothing counted against the allowance.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 200,
        body: { scans: [], scansLeftToday: 7 } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },{ path: "/api/design-scanner/scan", method: "POST", status: 502,
      body: { error: "That scan did not complete. It has not been counted against your daily scans." } }] },

  { key: "scanner-global-ceiling", label: "Global ceiling reached", surface: "design-scanner",
    what: "Capacity, not the member's own use. Must not read as their fault.",
    replies: [
      { path: "/api/design-scanner/scan", method: "GET", status: 200,
        body: { scans: [], scansLeftToday: 7 } },
      { path: "/api/market-watch/niches", status: 200, body: { watches: [] } },{ path: "/api/design-scanner/scan", method: "POST", status: 429,
      body: { error: "Analysis capacity is temporarily full. Your design is saved — try again a little later.",
        limited: true } }] },

  /* --------------------------------------------------------------- account */
  { key: "account-delete-refused", label: "Deletion refused (wrong phrase)", surface: "account",
    what: "The server refuses and says nothing was changed.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: { scans: 3, nicheWatches: 1 }, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" } } },
      { path: "/api/account/delete", status: 400,
        body: { error: "Type DELETE MY DATA exactly to confirm." } }] },

  { key: "account-delete-stale-auth", label: "Deletion refused (stale sign-in)", surface: "account",
    what: "Recent authentication is required. The member is told why, not just no.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: { scans: 3 }, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" } } },
      { path: "/api/account/delete", status: 400,
        body: { error: "Sign in again before deleting your data. This is deliberate: it "
          + "means somebody using your open laptop cannot do this." } }] },

  { key: "account-deleted", label: "Deletion complete", surface: "account",
    what: "Counts as evidence, not a reassurance, and a way to finish.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: { scans: 27, nicheWatches: 7 }, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" } } },
      { path: "/api/account/delete", status: 200,
        body: { deleted: true, alreadyDone: false,
          say: "Your data has been removed and your connections switched off.",
          complete: true, resumed: false,
          removed: [
            { say: "Your design scans and their results.", changed: 27 },
            { say: "The niches you were watching.", changed: 7 },
            { say: "The print files you uploaded.", changed: 112 },
            { say: "Your Etsy connection is switched off and its access keys destroyed.",
              changed: 1 }],
          incomplete: [],
          kept: ["Your billing record with the payment processor.",
            "The record of which plan you held."] } }] },

  { key: "account-delete-partial", label: "Deletion partly failed", surface: "account",
    what: "Forty-odd steps, one of which could not run. The member is told which, not reassured.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: { scans: 27, nicheWatches: 7 }, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" } } },
      { path: "/api/account/delete", status: 200,
        body: { deleted: true, alreadyDone: false,
          say: "Most of your data has been removed and your connections switched off. "
            + "Some of it could not be removed and is listed below — it has been "
            + "recorded, and asking again will finish it.",
          removed: [
            { say: "Your design scans and their results.", changed: 27 },
            { say: "The niches you were watching.", changed: 7 },
            { say: "The print files you uploaded.", changed: 112 }],
          complete: false, resumed: false,
          incomplete: [{ say: "Your mockup templates." }],
          kept: ["Your billing record with the payment processor.",
            "The record of what you subscribed to and when."] } }] },

  { key: "account-delete-resumed", label: "Deletion resumed and finished", surface: "account",
    what: "A second attempt picks up only what failed and finishes. Nothing is repeated.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: {}, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" } } },
      { path: "/api/account/delete", status: 200,
        body: { deleted: true, alreadyDone: false, complete: true, resumed: true,
          say: "Your data has been removed and your connections switched off.",
          removed: [{ say: "Your mockup templates.", changed: 14 }],
          incomplete: [],
          kept: ["Your billing record with the payment processor."] } }] },

  { key: "account-delete-already", label: "Deletion already done", surface: "account",
    what: "A retry reports the same completion and runs nothing.",
    replies: [
      { path: "/api/account/data", status: 200, body: { yours: {}, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" } } },
      { path: "/api/account/delete", status: 200,
        body: { deleted: true, alreadyDone: true, removed: [],
          say: "This account's data was already removed. Nothing further was changed." } }] },

  { key: "account-payment-overdue", label: "Payment overdue", surface: "account",
    what: "A failed card. Said in words, never as Stripe's own status identifier.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: { scans: 12, nicheWatches: 3 }, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" },
        billing: { active: false, subscription: { status: "past_due",
          currentPeriodEnd: secondsAgo(-86_400 * 4), cancelAtPeriodEnd: 0 },
          terms: { amount: 2900, currency: "usd", interval: "month" } } } }] },

  { key: "account-in-trial", label: "In trial", surface: "account",
    what: "A trial is not 'trialing'. Access and subscription are different questions.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: { scans: 2 }, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" },
        billing: { active: true, subscription: { status: "trialing",
          currentPeriodEnd: secondsAgo(-86_400 * 11), cancelAtPeriodEnd: 0 },
          terms: { amount: 2900, currency: "usd", interval: "month" } } } }] },

  { key: "account-access-ended", label: "Access ended", surface: "account",
    what: "Subscription over and access with it. The member's saved work is untouched.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: { scans: 41, nicheWatches: 6 }, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "No active plan" },
        billing: { active: false, subscription: { status: "canceled",
          currentPeriodEnd: secondsAgo(86_400 * 3), cancelAtPeriodEnd: 1 },
          terms: { amount: 2900, currency: "usd", interval: "month" } } } }] },

  { key: "account-usage-failed", label: "Plan could not be read", surface: "account",
    what: "Billing unavailable. Must not read as 'you have no plan'.",
    replies: [
      { path: "/api/account/data", status: 200,
        body: { yours: { scans: 12 }, kept: [], note: "" } },
      { path: "/api/usage", status: 500, body: { error: "upstream" } }] },


  /* --------------------------------------------------------------- batches */
  /* The shell these live in loads its own allowance, preferences, account and
     Etsy shops on mount. Leaving them unfixtured meant the sidebar sat on
     "Loading usage…" in every batches preview — which is how D1659 was
     found, but it also made the refusal panel the only thing reporting it,
     and that panel was dropping early refusals. */
  { key: "batches-loading", label: "Loading", surface: "batches",
    what: "Saved work takes a moment to read. Nothing may claim there is none.",
    replies: [
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/account", status: 200, body: { signedIn: true, name: "Preview",
        initials: "PV" } },
      { path: "/api/etsy", status: 200, body: { connected: true, shops: [] } },
{ path: "/api/batches", status: 200, body: { batches: [] }, delayMs: 60_000 }] },

  { key: "batches-empty", label: "No saved batches", surface: "batches",
    what: "A member who has not built anything yet.",
    replies: [
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/account", status: 200, body: { signedIn: true, name: "Preview",
        initials: "PV" } },
      { path: "/api/etsy", status: 200, body: { connected: true, shops: [] } },
{ path: "/api/batches", status: 200,
      body: { batches: [], prepared: [], preparedAvailable: true } }] },

  { key: "batches-saved", label: "Saved batches", surface: "batches",
    what: "The ordinary list: finished work, and one still running.",
    replies: [
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/account", status: 200, body: { signedIn: true, name: "Preview",
        initials: "PV" } },
      { path: "/api/etsy", status: 200, body: { connected: true, shops: [] } },
{ path: "/api/batches", status: 200, body: { prepared: [],
      preparedAvailable: true, batches: [
        { id: "b-1", status: "complete", step: "results", setup_name: "Bachelorette set", product_title: "Bachelorette Party Shirt", design_count: 6, created_at: "2026-09-16 14:02:11", updated_at: "2026-09-17 09:14:02", display_name: "Bachelorette Party Shirt", thumbnail_url: "", published_count: 0, draft_count: 6, expected_listing_count: 6 },
        { id: "b-2", status: "processing", step: "creating", setup_name: "Bachelorette set", product_title: "Dog Mom Tee", design_count: 6, created_at: "2026-09-16 14:02:11", updated_at: "2026-09-17 09:14:02", display_name: "Dog Mom Tee", thumbnail_url: "", published_count: 0, draft_count: 2, expected_listing_count: 6 },
        { id: "b-3", status: "draft", step: "artwork", setup_name: "Bachelorette set", product_title: "Teacher Mug", design_count: 6, created_at: "2026-09-16 14:02:11", updated_at: "2026-09-17 09:14:02", display_name: "Teacher Mug", thumbnail_url: "", published_count: 0 }] } }] },

  { key: "batches-remove-uncertain", label: "Removal not confirmed", surface: "batches",
    what: "A delete whose outcome is unknown. It must not report success it cannot prove.",
    replies: [
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/account", status: 200, body: { signedIn: true, name: "Preview",
        initials: "PV" } },
      { path: "/api/etsy", status: 200, body: { connected: true, shops: [] } },

      { path: "/api/batches", method: "DELETE", status: 500,
        body: { error: "That could not be confirmed." } },
      { path: "/api/batches", status: 200, body: { prepared: [], preparedAvailable: true,
        batches: [{ id: "b-1", status: "complete", step: "results", setup_name: "Bachelorette set", product_title: "Bachelorette Party Shirt", design_count: 6, created_at: "2026-09-16 14:02:11", updated_at: "2026-09-17 09:14:02", display_name: "Bachelorette Party Shirt", thumbnail_url: "", published_count: 0 }] } }] },

  { key: "batches-signed-out", label: "Signed out", surface: "batches",
    what: "A 401 on saved work is not an empty history.",
    replies: [
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/account", status: 200, body: { signedIn: true, name: "Preview",
        initials: "PV" } },
      { path: "/api/etsy", status: 200, body: { connected: true, shops: [] } },
{ path: "/api/batches", status: 401, body: { error: "Sign in." } }] },

  { key: "batches-load-failed", label: "History could not be read", surface: "batches",
    what: "Must not read as a member who has built nothing.",
    replies: [
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/account", status: 200, body: { signedIn: true, name: "Preview",
        initials: "PV" } },
      { path: "/api/etsy", status: 200, body: { connected: true, shops: [] } },
{ path: "/api/batches", status: 500, body: { error: "upstream" } }] },

  { key: "batches-count-unavailable", label: "Listing count unavailable", surface: "batches",
    what: "The list loads, the daily listing count does not. Said, not shown as zero.",
    replies: [
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/account", status: 200, body: { signedIn: true, name: "Preview",
        initials: "PV" } },
      { path: "/api/etsy", status: 200, body: { connected: true, shops: [] } },
{ path: "/api/batches", status: 200, body: { preparedAvailable: false,
      batches: [{ id: "b-1", status: "complete", step: "results", setup_name: "Bachelorette set", product_title: "Bachelorette Party Shirt", design_count: 6, created_at: "2026-09-16 14:02:11", updated_at: "2026-09-17 09:14:02", display_name: "Bachelorette Party Shirt", thumbnail_url: "", published_count: 0 }] } }] },


  /* -------------------------------------------------------- listing factory */
  { key: "factory-connect-checking", label: "Checking connections", surface: "listing-factory",
    what: "Neither answer has arrived. Nothing may say 'Not connected yet'.",
    replies: [
      { path: "/api/printify", status: 200, body: { connected: true }, delayMs: 60_000 },
      { path: "/api/etsy", status: 200, body: { connected: true }, delayMs: 60_000 },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/keyword-lists", status: 200, body: { lists: [] } },
      { path: "/api/product-recipes", status: 200, body: { recipes: [] } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/batches", status: 200, body: { batches: [], prepared: [],
        preparedAvailable: true } },
    ] },

  { key: "factory-connect-none", label: "Neither account connected", surface: "listing-factory",
    what: "A genuinely new member. The connect step is correct here.",
    replies: [
      { path: "/api/printify", status: 200, body: { connected: false } },
      { path: "/api/etsy", status: 200, body: { connected: false } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/keyword-lists", status: 200, body: { lists: [] } },
      { path: "/api/product-recipes", status: 200, body: { recipes: [] } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/batches", status: 200, body: { batches: [], prepared: [],
        preparedAvailable: true } },
    ] },

  { key: "factory-etsy-only", label: "Etsy connected, Printify not connected", surface: "listing-factory",
    what: "Sales access is an Etsy permission and must remain visible even when Printify is not connected.",
    replies: [
      { path: "/api/printify", status: 200, body: { connected: false } },
      { path: "/api/etsy", status: 200, body: { connected: true, shopName: "She's a Wolf",
        shops: [{ shopId: 1, shopName: "She's a Wolf", active: true }] } },
      { path: "/api/shop-map/connections", status: 200, body: { connections: [
        { shopId: 1, shopName: "She's a Wolf", activeForListingFactory: true,
          canReadSales: false, needsReconnect: false,
          authorizeSalesUrl: "/api/shop-map/connect-sales?for=preview" }] } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/keyword-lists", status: 200, body: { lists: [] } },
      { path: "/api/product-recipes", status: 200, body: { recipes: [] } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/batches", status: 200, body: { batches: [], prepared: [],
        preparedAvailable: true } },
    ] },

  { key: "factory-check-failed", label: "Connection check failed", surface: "listing-factory",
    what: "Both checks fail on an account that IS connected. It must not say "
      + "'Not connected yet', and it must not move the member.",
    replies: [
      { path: "/api/printify", status: 500, body: { error: "upstream" } },
      { path: "/api/etsy", status: 500, body: { error: "upstream" } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/keyword-lists", status: 200, body: { lists: [] } },
      { path: "/api/product-recipes", status: 200, body: { recipes: [] } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/batches", status: 200, body: { batches: [], prepared: [],
        preparedAvailable: true } },
    ] },

  { key: "factory-etsy-lapsed", label: "Etsy access lapsed", surface: "listing-factory",
    what: "Printify fine, Etsy's token gone. Reconnecting must not read as a first connection.",
    replies: [
      { path: "/api/printify", status: 200, body: { connected: true } },
      { path: "/api/etsy", status: 200, body: { connected: false,
        error: "Your Etsy access has expired. Reconnect the shop to continue." } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/keyword-lists", status: 200, body: { lists: [] } },
      { path: "/api/product-recipes", status: 200, body: { recipes: [] } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/batches", status: 200, body: { batches: [], prepared: [],
        preparedAvailable: true } },
    ] },

  { key: "factory-ready", label: "Connected, no product chosen", surface: "listing-factory",
    what: "Both connected and nothing built yet. The next thing to do must be obvious.",
    replies: [
      { path: "/api/printify", status: 200, body: { connected: true, owner: true } },
      { path: "/api/etsy", status: 200, body: { connected: true, shopName: "a-connected-shop" } },
      { path: "/api/shop-map/connections", status: 200, body: { connections: [
        { shopId: 1, shopName: "a-connected-shop", activeForListingFactory: true,
          canReadSales: false, needsReconnect: false,
          authorizeSalesUrl: "/api/shop-map/connect-sales?for=preview" }] } },
      { path: "/api/etsy/shipping-profiles", status: 200, body: { profiles: [
        { id: 1, title: "Standard" }] } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/keyword-lists", status: 200, body: { lists: [] } },
      { path: "/api/product-recipes", status: 200, body: { recipes: [] } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite",
        drafts: 10_000, dailyListings: 1_000 }, usage: { drafts: 12 } } },
      { path: "/api/batches", status: 200, body: { batches: [], prepared: [],
        preparedAvailable: true } },
    ] },

  { key: "factory-plan-exhausted", label: "Draft allowance spent", surface: "listing-factory",
    what: "The plan's drafts are used up. A limit is not an error and not the member's fault.",
    replies: [
      { path: "/api/printify", status: 200, body: { connected: true, owner: true } },
      { path: "/api/etsy", status: 200, body: { connected: true, shopName: "a-connected-shop" } },
      { path: "/api/shop-map/connections", status: 200, body: { connections: [
        { shopId: 1, shopName: "a-connected-shop", activeForListingFactory: true,
          canReadSales: true, needsReconnect: false, authorizeSalesUrl: null }] } },
      { path: "/api/etsy/shipping-profiles", status: 200, body: { profiles: [
        { id: 1, title: "Standard" }] } },
      { path: "/api/seller-preferences", status: 200, body: { pricing: null } },
      { path: "/api/keyword-lists", status: 200, body: { lists: [] } },
      { path: "/api/product-recipes", status: 200, body: { recipes: [] } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Starter", drafts: 50 },
        usage: { drafts: 50 } } },
      { path: "/api/batches", status: 200, body: { batches: [], prepared: [],
        preparedAvailable: true } },
    ] },

  /* -------------------------------------------------------------- shop map */
  { key: "shop-map-loading", label: "Loading", surface: "shop-map",
    what: "Shop Map reads a whole shop. The wait needs somewhere to land.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {}, delayMs: 60_000 }] },

  { key: "shop-map-api-error", label: "API failure", surface: "shop-map",
    what: "Must not render as an empty shop.",
    replies: [{ path: "/api/shop-map/map", status: 500, body: { error: "upstream" } }] },

  { key: "shop-map-loaded", label: "Loaded", surface: "shop-map",
    what: "The ordinary map: a month, niches with evidence behind them, somewhere to focus.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {
      shop: { shopName: "a-connected-shop" }, month: "September 2026",
      thisMonth: { revenueMinor: 184_250, etsyFeesMinor: -22_110,
        productionCostMinor: 71_400, profitMinor: 90_740, orders: 47,
        headline: "47 orders so far this month.", accuracy: "Every production cost came from Printify.",
        coverage: { verified: 44, estimated: 3, unavailable: 0 } },
      standout: { hasStandout: true,
        headline: "Bachelorette shirts are carrying the month.",
        nextStep: "They are 61% of orders and 12% of your active listings." },
      whereToFocus: [{ nicheId: "bachelorette", label: "Bachelorette",
        headline: "Most orders, fewest listings.",
        advice: "Your other niches have four times the listings for a third of the orders.",
        reason: "28 of 47 orders this month from 9 active listings." }],
      worldsPeriod: "last 90 days",
      directionBasis: "Orders and revenue over the last 90 days.",
      worlds: [
        { worldId: "bachelorette", label: "Bachelorette", listings: 14, activeListings: 9,
          period: "last 90 days", orders: 61, revenueMinor: 241_900,
          lifetimeOrders: 318, lifetimeRevenueMinor: 1_182_400,
          evidence: "61 orders across 9 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 9 },
            { family: "Tote", listings: 5 }],
          reviews: { recent: 12, lifetimeHeld: 96 } },
        { worldId: "dog-mom", label: "Dog mom", listings: 38, activeListings: 31,
          period: "last 90 days", orders: 19, revenueMinor: 64_300,
          lifetimeOrders: 140, lifetimeRevenueMinor: 487_100,
          evidence: "19 orders across 31 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 22 },
            { family: "Mug", listings: 9 }],
          reviews: { recent: 3, lifetimeHeld: 51 } }],
      coverage: { activeListings: 40, recentRevenue: 306_200, recentOrders: 80 },
      shopTotals: { listings: 52, orders: 80 } } }] },

  { key: "shop-map-partial", label: "Partial — finance unavailable", surface: "shop-map",
    what: "Niches are known, the money is not. The gap is named rather than shown as zero.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {
      shop: { shopName: "a-connected-shop" }, month: "September 2026",
      thisMonth: { revenueMinor: 0, etsyFeesMinor: 0, productionCostMinor: 0,
        profitMinor: null, orders: 0, accuracy: "This month's orders could not be read, so nothing is costed yet.",
        headline: "This month's figures could not be read from Etsy.",
        coverage: { verified: 0, estimated: 0, unavailable: 47 } },
      worldsPeriod: "last 90 days",
      directionCaveat: "Direction is based on orders alone while revenue is unavailable.",
      worlds: [
        { worldId: "bachelorette", label: "Bachelorette", listings: 14, activeListings: 9,
          period: "last 90 days", orders: 61, revenueMinor: 0,
          lifetimeOrders: 318, lifetimeRevenueMinor: 0,
          evidence: "61 orders across 9 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 9 }],
          reviews: { recent: 12, lifetimeHeld: 96 } }],
      shopTotals: { listings: 52, orders: 80 } } }] },

  { key: "shop-map-cost-missing", label: "Production cost missing", surface: "shop-map",
    what: "An unknown cost is not zero. Profit must read 'Not available', with the way to fix it.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {
      shop: { shopName: "a-connected-shop" }, month: "September 2026",
      thisMonth: { revenueMinor: 184_250, etsyFeesMinor: -22_110,
        productionCostMinor: 0, profitMinor: null, orders: 47,
        headline: "47 orders so far this month.",
        accuracy: "Production costs missing for 12 of 47 orders.",
        coverage: { verified: 35, estimated: 0, unavailable: 12 } },
      worldsPeriod: "last 90 days",
      worlds: [
        { worldId: "bachelorette", label: "Bachelorette", listings: 14, activeListings: 9,
          period: "last 90 days", orders: 61, revenueMinor: 241_900,
          lifetimeOrders: 318, lifetimeRevenueMinor: 1_182_400,
          evidence: "61 orders across 9 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 9 }],
          reviews: { recent: 12, lifetimeHeld: 96 } },
        { worldId: "dog-mom", label: "Dog mom", listings: 38, activeListings: 31,
          period: "last 90 days", orders: 19, revenueMinor: 64_300,
          lifetimeOrders: 140, lifetimeRevenueMinor: 487_100,
          evidence: "19 orders across 31 active listings.",
          productFamilies: [{ family: "Mug", listings: 9 }],
          reviews: { recent: 3, lifetimeHeld: 51 } }],
      shopTotals: { listings: 52, orders: 80 } } }] },

  /*
    ESTIMATED COSTS, WRITTEN FROM verdictFor() RATHER THAN FROM MEMORY.

    `verdictFor` in production-cost.ts is deliberately pessimistic: one
    estimate makes the whole month an estimate, and it emits exactly this
    label, headline and sentence. The arithmetic below is real too —
    1,842.50 revenue less 221.10 fees less 714.00 production is 907.40 — so
    the state can be checked rather than only looked at.
  */
  { key: "shop-map-estimated", label: "Estimated profit", surface: "shop-map",
    what: "One estimated cost makes the month an estimate. It must never read as a "
      + "verified figure: the chip is on the figure, not only in the headline.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {
      shop: { shopName: "a-connected-shop" }, month: "2026-09",
      thisMonth: { revenueMinor: 184_250, etsyFeesMinor: -22_110,
        productionCostMinor: 71_400, profitMinor: 90_740, orders: 47,
        label: "estimated", headline: "Estimated profit",
        accuracy: "12 of 47 production costs come from your saved estimates, "
          + "so this is an estimate.",
        coverage: { verified: 35, estimated: 12, unavailable: 0 } },
      worldsPeriod: "last 90 days",
      worlds: [
        { worldId: "bachelorette", label: "Bachelorette", listings: 14, activeListings: 9,
          period: "last 90 days", orders: 61, revenueMinor: 241_900,
          lifetimeOrders: 318, lifetimeRevenueMinor: 1_182_400,
          evidence: "61 orders across 9 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 9 }],
          reviews: { recent: 12, lifetimeHeld: 96 } }],
      shopTotals: { listings: 52, orders: 80 } } }] },

  { key: "shop-map-verified-mixed", label: "Verified, some entered by you", surface: "shop-map",
    what: "Costs you entered by hand still count as verified. The figure carries no "
      + "estimate chip, and the sentence says where the numbers came from.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {
      shop: { shopName: "a-connected-shop" }, month: "2026-09",
      thisMonth: { revenueMinor: 184_250, etsyFeesMinor: -22_110,
        productionCostMinor: 71_400, profitMinor: 90_740, orders: 47,
        label: "verified", headline: "Profit",
        accuracy: "3 of 47 production costs were entered by you; the rest came "
          + "from Printify.",
        coverage: { verified: 47, estimated: 0, unavailable: 0 } },
      worldsPeriod: "last 90 days",
      worlds: [
        { worldId: "bachelorette", label: "Bachelorette", listings: 14, activeListings: 9,
          period: "last 90 days", orders: 61, revenueMinor: 241_900,
          lifetimeOrders: 318, lifetimeRevenueMinor: 1_182_400,
          evidence: "61 orders across 9 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 9 }],
          reviews: { recent: 12, lifetimeHeld: 96 } }],
      shopTotals: { listings: 52, orders: 80 } } }] },

  { key: "shop-map-guidance", label: "Guidance and attention", surface: "shop-map",
    what: "Where to focus, and a niche carrying more listings than its orders justify.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {
      shop: { shopName: "a-connected-shop" }, month: "September 2026",
      thisMonth: { revenueMinor: 184_250, etsyFeesMinor: -22_110,
        productionCostMinor: 71_400, profitMinor: 90_740, orders: 47,
        headline: "47 orders so far this month.", accuracy: "Every production cost came from Printify.",
        coverage: { verified: 47, estimated: 0, unavailable: 0 } },
      standout: { hasStandout: true,
        headline: "Bachelorette shirts are carrying the month.",
        nextStep: "They are 61% of orders and 12% of your active listings." },
      whereToFocus: [{ nicheId: "bachelorette", label: "Bachelorette",
        headline: "Most orders, fewest listings.",
        advice: "Your other niches have four times the listings for a third of the orders.",
        reason: "28 of 47 orders this month from 9 active listings." }],
      needsAttention: { overbuiltWorlds: [
        { label: "Dog mom", reason: "31 active listings and 19 orders in 90 days." }] },
      directionBasis: "Orders and revenue over the last 90 days.",
      worldsPeriod: "last 90 days",
      worlds: [
        { worldId: "bachelorette", label: "Bachelorette", listings: 14, activeListings: 9,
          period: "last 90 days", orders: 61, revenueMinor: 241_900,
          lifetimeOrders: 318, lifetimeRevenueMinor: 1_182_400,
          evidence: "61 orders across 9 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 9 }],
          reviews: { recent: 12, lifetimeHeld: 96 } },
        { worldId: "dog-mom", label: "Dog mom", listings: 38, activeListings: 31,
          period: "last 90 days", orders: 19, revenueMinor: 64_300,
          lifetimeOrders: 140, lifetimeRevenueMinor: 487_100,
          evidence: "19 orders across 31 active listings.",
          productFamilies: [{ family: "Mug", listings: 9 }],
          reviews: { recent: 3, lifetimeHeld: 51 } }],
      shopTotals: { listings: 52, orders: 80 } } }] },

  { key: "shop-map-correction", label: "Correcting a niche", surface: "shop-map",
    what: "Moving a listing between niches. The read reloads; the write is answered separately.",
    replies: [
      { path: "/api/shop-map/correct", method: "POST", status: 200, body: { ok: true } },
      { path: "/api/shop-map/map", status: 200, body: {
        shop: { shopName: "a-connected-shop" }, month: "September 2026",
      worldsPeriod: "last 90 days",
      worlds: [
        { worldId: "bachelorette", label: "Bachelorette", listings: 14, activeListings: 9,
          period: "last 90 days", orders: 61, revenueMinor: 241_900,
          lifetimeOrders: 318, lifetimeRevenueMinor: 1_182_400,
          evidence: "61 orders across 9 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 9 }],
          reviews: { recent: 12, lifetimeHeld: 96 } },
        { worldId: "dog-mom", label: "Dog mom", listings: 38, activeListings: 31,
          period: "last 90 days", orders: 19, revenueMinor: 64_300,
          lifetimeOrders: 140, lifetimeRevenueMinor: 487_100,
          evidence: "19 orders across 31 active listings.",
          productFamilies: [{ family: "Mug", listings: 9 }],
          reviews: { recent: 3, lifetimeHeld: 51 } }],
        unclassifiedCard: { worldId: "unclassified", label: "Not yet sorted",
          listings: 6, activeListings: 6, period: "last 90 days", orders: 2,
          revenueMinor: 4_100, lifetimeOrders: 9, lifetimeRevenueMinor: 18_800,
          evidence: "2 orders across 6 active listings.",
          productFamilies: [], reviews: { recent: 0, lifetimeHeld: 1 } },
        shopTotals: { listings: 52, orders: 80 } } }] },

  { key: "shop-map-correction-failed", label: "Correction refused", surface: "shop-map",
    what: "The move could not be saved. The map must not show it as though it had.",
    replies: [
      { path: "/api/shop-map/correct", method: "POST", status: 500,
        body: { error: "That change could not be saved." } },
      { path: "/api/shop-map/map", status: 200, body: {
        shop: { shopName: "a-connected-shop" }, month: "September 2026",
      worldsPeriod: "last 90 days",
      worlds: [
        { worldId: "bachelorette", label: "Bachelorette", listings: 14, activeListings: 9,
          period: "last 90 days", orders: 61, revenueMinor: 241_900,
          lifetimeOrders: 318, lifetimeRevenueMinor: 1_182_400,
          evidence: "61 orders across 9 active listings.",
          productFamilies: [{ family: "Comfort Colors tee", listings: 9 }],
          reviews: { recent: 12, lifetimeHeld: 96 } },
        { worldId: "dog-mom", label: "Dog mom", listings: 38, activeListings: 31,
          period: "last 90 days", orders: 19, revenueMinor: 64_300,
          lifetimeOrders: 140, lifetimeRevenueMinor: 487_100,
          evidence: "19 orders across 31 active listings.",
          productFamilies: [{ family: "Mug", listings: 9 }],
          reviews: { recent: 3, lifetimeHeld: 51 } }],
        shopTotals: { listings: 52, orders: 80 } } }] },

  { key: "shop-map-empty-shop", label: "Connected, nothing listed", surface: "shop-map",
    what: "A real connection with no listings yet. Not an error, and not a blank page.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {
      shop: { shopName: "a-new-shop" }, month: "September 2026",
      worlds: [], worldsPeriod: "last 90 days",
      shopTotals: { listings: 0, orders: 0 },
      coverage: { activeListings: 0, recentRevenue: 0, recentOrders: 0 } } }] },

  { key: "shop-map-timezone", label: "Timezone not confirmed", surface: "shop-map",
    what: "Month boundaries move real money between months, so it asks rather than assumes.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {
      shop: { shopName: "a-connected-shop" }, month: "September 2026",
      timezoneNeeded: true, worlds: [], worldsPeriod: "last 90 days",
      shopTotals: { listings: 52, orders: 80 } } }] },
];

export const fixtureFor = (key: string) =>
  stateFixtures().find(entry => entry.key === key) ?? null;

/** Which fixture reply answers a request, if any. */
export function replyFor(
  fixture: StateFixture, url: string, method = "GET",
): FixtureReply | null {
  let path = url;
  let full = url;
  try {
    const parsed = new URL(url, "https://example.invalid");
    path = parsed.pathname;
    full = parsed.pathname + parsed.search;
  } catch { /* already a path */ }
  const verb = method.toUpperCase();
  /*
    A PATH MAY CARRY A QUERY, AND THEN THE QUERY IS PART OF THE MATCH.

    Market Watch reads its saved list and one niche's evidence from the same
    route, told apart only by `?key=`. Without this, a fixture for the detail
    view also answered the list behind it and neither state could be shown.
  */
  const matches = fixture.replies.filter(reply =>
    reply.path.includes("?") ? full.startsWith(reply.path) : path.startsWith(reply.path));
  /* Most specific first: a reply that names the method, then one that names
     a query, then the general one. */
  const rank = (reply: FixtureReply) =>
    (reply.method === verb ? 2 : 0) + (reply.path.includes("?") ? 1 : 0);
  const usable = matches.filter(reply => !reply.method || reply.method === verb);
  return usable.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}
