import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { inspectionPass } from "@/app/triggered-inspection";

/**
 * Work the inspection queue for one firing.
 *
 * Same authentication as the sensor: the clock builds this request in memory,
 * so it carries no cf-connecting-ip and no caller on the internet can forge
 * its absence. An owner may also run a pass by hand.
 */
export const GET = withErrorLog("market-inspect-tick", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const asked = Number(new URL(request.url).searchParams.get("jobs"));
  const maxJobs = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 100) : 20;
  return NextResponse.json(await inspectionPass({ maxJobs }));
});
