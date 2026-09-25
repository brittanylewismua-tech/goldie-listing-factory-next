import {NextResponse} from 'next/server';
import {requireFeatureApi} from '@/app/require-feature';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {withErrorLog} from '@/app/error-log';
import {ensureNicheResearch,researchDb,readResearch,writeResearch,claimResearch,packResearch,putEvidence} from '@/app/niche-research-store';
import {advanceResearch} from '@/app/niche-research-engine';
import {researchView} from '@/app/niche-research-view';
import {listingDisplay,listingPhoto,listingPrice} from '@/app/etsy-listing-display';
import type {NicheProject} from '@/app/niche-research-model';
const response=(p:NicheProject,status=200)=>NextResponse.json({project:researchView(p),error:p.error},{status,headers:{'Cache-Control':'private, no-store'}});
export const GET=withErrorLog('niche-research',async(request:Request)=>{
 const access=await requireFeatureApi('marketWatch');if(!access.ok)return access.response;await ensureNicheResearch();
 const id=new URL(request.url).searchParams.get('id');if(id){const p=await readResearch(access.user.userId,id);if(!p)return NextResponse.json({error:'Niche not found.'},{status:404});const collection=await researchDb().prepare('SELECT next_run AS nextRun,lease_until AS busyUntil,unixepoch() AS databaseNow FROM niche_research_projects WHERE user_id=? AND id=?').bind(access.user.userId,id).first();const clock=await researchDb().prepare('SELECT started_at AS startedAt,finished_at AS finishedAt FROM niche_research_clock WHERE id=1').first();return NextResponse.json({project:researchView(p),collection,clock},{headers:{'Cache-Control':'private, no-store'}});}
 const result=await researchDb().prepare('SELECT payload FROM niche_research_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 10').bind(access.user.userId).all<{payload:string}>();
 return NextResponse.json({projects:(result.results??[]).map(row=>{const p=JSON.parse(row.payload) as NicheProject;return {id:p.id,name:p.name,phase:p.phase,monitoring:p.monitoring};})},{headers:{'Cache-Control':'private, no-store'}});
});
export const POST=withErrorLog('niche-research',async(request:Request)=>{
 if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});const access=await requireFeatureApi('marketWatch');if(!access.ok)return access.response;await ensureNicheResearch();const user=access.user.userId,db=researchDb();
 const body=await request.json().catch(()=>null) as {action?:string;id?:string;name?:string;phrases?:unknown;selected?:unknown;enabled?:boolean;listingIds?:unknown}|null;
 if(body?.action==='create'){
 const name=String(body.name??'').trim().slice(0,100),phrases=Array.isArray(body.phrases)?[...new Set(body.phrases.filter((p):p is string=>typeof p==='string').map(p=>p.trim().slice(0,100)).filter(p=>/[a-z0-9]/i.test(p)))].slice(0,8):[];
 if(!name||!phrases.length)return NextResponse.json({error:'Enter a niche and at least one phrase.'},{status:400});
 const now=Math.floor(Date.now()/1000),p:NicheProject={id:crypto.randomUUID(),name,phrases,createdAt:now,updatedAt:now,searchIndex:0,searchOffsets:phrases.map(()=>0),searchDone:phrases.map(()=>false),candidates:[],shops:[],selected:[],phase:'discovering',monitoring:true,nextRun:now,cycleAt:now,history:[],lastDiscovery:now,callsToday:0,callDay:'',targetShops:10};
 const inserted=await db.prepare('INSERT INTO niche_research_projects(id,user_id,payload,owner_identity,updated_at,next_run) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM niche_research_projects WHERE user_id=?)<10 RETURNING id').bind(p.id,user,packResearch(p),JSON.stringify(access.user),now,now,user).first();if(!inserted)return NextResponse.json({error:'You already have 10 niche panels. Open an existing niche to continue.'},{status:409});return response(p);
 }
 if(!body?.id||!['advance','select','monitor','refresh','photos'].includes(body.action??''))return NextResponse.json({error:'Choose a niche.'},{status:400});
 const lease=await claimResearch(user,body.id);if(!lease)return NextResponse.json({error:'This niche is updating. Try again in a moment.'},{status:409});
 const p=await readResearch(user,body.id);if(!p)return NextResponse.json({error:'Niche not found.'},{status:404});
 try{
 if(body.action==='select'){p.selectionEdited=true;const selected=Array.isArray(body.selected)?body.selected:[];p.selected=[...new Set(selected.filter((id):id is number=>typeof id==='number'&&p.shops.some(s=>s.id===id&&s.catalogDone&&s.reviewsDone)))].slice(0,15);}
 else if(body.action==='monitor'){p.monitoring=body.enabled===true;p.nextRun=p.monitoring?Math.floor(Date.now()/1000):0;}
 else if(body.action==='refresh'){p.nextRun=Math.floor(Date.now()/1000);await advanceResearch(user,p);}
 else if(body.action==='photos'){
 const requested=Array.isArray(body.listingIds)?body.listingIds:[],ls=p.shops.flatMap(s=>s.listings).filter(l=>requested.includes(l.id)&&Date.now()/1000-(l.imageAt??0)>=3600||requested.includes(l.id)&&!l.image).slice(0,50);
 const display=await listingDisplay(ls.map(l=>l.id),'shop-watch');for(const l of ls){const r=display.get(l.id);if(r){l.image=listingPhoto(r);l.imageAt=Math.floor(Date.now()/1000);l.price=listingPrice(r);l.currency=r.price?.currency_code??'';l.title=String(r.title??l.title);l.displayAt=Math.floor(Date.now()/1000);}else{l.image='';l.active=false;}}
 for(const s of p.shops)await putEvidence(user,p.id,s.id,'listing',ls.filter(l=>l.shopId===s.id));
 }else if(p.phase!=='ready')await advanceResearch(user,p);
 if(body.action!=='photos')delete p.error;await writeResearch(user,p,lease);return response(p);
 }catch(error){p.error=error instanceof Error?error.message:'The update stopped. Progress is saved.';p.nextRun=Math.max(p.nextRun,Math.floor(Date.now()/1000)+3600);await writeResearch(user,p,lease);return response(p,502);}
});
