import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type RuntimeEnv={DB?:D1Database};
type BatchListState={activeBundle?:{name?:string};bundleRecipes?:unknown[];keptAsDrafts?:boolean;designs?:Array<{name?:string}>;drafts?:Array<{previewUrl?:string}>;batchReceipt?:{publishedCount?:number}};
function db(){return (env as unknown as RuntimeEnv).DB}
async function ensure(database:D1Database){await database.prepare("CREATE TABLE IF NOT EXISTS listing_batches (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, step TEXT NOT NULL, setup_name TEXT NOT NULL DEFAULT '', product_title TEXT NOT NULL DEFAULT '', design_count INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();await database.prepare("CREATE INDEX IF NOT EXISTS idx_listing_batches_user_updated ON listing_batches(user_id, updated_at)").run()}

/* A design filename only makes a good batch name when the seller named the file.
 * Machine defaults do not: a batch called "ChatGPT Image Aug 21, 2026, 05 32 41
 * PM (2) + 3 more" tells her nothing and is what AI art, phone cameras and
 * screenshots produce by default. When the name is generic, fall through to the
 * product name instead. */
const GENERIC_DESIGN_NAME=/^(chatgpt image|dall[- ]?e|midjourney|gemini|firefly|stable ?diffusion|img|dsc|dscn|pxl|photo|image|screenshot|screen shot|untitled|download|generated image|export|scan|capture)\b/i;
function designLabel(name:string){
  const cleaned=name.replace(/\.[^.]+$/,"").replace(/[-_]+/g," ").replace(/\s+/g," ").trim();
  if(!cleaned)return "";
  if(GENERIC_DESIGN_NAME.test(cleaned))return "";
  // a name that is mostly digits, dates or times is a machine default too
  const letters=cleaned.replace(/[^a-z]/gi,"").length;
  if(letters<4)return "";
  return cleaned;
}
function batchListItem(row:Record<string,unknown>){let state:BatchListState={};try{state=JSON.parse(String(row.state_json||"{}")) as BatchListState}catch{/* A damaged snapshot should not hide the rest of Batch History. */}const designs=(state.designs||[]).map(design=>designLabel(String(design.name||""))).filter(Boolean);const designName=designs.length>1?`${designs[0]} + ${designs.length-1} more`:designs[0];const sellerNamed=state.keptAsDrafts&&String(row.setup_name||"").trim();return {id:row.id,status:row.status,step:row.step,setup_name:row.setup_name,/* A bundle batch stored the ACTIVE product's blueprint here, so Batch History
   labelled a three-product bundle "Unisex Midweight Softstyle Fleece Hoodie" —
   naming one member as though it were the whole batch. */
  product_title:(state.activeBundle&&(state.bundleRecipes||[]).length>1)?`${(state.bundleRecipes||[]).length} products`:row.product_title,design_count:row.design_count,created_at:row.created_at,updated_at:row.updated_at,display_name:sellerNamed||designName||row.setup_name||row.product_title||"Untitled batch",thumbnail_url:(state.drafts||[]).find(draft=>draft.previewUrl)?.previewUrl||"",published_count:Math.max(0,Number(state.batchReceipt?.publishedCount)||0)}}

export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});const database=db();if(!database)return NextResponse.json({error:"Batch history is unavailable."},{status:503});await ensure(database);const url=new URL(request.url),id=url.searchParams.get("id");if(id){const row=await database.prepare("SELECT * FROM listing_batches WHERE id=? AND user_id=?").bind(id,user.userId).first<Record<string,unknown>>();return row?NextResponse.json({batch:{...row,state:JSON.parse(String(row.state_json||"{}"))}}):NextResponse.json({error:"That batch was not found."},{status:404})}const rows=await database.prepare("SELECT id,status,step,setup_name,product_title,design_count,state_json,created_at,updated_at FROM listing_batches WHERE user_id=? ORDER BY updated_at DESC LIMIT 20").bind(user.userId).all<Record<string,unknown>>();return NextResponse.json({batches:rows.results.map(batchListItem)})}

export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});const database=db();if(!database)return NextResponse.json({error:"Batch history is unavailable."},{status:503});await ensure(database);const body=await request.json() as {id?:string;status?:string;step?:string;setupName?:string;productTitle?:string;designCount?:number;state?:unknown};const id=String(body.id||crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g,"").slice(0,80);const allowedStatus=new Set(["draft","processing","needs_attention","complete"]),allowedStep=new Set(["connect","setup","designs","review","finish"]);const status=allowedStatus.has(String(body.status))?String(body.status):"draft",step=allowedStep.has(String(body.step))?String(body.step):"connect";const stateJson=JSON.stringify(body.state??{});if(stateJson.length>750000)return NextResponse.json({error:"This batch snapshot is too large."},{status:413});await database.prepare("INSERT INTO listing_batches (id,user_id,status,step,setup_name,product_title,design_count,state_json,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET status=excluded.status,step=excluded.step,setup_name=excluded.setup_name,product_title=excluded.product_title,design_count=excluded.design_count,state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP WHERE user_id=excluded.user_id").bind(id,user.userId,status,step,String(body.setupName||"").slice(0,160),String(body.productTitle||"").slice(0,200),Math.max(0,Math.min(20,Number(body.designCount||0))),stateJson).run();return NextResponse.json({id,saved:true})}

export async function DELETE(request:Request){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});const database=db();if(!database)return NextResponse.json({error:"Batch history is unavailable."},{status:503});await ensure(database);const id=String(new URL(request.url).searchParams.get("id")||"").replace(/[^a-zA-Z0-9-]/g,"").slice(0,80);if(!id)return NextResponse.json({error:"Choose a batch to clear."},{status:400});await database.prepare("DELETE FROM listing_batches WHERE id=? AND user_id=?").bind(id,user.userId).run();return NextResponse.json({deleted:true})}
