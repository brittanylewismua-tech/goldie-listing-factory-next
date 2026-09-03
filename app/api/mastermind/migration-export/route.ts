import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { decryptPrintifyToken, encryptPrintifyToken } from "@/app/api/printify/token-crypto";

type Runtime = { DB?: D1Database; ARTWORK?: R2Bucket; PRINTIFY_TOKEN_KEY?: string; MIGRATION_EXPORT_SECRET?: string };

function runtime() { return env as unknown as Runtime; }
function safeTable(name: string) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name); }

async function owner() {
  const user = await getChatGPTUser();
  return Boolean(user && isOwner(user));
}

async function authorized(request: Request) {
  const supplied = request.headers.get("x-goldie-migration-secret") || "";
  const expected = runtime().MIGRATION_EXPORT_SECRET || "";
  if (expected && supplied.length === expected.length && supplied === expected) return true;
  return owner();
}

async function rotateTokens(table: string, rows: Record<string, unknown>[], oldKey: string, newKey: string) {
  if (table === "printify_connections") {
    for (const row of rows) {
      const encrypted = String(row.encrypted_token || "");
      if (encrypted) row.encrypted_token = await encryptPrintifyToken(await decryptPrintifyToken(encrypted, oldKey), newKey);
    }
  }
  if (table === "etsy_connections") {
    for (const row of rows) {
      for (const column of ["encrypted_access_token", "encrypted_refresh_token"] as const) {
        const encrypted = String(row[column] || "");
        if (encrypted) row[column] = await encryptPrintifyToken(await decryptPrintifyToken(encrypted, oldKey), newKey);
      }
    }
  }
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { DB, PRINTIFY_TOKEN_KEY } = runtime();
  const body = await request.json().catch(() => ({})) as { newTokenKey?: string; table?: string };
  const newKey = body.newTokenKey?.trim() || "";
  if (!DB || !PRINTIFY_TOKEN_KEY || !/^[a-f0-9]{64}$/i.test(newKey)) return NextResponse.json({ error: "Migration is not configured." }, { status: 400 });

  const schemas = await DB.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_account_reset_%' ORDER BY name").all<{name:string;sql:string}>();
  if (!body.table) return NextResponse.json({ tables: schemas.results.filter(schema => safeTable(schema.name) && schema.sql) });
  const selected = schemas.results.find(schema => schema.name === body.table && safeTable(schema.name) && schema.sql);
  if (!selected) return NextResponse.json({ error: "Table not found." }, { status: 404 });
  const rows = (await DB.prepare(`SELECT * FROM \`${selected.name}\``).all<Record<string, unknown>>()).results;
  await rotateTokens(selected.name, rows, PRINTIFY_TOKEN_KEY, newKey);
  return NextResponse.json({ table: { name: selected.name, sql: selected.sql, rows } });

}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const bucket = runtime().ARTWORK;
  if (!bucket) return NextResponse.json({ error: "Storage is unavailable." }, { status: 503 });
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key) {
    const object = await bucket.get(key);
    if (!object) return NextResponse.json({ error: "Object not found." }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    return new Response(object.body, { headers });
  }
  const objects: Array<{key:string;size:number;etag:string}> = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ limit: 1000, cursor });
    objects.push(...page.objects.map(object => ({ key: object.key, size: object.size, etag: object.httpEtag })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return NextResponse.json({ objects });
}
