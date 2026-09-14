import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { apiKey, etsyRedirectUri, goldieSiteUrl } from "@/app/api/etsy/client";
import { etsyOauthState } from "@/app/etsy-connect-intent";
import { oauthReturnOrigin } from "@/app/api/etsy/return-origin";
import { SHOP_MAP_SCOPES } from "@/app/shop-map-auth";
import { readTarget } from "@/app/shop-map-targets";

/**
 * ASK ETSY FOR SALES PERMISSION ON ONE SAVED SHOP.
 *
 * A plain GET, so it can be handed to somebody as a link. It names the shop
 * with an opaque handle the server issued — never a shop id from the URL —
 * and carries that shop through the OAuth state so the callback can refuse an
 * authorisation that came back for a different Etsy account.
 *
 * NOTHING ABOUT THE ACTIVE SHOP CHANGES. Publishing stays pointed wherever it
 * was pointed, before and after.
 */
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const GET = withErrorLog("shop-map-connect-sales", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const handle = new URL(request.url).searchParams.get("for") ?? "";
  const target = handle ? await readTarget(user.userId, handle) : null;
  if (!target)
    return NextResponse.json(
      { error: "That authorisation link has expired. Open Shop Map and try again." },
      { status: 400 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const redirectUri = etsyRedirectUri();
  const state = etsyOauthState("sales", base64url(crypto.getRandomValues(new Uint8Array(24))));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));

  /* The intended shop travels in the state row, on the server, not in the
     redirect. The callback compares what Etsy authorised against it. */
  await db.batch([
    db.prepare(`DELETE FROM etsy_oauth_states WHERE expires_at<=unixepoch()`),
    db.prepare(
      `INSERT INTO etsy_oauth_states
         (state,user_id,code_verifier,redirect_uri,return_origin,target_shop_id,expires_at)
       VALUES (?,?,?,?,?,?,unixepoch()+600)`)
      .bind(state, user.userId, verifier, redirectUri,
        oauthReturnOrigin(request.url, goldieSiteUrl()), target.shopId),
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

  if (new URL(request.url).searchParams.get("json"))
    return NextResponse.json({ authorizeUrl, shopName: target.shopName, scope: SHOP_MAP_SCOPES });
  return NextResponse.redirect(authorizeUrl);
});
