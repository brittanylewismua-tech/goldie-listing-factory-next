# Security ledger

Live build at the time of writing: **D1732** (`7a7b9734`). Suite: **3,439 passing, 0 failing, 12 skipped**. 94 of those tests are the security tests listed here.

Labels mean exactly what they say:

- **Live verified** — checked against the deployed site at thegoldiesuite.com.
- **Behaviorally verified** — the property is asserted against the real handler or module, driven to the actual outcome. Not a source-text match.
- **Unresolved** — not proven. Nothing is filed here that I could not demonstrate.

---

## 1. Cross-account writes — behaviorally verified

Every deletion plan step is required by test to be scoped `WHERE user_id = ?` with exactly one bound parameter, and to name the table it claims. Upload storage keys are asserted to contain the signed-in member's id. The Etsy image route's draft-ownership lookup is asserted to bind the caller's id rather than anything from the request.

A bystander member is seeded alongside the deleted one in every deletion fixture and asserted intact afterwards — including on partial runs and resumes.

`tests/account-deletion.test.mjs`, `tests/deletion-plan-completeness.test.mjs`, `tests/member-upload-safety.test.mjs`

## 2. CSRF and browser sessions — live verified

CSP is **enforcing** on the deployed site, confirmed by reading the response headers: `content-security-policy` present, `content-security-policy-report-only` absent, `script-src 'nonce-…' 'self' https://static.cloudflareinsights.com` with a real per-request nonce and **no `unsafe-inline`**, `frame-ancestors 'none'`, `object-src 'none'`, `connect-src 'self' https://*.supabase.co`.

`Sec-Fetch-Site` is treated as defence in depth, not the fix — as instructed. The session cookie is `SameSite=Lax`, which does **not** stop a top-level GET navigation, so the guard rejects cross-site writes independently.

`tests/same-site-only.test.mjs`, plus live header read.

## 3. Entitlement escalation — behaviorally verified

`isOwner` refuses an unverified email before any allowlist comparison. Plan entitlement is written only by subscription webhook events, and checkout events are asserted not to overwrite a trial's narrower allowance.

`tests/owner-allowlist.test.mjs`, `tests/webhook-idempotency.test.mjs`

## 4. SSRF and remote fetch — behaviorally verified, no remainder

Two classes, both enumerated by tests that fail on anything unclassified:

**Fetches we perform** — 21 locations, each categorised as `guarded` (through `fetchTrustedImage` / `trustedImageUrl`), `own-url` (built from our own constants), `host-pinned`, `helper`, or `client` (a browser call to our own origin, bounded by `connect-src 'self'`).

**Fetches a provider performs for us** — 7 locations where a URL is handed to fal as `image_url`/`image_urls`. There is no `fetch()` at these call sites, so the first scan could not see them, and the request leaves from the provider's network on the far side of our own guard. Six were already guarded. **The seventh was a real hole**: `/api/design-scanner/scan` checked only that `imageDataUrl` was *present* before forwarding it, so a member could pass `http://169.254.169.254/…` and have the provider fetch it and return the contents as analysis. Fixed in D1728.

`tests/remote-fetch-coverage.test.mjs`, `tests/trusted-image-fetch.test.mjs`

## 5. Member uploads — behaviorally verified

Tested against the **real compiled handlers**, not the helper alone. Every entry point: `/api/etsy/images`, `/api/mockups/library/[id]/occlusion`, `/api/design-scanner/scan`, `/api/support`.

What was wrong before D1728:

- Every path trusted the **browser-declared** MIME type. A `.svg` or an HTML page declared `image/png` passed.
- `/api/mockups/library/[id]/occlusion` checked **no type at all** and wrote whatever arrived as `contentType: "image/png"`.
- Nothing anywhere checked decoded dimensions or pixel count, so a 700-byte PNG declaring 50,000 × 50,000 was accepted.
- A file named `order.json` produced a key that GET and DELETE both refuse, leaving an object the member could never read back or remove.

Each requirement, now asserted: signature-versus-declaration; permitted formats; malformed and truncated files; raw byte ceilings; decoded dimensions and total pixels; decompression bombs (asserted small enough that the byte cap *cannot* be what catches it); empty and near-empty files; SVG refused **by name**, so the refusal is deliberate rather than incidental; filename and stored-name safety against traversal, quotes and newlines; member-scoped keys; and refusal **before** durable storage or provider submission — a bad file in the middle of a batch leaves no earlier file written.

Dimensions are read by the parser already in `app/mockups/product-mask.ts` rather than a second one, and it is given the *sniffed* type, never the declared one.

`tests/member-upload-safety.test.mjs` (13 tests)

## 6. Stored and reflected content — live verified

Enforced CSP with a per-request nonce is the control, confirmed live above. Report-only mode was run first and earned its keep: it caught that `strict-dynamic` would have broken every client-side navigation.

## 7. Webhooks — behaviorally verified (defect found and fixed)

Signature verification was already real HMAC, and the tests sign payloads properly rather than stubbing it. Signature was only half the requirement, as you said.

**The other half was broken.** The receipt was read with a `SELECT` at the top and written at the very bottom, with every effect in between. Stripe retries on timeout without knowing the first delivery is still in flight. Measured with realistic D1 latency: two simultaneous deliveries of one event both found no receipt, both proceeded, and sent **two trial-reminder emails**. Three sent three. The database looked correct afterwards — the writes are `ON CONFLICT DO UPDATE` and the second receipt was `INSERT OR IGNORE` — so the final shape was right while the effect had happened twice, and an orphaned Resend id was left that nothing could cancel. This is exactly the case where one final database shape is insufficient.

Fixed by claiming the receipt up front with `INSERT OR IGNORE`, which is a compare-and-swap on the primary key: exactly one caller sees `changes === 1`. Because the claim is no longer inside the batch it can no longer be rolled back by it, so a failed batch releases the claim by hand — otherwise the event would be marked handled while nothing happened and the retry would be turned away as a duplicate.

A failing trial reminder deliberately does **not** un-claim the event: access is already correct, and replaying the billing event to retry an email would risk applying the entitlement change twice. That is now asserted rather than assumed.

*Worth recording:* the first version of this test **passed against the broken code**. Instrumenting the fake D1 showed read-write-read — the two deliveries never overlapped. It only became evidence once every D1 call carried the round-trip latency it has in production.

`tests/webhook-idempotency.test.mjs` (6 tests)

## 8. Non-AI rate limits — behaviorally verified; live verified as non-regression

Only the two reporting endpoints had ceilings. All nine named surfaces are now bounded.

Enforcement is **central**, in `worker/index.ts`. Route-by-route would have been 144 separate decisions and the misses would be invisible, so the classifier has a catch-all last: a route added tomorrow is bounded the day it exists. A test resolves **every one of the 144 route files on disk**, across five methods, to a ceiling — nothing is unbounded by omission.

Keying, since you asked it be proven: a signed-in member is keyed as themselves, so two members behind one office address cannot throttle each other; anonymous callers fall back to a truncated hash of the address, which is not kept. Counters live in D1, not in memory — a limit that only holds within one isolate is not a limit. A refused attempt still counts, so hammering a refusal is not free. A counter that cannot write **fails open and reports it**: a broken counter must not become an outage, but a limiter that silently stops limiting is worse than none.

**On the suppression risk you raised** — you were right. Past the area ceiling the area now stops accepting *volume*, not *reporters*: a source that has said little this hour is still heard, because a reporter who has sent two reports is not the one who filled it. Only sources already over the reserve are turned away. Otherwise the product would have gone quiet at exactly the moment it was under attack, and quiet looks like health.

Report bodies are read up to a bound, **counting as they read**, so a lying `Content-Length` buys nothing.

Live: a real page load making 12 API calls returned 200 on all 12, and a second making 7 returned 200 on all 7. No 429s in normal use.

*Not claimed:* I did not force a live 429. Doing so would mean deliberately exhausting one of your real allowances or writing dozens of junk rows into your error log. The 429 path is driven to a real refusal against the actual compiled worker entry instead.

`tests/request-limits.test.mjs`, `tests/request-surface-coverage.test.mjs`, `tests/report-bounds.test.mjs`

## 9. Logs — behaviorally verified

Secrets are scrubbed from logged text. The reporter key is a truncated hash of address plus a coarse client hint — enough to tell two reporters apart for an hour, not enough to be a record of who visited, which matters because an operator reads that table.

`tests/log-scrubbing.test.mjs`, `tests/report-bounds.test.mjs`

## 10. Deletion — behaviorally verified against fixtures

Every table in the plan and every member-keyed R2 prefix is seeded and then asserted: the member's rows are gone or deliberately retired, the bystander's survive untouched, and every object prefix is attempted and reports what it removed. Also proven: tokens destroyed and entitlement removed; the audit row opened before the first statement and closed after the last, and not part of the plan it audits; one failing step does not abandon the other forty-two; a partial run reports incomplete and a resume finishes only what failed without repeating a completed destructive step; prefix deletion pages to the end; and the confirmation never shows a member a table name.

**One gap I introduced and closed in the same pass:** the new `request_limits` table stores `u:<userId>` rows. The completeness scan finds member-keyed tables by looking for a literal `user_id` column, so a table keyed on a prefixed identity was invisible to exactly the check meant to catch this. Rather than loosen the two guards that require `WHERE user_id = ?`, the table now carries an ordinary nullable `user_id` alongside the identity — NULL for anonymous callers, who have no account to delete.

`tests/account-deletion.test.mjs` (22 tests), `tests/deletion-plan-completeness.test.mjs` (7 tests)

---

## Deployment proof

| Item | Result |
|---|---|
| Live build | D1732 (`7a7b9734`) — all six commits from this pass deployed |
| Enforced CSP | Confirmed by live header read; report-only header absent |
| Printify queued cleanup | Connections page live: **Printify still Connected** after GET traffic; credential not deleted or retired |
| Security tests | 94 passing |
| Full regression | 3,439 passing, 0 failing |
| Override audit | **0 active** overrides, 0 orphaned, 0 money-in-two-places, 0 unreadable — no test residue in your shop |
| Presentation | Frozen. No visual work in this pass. |

## Still running independently

The trademark backfile: **109 done / 3 skipped / 7 waiting**, 228,096 marks, queue advancing. Two files are held by USPTO rate limiting until 07:00Z and 10:00Z — waiting on USPTO, not stuck. The incomplete-register warning correctly remains up.
