import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";

/**
 * THE RAW SHAPE, SO A SIGN CONVENTION IS OBSERVED RATHER THAN ASSUMED.
 *
 * Totals came out with revenue negative and tax larger than revenue, which is
 * structurally impossible. Rather than flipping a sign until the number looks
 * plausible - which is how a wrong figure becomes a confident one - this
 * shows what Etsy actually sends.
 *
 * Amounts and types only. No buyer field is requested or returned.
 */
export const GET = withErrorLog("shop-map-financial-audit", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  /*
    D1456 - the stored ledger reaches back years; the live endpoint only
    reaches 31 days. A code that appears rarely is only findable in what has
    already been ingested.
  */
  const stored = (new URL(request.url).searchParams.get("stored") ?? "").trim();
  if (stored) {
    const db = (env as unknown as { DB: D1Database }).DB;
    const rows = await db.prepare(
      `SELECT source_id, raw_type, amount_minor, currency, receipt_id, transaction_id,
              source_created_at
         FROM finance_ledger WHERE user_id = ? AND raw_type = ?
        ORDER BY source_created_at DESC LIMIT 12`)
      .bind(user.userId, stored)
      .all<{ source_id: string; raw_type: string; amount_minor: number; currency: string;
        receipt_id: number | null; transaction_id: number | null; source_created_at: number }>();
    const examples = rows.results ?? [];

    /* Everything written against the same order, so the code can be read
       against what sits beside it. */
    const siblings = [];
    for (const example of examples.slice(0, 3)) {
      const key = example.receipt_id ?? example.transaction_id;
      if (!key) continue;
      const near = await db.prepare(
        `SELECT raw_type, amount_minor, receipt_id, transaction_id
           FROM finance_ledger
          WHERE user_id = ? AND (receipt_id = ? OR transaction_id = ?)
          ORDER BY source_created_at ASC LIMIT 12`)
        .bind(user.userId, key, key)
        .all<{ raw_type: string; amount_minor: number }>();
      siblings.push({ around: key, rows: near.results ?? [] });
    }

    const counts = await db.prepare(
      `SELECT raw_type, COUNT(*) AS n, SUM(amount_minor) AS total
         FROM finance_ledger WHERE user_id = ? AND raw_type LIKE ?
        GROUP BY raw_type`)
      .bind(user.userId, `${stored}%`).all<{ raw_type: string; n: number; total: number }>();

    return NextResponse.json({ storedLookup: stored, examples, siblings,
      counts: counts.results ?? [],
      reminder: "Amounts and types only. No buyer field read or returned." });
  }

  const connection = await etsyConnection(user.userId);
  const shopId = Number(connection.shopId);
  const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  const to = Math.floor(Date.now() / 1_000);
  const from = to - days * 86_400;

  await waitForEtsyCapacity();
  const response = await fetch(
    `https://openapi.etsy.com/v3/application/shops/${shopId}/payment-account/ledger-entries`
    + `?limit=40&min_created=${from}&max_created=${to}`,
    { headers: { "x-api-key": etsyApiCredential(), authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(25_000) });
  await recordEtsyCall(response, "finance");
  if (!response.ok)
    return NextResponse.json({ status: response.status }, { status: 200 });

  const body = await response.json() as { results?: Array<Record<string, unknown>> };
  const all = body.results ?? [];
  /*
    Look at one code closely rather than a sample of everything. An unmapped
    code is only safe to classify when its own amounts and its neighbours
    establish what it means.
  */
  const only = (new URL(request.url).searchParams.get("type") ?? "").trim();
  const rows = (only
    ? all.filter(row => String(row.ledger_type ?? "") === only)
    : all).slice(0, 25);

  /* The sibling entries written against the same order, which is what shows
     whether a code duplicates or complements the ones beside it. */
  const neighbours = only
    ? all.filter(row => rows.some(pick =>
        String(pick.reference_id ?? "") && String(row.reference_id ?? "") === String(pick.reference_id ?? "")))
      .map(row => ({ ledger_type: row.ledger_type, amount: row.amount,
        reference_type: row.reference_type, reference_id: row.reference_id }))
      .slice(0, 40)
    : [];

  return NextResponse.json({
    fieldsPresent: [...new Set(rows.flatMap(row => Object.keys(row)))],
    sample: rows.map(row => ({
      /* Every field that could carry a type or a sign. Nothing else. */
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      balance: row.balance,
      ledger_type: row.ledger_type,
      entry_type: row.entry_type,
      created: row.create_date ?? row.created_timestamp,
    })),
    typeCounts: Object.entries(all.reduce<Record<string,number>>((into, row) => {
      const key = String(row.ledger_type ?? "");
      into[key] = (into[key] ?? 0) + 1;
      return into;
    }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]),
    neighbours,
    reminder: "Amounts and types only. No buyer field requested or returned.",
  });
});
