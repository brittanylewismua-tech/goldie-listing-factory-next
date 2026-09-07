import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import type { PlanKey, BillingInterval } from "@/app/plan-limits";

type BillingRuntime = {
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_GOLDIE_PRICE_ID?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_SCALE_PRICE_ID?: string;
  STRIPE_SCALE_99_PRICE_ID?: string;
  STRIPE_STARTER_MONTHLY_PRICE_ID?: string;
  STRIPE_STARTER_YEARLY_PRICE_ID?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_YEARLY_PRICE_ID?: string;
  STRIPE_SCALE_MONTHLY_PRICE_ID?: string;
  STRIPE_SCALE_YEARLY_PRICE_ID?: string;
  RESEND_API_KEY?: string;
  GOLDIE_EMAIL_LOGO_URL?: string;
  GOLDIE_SITE_URL?: string;
};

export function billingRuntime() { return env as unknown as BillingRuntime; }

export async function ensureBillingTables(db = billingRuntime().DB) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS billing_customers (user_id TEXT PRIMARY KEY, email TEXT NOT NULL, stripe_customer_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_subscriptions (user_id TEXT PRIMARY KEY, stripe_customer_id TEXT NOT NULL, stripe_subscription_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, plan_key TEXT NOT NULL, current_period_end INTEGER, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS account_plans (user_id TEXT PRIMARY KEY, plan_key TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_trials (user_id TEXT PRIMARY KEY, started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS stripe_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS trial_reminder_emails (user_id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, resend_email_id TEXT NOT NULL, scheduled_for INTEGER NOT NULL, canceled_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_migrations (key TEXT PRIMARY KEY, completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  ]);
  const migrationKey = "2026-08-19-scale-to-pro";
  const migrated = await db.prepare("SELECT 1 done FROM billing_migrations WHERE key=?").bind(migrationKey).first<{done:number}>();
  if (!migrated) {
    await db.batch([
      db.prepare("UPDATE billing_subscriptions SET plan_key='pro',updated_at=CURRENT_TIMESTAMP WHERE plan_key='scale'"),
      db.prepare("UPDATE account_plans SET plan_key='pro',updated_at=CURRENT_TIMESTAMP WHERE plan_key='scale'"),
      db.prepare("INSERT OR IGNORE INTO billing_migrations (key) VALUES (?)").bind(migrationKey),
    ]);
  }
}

export function priceForPlan(plan: PlanKey, interval: BillingInterval = "month") {
  const runtime = billingRuntime();
  // Never use a legacy price for a new checkout. Legacy IDs below remain valid
  // for existing subscriptions, which this release does not reprice.
  if (plan === "goldie") return (interval === "year" ? runtime.STRIPE_STARTER_YEARLY_PRICE_ID : runtime.STRIPE_STARTER_MONTHLY_PRICE_ID) || null;
  if (plan === "pro") return (interval === "year" ? runtime.STRIPE_PRO_YEARLY_PRICE_ID : runtime.STRIPE_PRO_MONTHLY_PRICE_ID) || null;
  return (interval === "year" ? runtime.STRIPE_SCALE_YEARLY_PRICE_ID : runtime.STRIPE_SCALE_MONTHLY_PRICE_ID) || null;
}

export function planForPrice(priceId?: string | null): PlanKey | null {
  const runtime = billingRuntime();
  for (const plan of ["goldie", "pro", "scale"] as const) {
    if (priceId && (priceId === priceForPlan(plan, "month") || priceId === priceForPlan(plan, "year"))) return plan;
  }
  if (priceId && priceId === runtime.STRIPE_GOLDIE_PRICE_ID) return "goldie";
  if (priceId && (priceId === runtime.STRIPE_PRO_PRICE_ID || priceId === runtime.STRIPE_SCALE_PRICE_ID)) return "pro";
  if (priceId && priceId === runtime.STRIPE_SCALE_99_PRICE_ID) return "scale";
  return null;
}

export function isCurrentPrice(priceId?: string | null) {
  return Boolean(priceId && (["goldie", "pro", "scale"] as const).some(plan => priceId === priceForPlan(plan, "month") || priceId === priceForPlan(plan, "year")));
}

export function siteOrigin(request?: Request) {
  const configured = billingRuntime().GOLDIE_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    const canonical = new URL(configured);
    if (request) {
      const incoming = new URL(request.url);
      const goldieHosts = new Set(["thegoldiesuite.com", "www.thegoldiesuite.com"]);
      // Keep host-scoped login cookies on the same approved production host.
      // Never use forwarded headers or an arbitrary incoming host for billing returns.
      if (incoming.origin === canonical.origin ||
          (canonical.protocol === "https:" && incoming.protocol === "https:" &&
           !canonical.port && !incoming.port &&
           goldieHosts.has(canonical.hostname) && goldieHosts.has(incoming.hostname))) {
        return incoming.origin;
      }
    }
    return canonical.origin;
  }
  if (request) return new URL(request.url).origin;
  throw new Error("GOLDIE_SITE_URL is not configured.");
}

export async function stripeRequest<T>(path: string, init: {method?: string; body?: URLSearchParams; idempotencyKey?:string} = {}) {
  const secret = billingRuntime().STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe is not connected yet.");
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, "")}`, {
    method: init.method || "GET",
    headers: { Authorization: `Bearer ${secret}`, "Stripe-Version":"2026-06-24.dahlia", ...(init.body ? {"Content-Type":"application/x-www-form-urlencoded"} : {}), ...(init.idempotencyKey?{"Idempotency-Key":init.idempotencyKey}:{}) },
    body: init.body,
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json() as T & {error?:{message?:string}};
  if (!response.ok) throw new Error(payload.error?.message || "Stripe could not complete that request.");
  return payload;
}

export async function billingState(user: ChatGPTUser, includeTerms = false) {
  const db = billingRuntime().DB;
  await ensureBillingTables(db);
  const row = await db.prepare("SELECT stripe_customer_id customerId, stripe_subscription_id subscriptionId, status, plan_key planKey, current_period_end currentPeriodEnd, cancel_at_period_end cancelAtPeriodEnd FROM billing_subscriptions WHERE user_id=?")
    .bind(user.userId).first<{customerId:string;subscriptionId:string;status:string;planKey:PlanKey;currentPeriodEnd:number|null;cancelAtPeriodEnd:number}>();
  const active = Boolean(row && ["active","trialing","past_due"].includes(row.status));
  let terms: { amount: number; currency: string; interval: string; intervalCount: number } | null = null;
  // Only the Usage + Plan screen requests price details. Access checks do not
  // depend on Stripe availability and existing subscribers see their real price.
  if (includeTerms && row) {
    try {
      const subscription = await stripeRequest<{items:{data:Array<{price:{unit_amount:number|null;currency:string;recurring?:{interval:string;interval_count:number}}}>}}>(`subscriptions/${encodeURIComponent(row.subscriptionId)}`);
      const price = subscription.items.data[0]?.price;
      if (price && price.unit_amount !== null && price.recurring) terms = { amount: price.unit_amount, currency: price.currency, interval: price.recurring.interval, intervalCount: price.recurring.interval_count };
    } catch { /* The billing portal remains authoritative when terms are unavailable. */ }
  }
  return { active, subscription: row || null, terms };
}

export async function customerFor(user: ChatGPTUser) {
  const db = billingRuntime().DB;
  await ensureBillingTables(db);
  const saved = await db.prepare("SELECT stripe_customer_id customerId FROM billing_customers WHERE user_id=?").bind(user.userId).first<{customerId:string}>();
  if (saved?.customerId) return saved.customerId;
  const customer = await stripeRequest<{id:string}>("customers", {method:"POST", body:new URLSearchParams({email:user.email,"metadata[user_id]":user.userId,"metadata[source]":"goldie_listing_factory"})});
  await db.prepare("INSERT INTO billing_customers (user_id,email,stripe_customer_id) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,stripe_customer_id=excluded.stripe_customer_id,updated_at=CURRENT_TIMESTAMP")
    .bind(user.userId,user.email,customer.id).run();
  return customer.id;
}

export async function trialAvailable(user: ChatGPTUser) {
  const db=billingRuntime().DB;
  await ensureBillingTables(db);
  const used=await db.prepare("SELECT 1 used FROM billing_trials WHERE user_id=?").bind(user.userId).first<{used:number}>();
  return !used;
}
