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
};

type LogRuntime = { DB?: D1Database; RESEND_API_KEY?: string; GOLDIE_ALERT_EMAIL?: string; GOLDIE_SITE_URL?: string };
function runtime() { return env as unknown as LogRuntime; }

const cut = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

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
    await alert(db, id, { ...input, message });
    return id;
  } catch {
    return null;
  }
}

/* One email per area per fifteen minutes. A failing integration can produce
   hundreds of identical errors, and an inbox nobody can face is the same as no
   alerting at all. The log keeps every one; the email says it is happening. */
const ALERT_WINDOW_MINUTES = 15;

async function alert(db: D1Database, id: string, input: LoggedError) {
  const config = runtime();
  const key = config.RESEND_API_KEY;
  const to = config.GOLDIE_ALERT_EMAIL || "brittanylewismua@gmail.com";
  if (!key || input.severity === "warning") return;
  try {
    const recent = await db.prepare(
      `SELECT COUNT(*) AS count FROM error_log
       WHERE area = ? AND alerted = 1 AND created_at > datetime('now', ?)`)
      .bind(input.area, `-${ALERT_WINDOW_MINUTES} minutes`).first<{ count: number }>();
    if ((recent?.count ?? 0) > 0) return;

    const site = (config.GOLDIE_SITE_URL || "https://thegoldiesuite.com").replace(/\/$/, "");
    const escape = (value: string) => value.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
    const row = (label: string, value?: string | number | null) =>
      value === null || value === undefined || value === "" ? "" :
      `<tr><td style="padding:6px 14px 6px 0;color:#7a6a76;font:600 12px system-ui">${label}</td>
       <td style="padding:6px 0;color:#2c1f2a;font:400 13px system-ui">${escape(String(value))}</td></tr>`;

    const html = `<div style="font-family:system-ui,sans-serif;max-width:640px">
      <p style="font:700 15px system-ui;color:#7c3350;margin:0 0 4px">Listing Factory error</p>
      <p style="font:400 13px system-ui;color:#6b5c67;margin:0 0 16px">${escape(input.area)}</p>
      <table style="border-collapse:collapse">
        ${row("Who", input.userEmail || input.userId || "Not signed in")}
        ${row("Name", input.userName)}
        ${row("When", new Date().toISOString())}
        ${row("Where", input.url)}
        ${row("Code", input.errorCode)}
        ${row("HTTP", input.httpStatus)}
        ${row("Browser", input.userAgent)}
      </table>
      <p style="font:600 13px system-ui;color:#2c1f2a;margin:16px 0 4px">What happened</p>
      <pre style="white-space:pre-wrap;background:#fdeef3;border-left:3px solid #a32c4c;padding:12px;font:400 12px ui-monospace,monospace;color:#4a2b3d;margin:0">${escape(input.message)}</pre>
      ${input.context ? `<p style="font:600 13px system-ui;color:#2c1f2a;margin:16px 0 4px">Context</p>
      <pre style="white-space:pre-wrap;background:#faf6fb;padding:12px;font:400 12px ui-monospace,monospace;color:#4a2b3d;margin:0">${escape(JSON.stringify(input.context, null, 2).slice(0, 1500))}</pre>` : ""}
      <p style="font:400 12px system-ui;color:#6b5c67;margin:18px 0 0">
        Reference ${escape(id)} · <a href="${site}/mastermind-admin" style="color:#7c3350">Open the error log</a><br>
        Further ${escape(input.area)} errors in the next ${ALERT_WINDOW_MINUTES} minutes are recorded but not emailed.
      </p></div>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Listing Factory <hello@mail.thegoldiesuite.com>",
        to: [to],
        subject: `Listing Factory error · ${input.area}${input.userEmail ? ` · ${input.userEmail}` : ""}`,
        html,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) await db.prepare("UPDATE error_log SET alerted = 1 WHERE id = ?").bind(id).run();
  } catch { /* An alert that cannot send must not turn one failure into two. */ }
}

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
