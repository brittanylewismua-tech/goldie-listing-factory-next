import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

// These two switches intentionally live in source control. Customer access
// cannot be enabled by changing the Site's sharing setting alone.
export const CUSTOMER_LAUNCH_ENABLED = false;
export const SECURE_URL_UPLOAD_IMPLEMENTED = true;

type Runtime = { DB?: D1Database };

export async function customerLaunchBlock(user: ChatGPTUser) {
  if (CUSTOMER_LAUNCH_ENABLED && SECURE_URL_UPLOAD_IMPLEMENTED) return null;

  // The existing private tester remains usable while customer launch is locked.
  const normalizedEmail = user.email.trim().toLowerCase();
  if (["beawolfbiz@gmail.com", "brittany@beawolfbiz.com"].includes(normalizedEmail)) return null;
  const db = (env as unknown as Runtime).DB;
  const existingTester = db
    ? await db.prepare("SELECT 1 AS allowed FROM printify_connections WHERE user_id = ? LIMIT 1").bind(user.userId).first<{ allowed: number }>()
    : null;
  if (existingTester?.allowed === 1) return null;

  return CUSTOMER_LAUNCH_ENABLED
    ? "Customer launch is locked until secure temporary-URL artwork delivery is implemented."
    : "Goldie Listing Factory is currently in private testing. Customer access has not been enabled yet.";
}
