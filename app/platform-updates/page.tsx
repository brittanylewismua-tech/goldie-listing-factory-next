import Link from 'next/link';
import {getChatGPTUser,accountSignInPath} from '@/app/chatgpt-auth';
import FactoryShell from '@/app/factory-shell';
import PlatformUpdate from './update-view';
export const metadata={title:'Etsy + Printify Updates'};
export default async function Page(){if(!await getChatGPTUser())return <main><Link href={accountSignInPath('/platform-updates')}>Sign in</Link></main>;return <FactoryShell active="platform-updates" title="Etsy + Printify Updates" desktopOnly={false}><PlatformUpdate/></FactoryShell>;}
