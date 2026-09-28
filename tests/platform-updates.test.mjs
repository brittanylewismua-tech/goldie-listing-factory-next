import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {UPDATE_SOURCES,sourceText,plainText,addedText,briefDay,editionDay,publishDay,validateCandidate,dailySummary,officialUrl} from '../app/platform-update-model.ts';
const source=UPDATE_SOURCES[0],quote='Sellers must disclose the new required product information before October 1.';
const item={priority:'ACTION REQUIRED',evidence:'Confirmed platform change',title:'Etsy changes a test requirement',impact:'Affected sellers must update their test listings.',action:'Check the required field by October 1.',topic:'test-requirement',quote,urgent:true};
test('official source manifest covers both platforms and never reads a seller shop',()=>{assert.ok(UPDATE_SOURCES.length>=10);for(const s of UPDATE_SOURCES)assert.ok(officialUrl(s.fetchUrl,s.platform));assert.equal(new Set(UPDATE_SOURCES.map(s=>s.id)).size,UPDATE_SOURCES.length)});
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
 assert.match(s,/if\(source\.seedOnFirstRead&&edited<4\)/);assert.match(s,/ON CONFLICT\(id\) DO UPDATE SET last_error=excluded.last_error/);assert.match(s,/reserveSpend/);assert.match(s,/if\(edited>=4\)/)});
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
 /* A rules page must never seed: its text is policy that already applies. */
 for(const id of ['Etsy-115014483627','Etsy-360024112614','Printify-22264012673297'])
  assert.equal(UPDATE_SOURCES.find(s=>s.id===id).seedOnFirstRead,false,
   id+' would announce standing policy as new');
 const collector=readFileSync(new URL('../app/platform-update-collector.ts',import.meta.url),'utf8');
 assert.match(collector,/summarize\(source,'',current,current,seen,undefined,true\)/);
 /* A first read has no previous version, so the editor is told the window. */
 /* D1899 · The first version of this instruction demanded every entry prove it
    was under 21 days old. Newly Crafted lists entries without per-item dates,
    so nothing could prove it and the seeded read returned nothing - the
    instruction, not the source, was the blocker. */
 assert.doesNotMatch(collector,/Report only posts dated or described as within the last 21 days/);
 assert.match(collector,/do not treat the absence of a date as a reason to skip it/);
});
