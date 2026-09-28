import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {UPDATE_SOURCES,sourceText,plainText,addedText,briefDay,editionDay,publishDay,validateCandidate,dailySummary,officialUrl} from '../app/platform-update-model.ts';
const source=UPDATE_SOURCES[0],quote='Sellers must disclose the new required product information before October 1.';
const item={priority:'ACTION REQUIRED',evidence:'Confirmed platform change',title:'Etsy changes a test requirement',impact:'Affected sellers must update their test listings.',action:'Check the required field by October 1.',topic:'test-requirement',quote,urgent:true};
test('official source manifest covers both platforms and never reads a seller shop',()=>{
 /*
   D1905 · This asserted at least ten sources, which was the wrong measure and
   quietly rewarded the thing that was broken: nine of those ten were
   hand-picked help articles, and the count going up meant somebody had
   remembered one more page - not that coverage had improved. Two sweeps now
   read all 342 Etsy and 394 Printify help articles, so what matters is that
   both platforms are covered and that the whole help centre is swept, not how
   many rows the list has.
 */
 for(const platform of ['Etsy','Printify']){
  assert.ok(UPDATE_SOURCES.some(s=>s.platform===platform&&s.kind==='sweep'),
   platform+' is back to whichever pages somebody remembered to list');
  assert.ok(UPDATE_SOURCES.some(s=>s.platform===platform));
 }for(const s of UPDATE_SOURCES)assert.ok(officialUrl(s.fetchUrl,s.platform));assert.equal(new Set(UPDATE_SOURCES.map(s=>s.id)).size,UPDATE_SOURCES.length)});
test('strip scripts navigation and formatting without treating them as changes',()=>{assert.equal(plainText('<nav>Menu</nav><p>Hello &amp; goodbye</p><script>bad()</script>'),'Hello & goodbye');assert.equal(addedText('A\nB','B\nA'),'')});
test('help-center body extraction excludes timestamp-only edits',()=>{assert.equal(sourceText(source,JSON.stringify({article:{title:'Title',body:'<p>Text</p>',updated_at:'today'}})),'Title\nText');assert.throws(()=>sourceText(source,'{}'))});
test('blocked or missing HTML body cannot become an all-clear',()=>{assert.throws(()=>sourceText(UPDATE_SOURCES.find(s=>s.kind==='html'),'<html>Access denied</html>'))});
test('daily edition follows Pacific morning across daylight saving',()=>{assert.equal(briefDay(new Date('2026-09-27T01:00:00Z')),'2026-09-26');assert.equal(publishDay(new Date('2026-09-26T12:59:00Z'),false),'2026-09-26');assert.equal(publishDay(new Date('2026-09-26T13:00:00Z'),false),'2026-09-27');assert.equal(publishDay(new Date('2026-09-26T15:00:00Z'),true),'2026-09-26');assert.equal(publishDay(new Date('2026-12-26T13:59:00Z'),false),'2026-12-26')});
test('confirmed item needs exact evidence in the changed text',()=>{assert.ok(validateCandidate(item,source,quote,quote));assert.equal(validateCandidate(item,source,quote,'Unrelated changed text'),null);assert.equal(validateCandidate({...item,quote:'invented evidence that is absent'},source,quote,quote),null)});
test('guidance and rumors cannot become mandatory rules',()=>{assert.equal(validateCandidate({...item,evidence:'Official guidance'},source,quote,quote),null);assert.equal(validateCandidate({...item,evidence:'Seller speculation'},source,quote,quote),null)});
test('external and invented source links are refused',()=>{for(const sourceUrl of ['https://etsy.com.evil.test/rule','http://help.etsy.com/rule','https://help.etsy.com/invented','javascript:alert(1)'])assert.equal(validateCandidate({...item,sourceUrl},source,quote,quote),null)});
test('urgent guidance cannot interrupt the daily brief',()=>{assert.equal(validateCandidate({...item,priority:'GOOD TO KNOW',evidence:'Official guidance'},source,quote,quote).urgent,false)});
test('empty daily result is explicit and does not manufacture content',()=>{
 /*
   D1897 · It used to say "No important Etsy or Printify changes today", which
   asserts the day was quiet at Etsy and Printify. It knows only what its own
   twelve sources said, and for thirty days those were help-centre articles
   that document existing rules rather than announce new ones - so it reported
   a quiet month while Etsy shipped shared shop access and expanded appeals.
   The empty line now describes the check, not the world.
 */
 assert.match(dailySummary([]),/^Nothing new in today's check of the official sources\./);
 assert.doesNotMatch(dailySummary([]),/No important Etsy or Printify changes/);
 assert.match(dailySummary([item]),/1 change needs your attention/)});
test('source failures preserve old content and never advance its baseline',()=>{const s=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');/* D1898 · The baseline branch now also seeds an announcements board, whose
    posts are themselves the news. A help article still reports nothing on its
    first read. */
 assert.match(s,/if\(!stored\?\.content\)\{baseline\+\+/);
 assert.match(s,/if\(source\.seedOnFirstRead&&edited<4\)/);assert.match(s,/ON CONFLICT\(id\) DO UPDATE SET last_error=excluded.last_error/);assert.match(s,/reserveSpend/);/* D1902 · The budget no longer throws. Going over it threw 'Queued for next
    source check', which the catch recorded as a source FAILURE - a deferred
    source looked broken and dragged the brief to 'partial'. */
 assert.match(s,/edited<EDIT_BUDGET/);
 assert.doesNotMatch(s.replace(/\/\*[\s\S]*?\*\//g,''),/Queued for next source check/)});
test('daily job is scheduled and home card opens the actual update',()=>{assert.match(readFileSync(new URL('../scripts/add-scheduled-handler.mjs',import.meta.url),'utf8'),/run\("\/api\/platform-updates\/tick"\)/);assert.match(readFileSync(new URL('../app/home/home-view.tsx',import.meta.url),'utf8'),/<PlatformUpdate compact/);assert.match(readFileSync(new URL('../app/platform-updates/update-view.tsx',import.meta.url),'utf8'),/href="\/platform-updates"/)});

test('tomorrow morning items stay out of the midnight edition while urgent changes appear now',()=>{const before=new Date('2026-09-27T10:00:00Z');assert.equal(editionDay(before),'2026-09-26');assert.equal(publishDay(before,false),'2026-09-27');assert.equal(publishDay(before,true),'2026-09-26');assert.equal(editionDay(new Date('2026-09-27T13:00:00Z')),'2026-09-27')});

test('the board where Etsy announces things is a source',()=>{
 /*
   Measured live on 2026-09-27: status "ready", all twelve sources read without
   error, zero items today and zero in the previous thirty days - while Etsy
   had announced shared shop access, expanded listing appeals and new Shop
   Stats graphs. Every source was a help-centre article, and help articles
   document rules that already exist rather than announce new ones.
 */
 const model=readFileSync(new URL('../app/platform-update-model.ts',import.meta.url),'utf8');
 assert.match(model,/community\.etsy\.com\/forum\/announcements-290/,
   'the only channel Etsy actually posts seller news to is not being watched');
 /* community.etsy.com must pass the official-host check. */
 assert.equal(officialUrl('https://community.etsy.com/forum/announcements-290/','Etsy'),true);
 /* A page with no <main> is a layout choice, not a dead source. */
 assert.doesNotMatch(model,/if\(!main\)throw new Error\('Source content unavailable'\)/);
});

test('a new seller-facing feature counts as news',()=>{
 const collector=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');
 /* The editor was told to ignore "minor launches", so a new tool - the thing a
    seller most wants to hear about - was binned by instruction. */
 assert.doesNotMatch(collector,/minor launches/);
 assert.match(collector,/IS reportable even if it is optional and even if it is described as a launch/);
 /* Sweepstakes and award programmes still are not news. */
 assert.match(collector,/Sweepstakes, award programmes, events, petitions and webinars are not reportable/);
});

test('the front page does not report zero from a one-day window',()=>{
 const home=readFileSync(new URL('../app/home-preview/preview-client.tsx',import.meta.url),'utf8');
 /* It counted today's edition only, so it read "0 changes at Etsy or Printify"
    on almost every day for sources that publish weekly at best. */
 assert.doesNotMatch(home,/const changes=\(up\?\.items\?\?\[\]\)\.length;/);
 assert.match(home,/const changes=\(up\?\.items\?\?\[\]\)\.length\+\(up\?\.recent\?\?\[\]\)\.length;/);
 assert.match(home,/last 30 days · \{num\(\(up\.sources\?\?\[\]\)\.length\)\} official sources/);
});

test('only an announcements board seeds its own first read',()=>{
 /*
   Adding the board stored a baseline and reported nothing, so the fortnight of
   announcements already sitting on it was swallowed on the way in - the exact
   news that was missing in the first place. Seeding is correct there and wrong
   for a help article, whose whole text is rules that already exist.
 */
 /*
   D1899 · Newly Crafted joins it. That article is Etsy's own roundup of new
   seller tools - a list of announcements, not a rules page - and its entire
   contents were baselined on first read, which is why thirty days of checking
   reported nothing while it sat there listing shared shop access, ad groups and
   the new Shop Stats graphs.
 */
 const seeded=UPDATE_SOURCES.filter(s=>s.seedOnFirstRead).map(s=>s.id).sort();
 assert.deepEqual(seeded,['Etsy-10603291042967','etsy-announcements']);
 /* A help-centre sweep must never seed: its first pass sees all 736 articles
    as new, and reporting those would announce every standing rule Etsy and
    Printify have as a change. */
 for(const source of UPDATE_SOURCES.filter(s=>s.kind==='sweep'))
  assert.ok(!source.seedOnFirstRead,source.id+' would announce standing policy as new');
 const collector=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');
 assert.match(collector,/summarize\(source,'',current,current,seen,undefined,true,8\)/);
 /* A first read has no previous version, so the editor is told the window. */
 /* D1899 · The first version of this instruction demanded every entry prove it
    was under 21 days old. Newly Crafted lists entries without per-item dates,
    so nothing could prove it and the seeded read returned nothing - the
    instruction, not the source, was the blocker. */
 assert.doesNotMatch(collector,/Report only posts dated or described as within the last 21 days/);
 assert.match(collector,/do not treat the absence of a date as a reason to skip it/);
});

test('an item filed into tomorrow morning still counts today',()=>{
 const store=readFileSync(new URL('../app/platform-update-store.ts',import.meta.url),'utf8');
 /*
   Measured live: the collector returned published:1 and every figure on the
   site read zero. Non-urgent items are filed into tomorrow's edition by design;
   the recent list selected day < today and the current list selects day =
   today, so an item written into tomorrow fell between them and existed in no
   count at all.
 */
 assert.doesNotMatch(store,/WHERE day<\? AND day>=\?/,
   'a future-dated edition falls out of every count again');
 assert.match(store,/WHERE day<>\? AND published_at>=\?/);
});

test('a roundup of six new tools is not capped at one item',()=>{
 const collector=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');
 /*
   Measured live: Newly Crafted listed shared shop access, the quick list form,
   Etsy Ads ad groups, new Shop Stats graphs and the Stats assistant, and the
   brief published exactly one item. Four separate caps, none of them related to
   how much news there was.
 */
 assert.doesNotMatch(collector,/At most 2 items per source/);
 assert.match(collector,/a roundup listing six new tools is six items, not one/);
 assert.doesNotMatch(collector,/parsed\.items\.slice\(0,2\)/);
 assert.match(collector,/parsed\.items\.slice\(0,maxItems\)/);
 /* And one unquotable candidate no longer discards the valid ones beside it. */
 assert.match(collector,/if\(rejected&&!items\.length\)/,
   'a single bad candidate throws away the whole source again');
});

test('the output budget follows the number of items asked for',()=>{
 const collector=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');
 /* Measured live after the cap was lifted: "Unterminated string in JSON at
    position 7340". The reply was cut off mid-item and the source failed to
    parse, so raising the cap produced fewer items than before. */
 assert.doesNotMatch(collector,/max_tokens:1800/);
 assert.match(collector,/max_tokens:900\+maxItems\*700/);
});

test('the Printify catalog is counted, not scraped or summarised',()=>{
 const watch=readFileSync(new URL('../app/printify-catalog-watch.ts',import.meta.url),'utf8');
 /*
   Printify announces new products nowhere a machine can read: no changelog, a
   marketing blog, and a catalogue page drawn by JavaScript that fetches as an
   empty document. So this source is not a page. A blueprint id absent from last
   week's catalogue is a new product - a counted fact, with the product's own
   title and brand reported rather than a model's wording.
 */
 const catalog=UPDATE_SOURCES.find(s=>s.kind==='catalog');
 assert.ok(catalog,'the catalog source is gone');
 assert.equal(officialUrl(catalog.fetchUrl,'Printify'),true);
 assert.match(watch,/catalog\/blueprints\.json/);
 /* Day one is not a launch of eleven hundred products. */
 assert.match(watch,/if \(!seen\.size \|\| !arrivals\.length \|\| arrivals\.length > IMPLAUSIBLE_ARRIVALS\)/);
 /* And it borrows nobody's credentials. */
 assert.doesNotMatch(watch,/ORDER BY rowid DESC LIMIT 1/,
   'the catalog read is picking whichever connection happens to be newest again');
 assert.match(watch,/WHERE user_id = \? AND encrypted_token <> ''/);
 assert.match(watch,/FROM printify_catalog_reader WHERE only_row = 1/);
});

test('a help centre is swept whole, and a bumped timestamp is not a change',()=>{
 const sweepFile=readFileSync(new URL('../app/help-center-sweep.ts',import.meta.url),'utf8');
 /*
   Etsy publishes 342 help articles and Printify 394. The brief watched nine of
   them, chosen by hand, so a fee change or a new feature documented on any of
   the other 727 was invisible and the front page reported that silence as calm.

   Zendesk also bumps updated_at for its own housekeeping - three Printify
   articles sampled while building this were "updated" within the same half
   hour carrying a sys_rv_p1 revision label and no visible edit - so the stored
   body decides whether anything changed, and updated_at only decides order.
 */
 assert.match(sweepFile,/sort_by=updated_at&sort_order=desc/);
 assert.match(sweepFile,/previous !== row\.text && added\.length >= MIN_ADDED/,
   'a bumped timestamp counts as news again');
 /* First sweep learns the whole help centre and announces none of it. */
 assert.match(sweepFile,/if \(!known\.size\)/);
 /* Over the cap, the old body must stay so the change is still pending. */
 assert.match(sweepFile,/if \(changed\) continue;/);
});

test('each changed article is summarised on its own, not in a blob',()=>{
 const collector=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');
 /* The old "documentation updates" source concatenated thirty articles into
    one string and asked the model to find the change inside it. It never
    reported anything. */
 assert.match(collector,/if\(source\.kind==='sweep'\)/);
 assert.match(collector,/summarize\(asSource,change\.previous,change\.current,change\.added/);
 /* The item links to the article that changed, not to a help-centre index. */
 assert.match(collector,/url:change\.url/);
});
