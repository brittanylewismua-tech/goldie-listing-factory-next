import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { filesFromProduct, productFilesUrl } from "@/app/uspto-bulk";
import { ensureRegisterTables, ingestFile, registerSize } from "@/app/trademark-register";

/**
 * ONE BULK FILE PER FIRING.
 *
 * The register arrives as ninety-odd historical files plus one a day forever.
 * Nothing here tries to do it in one go: each cron firing takes the next file
 * and stops on a deadline well short of the worker's limit. Every write is an
 * upsert keyed on the serial number, so a file interrupted halfway is simply
 * started again — the only cost is repeated work, never a wrong row.
 *
 * TODAY BEFORE 1953. The daily files are read first, because a mark filed
 * last week is the one a seller cannot look up anywhere else. The backfile
 * fills in behind it over the following days.
 *
 * Same authentication as the sweep: a request the worker built for itself
 * carries no cf-connecting-ip, and no caller on the internet can strip one.
 */
const key = () => (env as unknown as { USPTO_API_KEY?: string }).USPTO_API_KEY?.trim() || "";

/* Enough recent days to cover a gap of a fortnight without a special path. */
const DAILY_DAYS = 21;
const DEADLINE_MS = 120_000;

const isoDay = (offsetDays: number) =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

async function seed(db: D1Database): Promise<number> {
  const apiKey = key();
  const wanted: Array<{ product: string; from: string; to: string; priority: number }> = [
    /* Yesterday and the fortnight behind it: the current edge of the register. */
    { product: "TRTDXFAP", from: isoDay(DAILY_DAYS), to: isoDay(0), priority: 1 },
    /* Everything the office has ever registered, filled in behind. */
    { product: "TRTYRAP", from: "2025-01-01", to: "2025-12-31", priority: 5 },
  ];

  let added = 0;
  for (const want of wanted) {
    const response = await fetch(productFilesUrl(want.product, want.from, want.to), {
      headers: { "X-API-KEY": apiKey, "user-agent": "Goldie/1.0 (+https://thegoldiesuite.com)" },
    });
    if (!response.ok) continue;
    const files = filesFromProduct(await response.json());
    for (const file of files) {
      const result = await db
        .prepare(
          `INSERT INTO tm_ingest_files (name, product, url, covers, bytes, priority)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO NOTHING`,
        )
        .bind(file.name, want.product, file.url, file.to, file.bytes, want.priority)
        .run();
      added += result.meta?.changes ?? 0;
    }
  }
  return added;
}

export const GET = withErrorLog("trademark-ingest-tick", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!key()) return NextResponse.json({ skipped: "No USPTO key." });

  const db = (env as unknown as { DB: D1Database }).DB;
  await ensureRegisterTables(db);

  /* Re-seeding is cheap and idempotent, and it is what picks up yesterday's
     file without anyone remembering to. */
  const added = await seed(db);

  const next = await db
    .prepare(
      `SELECT name, product, url FROM tm_ingest_files
        WHERE state IN ('waiting', 'partial')
        ORDER BY priority ASC, name DESC
        LIMIT 1`,
    )
    .first<{ name: string; product: string; url: string }>();

  if (!next) return NextResponse.json({ added, idle: true, ...(await registerSize(db)) });

  await db.prepare(`UPDATE tm_ingest_files SET state = 'running' WHERE name = ?`).bind(next.name).run();

  try {
    const result = await ingestFile(db, next, key(), { deadline: Date.now() + DEADLINE_MS });
    await db
      .prepare(
        `UPDATE tm_ingest_files
            SET state = ?, records = ?, kept = ?, note = '', finished = ?
          WHERE name = ?`,
      )
      .bind(
        result.complete ? "done" : "partial",
        result.records,
        result.kept,
        new Date().toISOString(),
        next.name,
      )
      .run();
    return NextResponse.json({ added, file: next.name, ...result, ...(await registerSize(db)) });
  } catch (error) {
    const note = error instanceof Error ? error.message : "failed";
    /* Left waiting on purpose: a file that failed once for a network reason
       should be tried again, and one that fails forever shows up in the note. */
    await db
      .prepare(`UPDATE tm_ingest_files SET state = 'waiting', note = ? WHERE name = ?`)
      .bind(note.slice(0, 300), next.name)
      .run();
    return NextResponse.json({ added, file: next.name, error: note }, { status: 500 });
  }
});
