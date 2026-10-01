import { cookies } from "next/headers";

export const QA_OIDC_COOKIE = "goldie_qa_oidc";
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS = ISSUER + "/.well-known/jwks";
const AUDIENCE = "goldie-shop-map-qa";
const REPOSITORY = "brittanylewismua-tech/goldie-listing-factory-next";
const WORKFLOW = REPOSITORY + "/.github/workflows/deploy.yml@refs/heads/main";

function decode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
function jsonPart(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decode(value))) as Record<string, unknown>;
}

export async function verifiedQaOidc(token: string): Promise<number|null> {
  try {
    if (token.length < 300 || token.length > 10000) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = jsonPart(parts[0]);
    const claims = jsonPart(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE
      || claims.repository !== REPOSITORY || claims.ref !== "refs/heads/main"
      || claims.workflow_ref !== WORKFLOW || claims.event_name !== "push"
      || claims.runner_environment !== "github-hosted") return null;
    const exp = Number(claims.exp), nbf = Number(claims.nbf ?? claims.iat);
    if (!Number.isFinite(exp) || !Number.isFinite(nbf) || exp <= now || exp > now + 600 || nbf > now + 30) return null;
    const response = await fetch(JWKS, {signal:AbortSignal.timeout(6000)});
    if (!response.ok) return null;
    const body = await response.json() as {keys?:Array<JsonWebKey & {kid?:string}>};
    const jwk = body.keys?.find(key => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk,
      {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"}, false, ["verify"]);
    const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), signed);
    return valid ? exp : null;
  } catch { return null; }
}

export async function isQaOidcReviewer(): Promise<boolean> {
  const token = (await cookies()).get(QA_OIDC_COOKIE)?.value ?? "";
  return (await verifiedQaOidc(token)) !== null;
}
