import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// An empty icons array left the Android install affordance unavailable even
// though home-screen launch and standalone display were configured correctly.
test('home-screen manifest supplies real installable and maskable PNG icons',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  for(const size of [192,512]) {
    const icon=manifest.icons.find(icon=>icon.sizes===`${size}x${size}` && (!icon.purpose || icon.purpose.split(' ').includes('any')));
    assert.ok(icon,`missing ${size}px install icon`);
  }
  assert.ok(manifest.icons.some(icon=>icon.purpose?.split(' ').includes('maskable')));
  for(const icon of manifest.icons) {
    assert.match(icon.src,/^\/[a-z0-9-]+\.png$/);
    const bytes=readFileSync(new URL(`../public${icon.src}`,import.meta.url));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(icon.sizes,`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`);
    assert.equal(icon.type,'image/png');
  }
  assert.equal(manifest.display,'standalone');
  assert.equal(new URL(manifest.start_url,'https://thegoldiesuite.com').pathname,'/home');
});
