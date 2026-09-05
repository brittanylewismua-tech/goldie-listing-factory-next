# Operating cost audit — September 5, 2026

## What is actually verified

- Cloudflare Workers Paid was activated; the earlier failure was the Free plan's
  per-request CPU ceiling, not proof that testing exhausted a huge monthly budget.
- Cloudflare usage alerts exist at $10, $25 and $50. These are notifications,
  **not spending caps**. Email delivery has not been confirmed.
- The signed-in fal billing dashboard shows $0.184466 across 203 billed vision
  requests for the current month. Recent request rows identify the production
  Goldie key by name. This is account-period evidence, not a whole-app invoice.
- fal credit balance is **$1.39**, with 47 days until the displayed expiry, and
  the billing page says **no saved payment methods**. No funds were purchased,
  payment information added, or automatic recharge enabled during this audit.
- Supabase's organization containing `goldie-listing-factory-auth` is **Free**;
  spend cap enabled. The dashboard reports 5/50,000 MAU, 0.20/5 GB egress,
  122/500 MB database size. Organization usage includes another project.
- Supabase warns that exceeding quotas can make projects unresponsive. The cap
  prevents overage charges; it does NOT promise continuous service at the limit.
- Resend billing/current usage and Stripe account fees have not been verified.

## The direct answer about a surprise $300/week

No verified current bill approaches that figure. But there is no honest basis
for promising it can never happen. $300/week averages roughly $1,300/month.
Costs follow activity, retained files, AI calls and image transformations—not just
the number of registered customers. Alerts cannot guarantee a maximum invoice.

### Illustrative workload, NOT a measured forecast or an all-in quote

Each customer creates 300 drafts/month. Each draft is assumed to cause 100 Worker
requests averaging 25 ms CPU, 10 R2 writes, 100 reads, 1,000 D1 row reads, 100 row
writes, and 200 log events. Assume 10 MB retained per draft and three months of
that stock held for the entire billing month. **A three-month deletion policy is
not implemented.** Storage will keep growing if files are retained longer.

AI uses the observed account sample mean ($0.184466/203), with two to three
vision calls per draft. This is not an upper bound: repeated title generation,
larger prompts, model changes and other features add cost.

| Customers using all 300 drafts | Drafts/month | Workers | R2 storage + operations | Logs | AI sample extrapolation | Modeled subtotal/month |
|---|---:|---:|---:|---:|---:|---:|
| 100 | 30,000 | $5.90 | $13.35 | $0 | $54.52–81.78 | $73.77–101.03 |
| 300 | 90,000 | $8.90 | $40.35 | $0 | $163.57–245.35 | $212.82–294.60 |
| 500 | 150,000 | $13.40 | $73.65 | $6 | $272.61–408.91 | $365.66–501.96 |

Excluded: Supabase paid plan, email, payment-processing fees, taxes, domain,
image transformations, optional generated mockups, scene preparation and any
future durable-job service. D1 modeled operations fit its included quotas;
assumed database stock is 1 GB. Other account projects share included allowances.
Monthly active customers are NOT the same as simultaneous users; this table does
not establish throughput or safe concurrency. Reproduce using `tools/cost-model.mjs`.

### Where the larger bills can come from

- Ten unique Cloudflare image transformations per draft would add $147.50,
  $447.50 or $747.50/month respectively to those rows. This is a sensitivity
  scenario, **not a claim that ten transformations currently happen per draft**.
  Direct Printify images are not automatically Cloudflare transformations.
  At 500 customers the high subtotal plus that sensitivity is about $1,249/month,
  before the excluded services—close to $300/week.
- Keeping 50 MB rather than 10 MB per draft multiplies the storage stock by five.
  Each additional 1,000 GB held for a month adds $15 in standard R2 storage.
- The legacy `/api/mockups/render` endpoint still uses FLUX.2 flex image editing.
  No UI caller was found by repository search, and no such endpoint usage was
  listed in the current-month fal billing view. Do not include its plan allowance
  as observed ordinary usage. If enabled/used, it is separately expensive:
  four billed input/output megapixels at $0.05 each would cost $0.20 per render;
  6,500 such renders would cost $1,300. Actual billing depends on image dimensions
  and provider rounding, not the count of drafts alone.
- Generated mockup allowances remain 50/150/300 for Starter/Pro/Scale in source.
  They are not interchangeable with cheap vision calls or free Printify mockups.
- Current title/details requests have no durable deduplication or monthly
  monetary reservation. Account entitlement checks do not prevent a paid user
  from repeatedly spending through otherwise valid requests.

## When included quotas are crossed

| Meter | Paid included amount | Beyond included usage |
|---|---|---|
| Workers | 10M requests + 30M CPU-ms/month | $0.30/M requests + $0.02/M CPU-ms |
| R2 standard | 10 GB-month, 1M writes, 10M reads | $0.015/GB-month; $4.50/M writes; $0.36/M reads; rounding applies |
| D1 | 25B rows read, 50M written, 5 GB/month | $0.001/M reads; $1/M writes; $0.75/GB-month |
| Images | 5,000 unique transformations/month | $0.50/1,000 |
| Workers logs | 20M events/month | $0.60/M |
| Workflows, if introduced | 500K steps + 1 GB state/month | $0.80/100K steps + $0.20/GB-month; Workers CPU/invocations also count |

At the illustrative 25 ms CPU/request, the CPU inclusion is consumed after
1.2 million requests; that starts small usage charges rather than requiring a
large emergency upgrade. That CPU figure is NOT measured across every route.

Supabase Pro starts at $25/month with one Micro project's compute included.
This organization has two projects, so a simple organization upgrade can be
about **$35/month**, not just $25. Exact configuration/checkout must be verified
before any purchase. No upgrade was made. Hundreds of users alone are far below
50,000 MAU, but MAU is not its only quota or concurrency constraint.

## Changes and remaining work

D1108 isolates immediately shippable protections from unfinished draft recovery:
anonymous paid scene analysis is rejected; customer vision/scene preparation
requires existing entitlement; two direct vision paths cap output at 8,192 tokens
and explicitly disable paid web search; completed direct vision requests log only
numeric usage/cost, never prompts, artwork or credentials. These protections are
NOT global monthly budgets, and do not yet cover every paid AI call.

Required before an all-in budget/readiness commitment:
1. Fund the production AI account with an explicitly agreed amount and policy.
   $1.39 is not a launch reserve; no unbounded recharge should be silently enabled.
2. Choose the authentication production plan with its full project count and
   cost-cap tradeoff visible. Do not silently disable its existing spend cap.
3. Verify email billing and actual Cloudflare whole-account usage; no $0 overall
   usage claim may be based on a dashboard filtered to R2 alone.
4. Add persistent AI deduplication and cost reservations, per-account pacing,
   usage-growth/backlog alerts and retention accounting. Do not silently delete
   saved user artwork to reduce the storage bill.
5. Complete durable draft recovery and isolated concurrency tests. The ongoing
   draft changes are deliberately not included in D1108.
6. Measure complete single/bundle jobs and reconcile estimates to invoices.

Changing web hosts cannot remove fal, Supabase or Printify dependencies. Keep
Cloudflare while correcting these issues; reevaluate a fixed-price background
worker if measured CPU/memory/queue behavior warrants it. That is not a claim
that Cloudflare is proven optimal at hundreds of simultaneous users.

## Pricing sources checked September 5

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/images/pricing/
- https://developers.cloudflare.com/images/optimization/binding/
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://developers.cloudflare.com/workflows/reference/pricing/
- https://developers.cloudflare.com/billing/manage/budget-alerts/
- https://fal.ai/models/openrouter/router/vision/api
- https://fal.ai/models/fal-ai/flux-2-flex/edit
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/cost-control
