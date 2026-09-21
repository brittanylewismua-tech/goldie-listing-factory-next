import {NextResponse} from 'next/server';
import {env} from 'cloudflare:workers';
import {requireFeatureApi} from '@/app/require-feature';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {PLAN_FEATURES,validPlan,type PlanFeature} from '@/app/command-center-plan';
async function context(request:Request){
  const params=new URL(request.url).searchParams;
  const feature=params.get('feature') as PlanFeature;
  const source=params.get('source')??'';
  if(!PLAN_FEATURES.includes(feature)||!source||source.length>180)return {error:NextResponse.json({error:'Choose a feature and an item to save this plan against.'},{status:400})};
  const access=await requireFeatureApi(feature);
  if(!access.ok)return {error:access.response};
  const db=(env as unknown as {DB:D1Database}).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS command_center_plans (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,feature TEXT NOT NULL,source TEXT NOT NULL,
    title TEXT NOT NULL,notes TEXT NOT NULL,outcome TEXT NOT NULL,status TEXT NOT NULL,updated_at INTEGER NOT NULL)`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS command_center_plans_owner ON command_center_plans(user_id,feature,source)').run();
  return {db,userId:access.user.userId,feature,source};
}
export async function GET(request:Request){
  const c=await context(request);if(c.error)return c.error;
  const rows=await c.db!.prepare(`SELECT id,title,notes,outcome,status,updated_at AS updatedAt FROM command_center_plans
    WHERE user_id=? AND feature=? AND source=? ORDER BY updated_at DESC LIMIT 50`).bind(c.userId!,c.feature!,c.source!).all();
  return NextResponse.json({plans:rows.results??[]});
}
export async function POST(request:Request){
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});
  const c=await context(request);if(c.error)return c.error;
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const plan=validPlan(body);
  if(!plan)return NextResponse.json({error:'Add a title and keep the plan within the field limits.'},{status:400});
  const id=body?.id?String(body?.id):crypto.randomUUID();
  const existing=await c.db!.prepare('SELECT id FROM command_center_plans WHERE id=? AND user_id=? AND feature=? AND source=?').bind(id,c.userId!,c.feature!,c.source!).first();
  if(body?.id&&!existing)return NextResponse.json({error:'That saved plan was not found.'},{status:404});
  if(!existing){
    const count=await c.db!.prepare('SELECT COUNT(*) AS n FROM command_center_plans WHERE user_id=? AND feature=? AND source=?').bind(c.userId!,c.feature!,c.source!).first<{n:number}>();
    if((count?.n??0)>=50)return NextResponse.json({error:'This item already has 50 saved plans. Update an existing plan.'},{status:400});
  }
  const at=Math.floor(Date.now()/1000);
  await c.db!.prepare(`INSERT INTO command_center_plans(id,user_id,feature,source,title,notes,outcome,status,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,notes=excluded.notes,outcome=excluded.outcome,status=excluded.status,updated_at=excluded.updated_at
    WHERE command_center_plans.user_id=excluded.user_id AND command_center_plans.feature=excluded.feature AND command_center_plans.source=excluded.source`)
    .bind(id,c.userId!,c.feature!,c.source!,plan.title,plan.notes,plan.outcome,plan.status,at).run();
  return NextResponse.json({plan:{id,...plan,updatedAt:at}});
}
