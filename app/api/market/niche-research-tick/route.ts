import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {getChatGPTUser,type ChatGPTUser} from '@/app/chatgpt-auth';
import {isOwner} from '@/app/mastermind/access';
import {gate} from '@/app/entitlements';
import {ensureNicheResearch,researchDb,claimResearch,readResearch,writeResearch} from '@/app/niche-research-store';
import {advanceResearch} from '@/app/niche-research-engine';
export const POST=withErrorLog('niche-research-tick',async(request:Request)=>{
 if(request.headers.get('cf-connecting-ip')){const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:'Not authorized.'},{status:403});}
 await ensureNicheResearch();const db=researchDb(),now=Math.floor(Date.now()/1000);
 await db.prepare('INSERT INTO niche_research_clock(id,started_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at').bind(now).run();
 const due=await db.prepare('SELECT id,user_id,owner_identity FROM niche_research_projects WHERE next_run>0 AND next_run<=? AND lease_until<=? ORDER BY updated_at ASC LIMIT 4').bind(now,now).all<{id:string;user_id:string;owner_identity:string}>();
 await db.prepare('DELETE FROM niche_research_public_cache WHERE expires_at<?').bind(now-86400).run();
 let steps=0,failed=0;const deadline=Date.now()+45000;
 for(const row of due.results??[]){if(Date.now()>=deadline)break;const lease=await claimResearch(row.user_id,row.id);if(!lease)continue;const p=await readResearch(row.user_id,row.id);if(!p)continue;
 try{const allowed=await gate(JSON.parse(row.owner_identity) as ChatGPTUser,'marketWatch');if(!allowed.ok){p.monitoring=false;p.nextRun=0;}else if(p.monitoring){for(let i=0;i<32&&Date.now()<deadline;i++){await advanceResearch(row.user_id,p);steps++;if(p.phase==='ready')break;}}else p.nextRun=0;
 }catch(error){failed++;p.error=error instanceof Error?error.message:'Scheduled update failed. Retrying automatically.';p.nextRun=Math.max(p.nextRun,now+3600);}
 await writeResearch(row.user_id,p,lease);
 }
 await db.prepare('UPDATE niche_research_clock SET finished_at=?,steps=?,failed=? WHERE id=1').bind(Math.floor(Date.now()/1000),steps,failed).run();
 return NextResponse.json({steps,failed,panelsDue:due.results?.length??0});
});
