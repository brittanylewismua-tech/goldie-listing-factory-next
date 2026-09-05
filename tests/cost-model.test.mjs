import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyCost,listingScenario} from '../tools/cost-model.mjs';
test('included quotas do not generate imaginary overages',()=>{
  assert.equal(monthlyCost({requests:10e6,cpuMs:30e6,r2GbMonths:10,d1Reads:25e9,d1Writes:50e6,d1GbMonths:5,uniqueImageTransforms:5000,logEvents:20e6,workflowSteps:500000,workflowGbMonths:1}).total,5);
});
test('every separately metered component is added, never hidden in the Workers fee',()=>{
  const cost=monthlyCost({requests:11e6,cpuMs:31e6,r2GbMonths:11,r2Writes:1000001,r2Reads:10000001,d1Reads:25001e6,d1Writes:51e6,d1GbMonths:6,uniqueImageTransforms:6000,logEvents:21e6,workflowSteps:600000,workflowGbMonths:2,aiCostUsd:20,otherSubscriptionsUsd:35});
  const expected={workers:5.32,r2Storage:0.015,r2Writes:4.5,r2Reads:0.36,d1Reads:0.001,d1Writes:1,d1Storage:0.75,imageTransforms:0.5,logs:0.6,workflowSteps:0.8,workflowStorage:0.2,ai:20,otherSubscriptions:35};
  assert.deepEqual(Object.keys(cost.components),Object.keys(expected));
  for(const [name,value] of Object.entries(expected)) assert.ok(Math.abs(cost.components[name]-value)<1e-9,name);
  assert.throws(()=>monthlyCost({requests:Infinity}));
});
test('three calls per draft costs fifty percent more AI than two, not more storage',()=>{
  const two=listingScenario(100,300,2),three=listingScenario(100,300,3);
  assert.ok(Math.abs(three.components.ai-two.components.ai*1.5)<1e-10);
  assert.equal(three.components.r2Storage,two.components.r2Storage);
});
