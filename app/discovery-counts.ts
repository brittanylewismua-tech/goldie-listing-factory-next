/**
 * EVERY STAGE OF DISCOVERY, COUNTED SEPARATELY.
 *
 * The report said "200 listings added across 211 shops". A set of 200 listings
 * cannot contain 211 distinct shops, and the reason it claimed to was that two
 * numbers came from two different sets: the listing count came from the
 * capped, monitored pool, and the shop count came from the larger accepted
 * search pool before the cap.
 *
 * That is exactly the class of mistake that makes a member distrust every
 * other number on the page, so the stages are now separate values with
 * separate names, and the arithmetic between them is asserted rather than
 * assumed.
 *
 * MEMBER-FACING NUMBERS COME FROM THE MONITORED SET AND NOTHING ELSE. What
 * Goldie is watching is what it inserted — never what a search returned.
 */
export type Stage = {
  /** Rows Etsy returned across every page read. */
  examined: number;
  /** Of those, the ones the matcher accepted. */
  accepted: number;
  acceptedShops: number;
  /** Of the accepted, the ones kept after the per-niche cap. */
  selected: number;
  selectedShops: number;
  /** Of the selected, the ones that became new rows. */
  inserted: number;
  insertedShops: number;
  /** The monitored pool as it now stands, by state. */
  awaitingBaseline: number;
  monitoring: number;
  withEvidence: number;
};

export type Violation = { rule: string; detail: string };

/**
 * The arithmetic that has to hold.
 *
 * Returned rather than thrown: a broken count should be visible in the report
 * beside the numbers it describes, not replaced by a 500 that hides them.
 */
export function invariants(stage: Stage, monitoredShops: number): Violation[] {
  const broken: Violation[] = [];
  const check = (ok: boolean, rule: string, detail: string) => {
    if (!ok) broken.push({ rule, detail });
  };

  check(stage.acceptedShops <= stage.accepted, "accepted shops ≤ accepted listings",
    `${stage.acceptedShops} shops across ${stage.accepted} listings`);
  check(stage.selectedShops <= stage.selected, "selected shops ≤ selected listings",
    `${stage.selectedShops} shops across ${stage.selected} listings`);
  check(stage.insertedShops <= stage.inserted, "inserted shops ≤ inserted listings",
    `${stage.insertedShops} shops across ${stage.inserted} listings`);
  check(monitoredShops <= stage.awaitingBaseline + stage.monitoring + stage.withEvidence,
    "monitored shops ≤ monitored listings",
    `${monitoredShops} shops across `
    + `${stage.awaitingBaseline + stage.monitoring + stage.withEvidence} listings`);

  check(stage.accepted <= stage.examined, "accepted ≤ examined",
    `${stage.accepted} of ${stage.examined}`);
  check(stage.selected <= stage.accepted, "selected ≤ accepted",
    `${stage.selected} of ${stage.accepted}`);
  check(stage.inserted <= stage.selected, "inserted ≤ selected",
    `${stage.inserted} of ${stage.selected}`);
  return broken;
}

/**
 * What a member is told, built from the monitored set alone.
 *
 * It takes the pool counts, not the search counts, so it cannot drift from the
 * rows the detail page returns.
 */
export function watchingLine(
  { watching, shops }: { watching: number; shops: number },
): string {
  if (!watching) return "";
  /* Stated as a fact about what is being watched, never as movement. */
  return ` Market Watch is watching ${watching} listing${watching === 1 ? "" : "s"} across `
    + `${shops} shop${shops === 1 ? "" : "s"} for this niche.`;
}
