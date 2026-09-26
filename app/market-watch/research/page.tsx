import {requireFeaturePage} from '@/app/require-feature';
import FactoryShell from '@/app/factory-shell';
import ResearchClient from './research-client';
import './research.css';
export const metadata={title:'Niche research · Market Watch'};
export default async function Page(){await requireFeaturePage('marketWatch','/market-watch/research');return <FactoryShell active="niche-research" title="Niche Research" desktopOnly={false}><ResearchClient/></FactoryShell>;}
