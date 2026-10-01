import { cookies } from "next/headers";

export const QA_REVIEWER_ID = "qa:goldie-shop-map-reviewer";
export const QA_REVIEWER_EMAIL = "qa-reviewer@goldie.invalid";
export const QA_COOKIE = "goldie_qa_review";
export const QA_EXPIRES_AT = Date.UTC(2026, 10, 1);
const QA_TOKEN_SHA256 = "ac538e5e53e5a2388a7310768af1b71cba888ce1d766ebb17a95f6a8d1f52e6d";

export async function validQaToken(token: string): Promise<boolean> {
  if (Date.now() >= QA_EXPIRES_AT || token.length < 40 || token.length > 128) return false;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const actual = [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
  let difference = 0;
  for (let i = 0; i < QA_TOKEN_SHA256.length; i++) difference |= actual.charCodeAt(i) ^ QA_TOKEN_SHA256.charCodeAt(i);
  return difference === 0;
}

export async function isQaReviewer(): Promise<boolean> {
  const value = (await cookies()).get(QA_COOKIE)?.value ?? "";
  return validQaToken(value);
}
