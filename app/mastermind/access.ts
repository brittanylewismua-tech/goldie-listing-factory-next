import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

type Runtime = { DB?: D1Database; MASTERMIND_ACCESS_CODE?: string };
export function runtime() { return env as unknown as Runtime; }

export function isOwner(user: ChatGPTUser) {
  return ["beawolfbiz@gmail.com", "brittany@beawolfbiz.com"].includes(user.email.trim().toLowerCase());
}

export async function mastermindState(user: ChatGPTUser) {
  if (isOwner(user)) return { active: true, redeemed: true, owner: true };
  const db = runtime().DB;
  if (!db) return { active: false, redeemed: false, owner: false };
  const [setting, access] = await Promise.all([
    db.prepare("SELECT active FROM mastermind_settings WHERE id = 1").first<{ active: number }>(),
    db.prepare("SELECT 1 AS redeemed FROM mastermind_access WHERE user_id = ?").bind(user.userId).first<{ redeemed: number }>(),
  ]);
  return { active: setting?.active === 1, redeemed: access?.redeemed === 1, owner: false };
}

export async function codeMatches(value: string) {
  const expected = runtime().MASTERMIND_ACCESS_CODE;
  if (!expected || !value) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(value.trim())), crypto.subtle.digest("SHA-256", encoder.encode(expected))]);
  const a = new Uint8Array(left); const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}
