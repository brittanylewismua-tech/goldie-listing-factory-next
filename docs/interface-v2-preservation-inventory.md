# Listing Factory interface migration — preservation inventory

The approved Goldie UX preview is a visual and structural reference. Production
components, routes, data and state machines remain authoritative. If the preview
conflicts with a production capability, the capability wins and the layout adapts.

## Global shell

- Goldie wordmark and animated star
- Fixed desktop sidebar; only the workflow pane scrolls
- Listing Factory, Batch History, Keyword Banks, Usage + Plan and Connections
- Start-new-batch control and guarded navigation during uploads
- Monthly listing usage, weekly publishing goal, Etsy trademark disclosure,
  copyright and Powered by Goldie AI
- Account access, owner diagnostics, command center, contextual help, support
  launcher, video help, footer and automatic-save status

## Product and connection state

- Printify and Etsy connection, reconnection and shop-pairing proof
- Saved products and bundles, product store identity, colors, sizes, variants,
  keyword banks, placement, product costs, Etsy fees, pricing and shipping
- New/saved/unfinished products, bundle member setup and per-product batches
- Missing, deleted, foreign and mismatched product/batch/shop states

## Designs and images

- 1–20 local design files, IndexedDB restoration and missing-local-file recovery
- Resolution/DPI analysis, per-design review and explicit low-resolution choice
- Printify staging, draft creation, retry, partial success and failure references
- Printify placement review and external editor access
- Printify photo selection/defaults, customer photo uploads, size guides,
  download ZIP and final per-listing photo order under Etsy’s 20-photo limit

## Listing details

- Per-design title, tags and description; keyword-bank guarantees and mismatch warning
- Etsy taxonomy, category, required/optional attributes, personalization and defaults
- Single-product and bundle-wide readiness, product switching and persistence

## Publish and recovery

- Exact selected-listing and selected-product counts, shop name and estimated fees
- Per-product photo choices, shipping profiles and settings in one bundle request
- Idempotent publish jobs, stalled-item recovery, bounded polling, per-item status,
  partial failures, upstream errors, seller-fixable errors and retry without duplicates
- Batch receipts, published listing attribution, history, goals and resumed batches
- Authentication, billing, plan limits, per-seller ownership and 404 isolation

## Explicit removals already authorized

- Generated lifestyle-mockup creation, scene sets and the Mockup Library are not
  reintroduced. Sellers upload finished listing photos instead.

No other feature may be removed as part of this interface migration.
