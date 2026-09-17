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
  status: number;
  body: unknown;
  /* Milliseconds before answering, for watching a loading state on purpose. */
  delayMs?: number;
};

export type StateFixture = {
  key: string;
  label: string;
  /* Which component the preview should mount. */
  surface: "connections" | "market-watch" | "design-scanner" | "shop-map" | "account";
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

  /* -------------------------------------------------------- market watch */
  { key: "market-watch-empty", label: "Nothing watched", surface: "market-watch",
    what: "A member who has not started. The page has to invite, not apologise.",
    replies: [{ path: "/api/market-watch/niches", status: 200, body: { niches: [], watches: [] } },
      { path: "/api/market/shop-watch", status: 200, body: { watches: [] } }] },

  { key: "market-watch-api-error", label: "API failure", surface: "market-watch",
    what: "Evidence unavailable. Must not read as 'nothing is moving'.",
    replies: [{ path: "/api/market-watch/niches", status: 500, body: { error: "upstream" } },
      { path: "/api/market/shop-watch", status: 500, body: { error: "upstream" } }] },

  /* ------------------------------------------------------- design scanner */
  { key: "scanner-daily-limit", label: "Daily limit reached", surface: "design-scanner",
    what: "The allowance is spent. Saved results stay open and reopening is free.",
    replies: [{ path: "/api/design-scanner/scan", status: 429,
      body: { error: "You have used all 10 scans for today. One becomes available again shortly. "
        + "Your saved results stay open and reopening them is free.", limited: true } }] },

  { key: "scanner-provider-error", label: "Provider failure", surface: "design-scanner",
    what: "The model failed. Nothing counted against the allowance.",
    replies: [{ path: "/api/design-scanner/scan", status: 502,
      body: { error: "That scan did not complete. It has not been counted against your daily scans." } }] },

  { key: "scanner-global-ceiling", label: "Global ceiling reached", surface: "design-scanner",
    what: "Capacity, not the member's own use. Must not read as their fault.",
    replies: [{ path: "/api/design-scanner/scan", status: 429,
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
          removed: [
            { say: "Your design scans and their results.", changed: 27 },
            { say: "The niches you were watching.", changed: 7 },
            { say: "Your Etsy connection is switched off and its access keys destroyed.",
              changed: 1 }] } }] },

  { key: "account-delete-already", label: "Deletion already done", surface: "account",
    what: "A retry reports the same completion and runs nothing.",
    replies: [
      { path: "/api/account/data", status: 200, body: { yours: {}, kept: [], note: "" } },
      { path: "/api/usage", status: 200, body: { plan: { name: "Full Suite" } } },
      { path: "/api/account/delete", status: 200,
        body: { deleted: true, alreadyDone: true, removed: [],
          say: "This account's data was already removed. Nothing further was changed." } }] },

  /* -------------------------------------------------------------- shop map */
  { key: "shop-map-loading", label: "Loading", surface: "shop-map",
    what: "Shop Map reads a whole shop. The wait needs somewhere to land.",
    replies: [{ path: "/api/shop-map/map", status: 200, body: {}, delayMs: 60_000 }] },

  { key: "shop-map-api-error", label: "API failure", surface: "shop-map",
    what: "Must not render as an empty shop.",
    replies: [{ path: "/api/shop-map/map", status: 500, body: { error: "upstream" } }] },
];

export const fixtureFor = (key: string) =>
  stateFixtures().find(entry => entry.key === key) ?? null;

/** Which fixture reply answers a request, if any. */
export function replyFor(fixture: StateFixture, url: string): FixtureReply | null {
  let path = url;
  try { path = new URL(url, "https://example.invalid").pathname; } catch { /* already a path */ }
  return fixture.replies.find(reply => path.startsWith(reply.path)) ?? null;
}
