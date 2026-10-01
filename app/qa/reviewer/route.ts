import { NextResponse } from "next/server";
import { QA_COOKIE, QA_EXPIRES_AT, validQaToken } from "@/app/qa-reviewer";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!(await validQaToken(token)))
    return new Response("Reviewer link unavailable.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const response = NextResponse.redirect(new URL("/shop-map", url.origin));
  const maxAge = Math.max(0, Math.floor((QA_EXPIRES_AT - Date.now()) / 1000));
  response.cookies.set(QA_COOKIE, token, {
    path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
