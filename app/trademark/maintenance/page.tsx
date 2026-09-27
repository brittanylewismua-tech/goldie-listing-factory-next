import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isOwner} from '@/app/owner-allowlist';
import Maintenance from './panel';
export default async function Page(){const user=await getChatGPTUser();if(!user||!isOwner(user))return <main>Not found.</main>;return <Maintenance/>;}
