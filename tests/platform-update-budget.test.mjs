import test from 'node:test';
import assert from 'node:assert/strict';
import {PAID_WORKLOADS} from '../app/paid-workloads.ts';
test('update repair attempts stay bounded under the existing shared daily spending ceiling',()=>{const w=PAID_WORKLOADS.find(x=>x.key==='platformUpdateBrief');assert.equal(w.globalDailyCeiling,0.5);assert.equal(w.memberDailyAttempts,32);assert.equal(w.globalDailyRequests,32);assert.equal(w.retries,1);});
