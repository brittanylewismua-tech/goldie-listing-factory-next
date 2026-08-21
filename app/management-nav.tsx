import GoldieWordmark from "./goldie-wordmark";

type Destination="batches"|"keywords"|"mockups"|"usage"|"operations";

export default function ManagementNav({active,listingFactoryHref="/listing-factory",showOperations=false}:{active?:Destination;listingFactoryHref?:string;showOperations?:boolean}){
  const links:Array<{key:Destination;href:string;label:string}>=[
    {key:"batches",href:"/batches",label:"Batch History"},
    {key:"keywords",href:"/keywords",label:"Keyword Banks"},
    {key:"mockups",href:"/mockups",label:"Mockup Library"},
    {key:"usage",href:"/usage",label:"Usage + Plan"},
  ];
  if(showOperations)links.push({key:"operations",href:"/operations",label:"Operations"});
  return <nav className="management-nav" aria-label="Goldie tools"><GoldieWordmark/><a href={listingFactoryHref}>Listing Factory</a>{links.map(link=><a key={link.key} className={active===link.key?"active":undefined} href={link.href}>{link.label}</a>)}</nav>;
}
