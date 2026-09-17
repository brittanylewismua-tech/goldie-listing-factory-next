/**
 * WHY THE NICHES LOOK THE WAY THEY DO, IN A MEMBER'S WORDS.
 *
 * A shop whose listings suggest thirteen groupings is shown five. Without an
 * explanation the only available conclusion is that something was lost, and
 * the member cannot tell whether the judgement was right — let alone correct
 * it. This turns the grouping decisions into plain sentences.
 *
 * WHAT IT DELIBERATELY DOES NOT SAY. No prompts, no model names, no scores,
 * no internal rule names, no raw field values. A member needs to understand
 * and be able to disagree with the decision; none of the machinery helps with
 * either, and all of it invites treating the output as more authoritative
 * than it is.
 *
 * The sentences are built here rather than in the page so they can be tested
 * as text, and so the page never handles the internal vocabulary at all.
 */

/** "A", "A and B", "A, B and C" — a list a person would say out loud. */
export function plainList(items: string[]): string {
  const unique = [...new Set(items.filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

export type GroupingDecision = { from: string; into: string; because: string };

export type GroupingNote = { kind: "grouped" | "left-out"; sentence: string };

/*
  The three decisions the grouping can make, each turned into the reason a
  member would give for it. An unrecognised one falls back to the mildest
  true statement rather than passing its own wording through, because that
  wording is not written for anybody to read.
*/
const SAME_AUDIENCE = "a design format, not a different buyer";
const NARROWED = "the same subject, narrowed";

export function explainGrouping(decisions: GroupingDecision[]): GroupingNote[] {
  const notes: GroupingNote[] = [];
  const grouped = decisions.filter(one => one.into);
  const dropped = decisions.filter(one => !one.into);

  /* One sentence per target and reason, so a target that absorbed two kinds
     of thing says both rather than averaging them into something vague. */
  const byTarget = new Map<string, Map<string, string[]>>();
  for (const decision of grouped) {
    const reasons = byTarget.get(decision.into) ?? new Map<string, string[]>();
    reasons.set(decision.because, [...(reasons.get(decision.because) ?? []), decision.from]);
    byTarget.set(decision.into, reasons);
  }

  for (const [target, reasons] of byTarget) {
    for (const [because, names] of reasons) {
      const what = plainList(names);
      const were = names.length === 1 ? "was" : "were";
      const sentence =
        because === SAME_AUDIENCE
          ? `${what} ${were} grouped under ${target} because they reach the same `
            + `shoppers and differ mainly by design style.`
          : because === NARROWED
            ? `${what} ${were} grouped under ${target} because ${names.length === 1
              ? "it is" : "they are"} the same subject in a narrower form.`
            : `${what} ${were} grouped under ${target} because ${names.length === 1
              ? "it describes" : "they describe"} the same thing.`;
      notes.push({ kind: "grouped", sentence });
    }
  }

  /*
    A category resting on one or two listings is not established yet. Said
    together, because a list of one-line dismissals reads as a fault list.
  */
  if (dropped.length) {
    const what = plainList(dropped.map(one => one.from));
    const were = dropped.length === 1 ? "was" : "were";
    notes.push({
      kind: "left-out",
      sentence: `${what} ${were} not shown as ${dropped.length === 1
        ? "a niche of its own" : "niches of their own"} because too few listings `
        + `sat in ${dropped.length === 1 ? "it" : "them"} to tell yet. `
        + `${dropped.length === 1 ? "Its listings are" : "Their listings are"} `
        + `counted in whichever niche they best fit.`,
    });
  }

  return notes;
}
