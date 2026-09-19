/**
 * A LINK SOMEBODY ELSE WROTE MUST NOT CHANGE ANYTHING HERE.
 *
 * The session cookie is SameSite=Lax, which is usually described as "blocks
 * CSRF". It blocks the cross-site POST and it blocks cookies on subresource
 * GETs — an <img> or a fetch from another origin. It does NOT block a
 * top-level navigation: a link on another site, clicked, arrives here WITH
 * the session cookie attached.
 *
 * Thirteen GET handlers in this app write to the database, ten of them behind
 * the owner check, several destructively — disconnecting Printify, retiring
 * corrections, re-running an ingest that costs provider calls. Every one of
 * those is a link away from happening to whoever is signed in.
 *
 * Sec-Fetch-Site is the signal that separates the cases, and browsers have
 * sent it for years:
 *
 *   same-origin  our own page called it            -> allow
 *   none         typed in the address bar, or a    -> allow
 *                bookmark: a deliberate act
 *   same-site    another subdomain of ours         -> REFUSE, see below
 *   cross-site   somebody else's link              -> refuse
 *
 * `same-site` is refused rather than allowed because a sibling subdomain is
 * exactly the attack path that makes "same site" different from "same
 * origin", and nothing here legitimately calls the API from one.
 *
 * A request with no header at all is not a browser. Those are internal or
 * scripted callers, which have their own gates, so the absence is treated as
 * `none` rather than as a failure — refusing it would break the cron.
 */
export function crossSiteWrite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (!site) return false;
  return site !== "same-origin" && site !== "none";
}

export const CROSS_SITE_REFUSAL = {
  error: "This address changes something, so it cannot be opened from a link "
    + "on another site. Open it from inside the app, or paste it into the "
    + "address bar yourself.",
};
