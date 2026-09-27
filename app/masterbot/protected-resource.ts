import { MASTERBOT_ISSUER, MASTERBOT_RESOURCE } from "@/app/masterbot/masterbot-server";

/* RFC 9728 protected-resource metadata for the MasterBot MCP server. It names
   Supabase's OAuth server as the only authorization server. */
export function protectedResourceResponse() {
  return new Response(JSON.stringify({
    resource: MASTERBOT_RESOURCE,
    authorization_servers: [MASTERBOT_ISSUER],
    scopes_supported: ["openid", "email", "profile"],
    bearer_methods_supported: ["header"],
    resource_name: "MasterBot",
    resource_documentation: "https://thegoldiesuite.com/masterbot",
  }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
