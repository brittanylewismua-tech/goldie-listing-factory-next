import {NextResponse} from 'next/server';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isOwner} from '@/app/mastermind/access';
import {readDailyUpdate} from '@/app/platform-update-store';
export async function GET(){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'Sign in to read the update.'},{status:401});return NextResponse.json({...await readDailyUpdate(),owner:isOwner(user)},{headers:{'Cache-Control':'private, no-store'}});}
