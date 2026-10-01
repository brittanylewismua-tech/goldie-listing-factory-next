import { NextResponse } from "next/server";
import { QA_OIDC_COOKIE, verifiedQaOidc } from "@/app/qa-reviewer-oidc";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expires = await verifiedQaOidc(token);
  if (!expires) return NextResponse.json({error:"Reviewer identity unavailable."}, {status:403});
  const response = NextResponse.json({ok:true,reviewer:"shop-map"});
  response.cookies.set(QA_OIDC_COOKIE, token, {
    path:"/", httpOnly:true, secure:true, sameSite:"lax",
    maxAge:Math.max(0, expires-Math.floor(Date.now()/1000)),
  });
  response.headers.set("Cache-Control","no-store");
  return response;
}
