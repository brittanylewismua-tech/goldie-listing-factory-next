export type Platform = 'Etsy' | 'Printify';
export type UpdateItem = {id:string;platform:Platform;priority:'ACTION REQUIRED'|'GOOD TO KNOW'|'IGNORE THE PANIC';evidence:'Confirmed platform change'|'Official guidance'|'Seller speculation'|'No evidence';title:string;impact:string;action:string;sourceUrl:string;sourceTitle:string;topic:string;urgent:boolean;publishedAt:number};
export type Source = {id:string;platform:Platform;name:string;url:string;fetchUrl:string;kind:'article'|'html'|'recent';
 /* D1898 · An announcements board's posts ARE the news, so the first read has
    to report the recent ones. A help article's first read must not: its whole
    text is existing rules, and reporting those as changes would announce every
    standing policy as new. */
 seedOnFirstRead?:boolean};
const article=(platform:Platform,id:string,name:string,seedOnFirstRead=false):Source=>{const host=platform==='Etsy'?'help.etsy.com':'help.printify.com';return{id:`${platform}-${id}`,platform,name,url:`https://${host}/hc/en-us/articles/${id}`,fetchUrl:`https://${host}/api/v2/help_center/en-us/articles/${id}.json`,kind:'article',seedOnFirstRead}};
export const UPDATE_SOURCES:Source[]=[
 /*
   D1899 · THE ONE SOURCE CARRYING ETSY'S "WHAT'S NEW" WAS SWALLOWED WHOLE.

   Article 10603291042967 is Newly Crafted, Etsy's own roundup of new seller
   tools. It is not a rules page; it is a list of announcements, and it already
   held shared shop access, the quick list form, Etsy Ads ad groups, the new
   Shop Stats comparison graphs and the Stats assistant beta. All of it was
   present at the moment the source was first read, so all of it became the
   baseline and none of it was ever reportable. Thirty days of "no changes" with
   that article sitting there unread is where the front page's zero came from.
 */
 article('Etsy','10603291042967','Etsy seller updates',true),article('Etsy','360024112614','Etsy creativity and allowed items'),article('Etsy','115014483627','Etsy fees'),article('Etsy','5850122619287','Etsy Purchase Protection'),article('Etsy','360000572888','Etsy refunds and cases'),article('Etsy','360016260113','Etsy listing images'),
 article('Printify','22264012673297','Printify price updates'),article('Printify','4483630162833','Printify discontinued products'),article('Printify','4483625090321','Printify order routing'),
 {id:'printify-network',platform:'Printify',name:'Printify fulfillment updates',url:'https://printify.com/network-fulfillment-status/',fetchUrl:'https://printify.com/network-fulfillment-status/',kind:'html'},
 /*
   D1897 · WHERE ETSY ACTUALLY ANNOUNCES THINGS.

   Every other source here is a help-centre article. Help articles document
   rules that already exist; they are rewritten rarely and quietly, which is
   why thirty days of checking produced nothing at all while Etsy shipped
   shared shop access, expanded listing appeals and new Shop Stats graphs. Etsy
   posts seller news to its community announcements board, and each post
   carries its full text server-rendered, so it diffs the same way an article
   does.
 */
 {id:'etsy-announcements',platform:'Etsy',name:'Etsy seller announcements',url:'https://community.etsy.com/forum/announcements-290/',fetchUrl:'https://community.etsy.com/forum/announcements-290/',kind:'html',seedOnFirstRead:true},
 ...(['Etsy','Printify'] as const).map(platform=>({id:`${platform}-recent`,platform,name:`${platform} documentation updates`,url:`https://help.${platform.toLowerCase()}.com/hc/en-us`,fetchUrl:`https://help.${platform.toLowerCase()}.com/api/v2/help_center/en-us/articles.json?sort_by=updated_at&sort_order=desc&per_page=30`,kind:'recent' as const}))
];
export function plainText(html:string){return html.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(p|div|li|h[1-6]|tr)>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
export function sourceText(source:Source,body:string):string{
 if(source.kind==='html'){
  /* D1897 · Prefer <main>, but a page that does not use the tag is still a
     readable page. Throwing here turned a layout choice into a dead source,
     and a dead source is indistinguishable from quiet news. */
  const main=body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const region=main?main[1]:(body.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]??'');
  const text=plainText(region);if(text.length<150)throw new Error('Source content unavailable');
  return text.slice(0,90000);}
 const json=JSON.parse(body);if(source.kind==='recent'){if(!Array.isArray(json.articles))throw new Error('Source content unavailable');return json.articles.filter((a:any)=>!a.draft).map((a:any)=>`${a.html_url}\n${a.title}\n${plainText(String(a.body??''))}`).join('\n\n').slice(0,90000);}
 if(!json.article?.body)throw new Error('Source content unavailable');return `${json.article.title}\n${plainText(json.article.body)}`.slice(0,90000);
}
export function addedText(before:string,after:string){const old=new Set(before.split('\n').map(s=>s.trim()).filter(Boolean));return after.split('\n').filter(s=>s.trim()&&!old.has(s.trim())).join('\n').slice(0,18000);}
export function briefDay(now:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function editionDay(now:Date){const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',hourCycle:'h23'}).format(now));return briefDay(new Date(now.getTime()-(hour<6?86400000:0)));}
export function publishDay(now:Date,urgent:boolean){if(urgent)return editionDay(now);const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',hourCycle:'h23'}).format(now));return briefDay(new Date(now.getTime()+(!urgent&&hour>=6?86400000:0)));}
export function officialUrl(value:string,platform:Platform){try{const u=new URL(value);const root=platform==='Etsy'?'etsy.com':'printify.com';return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname===root||u.hostname.endsWith('.'+root));}catch{return false;}}
export function validateCandidate(raw:any,source:Source,current:string,added:string):Omit<UpdateItem,'id'|'publishedAt'>|null{
 if(!raw||!['ACTION REQUIRED','GOOD TO KNOW','IGNORE THE PANIC'].includes(raw.priority)||!['Confirmed platform change','Official guidance','Seller speculation','No evidence'].includes(raw.evidence))return null;
 const title=String(raw.title??'').trim(),impact=String(raw.impact??'').trim(),action=String(raw.action??'').trim(),topic=String(raw.topic??'').trim().toLowerCase(),quote=String(raw.quote??'').trim();
 if(!title||!impact||!action||!topic||title.length>130||impact.length>240||action.length>180||quote.length<25||quote.length>350||!current.includes(quote)||!added.includes(quote))return null;
 // A changed page alone is never proof of a new enforceable rule.
 if(raw.priority==='ACTION REQUIRED'&&raw.evidence!=='Confirmed platform change')return null;
 if(raw.evidence==='Seller speculation')return null; // This collector only reads official sources.
 if(raw.priority==='IGNORE THE PANIC'&&!['Official guidance','No evidence'].includes(raw.evidence))return null;
 const sourceUrl=String(raw.sourceUrl||source.url);if(!officialUrl(sourceUrl,source.platform)||(sourceUrl!==source.url&&!current.includes(sourceUrl)))return null;
 return{platform:source.platform,priority:raw.priority,evidence:raw.evidence,title,impact,action,sourceUrl,sourceTitle:source.name,topic:topic.slice(0,160),urgent:raw.urgent===true&&raw.priority==='ACTION REQUIRED'};
}
export function dailySummary(items:UpdateItem[]){const action=items.filter(i=>i.priority==='ACTION REQUIRED').length,other=items.length-action;return items.length?`${action?`${action} ${action===1?'change needs':'changes need'} your attention.`:'No action required.'}${other?` ${other} ${other===1?'item is':'items are'} good to know.`:''}`:
 /* D1897 · This said "No important Etsy or Printify changes today", which
    claims the day was quiet. It knows only what its own sources said. */
 'Nothing new in today\'s check of the official sources. Recent items are below.';}
