import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const command=readFileSync("app/command-center/command-center-client.tsx","utf8");
const commandCss=readFileSync("app/command-center/command-center.css","utf8");
const connCss=readFileSync("app/connections/connections.css","utf8");

test("Command Center surfaces the business question each tool answers",()=>{
  assert.match(command,/What is selling across Etsy right now\?/);
  assert.match(command,/What changed on Etsy or Printify\?/);
  assert.match(command,/What are buyers choosing in my niche\?/);
  assert.match(command,/Which of my designs actually make money\?/);
  assert.match(command,/Does this phrase have trademark matches\?/);
  assert.match(command,/cc-home-question/);
});

test("Command Center tiles use the Goldie visual system",()=>{
  assert.match(commandCss,/box-shadow:4px 4px 0 #000/);
  assert.match(commandCss,/box-shadow:7px 7px 0 #ee6fc0/);
});

test("Connections uses the same Goldie card hierarchy",()=>{
  assert.match(connCss,/Goldie Suite connections visual system/);
  assert.match(connCss,/border:2px solid #000!important/);
  assert.match(connCss,/box-shadow:4px 4px 0 #000!important/);
  assert.match(connCss,/background:var\(--g-pink-soft\)!important/);
});
