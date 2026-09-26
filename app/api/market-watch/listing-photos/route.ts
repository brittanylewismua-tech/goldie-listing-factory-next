import {NextResponse} from 'next/server';
import {requireFeatureApi} from '@/app/require-feature';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {listingDisplay,listingPhoto} from '@/app/etsy-listing-display';

/** Hydrate only the newly visible page after a local sort or Show more. */
export async function GET(request:Request){
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});
  const access=await requireFeatureApi('marketWatch');
  if(!access.ok)return access.response;
  const raw=new URL(request.url).searchParams.get('ids')??'';
  const ids=[...new Set(raw.split(',').map(Number))];
  if(!raw||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<=0))
    return NextResponse.json({error:'Choose up to 100 valid listings.'},{status:400});
  try{
    const details=await listingDisplay(ids,'search');
    return NextResponse.json({photos:Object.fromEntries(ids.map(id=>[id,details.has(id)?listingPhoto(details.get(id)!):'']))});
  }catch{
    return NextResponse.json({error:'These listing photos could not load. Try again.'},{status:502});
  }
}
