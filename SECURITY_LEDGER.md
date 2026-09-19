# Security ledger — CLOSED

**Build:** D1732 · commit `e0f7ce96` — live commit matches the local tree exactly.

**Final full application suite on D1732:**

| | |
|---|---|
| Total tests | **3,451** |
| Passing | **3,439** |
| Failing | **0** |
| Skipped | **12** (pre-existing; unrelated to this pass) |

Clean. **This milestone is closed and the security scope is not expanding further.**

---

## Live verified

Checked against the deployed site at thegoldiesuite.com.

- **Enforced CSP** — `content-security-policy` present and `content-security-policy-report-only` absent. `script-src 'nonce-…' 'self' https://static.cloudflareinsights.com` with a real per-request nonce and **no `unsafe-inline`**; `frame-ancestors 'none'`; `object-src 'none'`; `connect-src 'self' https://*.supabase.co https://static.cloudflareinsights.com`.
- **Normal authenticated routes** — Home, Listing Factory, Market Watch, Design Scanner, Usage, Connections all render for the signed-in account. Two real page loads made 12 and 7 API calls respectively; **every one returned 200**. No 429s in normal use.
- **Connection state** — Etsy shows `shesawolfclothing`, publishing here, sales visible. Printify shows Connected.
- **Printify credential survival** — the credential is intact after GET traffic. It is not deleted or retired during a read; retirement happens only through the internal queued cleanup.
- **No active overrides or test residue** — override audit reports **0 active** (2 stored, 2 reversed), 0 orphaned, 0 money-in-two-places, 0 unreadable, no duplicated rows.

## Behaviorally verified

The property is driven to its actual outcome against the real handler or module. Not a source-text match.

- **Upload validation** — every entry point, against the real compiled handlers: signature versus declaration, permitted formats, malformed and truncated files, raw byte ceilings, decoded dimensions and total pixels, decompression bombs (the fixture is asserted small enough that the byte cap *cannot* be what catches it), empty and near-empty files, SVG refused by name, filename and stored-name safety, member-scoped keys, and refusal **before** durable storage or provider submission.
- **Delegated-provider URL validation** — all seven sites where a URL is handed to a provider to fetch on our behalf.
- **Remote-fetch controls** — 21 locations where we fetch, each categorised; no unexplained remainder, enforced by a test that fails on anything unclassified or stale.
- **Concurrent webhook idempotency** — duplicate simultaneous delivery produces every downstream effect exactly once: emails, entitlement changes, audit rows, billing writes.
- **Rate limits** — all nine named surfaces bounded, plus a catch-all. Every one of the 144 route files on disk resolves to a ceiling across five methods. Keying, refusal accounting, window turnover, pruning, and fail-open-and-report behaviour all asserted.
- **Deletion completeness** — every table in the plan and every member-keyed R2 prefix seeded and proven gone or deliberately retained; partial runs resume safely.
- **Credential retirement** — retirement occurs only through the queued cleanup, which re-verifies with Printify before removing anything.
- **Entitlement isolation** — `isOwner` refuses an unverified email before any allowlist comparison; checkout events cannot overwrite a trial's narrower allowance.
- **Cross-account isolation** — every deletion step scoped `WHERE user_id = ?` with exactly one bound parameter; a bystander member is seeded and asserted intact in every fixture, including partial runs; storage keys and ownership lookups bound to the signed-in member.

## Deliberately not forced in production

- **A real 429.** Forcing one live would have meant deliberately exhausting one of your real allowances or writing dozens of junk rows into your error log. **Recorded instead:** the refusal path is driven against the actual compiled `worker/index.ts` — the real entry is executed, a caller is taken past the `account/delete` ceiling of five, and the test asserts a genuine 429 with a positive `Retry-After`, that a second caller is unaffected, and that a scheduled self-call is not bounded at all.

## Unresolved

**None.** The full suite passes.

---

## The three vulnerabilities fixed

### 1. Member-controlled URL delegated to the Design Scanner provider

`/api/design-scanner/scan` checked only that `imageDataUrl` was **present**, then forwarded it to the vision provider as an image URL. A member could send `http://169.254.169.254/latest/meta-data/…`, `http://localhost:8080/admin`, or any external address, and the **provider** would fetch it — from its own network, on the far side of our SSRF guard — and return the contents as analysis.

There is no `fetch()` at that call site, which is why the first remote-fetch sweep did not see it: it enumerated the places *we* fetch, not the places a provider fetches *for* us. Seven such sites exist; the other six were already guarded. Fixed in D1728: the value must now be an inline image whose bytes are verified, checked before a scan is spent.

### 2. Concurrent Stripe deliveries producing duplicate email side effects

The event receipt was read with a `SELECT` at the top of the handler and written at the very bottom, with every effect in between. Stripe retries on timeout without knowing the first delivery is still in flight.

Measured with realistic D1 latency: **two simultaneous deliveries of one event sent two trial-reminder emails; three sent three** — and left an orphaned Resend id that nothing could cancel. The database looked entirely correct afterwards, because the writes are `ON CONFLICT DO UPDATE` and the second receipt was `INSERT OR IGNORE`. The final shape was right while the effect had happened twice.

Fixed in D1730 by claiming the receipt up front with `INSERT OR IGNORE` — a compare-and-swap on the primary key, so exactly one caller sees `changes === 1`. Because the claim is no longer inside the batch it cannot be rolled back by it, so a failed batch releases the claim by hand; otherwise the event would be marked handled while nothing happened and the retry would be turned away as a duplicate.

*Recorded because it matters:* the first version of this test **passed against the broken code**. Instrumenting the fake D1 showed read-write-read — the two deliveries never actually overlapped. It became evidence only once every D1 call carried the round-trip latency it has in production.

### 3. Uploads trusting declared MIME and accepting extreme decoded dimensions

Every upload path trusted the **browser-declared** MIME type, so an SVG or an HTML page declared `image/png` passed. `/api/mockups/library/[id]/occlusion` checked **no type at all** and wrote whatever arrived as `contentType: "image/png"`. Nothing anywhere checked decoded dimensions or pixel count, so a ~700-byte PNG declaring 50,000 × 50,000 — roughly 10 GB decoded — was accepted; a byte cap cannot see that.

Fixed in D1728: the real type is read from the file signature, dimensions come from the parser already in `app/mockups/product-mask.ts` (given the *sniffed* type, never the declared one), and files are refused on empty, unrecognised, wrong-format, truncated, oversized, over-edge and over-pixel-count — before storage or provider submission.

Two smaller issues fixed alongside: a file named `order.json` produced a key that GET and DELETE both refuse, leaving an object the member could never read back or remove; and a bad file mid-batch could leave earlier files already written.

---

## Two corrections that came from your review

- **The report-area ceiling was a mute button.** A global per-area ceiling let one attacker fill the hour from rotating sources and suppress everyone else's reports — the product would have gone quiet at exactly the moment it was under attack, and quiet looks like health. Past the ceiling the area now stops accepting *volume*, not *reporters*: a source that has said little this hour is still heard.
- **Report payloads were unbounded.** Fields were truncated, but only *after* the body was parsed. Bodies are now read up to a bound, counting as they read, so a lying `Content-Length` buys nothing.

## One gap I introduced and closed in the same pass

The new `request_limits` table stores `u:<userId>` rows. The deletion completeness scan finds member-keyed tables by looking for a literal `user_id` column, so a table keyed on a prefixed identity was invisible to exactly the check meant to catch this. Rather than loosen the two guards that require `WHERE user_id = ?`, the table now carries an ordinary nullable `user_id` alongside the identity — NULL for anonymous callers, who have no account to delete.

---

## Presentation

Frozen. No visual work in this pass.
