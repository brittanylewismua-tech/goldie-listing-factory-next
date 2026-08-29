/* D339 · One definition of a period, used by the sidebar bar, the publish
   receipt and the goals page. Three surfaces disagreeing about when a week
   starts would be worse than not showing the number at all. */
export type ListingGoal = { enabled: boolean; period: "week" | "month"; target: number };
/* D700 · published_at is when the listings actually went live. The goal counts the
   week she published in, not the week she happened to start the batch. */
export type PublishedBatch = { created_at?: string | null; published_at?: string | null; published_count?: number | null };

/* Weeks start Monday. Sellers think in working weeks, and a Sunday reset makes
   Sunday's work land in the "next" week. */
export function periodStart(period: "week" | "month", now = new Date()): Date {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return date;
}

/* D700 · This counted a batch into the week it was CREATED. Work begun on a Sunday
   and published on the Monday landed in the wrong week, and a batch created weeks
   ago and published today did not count at all - the seller sees listings go live
   and the bar does not move. It counts the week they went live. created_at is the
   fallback for rows published before the column existed. */
/* No return-type annotation: tests/listing-goal.test.mjs strips types with a regex
   and a union return type breaks it. Inferred is Date|null either way. */
function publishedWhen(batch: PublishedBatch) {
  const raw = batch.published_at || batch.created_at;
  if (!raw) return null;
  const when = new Date(raw);
  return Number.isNaN(when.getTime()) ? null : when;
}

export function publishedSince(batches: PublishedBatch[], since: Date): number {
  return batches.reduce((total, batch) => {
    const when = publishedWhen(batch);
    if (!when || when < since) return total;
    return total + Math.max(0, Number(batch.published_count) || 0);
  }, 0);
}

export function publishedThisPeriod(batches: PublishedBatch[], goal: ListingGoal, now = new Date()): number {
  return publishedSince(batches, periodStart(goal.period, now));
}

/* History for the goals page. Returns most recent first, oldest last, and never
   pads beyond what actually exists — an invented run of empty weeks reads as
   failure rather than as "you had not started yet". */
export function periodHistory(batches: PublishedBatch[], period: "week" | "month", count = 8, now = new Date()) {
  const rows: Array<{ start: Date; label: string; published: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const anchor = new Date(now);
    if (period === "month") anchor.setMonth(anchor.getMonth() - index);
    else anchor.setDate(anchor.getDate() - index * 7);
    const start = periodStart(period, anchor);
    const end = new Date(start);
    if (period === "month") end.setMonth(end.getMonth() + 1);
    else end.setDate(end.getDate() + 7);
    const published = batches.reduce((total, batch) => {
      const when = publishedWhen(batch);
      if (!when || when < start || when >= end) return total;
      return total + Math.max(0, Number(batch.published_count) || 0);
    }, 0);
    rows.push({
      start,
      label: period === "month"
        ? start.toLocaleDateString(undefined, { month: "long", year: "numeric" })
        : `Week of ${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      published,
    });
  }
  const lastWithWork = rows.map((row) => row.published > 0).lastIndexOf(true);
  return lastWithWork === -1 ? rows.slice(0, 1) : rows.slice(0, lastWithWork + 1);
}
