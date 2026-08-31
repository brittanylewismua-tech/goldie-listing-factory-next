import { isSellerFixable } from "./error-classification";
import { env } from "cloudflare:workers";

// One place every failure gets written down.
//
// Before this there were three unrelated things: printify_diagnostics, which
// recorded draft creation properly, with the member's email; /api/client-errors,
// which console.error'd into Cloudflare's logs where nothing is queryable and
// nobody is identified; and everywhere else, which recorded nothing at all. So a
// customer could hit a failure publishing to Etsy, rendering a mockup or building
// a title, and the only trace was whatever they chose to tell us.
//
// This records who it happened to, when, where in the app, what broke, and enough
// context to act on it - and emails Brittany so she hears it before the customer
// does.

export type LoggedError = {
  area: string;                 // "etsy-publish", "mockup-render", "browser", ...
  message: string;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  errorCode?: string | null;
  httpStatus?: number | null;
  url?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown> | null;
  severity?: "error" | "warning";
  sellerFixable?: boolean;
};

type LogRuntime = { DB?: D1Database; RESEND_API_KEY?: string; GOLDIE_ALERT_EMAIL?: string; GOLDIE_SITE_URL?: string };
function runtime() { return env as unknown as LogRuntime; }

const cut = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/* D645 · Every alert email so far has been a problem only the seller could fix -
   a shipping profile from the wrong shop, an incomplete Etsy field. Brittany's
   words: "I don't need to know about the errors until somebody contacts me
   anyways. It's not like I'm gonna see an error in my inbox and then email the
   person about it." With one seller that is noise; with a hundred it is their
   support queue landing in her inbox, burying the platform failures she does
   need to see.

   So the log keeps everything and the email is reserved for what she can act on:
   Printify unreachable, Etsy tokens broken, the queue itself faulting. These
   patterns are the seller's own to fix and are recorded silently. */

/* Tokens and keys must never be written into a log we then email around. */
const SECRETS = /\b(Bearer\s+[\w.\-]+|sk-[\w-]{8,}|key-[\w-]{8,}|gld-admin-[\w-]+|eyJ[\w.-]{20,})/gi;
export function scrubSecrets(value: string) { return value.replace(SECRETS, "[redacted]"); }

export async function ensureErrorLog(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS error_log (
      id text PRIMARY KEY NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      area text NOT NULL,
      severity text DEFAULT 'error' NOT NULL,
      user_id text,
      user_email text,
      user_name text,
      message text NOT NULL,
      error_code text,
      http_status integer,
      url text,
      user_agent text,
      context text,
      alerted integer DEFAULT 0 NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log (created_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_error_log_area ON error_log (area,created_at)`),
  ]);
}

/** Records a failure. Never throws - logging must not become its own outage. */
export async function logError(input: LoggedError): Promise<string | null> {
  const db = runtime().DB;
  if (!db) return null;
  const id = crypto.randomUUID();
  try {
    await ensureErrorLog(db);
    const message = scrubSecrets(cut(input.message, 1000)) || "Unknown error";
    await db.prepare(`INSERT INTO error_log
      (id,area,severity,user_id,user_email,user_name,message,error_code,http_status,url,user_agent,context)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        id,
        cut(input.area, 60) || "unknown",
        input.severity === "warning" ? "warning" : "error",
        input.userId ?? null,
        input.userEmail ? cut(input.userEmail, 200) : null,
        input.userName ? cut(input.userName, 120) : null,
        message,
        input.errorCode ? cut(input.errorCode, 80) : null,
        Number.isFinite(input.httpStatus as number) ? Number(input.httpStatus) : null,
        input.url ? scrubSecrets(cut(input.url, 400)) : null,
        input.userAgent ? cut(input.userAgent, 300) : null,
        input.context ? scrubSecrets(cut(JSON.stringify(input.context), 2000)) : null,
      ).run();
    /* D845 · No email. Every failure is still written to error_log with who,
       when, where and why, and /mastermind-admin is where it is read. She asked
       for a maintenance view the two of us can open, not an inbox that fills up
       with the same integration failing two hundred times. */
    return id;
  } catch {
    return null;
  }
}

/* One email per area per fifteen minutes. A failing integration can produce
   hundreds of identical errors, and an inbox nobody can face is the same as no
   alerting at all. The log keeps every one; the email says it is happening. */
const ALERT_WINDOW_MINUTES = 15;

/* D845 · The emailer lived here. It sent one message per area per fifteen
   minutes to brittanylewismua@gmail.com for every non-seller-fixable failure.
   It is gone: nothing in this file sends mail. The record it was built to
   deliver is the error_log row, which is written either way, and the place to
   read it is /mastermind-admin - owner only, which is the maintenance site she
   asked for. */

/* Wrapping a route handler catches what instrumenting each return site by hand
   would miss: the throw nobody predicted. Handlers that return an error response
   rather than throwing still call logError directly. */
export function withErrorLog<R extends Request, T extends unknown[]>(
  area: string,
  handler: (request: R, ...rest: T) => Promise<Response>,
) {
  return async (request: R, ...rest: T): Promise<Response> => {
    try {
      return await handler(request, ...rest);
    } catch (error) {
      const { getChatGPTUser } = await import("@/app/chatgpt-auth");
      const user = await getChatGPTUser().catch(() => null);
      await logError({
        area,
        message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        userId: user?.userId,
        userEmail: user?.email,
        userName: user?.displayName || user?.fullName,
        url: new URL(request.url).pathname,
        userAgent: request.headers.get("user-agent"),
        httpStatus: 500,
        context: { stack: error instanceof Error ? String(error.stack || "").slice(0, 1200) : undefined },
      });
      // Unchanged from before: the customer still gets a clean failure.
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: "Something went wrong. Goldie has recorded it." }, { status: 500 });
    }
  };
}

/* Owner-only diagnostic. The alert path deliberately swallows every failure so
   that a broken mailer cannot turn one error into two - which also means a
   silent mailer looks exactly like a working one. This reports what actually
   happened, without ever returning the key itself. */
/* D845 · testAlertEmail went with the emailer. There is no mailer left to
   test. */
