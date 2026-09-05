import test from 'node:test';
import assert from 'node:assert/strict';
import {readRenderingArea,artworkInRendering,svgTransform} from '../app/rendering-placement.ts';
const fixture='<svg viewBox="0 0 3527.65 3527.66"><defs><rect id="_front-path" width="1439.64" height="1823.54"/></defs><g transform="translate(1044.01 747.9)"><svg id="placeholder_front" width="1439.64" height="1823.54" viewBox="0 0 1439.64 1823.54"></svg></g></svg>';
test('actual Printify SVG supplies print-area geometry, not garment percentages',()=>{
  assert.deepEqual(readRenderingArea(fixture,'front'),{viewBox:[0,0,3527.65,3527.66],width:1439.64,height:1823.54,matrix:[1,0,0,1,1044.01,747.9]});
  assert.equal(readRenderingArea(fixture,'back'),null);
});
test('live offset design preserves its physical scale and normalized position',()=>{
  const area=readRenderingArea(fixture,'front');
  const art=artworkInRendering(area,{x:.7625775370052102,y:.256497123349611,scale:.5826368584917817},4200,4800,1);
  assert.ok(Math.abs(art.x/area.width-.4712591)<.0001);
  assert.ok(Math.abs(art.y/area.height-.0015935)<.0001);
  assert.ok(art.x+art.width>area.width,'provider clipping must be preserved, not recentered');
});
test('wrap and back areas use their own metadata',()=>{
  for(const side of ['wrap','back','left-sleeve'])assert.ok(readRenderingArea(fixture.replace('placeholder_front',`placeholder_${side}`),side));
});
test('transforms compose and unsupported or malformed geometry fails closed',()=>{
  assert.deepEqual(svgTransform('translate(10 20) scale(2)'),[2,0,0,2,10,20]);
  assert.equal(svgTransform('skewX(3)'),null);
  assert.equal(readRenderingArea(fixture.replace('1439.64 1823.54','2 2'),'front'),null);
  assert.equal(readRenderingArea('<!DOCTYPE x>'+fixture,'front'),null);
  assert.equal(readRenderingArea(fixture.replace('translate(1044.01 747.9)','translate(no 0)'),'front'),null);
});
test('portrait artwork height and rotation follow actual Printify placement',()=>{
  const art=artworkInRendering(readRenderingArea(fixture,'front'),{x:.5,y:.5,scale:.5,angle:15},4000,5000,.5);
  assert.equal(art.height,1823.54*.8);assert.match(art.rotation,/^rotate\(15 /);
});
