import { billingRuntime } from "@/app/billing";
import type { PlanKey } from "@/app/plan-limits";

type ReminderRuntime = { RESEND_API_KEY?: string; GOLDIE_EMAIL_LOGO_URL?: string; GOLDIE_SITE_URL?: string };
type ScheduledEmail = { id: string };
function runtime() { return billingRuntime() as unknown as ReminderRuntime; }
function money(plan: PlanKey) { return plan === "scale" ? "$99.00" : plan === "pro" ? "$59.00" : "$29.00"; }
function planName(plan: PlanKey) { return plan === "scale" ? "Listing Factory Scale" : plan === "pro" ? "Listing Factory Pro" : "Listing Factory Starter"; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character); }

export function trialReminderHtml({ plan, chargeAt, logoUrl }: { plan: PlanKey; chargeAt: number; logoUrl?: string }) {
  const env = runtime(), site = (env.GOLDIE_SITE_URL || "https://thegoldiesuite.com").replace(/\/$/, "");
  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(chargeAt * 1000));
  const resolvedLogo = logoUrl || env.GOLDIE_EMAIL_LOGO_URL || `${site}/listing-factory-email-logo.png`;
  const logo = `<img src="${escapeHtml(resolvedLogo)}" width="400" alt="The Listing Factory, powered by Goldie GPT" style="display:block;width:400px;max-width:100%;height:auto;margin:0 auto;">`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:480px){.email-shell{padding:24px 10px!important}.email-card{border-radius:22px!important}.email-logo{padding:32px 22px 12px!important}.email-heading{padding:18px 22px 10px!important}.email-heading h1{font-size:31px!important}.email-copy{padding:14px 22px 4px!important;font-size:16px!important}.email-action{padding:26px 18px 14px!important}.email-footer{padding:10px 22px 30px!important}}</style></head><body style="margin:0;background:#f8d7e5;font-family:Arial,Helvetica,sans-serif;color:#43283d;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#f8d7e5 0%,#e2d4ff 52%,#f5c5d9 100%);"><tr><td class="email-shell" style="padding:44px 16px;"><table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:rgba(255,255,255,.88);border:1px solid rgba(255,255,255,.95);border-radius:28px;box-shadow:0 22px 65px rgba(83,42,78,.18);"><tr><td class="email-logo" style="padding:42px 38px 16px;">${logo}</td></tr><tr><td class="email-heading" style="padding:22px 38px 12px;text-align:center;"><p style="margin:0 0 12px;font:700 12px/1.4 Arial,sans-serif;letter-spacing:2.4px;color:#9a568d;">YOUR TRIAL ENDS TOMORROW</p><h1 style="margin:0;font:500 38px/1.12 Georgia,Times New Roman,serif;color:#4b243f;">Keep creating, or update your plan.</h1></td></tr><tr><td class="email-copy" style="padding:16px 38px 6px;text-align:center;font:400 17px/1.65 Arial,sans-serif;color:#674a60;"><p style="margin:0 0 18px;">Your three-day <strong>${planName(plan)}</strong> trial ends on <strong>${date}</strong>.</p><p style="margin:0;">Your card will be charged <strong>${money(plan)}</strong> for your first month unless you cancel before the trial ends.</p></td></tr><tr><td class="email-action" style="padding:30px 38px 18px;text-align:center;"><a href="${site}/usage" style="display:inline-block;background:#562b4b;color:#fff;text-decoration:none;font:700 16px/1 Arial,sans-serif;padding:18px 30px;border-radius:999px;box-shadow:0 12px 28px rgba(86,43,75,.22);">Review or cancel my plan</a></td></tr><tr><td class="email-footer" style="padding:12px 38px 38px;text-align:center;font:400 13px/1.6 Arial,sans-serif;color:#846b7e;"><p style="margin:0;">You can manage your subscription anytime from Usage + Plan inside the Listing Factory.</p></td></tr></table><p style="margin:22px auto 0;text-align:center;font:600 11px/1.5 Arial,sans-serif;letter-spacing:1.4px;color:#77566f;">POWERED BY GOLDIE AI · © 2026 BE A WOLF BIZ</p></td></tr></table></body></html>`;
}

export async function scheduleTrialReminder(input: { email: string; plan: PlanKey; trialEnd: number }) {
  const key = runtime().RESEND_API_KEY;
  if (!key || !input.email) return null;
  const scheduledAt = input.trialEnd - 86400;
  if (scheduledAt <= Math.floor(Date.now() / 1000) + 60) return null;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Listing Factory <hello@mail.thegoldiesuite.com>", to: [input.email], subject: "Your Listing Factory trial ends tomorrow", html: trialReminderHtml({ plan: input.plan, chargeAt: input.trialEnd }), scheduled_at: new Date(scheduledAt * 1000).toISOString(), tags: [{ name: "email_type", value: "trial_reminder" }, { name: "plan", value: input.plan }] }), signal: AbortSignal.timeout(15000) });
  const payload = await response.json() as ScheduledEmail & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Trial reminder could not be scheduled.");
  return payload.id;
}

export async function cancelTrialReminder(emailId?: string | null) {
  const key = runtime().RESEND_API_KEY;
  if (!key || !emailId) return;
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok && response.status !== 404 && response.status !== 409) throw new Error("Scheduled trial reminder could not be canceled.");
}
