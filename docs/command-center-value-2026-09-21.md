# Command Center: from evidence to a seller decision

The Listing Factory remains Product → Drafts → Listing → Finish. These additions live in Command Center and do not publish listings, place orders, renew listings, or change prices.

## Implemented workflows

- **Market Watch:** select comparable listings explicitly instead of treating every keyword result as the same product. Price comparisons require three fresh records in one currency. An offer planner models discount, buyer shipping, production, fulfillment shipping, fees, advertising and the seller's target contribution. Loading an owned Printify product checks every enabled variant and destination-specific catalog shipping quote. It exposes costly sizes that a base-price comparison misses. Missing costs and mixed currencies produce no calculation. Overlapping shipping quotes are shown as a range; the scenario uses the highest quote and asks the seller to confirm the applicable shipping method.
- **Shop Watch:** repeated buyer wording leads to a concrete experiment, such as measured size help, a wash-tested sample photo, fabric details, or a delivery-promise audit. The evidence drawer uses the actual supporting reviews, including shop-wide patterns. Suggestions concern the seller's own offer; they do not assert that the seller's product has a competitor's defect.
- **Shop Map:** a short list prioritizes unavailable recent sellers, substantial declines across equal 30-day periods, and older unsold listings with lifetime favorites. Each names the evidence and a next investigation. Favorites are not treated as conversions. Opening Etsy verifies the current listing before action.
- **Design Scanner:** original upload dimensions support a print-size/PPI check before reduced analysis images discard that information. The seller can inspect a 150px thumbnail on different backgrounds. Revision plans keep the scan finding, what should remain, and one change to test.
- **Trademark Tracker:** product-category prioritization keeps every match visible and links to the USPTO's explanation of related goods. A saved review records intended use, records checked, alternatives and follow-up without declaring legal clearance.
- **All five:** private saved plans hold one change, testing status and the observed result. They are scoped to the member, feature and source item, and included in account deletion. These are dated decision records, not continuously updated market data.

## API basis

[Etsy Open API reference](https://developer.etsy.com/documentation/reference) supplies listings, reviews and authenticated shop receipt/transaction data. Public review activity, favorites and inventory changes are not exact competitor listing sales or keyword search volume. No such claims power these workflows.

[Printify API reference](https://developers.printify.com/) supplies owned products, variant fulfillment costs, destination/variant shipping profiles and orders with external order metadata. The product reader is read-only. Catalog shipping is a quote, not a final charge. The planner requires production-currency confirmation and never converts currencies implicitly. [Printify's currency guidance](https://help.printify.com/hc/en-us/articles/4483625794577-In-which-currency-can-I-sell-my-products) explains why retail prices and billing currency must not be conflated.

[USPTO guidance](https://www.uspto.gov/trademarks/search/likelihood-confusion) explains that related goods and similar marks require review. Class selection organizes the results; it does not remove other classes or decide clearance.

## Reliability changes supporting the workflows

The cost-correction view uses the active shop and exact shop-timezone month, includes discounts only once, and aggregates multiple matching production orders. Manual corrections include required timestamps and retain superseded entries with reversal links. The monthly calculation deducts the latest applicable manual cost once and uses a later verified Printify cost instead of double-counting both.

Trademark ingestion batches file discovery and uses an atomic single-file claim. A dedicated clock advances the backlog while preserving rate-limit cooldowns and interrupted-file recovery. Search completeness continues to depend on actual file completion, not on deployment.

## Validation

Behavior tests cover price-floor boundaries, discount/ad-fee interaction, stale and mixed-currency comparisons, sparse sales histories, month boundaries, real SQL cost corrections, duplicate saves, account isolation and entitlement refusal. Production desktop and phone checks remain required after deployment; passing fixtures alone does not certify the live result.
