import {NextResponse} from 'next/server';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isOwner} from '@/app/mastermind/access';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {collectPlatformUpdates} from '@/app/platform-update-collector';
import {withErrorLog} from '@/app/error-log';
export const maxDuration=300;
export const POST=withErrorLog('platform-update-tick',async(request:Request)=>{if(request.headers.get('cf-connecting-ip')){if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:'Not authorized.'},{status:403});}return NextResponse.json(await collectPlatformUpdates());});
