import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('multiple Etsy production partners are chosen once in The Listing Factory and sent with every draft',()=>{
 const ui=read('app/photo-delivery-handoff.tsx'),route=read('app/api/listing-photos/delivery/route.ts'),partners=read('app/api/etsy/production-partners/route.ts');
 assert.match(ui,/Production partner<select/);
 assert.match(ui,/This choice is remembered for this Etsy shop and added to every draft/);
 assert.match(ui,/productionPartnerId:partnerId\|\|undefined/);
 assert.match(route,/body\.productionPartnerId/);
 assert.match(partners,/etsyProductionPartners/);
 assert.match(partners,/partners\.some\(partner=>Number\(partner\.production_partner_id\)===id\)/);
});
