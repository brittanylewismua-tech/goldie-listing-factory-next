import test from 'node:test';
import assert from 'node:assert/strict';
import {shopMapSection} from '../app/shop-map/shop-map-navigation.ts';
test('Shop Map deep links select the section named by the destination',()=>{for(const tab of ['overview','themes','sold','money'])assert.equal(shopMapSection(tab),tab);});
test('missing or invalid section names open Overview',()=>{for(const tab of [null,'','bogus','__proto__'])assert.equal(shopMapSection(tab),'overview');});
