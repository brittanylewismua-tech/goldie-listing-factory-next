import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

type Runtime = { DB?: D1Database; MASTERMIND_ACCESS_CODE?: string; MASTERMIND_BETA_REDEEM_UNTIL?:string };
export function runtime() { return env as unknown as Runtime; }

export function isOwner(user: ChatGPTUser) {
  return ["beawolfbiz@gmail.com", "brittany@beawolfbiz.com", "brittanylewismua@gmail.com"].includes(user.email.trim().toLowerCase());
}

export async function mastermindState(user: ChatGPTUser) {
  if (isOwner(user)) return { active: true, redeemed: true, expired:false, owner: true, expiresAt: null };
  const db = runtime().DB;
  if (!db) return { active: false, redeemed: false, expired:false, owner: false, expiresAt: null };
  const [setting, access] = await Promise.all([
    db.prepare("SELECT active FROM mastermind_settings WHERE id = 1").first<{ active: number }>(),
    db.prepare("SELECT redeemed_at redeemedAt, datetime(redeemed_at, '+48 hours') expiresAt FROM mastermind_access WHERE user_id = ?").bind(user.userId).first<{ redeemedAt:string;expiresAt:string }>(),
  ]);
  const redeemed=Boolean(access?.redeemedAt),notExpired=Boolean(access?.expiresAt&&new Date(`${access.expiresAt.replace(" ","T")}Z`).getTime()>Date.now());
  const redeemUntil=runtime().MASTERMIND_BETA_REDEEM_UNTIL, enrollmentOpen=Boolean(setting?.active===1&&redeemUntil&&new Date(redeemUntil).getTime()>Date.now());
  return { active: enrollmentOpen||notExpired, enrollmentOpen, redeemed:redeemed&&notExpired, expired:redeemed&&!notExpired, owner: false, expiresAt: access?.expiresAt||null };
}

export async function codeMatches(value: string) {
  const expected = runtime().MASTERMIND_ACCESS_CODE;
  if (!expected || !value) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(value.trim().toUpperCase())), crypto.subtle.digest("SHA-256", encoder.encode(expected.trim().toUpperCase()))]);
  const a = new Uint8Array(left); const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}
