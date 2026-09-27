export default function ResearchNavigation({active}:{active:'niche'|'keywords'|'shops'|'saved'}){
 const views=[['niche','Niche research','/market-watch/research'],['keywords','Tracked keywords','/market-watch'],['shops','Tracked shops','/market-watch?tab=shops'],['saved','Saved listings','/market-watch?tab=saved']] as const;
 return <nav className="research-navigation" aria-label="Research views">{views.map(([key,label,href])=><a key={key} href={href} aria-current={active===key?'page':undefined}>{label}</a>)}</nav>;
}
