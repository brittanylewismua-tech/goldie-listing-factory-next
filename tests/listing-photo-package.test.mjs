import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/listing-photo-package.ts',import.meta.url),'utf8');
const {orderedPackagePhotos,loadPhotoPackage}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
const prefix='etsy-listing-images/owner/product/';
const upload={key:prefix+'upload/a.png'},guide={key:prefix+'size-guide/g.png'};
test('download matches saved mixed photo order and includes the size guide',async()=>{
 const photos=orderedPackagePhotos(['front','back'],[0,1],[upload,guide],prefix,['printify:1','stored:'+guide.key,'printify:0','stored:'+upload.key]);
 assert.deepEqual(photos.map(p=>p.id),['printify:1','stored:'+guide.key,'printify:0','stored:'+upload.key]);
 const files=await loadPhotoPackage(photos,async p=>({bytes:new TextEncoder().encode(p.id),extension:'png'}));
 assert.deepEqual(Object.keys(files),['01-printify.png','02-size-guide.png','03-printify.png','04-photo.png']);
 assert.equal(new TextDecoder().decode(files['01-printify.png']),'printify:1');
});
test('stale order cannot include deselected, deleted or another owner’s photos',()=>{
 const foreign={key:'etsy-listing-images/other/product/upload/private.png'};
 const photos=orderedPackagePhotos(['front','back'],[0,0,-1,9],[upload,guide,foreign,{key:prefix+'order.json'}],prefix,['printify:1','stored:'+foreign.key,'stored:deleted','printify:0','printify:0']);
 assert.deepEqual(photos.map(p=>p.id),['printify:0','stored:'+upload.key,'stored:'+guide.key]);
});
test('unsaved order matches editor defaults: uploads, selected Printify photos, size guide',()=>{
 assert.deepEqual(orderedPackagePhotos(['front','back'],[1,0],[guide,upload],prefix,null).map(p=>p.kind),['photo','printify','printify','size-guide']);
});
test('one failed image rejects the package rather than producing an incomplete ZIP',async()=>{
 let calls=0;
 await assert.rejects(loadPhotoPackage([{id:'1',kind:'photo'},{id:'2',kind:'photo'}],async()=>{if(++calls===2)throw Error('Photo unavailable');return{bytes:new Uint8Array([1]),extension:'png'}}),/Photo unavailable/);
});
test('package memory limit rejects oversized output',async()=>{
 await assert.rejects(loadPhotoPackage([{id:'1',kind:'photo'}],async()=>({bytes:new Uint8Array(4),extension:'png'}),3),/too large/);
});
