import { openaiAppsChallenge } from "@/app/masterbot/masterbot-server";

/* The OpenAI Apps domain check. The token lives in Supabase
   (masterbot.settings, key openai_apps_challenge), so setting it needs no
   deploy. Until it is set this answers 404. */
export async function GET() {
  const token = await openaiAppsChallenge();
  if (!token) return new Response("Not configured", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(token, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
