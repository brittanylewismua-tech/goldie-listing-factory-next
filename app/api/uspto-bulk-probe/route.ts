import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { blocks, singleEntryDeflateStream } from "@/app/uspto-bulk";

/**
 * CAN WE ACTUALLY READ ONE OF THESE FILES?
 *
 * Before building an ingest that runs for days, prove the chain on the
 * smallest file USPTO publishes: fetch with the key, unwrap the zip, inflate,
 * and cut out records. It reports the first records verbatim, because the DTD
 * is long and the file is the only honest description of itself.
 */
const key = () => (env as unknown as { USPTO_API_KEY?: string }).USPTO_API_KEY?.trim() || "";

export const GET = withErrorLog("uspto-bulk-probe", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const file = parameters.get("file") || "apc18840407-20251231-91.zip";
  const product = parameters.get("product") || "TRTYRAP";
  const stop = Number(parameters.get("records") || 3);

  const started = Date.now();
  const response = await fetch(
    `https://api.uspto.gov/api/v1/datasets/products/files/${product}/${file}`,
    { headers: { "X-API-KEY": key(), "user-agent": "Goldie/1.0 (+https://thegoldiesuite.com)" } },
  );
  if (!response.ok || !response.body)
    return NextResponse.json({
      step: "fetch",
      status: response.status,
      body: (await response.text()).slice(0, 500),
    });

  const samples: string[] = [];
  let counted = 0;
  try {
    const xml = await singleEntryDeflateStream(response.body);
    for await (const record of blocks(xml, "case-file")) {
      counted += 1;
      if (samples.length < stop) samples.push(record.slice(0, 4_000));
      /* Stop early: this is a proof, not the ingest. */
      if (counted >= stop) break;
    }
  } catch (error) {
    return NextResponse.json({
      step: "read",
      counted,
      error: error instanceof Error ? error.message : "failed",
    });
  }

  return NextResponse.json({
    file,
    counted,
    msElapsed: Date.now() - started,
    samples,
  });
});
