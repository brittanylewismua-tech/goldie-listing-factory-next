export type Platform = 'Etsy' | 'Printify';
export type UpdateItem = {id:string;platform:Platform;imageUrl?:string;priority:'ACTION REQUIRED'|'GOOD TO KNOW'|'IGNORE THE PANIC';evidence:'Confirmed platform change'|'Official guidance'|'Seller speculation'|'No evidence';title:string;impact:string;action:string;sourceUrl:string;sourceTitle:string;topic:string;urgent:boolean;publishedAt:number};
export type Source = {id:string;platform:Platform;name:string;url:string;fetchUrl:string;kind:'article'|'html'|'recent'|'catalog'|'sweep';
 /* D1898 · An announcements board's posts ARE the news, so the first read has
    to report the recent ones. A help article's first read must not: its whole
    text is existing rules, and reporting those as changes would announce every
    standing policy as new. */
 seedOnFirstRead?:boolean};
const article=(platform:Platform,id:string,name:string,seedOnFirstRead=false):Source=>{const host=platform==='Etsy'?'help.etsy.com':'help.printify.com';return{id:`${platform}-${id}`,platform,name,url:`https://${host}/hc/en-us/articles/${id}`,fetchUrl:`https://${host}/api/v2/help_center/en-us/articles/${id}.json`,kind:'article',seedOnFirstRead}};
const sweep=(platform:Platform,name:string):Source=>{const host=platform==='Etsy'?'help.etsy.com':'help.printify.com';return{id:`${platform}-help-sweep`,platform,name,url:`https://${host}/hc/en-us`,fetchUrl:`https://${host}/api/v2/help_center/en-us/articles.json?sort_by=updated_at&sort_order=desc&per_page=100`,kind:'sweep'}};
export const UPDATE_SOURCES:Source[]=[
 /*
   D1905 · WHAT THIS LIST IS, AND WHAT IT DELIBERATELY IS NOT.

   It used to be nine hand-picked help articles - six at Etsy, three at
   Printify. That is not a monitoring strategy, it is a list of the pages
   somebody happened to think of, and it can only ever be as good as that
   moment of recall. Etsy publishes 342 help articles and Printify 394; a fee
   change or a new feature documented on any of the other 727 was invisible,
   and the front page reported that silence as calm.

   Two of the entries below are sweeps: they read every article in a help
   centre, keep each one's text, and report the ones that actually change. So
   this list no longer decides WHICH pages get watched. What is left on it are
   the things a sweep cannot reach: a roundup that needs seeding, a status page
   that is not in a help centre, a forum board, and a product catalogue that is
   not a page at all.
 */
 sweep('Etsy','Etsy Help Center, every article'),
 sweep('Printify','Printify Help Center, every article'),
 /* Etsy's own roundup of new seller tools. Kept separate from the sweep
    because it is a list of announcements, so it seeds its own first read. */
 article('Etsy','10603291042967','Etsy seller updates',true),
 {id:'printify-network',platform:'Printify',name:'Printify fulfillment updates',url:'https://printify.com/network-fulfillment-status/',fetchUrl:'https://printify.com/network-fulfillment-status/',kind:'html'},
 /*
   D1904 · Printify announces new products nowhere a machine can read: no
   changelog, a marketing blog, and a catalogue page drawn by JavaScript that
   arrives empty. This source is not a page - it is Printify's own catalogue,
   counted, where a blueprint id that was not there last week is a new product.
   See printify-catalog-watch.ts.
 */
 {id:'printify-catalog',platform:'Printify',name:'Printify catalog',url:'https://printify.com/catalog/',fetchUrl:'https://api.printify.com/v1/catalog/blueprints.json',kind:'catalog'},
 /*
   D1897 · Where Etsy actually announces things. Help articles document rules
   that already exist; the announcements board is where new ones are declared,
   and each post carries its full text server-rendered.
 */
 {id:'etsy-announcements',platform:'Etsy',name:'Etsy seller announcements',url:'https://community.etsy.com/forum/announcements-290/',fetchUrl:'https://community.etsy.com/forum/announcements-290/',kind:'html',seedOnFirstRead:true},
];
/*
  D1910 · A PICTURE FROM THE ANNOUNCEMENT ITSELF, OR NONE AT ALL.

  Zendesk articles embed their own screenshots as attachments, and Printify's
  catalogue carries product photography. Both are the platform's own images of
  the thing being announced, which is the only kind worth showing here - a
  stock photo chosen to fill a card would be decoration pretending to be
  evidence. Only images served by the platform being reported on are accepted,
  so a page cannot smuggle in a picture from somewhere else.
*/
export function firstImage(html:string,platform:Platform):string{
 const root=platform==='Etsy'?'etsy.com':'printify.com';
 for(const match of String(html).matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)){
  const raw=match[1];
  try{const url=new URL(raw);
   if(url.protocol!=='https:')continue;
   if(!(url.hostname===root||url.hostname.endsWith('.'+root)))continue;
   /* Avatars and spacers are not pictures of what changed. */
   if(/avatar|icon|logo|spacer|emoji/i.test(url.pathname))continue;
   return url.toString().slice(0,400);
  }catch{continue}
 }
 return '';
}
/*
  D1920 · THE APOSTROPHE THAT EMPTIED THE BRIEF.

  Measured live, the rejected quote was: "We&rsquo;re testing an experience
  that lets buyers turn eligible digital purchases into physical" - a true
  sentence, from Etsy's own roundup, refused because it could not be found in
  the source. It could not be found because this function decoded five named
  entities and Zendesk writes &rsquo;, &ldquo;, &mdash; and the rest. The
  stored text kept a literal "&rsquo;" while the model, reading the same text,
  quoted it back with a real apostrophe, so the two could never match.

  Every entity is decoded now: numeric, hex, and the named ones that actually
  appear in help-centre prose. It was also putting raw "&rsquo;" into anything
  that did get published.
*/
const NAMED:Record<string,string>={nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',
 rsquo:'\u2019',lsquo:'\u2018',rdquo:'\u201d',ldquo:'\u201c',mdash:'\u2014',ndash:'\u2013',
 hellip:'\u2026',trade:'\u2122',reg:'\u00ae',copy:'\u00a9',deg:'\u00b0',eacute:'\u00e9',
 bull:'\u2022',middot:'\u00b7',laquo:'\u00ab',raquo:'\u00bb',euro:'\u20ac',pound:'\u00a3',
 frac12:'\u00bd',times:'\u00d7',minus:'\u2212',ndashx:'\u2013'};
export function decodeEntities(text:string):string{
 return String(text??'')
  .replace(/&#(\d+);/g,(_w,code)=>String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi,(_w,code)=>String.fromCodePoint(parseInt(code,16)))
  .replace(/&([a-z][a-z0-9]{1,9});/gi,(whole,name)=>NAMED[String(name).toLowerCase()]??whole);
}
export function plainText(html:string){return decodeEntities(html.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(p|div|li|h[1-6]|tr)>/gi,'\n').replace(/<[^>]*>/g,' ')).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
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
 /*
   D1918 · AN UNVERIFIABLE LINK IS NOT AN UNVERIFIABLE FACT.

   This rejected the whole candidate when the proposed sourceUrl was not found
   verbatim in the page text - and the page text has had its HTML stripped, so
   a link that exists only as an href is never in it. The model would name a
   real sub-article, the check could not confirm the string, and a true,
   quoted, evidenced item was thrown away. Measured live: every candidate from
   Etsy's own roundup rejected twice in a row, reported as "evidence needs
   review", and the brief stayed empty.

   The quote is what proves the change, and it is still checked against both
   the current and the added text. The link only says where to read more, so an
   unconfirmable one falls back to the page the item was actually found on
   rather than discarding the item. A link on the wrong host is still refused
   outright - that is a different thing, and it is the one this guard is for.
 */
 const proposed=String(raw.sourceUrl||'').trim();
 /* A link somewhere off the platform is a different matter: that is a model
    inventing a destination, and it stays a refusal. */
 if(proposed&&!officialUrl(proposed,source.platform))return null;
 const sourceUrl=proposed&&current.includes(proposed)?proposed:source.url;
 if(!officialUrl(sourceUrl,source.platform))return null;
 return{platform:source.platform,priority:raw.priority,evidence:raw.evidence,title,impact,action,sourceUrl,sourceTitle:source.name,topic:topic.slice(0,160),urgent:raw.urgent===true&&raw.priority==='ACTION REQUIRED'};
}
export function dailySummary(items:UpdateItem[]){const action=items.filter(i=>i.priority==='ACTION REQUIRED').length,other=items.length-action;return items.length?`${action?`${action} ${action===1?'change needs':'changes need'} your attention.`:'No action required.'}${other?` ${other} ${other===1?'item is':'items are'} good to know.`:''}`:
 /* D1897 · This said "No important Etsy or Printify changes today", which
    claims the day was quiet. It knows only what its own sources said. */
 'Nothing new in today\'s check of the official sources. Recent items are below.';}
