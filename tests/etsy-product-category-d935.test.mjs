import assert from "node:assert/strict";
import test from "node:test";
import { drinkwareCategoryScore } from "../app/etsy-category-score.ts";

test("D935: an 11 oz mug ranks Etsy Mugs above every tumbler category",()=>{
  const exact=drinkwareCategoryScore("Mug 11oz","Home & Living › Kitchen & Dining › Drinkware › Mugs");
  const wrong=drinkwareCategoryScore("Mug 11oz","Craft Supplies & Tools › Tools & Equipment › Equipment & Machines › Tumblers");
  assert.ok(exact>wrong,{exact,wrong});
});

test("D935: drinkware families prefer their own exact physical product",()=>{
  assert.ok(drinkwareCategoryScore("Stainless Tumbler","Drinkware › Tumblers")>drinkwareCategoryScore("Stainless Tumbler","Drinkware › Mugs"));
  assert.ok(drinkwareCategoryScore("Water Bottle","Drinkware › Water Bottles")>drinkwareCategoryScore("Water Bottle","Drinkware › Tumblers"));
  assert.ok(drinkwareCategoryScore("Wine Glass","Drinkware › Wine Glasses")>drinkwareCategoryScore("Wine Glass","Drinkware › Mugs"));
});
