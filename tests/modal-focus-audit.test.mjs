import test from 'node:test';
import assert from 'node:assert/strict';
import { containModalFocus } from '../app/modal-focus.ts';

test('preview modal focuses inside, wraps both directions, and restores its opener', () => {
  const listeners = new Map();
  const original = {document:globalThis.document,window:globalThis.window,HTMLElement:globalThis.HTMLElement};
  class Element {
    isConnected=true;
    focus(){document.activeElement=this;}
    getClientRects(){return [1];}
  }
  const opener=new Element(), first=new Element(), last=new Element();
  const dialog={getAttribute:()=> 'QA preview',querySelectorAll:()=>[first,last],contains:node=>[first,last].includes(node)};
  globalThis.HTMLElement=Element;
  globalThis.document={activeElement:opener,querySelectorAll:()=>[dialog]};
  globalThis.window={addEventListener:(key,handler)=>listeners.set(key,handler),removeEventListener:key=>listeners.delete(key)};
  try {
    const restore=containModalFocus('QA preview');
    assert.equal(document.activeElement,first);
    let prevented=0;
    const tab=shiftKey=>listeners.get('keydown')({key:'Tab',shiftKey,preventDefault:()=>prevented++});
    tab(true); assert.equal(document.activeElement,last);
    tab(false); assert.equal(document.activeElement,first);
    opener.focus(); tab(false); assert.equal(document.activeElement,first);
    assert.equal(prevented,3);
    restore(); assert.equal(document.activeElement,opener); assert.equal(listeners.size,0);
  } finally { Object.assign(globalThis,original); }
});
