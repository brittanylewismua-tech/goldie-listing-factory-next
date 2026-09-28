import test from 'node:test';
import assert from 'node:assert/strict';
import {PAID_WORKLOADS} from '../app/paid-workloads.ts';
test('update repair attempts stay bounded under the existing shared daily spending ceiling',()=>{const w=PAID_WORKLOADS.find(x=>x.key==='platformUpdateBrief');/*
   D1917 · 32 attempts and $0.50 was sized for nine hand-picked help articles,
   which change rarely. Two sweeps now read every article Etsy and Printify
   publish, and each genuinely changed article is its own comparison - the old
   ceiling stopped the brief partway and the remainder was reported as nothing.
   Still small and still bounded: the ceiling binds before the attempt count.
 */
 assert.equal(w.globalDailyCeiling,1.00);
 assert.equal(w.memberDailyAttempts,60);
 assert.equal(w.globalDailyRequests,60);
 assert.equal(w.retries,1);
 /* The ceiling has to bind first, or the attempt count is the real limit and
    the spend is whatever the model feels like charging. */
 assert.ok(w.globalDailyRequests*w.unitCost>=w.globalDailyCeiling,
   'the attempt count would run out before the money does');
});
