import test from 'node:test';
import assert from 'node:assert/strict';
import {productCategoryScore} from '../app/etsy-category-score.ts';

const paths=['Clothing › Gender-Neutral Adult Clothing › Tops & Tees › T-shirts','Clothing › Gender-Neutral Adult Clothing › Hoodies & Sweatshirts › Hoodies','Clothing › Gender-Neutral Adult Clothing › Hoodies & Sweatshirts › Sweatshirts','Clothing › Boys Clothing › Hoodies','Clothing › Gender-Neutral Adult Clothing › Tops & Tees › Tank Tops'];
const pick=blueprintTitle=>paths.map(path=>({path,score:productCategoryScore({blueprintTitle},path)})).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path))[0].path;
test('live Gildan hooded sweatshirt is a hoodie, not a tee from the substring tshirt',()=>{
  assert.equal(pick('Unisex Heavy Blend™ Hooded Sweatshirt'),paths[1]);
  assert.equal(pick('Unisex Garment-Dyed Hoodie'),paths[1]);
});
test('crewneck sweatshirts remain distinct from hoodies and tees',()=>{
  assert.equal(pick('Unisex Heavy Blend™ Crewneck Sweatshirt'),paths[2]);
  assert.equal(pick('Unisex Garment-Dyed Sweatshirt'),paths[2]);
});
test('actual tee product names select tees without matching unrelated garment names',()=>{
  for(const name of ['Unisex Heavy Cotton Tee','Unisex T-Shirt','Unisex T Shirt','Garment-Dyed T-shirt'])assert.equal(pick(name),paths[0]);
  assert.equal(pick('Unisex Tank Top'),paths[4]);
});
test('youth hooded sweatshirts keep the child audience',()=>{
  assert.equal(pick('Youth Heavy Blend Hooded Sweatshirt'),paths[3]);
});
