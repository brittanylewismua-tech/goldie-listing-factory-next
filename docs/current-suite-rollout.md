# Current design rollout — 26 September 2026

Approved direction: Current from the Sites collection, adapted to softer pink
(#f58abb), white, neutral gray and charcoal. The user requested restoring the
lowercase G logo during the rollout.

Applied to the existing production components and APIs. The shared shell, home,
command center, research, watchlists, shop map, libraries, account, connections,
platform updates and sign-in use the new styling. Research uses the existing
verified opportunities and associated listing images; selecting a finding changes
its evidence action. Shop Map keeps its revenue/profit completeness rules while
separating the headline total from the itemized breakdown.

Listing Factory's step machine, product setup, draft creation and publishing
behavior are unchanged. The shared logo and search button accessible label are
updated. The obsolete editorial stylesheet is removed. Temporary local fixture
routes are not included in this release. No schema, account records, providers,
API calculations or member entitlements are changed.

Validation: build and 3,675 regression checks passed, zero failures, 12 existing
skips. Chrome visual checks used real components with a closed fixture network
at desktop and 390px touch-device dimensions. Live walkthrough follows deployment.
