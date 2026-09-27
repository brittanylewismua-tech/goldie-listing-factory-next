import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/app/supabase-auth";

/*
  MASTERBOT — THE CHATGPT APP FOR THE WOLF METHOD MASTERMIND.

  Where things live, and why:

  - Sign-in for ChatGPT is Supabase's own OAuth 2.1 server (issuer below). The
    consent screen is /listing-factory/oauth/consent on this site, because
    Supabase appends its authorization path to the project's Site URL.
  - The playbooks are NOT in this repository (it is public). They sit in the
    private `masterbot` schema in Supabase, readable only through
    public.masterbot_playbook(), which re-checks membership on every call.
  - Membership is masterbot.members, fed by the Kajabi offer webhook for
    "The Wolf Method Mastermind" (Supabase function masterbot-kajabi-webhook).

  This file holds no secret. The access token ChatGPT sends is forwarded to
  Supabase as-is; Supabase verifies it and decides.
*/

export const MASTERBOT_ORIGIN = "https://thegoldiesuite.com";
export const MASTERBOT_MCP_PATH = "/api/masterbot/mcp";
export const MASTERBOT_RESOURCE = `${MASTERBOT_ORIGIN}${MASTERBOT_MCP_PATH}`;
export const MASTERBOT_ISSUER = `${SUPABASE_URL}/auth/v1`;
export const MASTERBOT_RESOURCE_METADATA =
  `${MASTERBOT_ORIGIN}/.well-known/oauth-protected-resource${MASTERBOT_MCP_PATH}`;

/* The sections a caller may ask for. The enum in the tool schema is this list,
   so an unknown section is refused before it reaches the database. */
export const MASTERBOT_SECTIONS = [
  "shop_review",
  "shop_review_patterns",
  "shop_summary",
  "execution",
  "keyword_mapping",
  "ceo_mode",
  "outcome_detacher",
  "ceo_transcripts_1",
  "ceo_transcripts_2",
] as const;
export type MasterbotSection = (typeof MASTERBOT_SECTIONS)[number];

export type RpcResult<T> = { ok: true; data: T } | { ok: false; status: number };

async function rpc<T>(fn: string, token: string, body: unknown = {}): Promise<RpcResult<T>> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, data: await response.json() as T };
}

export type MasterbotProfile = { signed_in: boolean; active: boolean };
export type MasterbotPlaybook = {
  allowed: boolean; section: string; found?: boolean; playbook?: string;
};

/* Asks Kajabi, live, whether this member's Mastermind purchase is still
   active, and records the answer before the database gate reads it. Someone
   who quits the Mastermind has a deactivated purchase and is locked out on
   their next request (answers are reused for at most 10 minutes). */
export async function refreshMembership(token: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/masterbot-membership`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    /* The gate below still decides from the last recorded answer. */
  }
}

export const masterbotProfile = (token: string) =>
  rpc<MasterbotProfile>("masterbot_profile", token);

export const masterbotPlaybook = (token: string, section: string) =>
  rpc<MasterbotPlaybook>("masterbot_playbook", token, { p_section: section });

/* Only the publishable key is needed: the function returns the one value the
   OpenAI portal asks this domain to publish, and nothing else. */
export async function openaiAppsChallenge(): Promise<string | null> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/masterbot_openai_challenge`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const value = await response.json() as unknown;
  return typeof value === "string" && value ? value : null;
}
