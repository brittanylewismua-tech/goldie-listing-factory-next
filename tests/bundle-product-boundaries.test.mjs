import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const css=readFileSync(new URL('../app/interface-v2.css',import.meta.url),'utf8');
const boundary=css.slice(css.indexOf('/* D1140:'));
test('bundle products have a full-width chapter header and generous inter-product spacing',()=>{
  assert.match(boundary,/\.in-batch \+ \.step-product-card\.in-batch\{\s*margin-top:64px/);
  assert.match(boundary,/width:100%;box-sizing:border-box;margin:0 0 28px;padding:24px/);
  assert.match(boundary,/background:var\(--lf-section\);border:2px solid #171717/);
  assert.match(boundary,/\.batch-product-position\{[^}]*font-size:14px!important/s);
  assert.doesNotMatch(boundary,/\.is-(open|closed)\s*>\s*header/,'open and closed products must share the same boundary');
});
test('bundle chapter identity wraps and the status gets its own mobile row',()=>{
  assert.match(boundary,/minmax\(0,1fr\)/);
  assert.match(boundary,/overflow-wrap:anywhere/);
  assert.match(boundary,/@media\(max-width:640px\)/);
  assert.match(boundary,/\.step-product-state\{grid-column:2;justify-self:start/);
  assert.match(boundary,/:focus-visible\{\s*outline:3px solid #171717;outline-offset:6px/);
});

// Titles are 20px bold (large text); smaller labels use white or muted white.
test('smoky section colors retain readable text in default and hover states',()=>{
 const token=name=>css.match(new RegExp('--'+name+':(#[0-9a-f]{6}|#fff);'))[1];
 const luminance=hex=>{if(hex.length===4)hex='#'+[...hex.slice(1)].map(c=>c+c).join('');return [.2126,.7152,.0722].reduce((sum,w,i)=>{const n=parseInt(hex.slice(1+i*2,3+i*2),16)/255;return sum+w*(n<=.04045?n/12.92:((n+.055)/1.055)**2.4)},0)};
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 for(const bg of ['lf-section','lf-section-hover']){
  assert.ok(contrast(token(bg),token('lf-pink'))>=3,'large accent title contrast');
  for(const ink of ['lf-section-ink','lf-section-muted'])assert.ok(contrast(token(bg),token(ink))>=4.5,'small section text contrast');
 }
 assert.match(boundary,/color:var\(--lf-pink\)!important;font-size:20px!important/);
});
