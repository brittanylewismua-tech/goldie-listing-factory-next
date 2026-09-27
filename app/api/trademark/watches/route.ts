import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { liveTrademarkSearch } from "@/app/trademark-live";
import { crossSiteWrite, CROSS_SITE_REFUSAL } from "@/app/same-site-only";
import { check, toMatches, withRegister } from "@/app/trademark-check";
import { lookup, normalize, registerSize, squeeze } from "@/app/trademark-register";

const ensure = (db: D1Database) => db.prepare(`CREATE TABLE IF NOT EXISTS trademark_watches (
  user_id TEXT NOT NULL,
  phrase TEXT NOT NULL,
  last_risk TEXT NOT NULL DEFAULT '',
  last_signature TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, phrase))`).run();

const signature = (value: { risk: string; hits?: Array<{ matched?: string }>;
  register?: Array<{ mark?: string; registered?: boolean; serial?:string; owner?:string; classes?:string[]; goods?:string[] }> }) => JSON.stringify({
    risk: value.risk,
    hits: (value.hits ?? []).map(row => String(row.matched ?? "").toLowerCase()).sort(),
    register: (value.register ?? []).map(row => JSON.stringify([row.serial,String(row.mark ?? "").toLowerCase(),row.registered,row.owner,[...(row.classes??[])].sort(),row.goods??[]])).sort(),
  });

export const GET = withErrorLog("trademark-watches", async () => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to view watched phrases." }, { status: 401 });
  const db = (env as unknown as { DB: D1Database }).DB;
  await ensure(db);
  const saved = await db.prepare(`SELECT phrase, last_risk AS lastRisk,
    last_signature AS lastSignature, created_at AS createdAt, checked_at AS checkedAt
    FROM trademark_watches WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`)
    .bind(user.userId).all<{ phrase: string; lastRisk: string; lastSignature: string;
      createdAt: number; checkedAt: number }>();
  const size = await registerSize(db).catch(() => null);
  const watches = [];
  for (const row of saved.results ?? []) {
    const base = check(row.phrase);
    const hits = await lookup(db, row.phrase).catch(() => null);
    const local=toMatches(hits??[],row.phrase,normalize,squeeze);
    const live=await liveTrademarkSearch(row.phrase,db,local.filter(m=>m.exact).map(m=>m.mark));
    if((!hits||!size)&&!live){watches.push({...row,risk:row.lastRisk||'review',changed:false,pending:false,matches:null,error:'Records could not be checked. Try again.'});continue;}
    const current = withRegister(base,live?.records??local,size);
    if(live){current.register=live.records;current.registerReady=live.complete;current.registerComplete=live.complete;}
    const currentSignature = signature(current);
    watches.push({ ...row, incomplete:!current.registerReady || current.registerComplete === false, risk: current.risk, changed: Boolean(row.lastSignature)
      && row.lastSignature !== currentSignature,
      pending: (current.register ?? []).some(match => !match.registered),
      matches: current.hits.length + (current.register ?? []).length });
  }
  return NextResponse.json({ watches });
});

export const POST = withErrorLog("trademark-watch-save", async (request: Request) => {
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to watch a phrase." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { phrase?: string };
  let phrase = String(body.phrase ?? "").trim().slice(0, 200);
  if (!phrase) return NextResponse.json({ error: "Enter a phrase first." }, { status: 400 });
  const db = (env as unknown as { DB: D1Database }).DB;
  await ensure(db);
  // Match the update label in the UI: a change of letter case updates the
  // existing watch rather than silently creating a second saved phrase.
  const existing=await db.prepare('SELECT phrase FROM trademark_watches WHERE user_id=? AND lower(phrase)=lower(?) LIMIT 1').bind(user.userId,phrase).first<{phrase:string}>();
  if(existing?.phrase)phrase=existing.phrase;
  const size = await registerSize(db).catch(() => null);
  const hits = await lookup(db, phrase).catch(() => null);
  const local=toMatches(hits??[],phrase,normalize,squeeze);
  const live=await liveTrademarkSearch(phrase,db,local.filter(m=>m.exact).map(m=>m.mark));
  if((!hits||!size)&&!live)return NextResponse.json({error:'The trademark records could not be checked. Your saved check has not changed.'},{status:503});
  const current = withRegister(check(phrase),live?.records??local,size);
  if(live){current.register=live.records;current.registerReady=live.complete;current.registerComplete=live.complete;}
  const now = Math.floor(Date.now() / 1_000);
  await db.prepare(`INSERT INTO trademark_watches
    (user_id, phrase, last_risk, last_signature, created_at, checked_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(user_id, phrase) DO UPDATE SET
    last_risk = excluded.last_risk, last_signature = excluded.last_signature,
    checked_at = excluded.checked_at`)
    .bind(user.userId, phrase, current.risk, signature(current), now, now).run();
  return NextResponse.json({ saved: true });
});

export const DELETE = withErrorLog("trademark-watch-remove", async (request: Request) => {
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to update watched phrases." }, { status: 401 });
  const phrase = String(new URL(request.url).searchParams.get("phrase") ?? "").slice(0, 200);
  const db = (env as unknown as { DB: D1Database }).DB;
  await ensure(db);
  await db.prepare(`DELETE FROM trademark_watches WHERE user_id = ? AND phrase = ?`)
    .bind(user.userId, phrase).run();
  return NextResponse.json({ removed: true });
});
