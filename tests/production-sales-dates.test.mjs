import test from 'node:test';
import assert from 'node:assert/strict';
import {etsySaleValues} from '../app/etsy-sale-values.ts';
import {performanceFrom} from '../app/shop-map-performance.ts';
const now=1800000000,old=now-86400*365;
const line={quantity:1,price:{amount:2200,divisor:100,currency_code:'USD'}};
test('a missing transaction timestamp uses the actual receipt date, never import time',()=>{
 assert.equal(etsySaleValues({is_paid:true,create_timestamp:old},{...line,paid_timestamp:0},now).soldAt,old);
 assert.equal(etsySaleValues({is_paid:true},line,now),null);
});
test('unpaid and canceled receipts do not become sales',()=>{
 assert.equal(etsySaleValues({is_paid:false,create_timestamp:old},line,now),null);
 assert.equal(etsySaleValues({is_paid:true,is_canceled:true,create_timestamp:old},line,now),null);
});
test('money respects the Etsy divisor',()=>{
 assert.equal(etsySaleValues({is_paid:true,create_timestamp:old},{...line,price:{amount:22,divisor:1}},now).priceMinor,2200);
});
test('historical, refunded, and future rows cannot inflate recent sales',()=>{
 const result=performanceFrom([
 {listingId:1,quantity:1,priceMinor:2200,soldAt:now-100,refunded:false},
 {listingId:1,quantity:100,priceMinor:2200,soldAt:old,refunded:false},
 {listingId:1,quantity:100,priceMinor:2200,soldAt:now+100,refunded:false},
 {listingId:1,quantity:100,priceMinor:2200,soldAt:now-100,refunded:true},
 ],{now,monthFrom:now-86400,monthTo:now,yearFrom:now-86400*300}).get(1);
 assert.equal(result.last90Orders,1);assert.equal(result.last90RevenueMinor,2200);
 assert.equal(result.monthRevenueMinor,2200);assert.equal(result.refundedOrders,1);
});
