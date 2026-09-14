import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { inspectInterval, inspectionPass } from "@/app/triggered-inspection";

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
  const parameters = new URL(request.url).searchParams;

  /* Re-run one interval by hand. Inspecting an interval twice is meant to be
     harmless, and this is how that is verified against production rather than
     asserted in a comment. */
  const one = Number(parameters.get("interval"));
  if (Number.isFinite(one) && one > 0)
    return NextResponse.json(await inspectInterval(one) ?? { error: "No such interval." });

  const asked = parameters.get("jobs") === null ? NaN : Number(parameters.get("jobs"));
  const maxJobs = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 100) : 20;
  return NextResponse.json(await inspectionPass({ maxJobs }));
});
