import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { apiKey, etsyRedirectUri, goldieSiteUrl } from "@/app/api/etsy/client";
import { etsyOauthState } from "@/app/etsy-connect-intent";
import { oauthReturnOrigin } from "@/app/api/etsy/return-origin";
import { SHOP_MAP_SCOPES } from "@/app/shop-map-auth";

/**
 * THE ONE LINK THAT ASKS ETSY FOR SALES PERMISSION.
 *
 * Shop Map's button points here. It exists as a plain GET so the member —
 * or the person testing this — can simply open it: a flow that can only be
 * started by a POST from one particular screen is a flow that cannot be
 * handed to somebody as a link.
 *
 * It asks for the Listing Factory's existing scopes plus `transactions_r`,
 * and nothing else. The existing connection is untouched until Etsy returns a
 * token, so declining here leaves the member exactly as they were.
 */
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const GET = withErrorLog("shop-map-connect-sales", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const redirectUri = etsyRedirectUri();
  /* Single-use, random, and short-lived: the state is what ties the callback
     back to this member and this request. */
  const state = etsyOauthState("connect", base64url(crypto.getRandomValues(new Uint8Array(24))));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));

  await db.batch([
    db.prepare(`DELETE FROM etsy_oauth_states WHERE expires_at<=unixepoch()`),
    db.prepare(
      `INSERT INTO etsy_oauth_states
         (state,user_id,code_verifier,redirect_uri,return_origin,expires_at)
       VALUES (?,?,?,?,?,unixepoch()+600)`)
      .bind(state, user.userId, verifier, redirectUri,
        oauthReturnOrigin(request.url, goldieSiteUrl())),
  ]);

  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SHOP_MAP_SCOPES,
    client_id: apiKey(),
    state,
    code_challenge: base64url(digest),
    code_challenge_method: "S256",
  });
  const authorizeUrl = `https://www.etsy.com/oauth/connect?${params}`;

  /* Opened in a browser this should just go to Etsy; asked for as JSON it
     returns the link, which is what a page's button needs. */
  if (new URL(request.url).searchParams.get("json"))
    return NextResponse.json({ authorizeUrl, scope: SHOP_MAP_SCOPES });
  return NextResponse.redirect(authorizeUrl);
});
