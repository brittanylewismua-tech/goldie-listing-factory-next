import {NextResponse} from 'next/server';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isOwner} from '@/app/mastermind/access';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {collectPlatformUpdates} from '@/app/platform-update-collector';
import {nominateCatalogReader} from '@/app/printify-catalog-watch';
import {withErrorLog} from '@/app/error-log';
export const maxDuration=300;
export const POST=withErrorLog('platform-update-tick',async(request:Request)=>{let retryFailed=false,reseed='',rebuild=false;if(request.headers.get('cf-connecting-ip')){if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:'Not authorized.'},{status:403});retryFailed=true;
 /* D1904 · The catalogue read borrows no credentials: running a check while
    signed in nominates THIS account's Printify connection for it, scoped by
    user_id, and the scheduled pass uses that one and nothing else. */
 await nominateCatalogReader(user.userId,Math.floor(Date.now()/1000)).catch(()=>undefined);
 reseed=String(new URL(request.url).searchParams.get('reseed')??'').slice(0,64);
 rebuild=new URL(request.url).searchParams.get('rebuild')==='1';}return NextResponse.json(await collectPlatformUpdates({retryFailed,reseed,rebuild}));});
