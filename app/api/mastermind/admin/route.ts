import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const body = await request.json() as { active?: boolean; disconnect?: boolean };
  const db = runtime().DB;
  if (!db || typeof body.active !== "boolean") return NextResponse.json({ error: "The setting could not be changed." }, { status: 400 });
  await db.prepare("INSERT INTO mastermind_settings (id, active, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET active = excluded.active, updated_at = CURRENT_TIMESTAMP").bind(body.active ? 1 : 0).run();

  /*
    PAUSING IS NOT THE SAME AS CUTTING SOMEBODY OFF.

    Turning access off always deleted every tester's saved Printify token. That
    is right when somebody is being removed for good, and wrong every other
    time: the usual reason to close the door is "not while I am in the middle
    of changing things", and paying members should not each have to reconnect
    Printify when it opens again an hour later. Deleting a token is not
    reversible from this end, so it now has to be asked for.
  */
  if (!body.active && body.disconnect === true)
    await db.prepare("DELETE FROM printify_connections WHERE user_id IN (SELECT user_id FROM mastermind_access)").run();
  return NextResponse.json({ active: body.active, disconnected: Boolean(!body.active && body.disconnect) });
}
