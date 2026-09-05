import test from 'node:test';
import assert from 'node:assert/strict';
import {listingCoverUrl} from '../app/listing-cover.ts';
test('final review honors the saved artwork-facing camera instead of Printify’s default',()=>{
  assert.equal(listingCoverUrl(['blank-angle','artwork-angle'],[0,1],[],['printify:1','printify:0'],'blank-angle'),'artwork-angle');
});
test('an uploaded cover remains first and removed photos cannot become the cover',()=>{
  assert.equal(listingCoverUrl(['front'],[0],[{id:'stored:a',src:'upload'}],['stored:removed','stored:a','printify:0']),'upload');
  assert.equal(listingCoverUrl(['front','back'],[0],[],['printify:1','printify:0']),'front');
});
test('a missing gallery safely retains its available product preview',()=>{
  assert.equal(listingCoverUrl([],[],[],[],'product-preview'),'product-preview');
});
