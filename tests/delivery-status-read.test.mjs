import test from 'node:test';import assert from 'node:assert/strict';
import {readDeliveryStatus} from '../app/delivery-status-read.ts';
test('a missing or malformed receipt collection cannot mean no existing drafts',async()=>{
 for(const value of [{},{deliveries:null},{deliveries:{}}])await assert.rejects(readDeliveryStatus(Response.json(value)),/could not be read/);
 assert.deepEqual(await readDeliveryStatus(Response.json({deliveries:[]})),[]);
});
test('a denied status read explains sign-in even when the response is not JSON',async()=>{
 await assert.rejects(readDeliveryStatus(new Response('Unauthorized',{status:401})),/Sign in to the Listing Factory.*Check saved progress/);
});
test('a status outage never becomes a successful empty delivery collection',async()=>{
 await assert.rejects(readDeliveryStatus(Response.json({error:'Temporarily unavailable',deliveries:[]},{status:503})),/Temporarily unavailable/);
 const delivery={id:'existing',status:'completed',listingId:123};assert.deepEqual(await readDeliveryStatus(Response.json({deliveries:[delivery]})),[delivery]);
});
