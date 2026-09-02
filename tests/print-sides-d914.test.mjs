import test from "node:test";
import assert from "node:assert/strict";
import {colorNoun,isLabelPosition,orderedPrintSides,primaryPrintSide,printSideLabel,productNoun} from "../app/print-sides.ts";

test("the populated template artwork decides the primary print side",()=>{
  assert.equal(primaryPrintSide([{position:"front",populated:false},{position:"back",populated:true}]),"back");
  assert.equal(primaryPrintSide([{position:"front",populated:false},{position:"wrap",populated:true}]),"wrap");
  assert.equal(primaryPrintSide([{position:"front",populated:false},{position:"left_sleeve",populated:true}]),"left_sleeve");
});

test("front, wrap, back and sleeves are stable tiebreaks, never response-order guesses",()=>{
  const expected=["front","wrap","back","left_sleeve"];
  assert.deepEqual(orderedPrintSides(["back","left_sleeve","front","wrap"]),expected);
  assert.deepEqual(orderedPrintSides(["wrap","front","left_sleeve","back"]),expected);
});

test("every real side survives, duplicate population is merged, and labels never become products",()=>{
  assert.deepEqual(orderedPrintSides([
    {position:"custom_panel",populated:false},{position:"custom_panel",populated:true},
    {position:"neck_label",populated:true},{position:"right_sleeve",populated:false},
  ]),["custom_panel","right_sleeve"]);
  assert.equal(isLabelPosition("inside neck tag"),true);
});

test("empty and unpopulated templates fail safely",()=>{
  assert.equal(primaryPrintSide([]),null);
  assert.equal(primaryPrintSide(null),null);
  assert.equal(primaryPrintSide([{position:"back",populated:false},{position:"front",populated:false}]),"front");
  assert.equal(primaryPrintSide(["back"]),"back");
});

test("print-side labels are readable",()=>{
  assert.equal(printSideLabel("left_sleeve"),"Left sleeve");
  assert.equal(printSideLabel("right-arm"),"Right sleeve");
  assert.equal(printSideLabel("all_around"),"Wrap");
  assert.equal(printSideLabel("custom_panel"),"Custom panel");
  assert.equal(printSideLabel(""),"Print area");
});

test("product language follows the blueprint and Printify alone is never a paper print",()=>{
  assert.equal(productNoun("11oz Mug","Generic","Printify"),"mug");
  assert.equal(productNoun("iPhone 15 Case","Generic","Printify"),"case");
  assert.equal(productNoun("Canvas Tote Bag","Generic","Printify"),"bag");
  assert.equal(productNoun("Art Print","Generic","Printify"),"print");
  assert.equal(productNoun("Gaming Mouse Pad","Generic","Printify"),"mousepad");
  assert.equal(productNoun("Custom object","Generic","Printify"),"item");
  assert.equal(colorNoun("11oz Mug"),"mug color");
});
