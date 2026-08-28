import GoldieWordmark from "./goldie-wordmark";
import { NavIcon } from "./nav-icons";

type Destination="batches"|"keywords"|"mockups"|"usage"|"operations"|"connections";

export default function ManagementNav({active,listingFactoryHref="/listing-factory",showOperations=false}:{active?:Destination;listingFactoryHref?:string;showOperations?:boolean}){
  const links:Array<{key:Destination;href:string;label:string}>=[
    {key:"batches",href:"/batches",label:"Batch History"},
    {key:"keywords",href:"/keywords",label:"Keyword Banks"},
    {key:"mockups",href:"/mockups",label:"Mockup Library"},
    {key:"usage",href:"/usage",label:"Usage + Plan"},
    /* D639 - the same way back, on every management page. */
    {key:"connections",href:"/listing-factory?step=connect",label:"Connections"},
  ];
  if(showOperations)links.push({key:"operations",href:"/operations",label:"Operations"});
  return <nav className="management-nav" aria-label="Goldie tools"><GoldieWordmark/><a href={listingFactoryHref}><NavIcon name="listingFactory"/>Listing Factory</a>{links.map(link=><a key={link.key} className={active===link.key?"active":undefined} href={link.href}><NavIcon name={link.key}/>{link.label}</a>)}{/* D398 - The management pages are a separate layout with no .app-shell, so
      they never had the sidebar footer the workflow has: no copyright, no Etsy
      attribution, no wordmark. The attribution in particular has to appear
      wherever Etsy data is shown, and these pages show it. */}
    <div className="management-nav-footer">
      <p className="management-copyright">© 2026 Be a Wolf Biz</p>
      <p className="etsy-api-disclosure">The term &lsquo;Etsy&rsquo; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
      <p className="approved-powered">POWERED BY <span>Goldie AI</span></p>
    </div>
  </nav>;
}
