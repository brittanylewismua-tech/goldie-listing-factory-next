import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { bundleHistoryIdentity } from "@/app/batch-history-identity";
import { APPLY_BUNDLE_KEYWORD_BANK } from "@/app/bundle-keyword-bank";

type RuntimeEnv={DB?:D1Database};
type BatchListState={templateDetails?:{previewImage?:string;previewImages?:string[]};activeBundle?:{name?:string};activeRecipe?:{name?:string};bundleIndex?:number;bundleRecipes?:unknown[];keptAsDrafts?:boolean;batchDisplayName?:string;designs?:Array<{name?:string}>;drafts?:Array<{id?:string;previewUrl?:string}>;batchReceipt?:{publishedCount?:number}};
function db(){return (env as unknown as RuntimeEnv).DB}
async function ensure(database:D1Database){await database.prepare("CREATE TABLE IF NOT EXISTS listing_batches (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, step TEXT NOT NULL, setup_name TEXT NOT NULL DEFAULT '', product_title TEXT NOT NULL DEFAULT '', design_count INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();await database.prepare("CREATE INDEX IF NOT EXISTS idx_listing_batches_user_updated ON listing_batches(user_id, updated_at)").run();
  /* D871 · A bundle run is one job the seller started, and it was stored as one
     row per product: same name, same badge, separate history, separate resume,
     separate publish. D697 records what that already nearly cost - a bundle's
     listings credited to one member, a Resume button over work that was live,
     and pressing it "would have published them again and charged Etsy's fee
     twice".

     The fix is a parent, not a rewrite. One row owns what the seller sees -
     identity, history, resume, deletion, publish authorisation and the receipt
     - and the existing per-product rows hang off it as children, keeping their
     own state and their own isolation exactly as they are. The children stop
     owning anything seller-facing; that is the whole change.

     Deliberately NOT a bundle_runs table: etsy_publish_jobs is
     UNIQUE(user_id,batch_id) against a listing_batches id, so keeping the
     parent in the same id space means the publish job, its per-item
     attribution and the receipt need no schema change at all.

     listing_batches is created here rather than by drizzle, so the column is
     added here too. ALTER fails once the column exists; that is the guard. */
  await database.prepare("ALTER TABLE listing_batches ADD parent_batch_id TEXT").run().catch(()=>undefined);
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_listing_batches_parent ON listing_batches(user_id, parent_batch_id)").run().catch(()=>undefined)}

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
function batchListItem(row:Record<string,unknown>,publishedByBatch:Record<string,number>={},publishedAtByBatch:Record<string,string>={},publishedAtByProduct:Record<string,string>={}){let state:BatchListState={};try{state=JSON.parse(String(row.state_json||"{}")) as BatchListState}catch{/* A damaged snapshot should not hide the rest of Batch History. */}const designs=(state.designs||[]).map(design=>designLabel(String(design.name||""))).filter(Boolean);const designName=designs.length>1?`${designs[0]} + ${designs.length-1} more`:designs[0];/* D686 - this used to read row.setup_name, and setup_name is not the name the
     seller chose. The client writes that one column from
     `batchDisplayName||activeBundle?.name||activeRecipe?.name||""`, so an autosave
     with no chosen name stores the RECIPE name there - and this line then presented
     it as if she had typed it, ranking it above the batch's real product.
     Measured on batch b8ce58cb: setup_name "Gildan Hoodie", product_title "Unisex
     Garment-Dyed Sweatshirt", while every workflow step showed the card as
     "Comfort Colors 1566 crewneck". The name was frozen from whichever recipe
     happened to be active at one autosave and never reconciled. The seller's typed
     name now travels in the state snapshot, where nothing else can overwrite it. */
  const mineByProduct=(state.drafts||[]).reduce((found,draft)=>{
    const at=draft.id?publishedAtByProduct[String(draft.id)]:undefined;
    if(!at)return found;
    return {count:found.count+1,at:at>found.at?at:found.at};
  },{count:0,at:""});
  const sellerNamed=String(state.batchDisplayName||"").trim(),bundleIdentity=bundleHistoryIdentity(state);return {id:row.id,status:row.status,step:row.step,setup_name:row.setup_name,/* A bundle batch stored the ACTIVE product's blueprint here, so Batch History
   labelled a three-product bundle "Unisex Midweight Softstyle Fleece Hoodie" —
   naming one member as though it were the whole batch. */
  /* D551 - D510 stopped one member of a bundle being named as though it were the
     whole batch, and overcorrected: every member then read "ZZ TEST BUNDLE / 3
     products · 2 designs", so one run of three products produced three rows that
     were identical apart from a timestamp. Verified on her history: six rows,
     nothing to tell them apart. The bundle names the batch; this says which of
     its products the batch actually holds. */
  product_title:bundleIdentity?.productTitle||row.product_title,design_count:row.design_count,created_at:row.created_at,updated_at:row.updated_at,/* D510 - three batches of the same bundle showed three different names: one
     read "Gildan Tee" over a hoodie thumbnail while the others read "ZZ TEST
     BUNDLE". setup_name holds the saved product a batch happened to start from,
     which for a bundle is one member of three and not what the batch is. A
     bundle is named by its bundle. */
  display_name:bundleIdentity?.displayName||sellerNamed||designName||row.product_title||row.setup_name||"Untitled batch",/* product_title before setup_name: product_title is derived from the batch's real drafts and stays current, setup_name is a snapshot of a recipe that may since have changed. *//* D225 · Batch History labelled every unpublished batch "DRAFTS READY", whether
     or not a single draft existed. Measured across all 17 saved batches: not one
     had a draft in its snapshot, and all 17 claimed drafts were ready. The count
     is right here in the state, so report it. */
  draft_count:(state.drafts||[]).length,/* D511 - a batch minted by the bundle run has no drafts yet, so this found no
     preview and the row showed a grey placeholder icon - on the very screen whose
     job is to let her recognise a batch at a glance. The product's own photo is
     in the snapshot; use it until a draft preview exists. */
  thumbnail_url:(state.drafts||[]).find(draft=>draft.previewUrl)?.previewUrl||state.templateDetails?.previewImage||(state.templateDetails?.previewImages||[]).find(Boolean)||"",/* D481 - this counted only what the browser had managed to autosave into the
     batch snapshot, so straight after a publish it read zero: the goal line said
     "0 of your 20 listings this week" on a page headed "2 listings are live on
     Etsy". How many listings are live is a fact about Etsy, not about whether a
     tab finished writing. The publish job's own completed count wins. */
  /* D704 · Its own products first; the batch-level counts stay as fallbacks so
     nothing that reads correctly today starts reading zero. */
  published_at:mineByProduct.at||publishedAtByBatch[String(row.id)]||null,published_count:Math.max(mineByProduct.count,Number(publishedByBatch[String(row.id)])||0,Number(state.batchReceipt?.publishedCount)||0)}}

/* D871 · What the run's card reports, gathered from its children.
   The parent row carries the run's identity and the seller's chosen name; the
   children carry the per-product work, and they are the only place the counts
   honestly exist. Listings are designs x products because that is what she
   asked for - counting the child rows that happen to exist reported 2 while
   she was making 4. */
type RunChild={batchId:string;productName:string;position:number;drafts:number;published:number;done:boolean};
function withRunProgress(item:Record<string,unknown>,parent:Record<string,unknown>,children:Array<Record<string,unknown>>,publishedByBatch:Record<string,number>,publishedAtByProduct:Record<string,string>){
  let parentState:{run?:{bundleName?:string;productOrder?:string[];activeProductId?:string}}={};
  try{parentState=JSON.parse(String(parent.state_json||"{}"))}catch{/* a damaged parent must not hide the run */}
  const order=parentState.run?.productOrder||[];
  const read=(child:Record<string,unknown>)=>{let state:BatchListState&{activeRecipe?:{id?:string;name?:string}}={};try{state=JSON.parse(String(child.state_json||"{}"))}catch{/* keep going */}return state};
  const members:RunChild[]=children.map(child=>{
    const state=read(child);
    const recipeId=String(state.activeRecipe?.id||"");
    const drafts=(state.drafts||[]);
    /* Published is counted per Printify product, the same way the rest of this
       route does it, so a child reports what is actually live rather than what
       a snapshot managed to autosave. */
    const published=drafts.filter(draft=>draft.id&&publishedAtByProduct[String(draft.id)]).length
      ||Number(publishedByBatch[String(child.id)])||0;
    const position=order.indexOf(recipeId);
    return {batchId:String(child.id),productName:String(state.activeRecipe?.name||"").trim(),position:position>=0?position+1:order.length+1,drafts:drafts.length,published,done:published>0};
  }).sort((a,b)=>a.position-b.position);
  const total=Math.max(order.length,members.length);
  const designs=Math.max(0,...children.map(child=>Number(child.design_count)||0));
  const listings=designs*Math.max(1,total);
  const publishedTotal=members.reduce((sum,member)=>sum+member.published,0);
  /* Where the work stopped, not where it started. D697's near-miss was a Resume
     button over listings that were already live. */
  const resumeInto=members.find(member=>!member.done)?.batchId||members[members.length-1]?.batchId||String(parent.id);
  return {...item,
    display_name:String(parentState.run?.bundleName||item.display_name||"Bundle run"),
    product_title:`${total} products · ${listings} ${listings===1?"listing":"listings"} · ${designs} ${designs===1?"design":"designs"}`,
    design_count:designs,
    draft_count:members.reduce((sum,member)=>sum+member.drafts,0),
    published_count:publishedTotal,
    thumbnail_url:String(item.thumbnail_url||"")||children.map(child=>{const state=read(child);return (state.drafts||[]).find(draft=>draft.previewUrl)?.previewUrl||state.templateDetails?.previewImage||""}).find(Boolean)||"",
    members,
    bundle_total:total,
    resume_batch_id:resumeInto};
}

export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});const database=db();if(!database)return NextResponse.json({error:"Batch history is unavailable."},{status:503});await ensure(database);const url=new URL(request.url),id=url.searchParams.get("id");if(id){const row=await database.prepare("SELECT * FROM listing_batches WHERE id=? AND user_id=?").bind(id,user.userId).first<Record<string,unknown>>();if(!row)return NextResponse.json({error:"That batch was not found."},{status:404});const state=JSON.parse(String(row.state_json||"{}")) as BatchListState,productIds=(state.drafts||[]).map(draft=>String(draft.id||"")).filter(Boolean);let authoritativeReceipt:{publishedCount:number;etsyUrls:string[];completedAt:string}|null=null;if(productIds.length){const marks=productIds.map(()=>"?").join(","),items=await database.prepare(`SELECT result_json,updated_at FROM etsy_publish_items WHERE user_id=? AND status='completed' AND product_id IN (${marks})`).bind(user.userId,...productIds).all<{result_json:string|null;updated_at:string}>().catch(()=>({results:[]}));const parsed=(items.results||[]).map(item=>{try{return {result:JSON.parse(item.result_json||"{}") as {url?:string},at:String(item.updated_at||"")}}catch{return {result:{},at:String(item.updated_at||"")}}});if(parsed.length)authoritativeReceipt={publishedCount:parsed.length,etsyUrls:parsed.map(item=>String(item.result.url||"")).filter(Boolean),completedAt:parsed.reduce((latest,item)=>item.at>latest?item.at:latest,"")}}/* D871 · A run row is asked for by the URL, and what the page needs is the
       product record to open. The children come with it so resume is one round
       trip and one decision: the product she left open, or the first that has
       not published. */
    const kids=await database.prepare("SELECT id,status,step,product_title,design_count,state_json,updated_at FROM listing_batches WHERE user_id=? AND parent_batch_id=?").bind(user.userId,String(row.id)).all<Record<string,unknown>>().catch(()=>({results:[] as Array<Record<string,unknown>>}));
    /* Live on Etsy is a fact about the publish records, not about what a tab
       managed to autosave, so it is read from there. */
    const done=await database.prepare("SELECT product_id FROM etsy_publish_items WHERE user_id=? AND status='completed'").bind(user.userId).all<{product_id:string}>().catch(()=>({results:[] as Array<{product_id:string}>}));
    const publishedProductIds=new Set((done.results||[]).map(item=>String(item.product_id)));
    const children=(kids.results||[]).map(child=>{let childState:BatchListState&{activeRecipe?:{id?:string;name?:string}}={};try{childState=JSON.parse(String(child.state_json||"{}"))}catch{/* keep going */}const drafts=childState.drafts||[];return {id:String(child.id),productId:String(childState.activeRecipe?.id||""),productName:String(childState.activeRecipe?.name||""),drafts:drafts.length,published:drafts.filter(draft=>draft.id&&publishedProductIds.has(String(draft.id))).length,updated_at:String(child.updated_at||"")}});
    return NextResponse.json({batch:{...row,state},children,authoritativeReceipt})}/* D871 · Batch History lists runs, not the records a run keeps for each of its
     products. A parent and a single-product batch both have no parent of their
     own; a child never appears on its own. Legacy sibling rows predate the
     column, so parent_batch_id is NULL on all of them and they list exactly as
     they do today - ungrouped, untouched. */
  const rows=await database.prepare("SELECT id,status,step,setup_name,product_title,design_count,state_json,created_at,updated_at FROM listing_batches WHERE user_id=? AND parent_batch_id IS NULL ORDER BY updated_at DESC LIMIT 20").bind(user.userId).all<Record<string,unknown>>();
  /* Each run's children, for the aggregate the card reports. One query. */
  const parentIds=(rows.results||[]).map(row=>String(row.id));
  const childRows=parentIds.length
    ?await database.prepare(`SELECT id,parent_batch_id,status,step,product_title,design_count,state_json,updated_at FROM listing_batches WHERE user_id=? AND parent_batch_id IN (${parentIds.map(()=>"?").join(",")})`).bind(user.userId,...parentIds).all<Record<string,unknown>>().catch(()=>({results:[] as Array<Record<string,unknown>>}))
    :{results:[] as Array<Record<string,unknown>>};
  const childrenByParent=new Map<string,Array<Record<string,unknown>>>();
  for(const child of childRows.results||[]){const key=String(child.parent_batch_id||"");if(!childrenByParent.has(key))childrenByParent.set(key,[]);childrenByParent.get(key)!.push(child)}/* D701 · Falls back to the job's batch_id when the item has none. D697 added the
     column and a migration to backfill it; the backfill did not populate, so on the
     first deploy every completed item still had NULL and Batch History reported
     zero published for work that is live on Etsy - the same Resume-and-republish
     risk D697 existed to remove, now on both products instead of one. Correctness
     here must not depend on a data migration having succeeded: the join gives the
     old attribution for old rows and the new per-listing attribution for new ones.

     D697 · Count the listings, not the jobs. A bundle publishes in one call and the
     job carries a single batch_id, so this credited every listing in the bundle to
     whichever product happened to be first. Measured after a real publish of the
     Hoodie + 1566 crewneck bundle: "4 PUBLISHED TO ETSY" on the hoodie, "DRAFT"
     with a Resume button on the crewneck, whose two listings were live on Etsy.
     Pressing Resume would have published them again and charged Etsy's fee twice.
     Each item now records the batch its own draft came from. */
  /* D704 · Attribute by product, not by batch id. A bundle's drafts all carry the
     batch they were first drafted in - measured on hers, every draft in both
     products carried 3c6ac387, neither of the two current batch ids - so the job,
     and D697's per-item column, both file under a batch that no longer owns
     anything. The product id is the one link that survives: each batch's snapshot
     lists the Printify products it owns, and etsy_publish_items records the product
     it published. */
  const publishedProducts=await database.prepare("SELECT product_id,MAX(updated_at) published_at FROM etsy_publish_items WHERE user_id=? AND status='completed' GROUP BY product_id").bind(user.userId).all<{product_id:string;published_at:string|null}>().catch(()=>({results:[] as Array<{product_id:string;published_at:string|null}>}));
  const publishedAtByProduct=Object.fromEntries((publishedProducts.results||[]).map(row=>[String(row.product_id),String(row.published_at||"")]));
  const published=await database.prepare("SELECT COALESCE(i.batch_id,j.batch_id) batch_id,COUNT(*) completed,MAX(i.updated_at) published_at FROM etsy_publish_items i LEFT JOIN etsy_publish_jobs j ON j.id=i.job_id WHERE i.user_id=? AND i.status='completed' AND COALESCE(i.batch_id,j.batch_id) IS NOT NULL GROUP BY COALESCE(i.batch_id,j.batch_id)").bind(user.userId).all<{batch_id:string;completed:number;published_at:string|null}>().catch(()=>({results:[] as Array<{batch_id:string;completed:number}>}));
  /* D700 · Carry WHEN it published, not just how many. The weekly goal was counting
     a batch into the week it was CREATED, so work started one week and published the
     next landed in the wrong week - and a batch created weeks ago and published today
     would not have counted at all. */
  const publishedByBatch=Object.fromEntries(published.results.map(row=>[String(row.batch_id),Number(row.completed)||0]));
  const publishedAtByBatch=Object.fromEntries(published.results.map(row=>[String(row.batch_id),String(row.published_at||"")]));
  /* D708 · The weekly goal used to be summed from THIS list, and this list is
     LIMIT 20. So every new batch pushed an older one off the end, and if that
     older batch was published this week its listings stopped counting: her bar
     went from 6 to 4 without her publishing or deleting anything. A number that
     falls when you start unrelated work is worse than no number.

     How many listings went live is a fact about the publish records, not about
     which page of history happens to be loaded, so it is counted there and sent
     alongside. Each product is counted once, on the day it most recently
     completed, which is the same rule the per-product lookup above already uses
     - a republish moves a listing, it does not mint a second one. */
  /* D711 · Two defects, one line, and the second is the one that mattered.
     The binding was user.id. The authenticated object exposes userId - every
     other query in this file binds user.userId - so this bound undefined, D1
     rejected the statement, the route threw, and Batch History went to 500.
     A counter in the sidebar took down the batch list.
     That is the real fault: this query is decoration for a goal bar, and it was
     wired so that its failure destroys the page's primary data. It cannot throw
     into the response any more. If the goal cannot be counted the seller sees
     no goal; she does not lose her batches. */
  let publishedDays:Array<{day:string;count:number}>=[];
  try{
    const publishedDayRows=await database.prepare("SELECT substr(MAX(updated_at),1,10) day,product_id FROM etsy_publish_items WHERE user_id=? AND status='completed' GROUP BY product_id").bind(user.userId).all();
    const publishedByDay:Record<string,number>={};
    for(const row of publishedDayRows.results||[]){const day=String((row as {day?:string}).day||"");if(!day)continue;publishedByDay[day]=(publishedByDay[day]||0)+1}
    publishedDays=Object.entries(publishedByDay).map(([day,count])=>({day,count})).sort((a,b)=>a.day<b.day?1:-1);
  }catch(error){
    console.error("batches: weekly goal count failed, serving batches without it",error);
  }
  /* D938 · Goldie now stops at private Printify drafts, so a goal based on Etsy
     publishes can never move. Count the successful draft records the seller
     actually creates in Goldie. The old `published` history remains in the
     response for truthful legacy receipts and Batch History attribution. */
  let preparedDays:Array<{day:string;count:number}>=[];
  try{
    const preparedDayRows=await database.prepare("SELECT substr(updated_at,1,10) day,COUNT(*) count FROM printify_draft_results WHERE user_id=? AND status='succeeded' GROUP BY substr(updated_at,1,10) ORDER BY day DESC").bind(user.userId).all<{day:string;count:number}>();
    preparedDays=(preparedDayRows.results||[]).map(row=>({day:String(row.day||""),count:Math.max(0,Number(row.count)||0)})).filter(row=>row.day);
  }catch(error){
    console.error("batches: listing goal count failed, serving batches without it",error);
  }
  return NextResponse.json({batches:rows.results.map(row=>{const item=batchListItem(row,publishedByBatch,publishedAtByBatch,publishedAtByProduct);const children=childrenByParent.get(String(row.id))||[];return children.length?withRunProgress(item,row,children,publishedByBatch,publishedAtByProduct):item}),prepared:preparedDays,published:publishedDays})}

export async function PATCH(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});
  const database=db();if(!database)return NextResponse.json({error:"Batch history is unavailable."},{status:503});
  const body=await request.json().catch(()=>null) as {id?:unknown;keywordBankId?:unknown}|null;
  if(typeof body?.id!=="string"||typeof body.keywordBankId!=="string"||!body.id||!body.keywordBankId||body.id.length>80||body.keywordBankId.length>80)return NextResponse.json({error:"Choose a batch and keyword bank."},{status:400});
  const result=await database.prepare(APPLY_BUNDLE_KEYWORD_BANK).bind(body.keywordBankId,user.userId,body.id).all<{id:string}>();
  if(!result.results?.length)return NextResponse.json({error:"That batch or keyword bank was not found."},{status:404});
  return NextResponse.json({saved:true,updated:result.results.length});
}

export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});const database=db();if(!database)return NextResponse.json({error:"Batch history is unavailable."},{status:503});await ensure(database);const body=await request.json() as {id?:string;status?:string;step?:string;setupName?:string;productTitle?:string;designCount?:number;state?:unknown;parentBatchId?:string};const id=String(body.id||crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g,"").slice(0,80);const allowedStatus=new Set(["draft","processing","needs_attention","complete"]),allowedStep=new Set(["connect","setup","designs","review","finish"]);const status=allowedStatus.has(String(body.status))?String(body.status):"draft",step=allowedStep.has(String(body.step))?String(body.step):"connect";const stateJson=JSON.stringify(body.state??{});if(stateJson.length>1800000)return NextResponse.json({error:"This batch snapshot is too large."},{status:413});/* D871 · A child names its parent run once, when it is first written. The
     COALESCE keeps it: a later autosave that omits it must not orphan a child
     mid-run, which would put it back in Batch History as a job of its own. */
  const parentBatchId=String(body.parentBatchId||"").replace(/[^a-zA-Z0-9-]/g,"").slice(0,80)||null;
  await database.prepare("INSERT INTO listing_batches (id,user_id,status,step,setup_name,product_title,design_count,state_json,parent_batch_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET parent_batch_id=COALESCE(excluded.parent_batch_id,listing_batches.parent_batch_id),status=excluded.status,step=excluded.step,setup_name=excluded.setup_name,product_title=excluded.product_title,design_count=excluded.design_count,state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP WHERE user_id=excluded.user_id").bind(id,user.userId,status,step,String(body.setupName||"").slice(0,160),String(body.productTitle||"").slice(0,200),Math.max(0,Math.min(20,Number(body.designCount||0))),stateJson,parentBatchId).run();return NextResponse.json({id,saved:true})}

export async function DELETE(request:Request){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});const database=db();if(!database)return NextResponse.json({error:"Batch history is unavailable."},{status:503});await ensure(database);const id=String(new URL(request.url).searchParams.get("id")||"").replace(/[^a-zA-Z0-9-]/g,"").slice(0,80);if(!id)return NextResponse.json({error:"Choose a batch to clear."},{status:400});/* D871 · Deleting a run deletes the run. A child is the run's own record for
     one of its products, not a separate job the seller can keep. */
  await database.prepare("DELETE FROM listing_batches WHERE user_id=? AND parent_batch_id=?").bind(user.userId,id).run().catch(()=>undefined);
  await database.prepare("DELETE FROM listing_batches WHERE id=? AND user_id=?").bind(id,user.userId).run();
  /* D631 - deleting a batch left every bundle that referenced it pointing at
     something gone. Measured on ZZ TEST BUNDLE: its Gildan Hoodie member pointed
     at batch 2d2650a1, deleted at some point, and step 4 sat on "Checking…"
     forever with Publish disabled. D627 made that state honest and recoverable;
     this stops it being created. Ordinary use makes these - deleting a batch
     from Batch History is a normal thing to do - so the reference has to be
     cleaned up by whoever breaks it.
     Scoped to this user's own rows, and only rewrites a batch that genuinely
     mapped a product to the deleted id. */
  const referencing=await database.prepare("SELECT id,state_json FROM listing_batches WHERE user_id=? AND state_json LIKE ?").bind(user.userId,`%${id}%`).all<{id:string;state_json:string}>();
  for(const row of referencing.results||[]){
    let state:Record<string,unknown>;
    try{state=JSON.parse(row.state_json||"{}") as Record<string,unknown>}catch{continue}
    const map=state.bundleBatchIds as Record<string,string>|undefined;
    if(!map||typeof map!=="object")continue;
    const kept=Object.fromEntries(Object.entries(map).filter(([,value])=>String(value)!==id));
    if(Object.keys(kept).length===Object.keys(map).length)continue;
    await database.prepare("UPDATE listing_batches SET state_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(JSON.stringify({...state,bundleBatchIds:kept}),row.id,user.userId).run();
  }
  return NextResponse.json({deleted:true})}
