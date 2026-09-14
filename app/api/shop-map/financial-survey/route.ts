import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";

/**
 * WHAT ETSY ACTUALLY RETURNS ABOUT MONEY.
 *
 * Profit is the one number in Goldie that a member could act on financially,
 * so none of it may be built on a documented field that turns out to be
 * absent, or on a fee that cannot honestly be tied to an order. This reads a
 * small window of real receipts, transactions, payments and ledger entries and
 * reports their SHAPE — which fields exist, which carry linking identifiers,
 * and which charges are shop-level with nothing to attach them to.
 *
 * NO BUYER DATA IS REPORTED. Receipts carry names, addresses, and messages.
 * Field names and types only, with every personal field withheld by name.
 */
const PERSONAL = new Set([
  "name", "first_line", "second_line", "city", "state", "zip", "country_iso",
  "formatted_address", "buyer_email", "seller_email", "message_from_buyer",
  "message_from_seller", "message_from_payment", "buyer_user_id",
]);

const shapeOf = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length ? [shapeOf(value[0], depth + 1)] : [];
  if (typeof value !== "object") return typeof value;
  if (depth > 3) return "object";
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) =>
      [key, PERSONAL.has(key) ? "withheld" : shapeOf(inner, depth + 1)]));
};

export const GET = withErrorLog("shop-map-financial-survey", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const connection = await etsyConnection(user.userId);
  const shopId = Number(parameters.get("shop")) || connection.shopId;
  const limit = Math.min(25, Math.max(1, Number(parameters.get("limit")) || 10));

  const call = async (path: string) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
      headers: {
        /* key:secret. The bare key answers 403 with a message that reads like
           a refused permission. */
        "x-api-key": etsyApiCredential(),
        authorization: `Bearer ${connection.token}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    await recordEtsyCall(response, "qa");
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* reported as text */ }
    return { status: response.status, parsed, text: parsed ? "" : text.slice(0, 300) };
  };

  const receipts = await call(`/shops/${shopId}/receipts?limit=${limit}`);
  const receiptRows = ((receipts.parsed as { results?: Array<Record<string, unknown>> })?.results) ?? [];
  const first = receiptRows[0];

  /* Money on a receipt arrives as {amount, divisor, currency_code}. Reported
     as a shape so nobody is tempted to read it as a float later. */
  const moneyFields = first
    ? Object.entries(first)
      .filter(([, value]) =>
        value !== null && typeof value === "object" && "divisor" in (value as object))
      .map(([key]) => key)
    : [];

  const transactionsOf = (receipt: Record<string, unknown> | undefined) =>
    ((receipt?.transactions ?? []) as Array<Record<string, unknown>>);

  /*
    The ledger refused a ninety-day window with a 400 and no explanation worth
    repeating, so both spellings are tried and whichever answers is reported.
    Etsy's error body is carried through verbatim: a 400 that nobody reads is
    how a fee ends up quietly missing from a profit figure.
  */
  const windowed = await call(
    `/shops/${shopId}/payment-account/ledger-entries?limit=${limit}` +
    `&min_created=${Math.floor(Date.now() / 1000) - 90 * 86_400}&max_created=${Math.floor(Date.now() / 1000)}`);
  const plain = windowed.status === 200
    ? windowed
    : await call(`/shops/${shopId}/payment-account/ledger-entries?limit=${limit}`);
  const ledger = plain;
  const ledgerRows = ((ledger.parsed as { results?: Array<Record<string, unknown>> })?.results) ?? [];

  /*
    WHICH LEDGER ENTRIES CAN BE TIED TO AN ORDER?

    Etsy's ledger mixes per-order fees with shop-level charges. Anything with
    no identifier is a monthly shop expense and must never be attached to a
    listing by reading its description — a description is prose, not a link.
  */
  const ledgerKinds: Record<string, { count: number; withReference: number }> = {};
  for (const row of ledgerRows) {
    const kind = String(row.entry_type ?? row.ledger_entry_type ?? "unknown");
    const linked = Boolean(row.reference_id ?? row.payment_id ?? row.receipt_id);
    const held = ledgerKinds[kind] ?? { count: 0, withReference: 0 };
    held.count += 1;
    if (linked) held.withReference += 1;
    ledgerKinds[kind] = held;
  }

  const firstReceiptId = first?.receipt_id;
  const payments = firstReceiptId
    ? await call(`/shops/${shopId}/receipts/${firstReceiptId}/payments`)
    : { status: 0, parsed: null, text: "" };

  return NextResponse.json({
    shopId,
    receipts: {
      status: receipts.status,
      count: (receipts.parsed as { count?: number })?.count ?? null,
      returned: receiptRows.length,
      moneyFields,
      shape: first ? shapeOf(first) : null,
    },
    transactions: {
      onFirstReceipt: transactionsOf(first).length,
      shape: transactionsOf(first)[0] ? shapeOf(transactionsOf(first)[0]) : null,
      /* The identifiers a Printify line item would have to be matched against. */
      identifiers: transactionsOf(first)[0] ? {
        transaction_id: typeof transactionsOf(first)[0].transaction_id,
        listing_id: typeof transactionsOf(first)[0].listing_id,
        product_id: typeof transactionsOf(first)[0].product_id,
        sku: typeof transactionsOf(first)[0].sku,
        quantity: typeof transactionsOf(first)[0].quantity,
      } : null,
    },
    payments: {
      status: payments.status,
      /* A 404 here may mean "no payment record for this receipt" rather than
         "wrong path", and the two need telling apart before any fee is
         called missing. */
      said: payments.status === 200 ? null : (payments.parsed ?? payments.text),
      receiptTried: firstReceiptId ?? null,
      shape: ((payments.parsed as { results?: unknown[] })?.results ?? [])[0]
        ? shapeOf(((payments.parsed as { results?: unknown[] }).results ?? [])[0]) : null,
    },
    ledger: {
      status: ledger.status,
      windowedStatus: windowed.status,
      said: ledger.status === 200 ? null : (ledger.parsed ?? ledger.text),
      returned: ledgerRows.length,
      kinds: ledgerKinds,
      shape: ledgerRows[0] ? shapeOf(ledgerRows[0]) : null,
    },
  });
});
