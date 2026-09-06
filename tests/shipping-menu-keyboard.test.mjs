import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/shipping-menu-keyboard.ts',import.meta.url),'utf8');
const {shippingMenuKeyboard}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
function fixture(){
 const document={activeElement:{tagName:'INPUT'}};let closed=0,prevented=0,stopped=0;
 const options=Array.from({length:3},()=>({focus(){document.activeElement=this}}));
 const root={ownerDocument:document,querySelectorAll:()=>options};
 const press=key=>shippingMenuKeyboard({key,preventDefault(){prevented++},stopPropagation(){stopped++}},root,()=>closed++);
 return {document,options,press,state:()=>({closed,prevented,stopped})};
}
test('shipping arrow keys move from search through options without selecting',()=>{
 const f=fixture();for(const [key,index] of [['ArrowDown',0],['ArrowDown',1],['ArrowUp',0],['ArrowUp',2],['Home',0],['End',2]]){f.press(key);assert.equal(f.document.activeElement,f.options[index]);}assert.equal(f.state().closed,0);
});
test('Escape dismisses shipping from either search or options',()=>{
 const f=fixture();f.press('Escape');f.press('ArrowDown');f.press('Escape');assert.equal(f.state().closed,2);assert.equal(f.state().stopped,2);
});
test('search editing keys and empty filtered lists retain focus and default behavior',()=>{
 const f=fixture(),search=f.document.activeElement;for(const key of ['Home','End','a','Enter','Tab'])f.press(key);assert.equal(f.document.activeElement,search);assert.equal(f.state().prevented,0);
 let focused=false;shippingMenuKeyboard({key:'ArrowDown',preventDefault(){focused=true},stopPropagation(){}},{querySelectorAll:()=>[]},()=>assert.fail('No selection'));assert.equal(focused,false);
});
