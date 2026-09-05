import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("D672 — every open task row closes from the whole row", () => {
  assert.match(page, /const rowOpen=Boolean\(!switchingProduct&&open&&row\.task&&activeTask===row\.task\)/);
  assert.match(page, /aria-expanded=\{row\.report\?undefined:rowOpen\}/);
  assert.match(page, /onClick=\{event=>\{if\(row\.report\)return;holdRowInPlace\(\(event\.currentTarget as HTMLElement\)\);openRow\(row\.target,row\.task\)\}\}/);
  assert.match(page, /opening\?"Opening…":rowOpen\?"Close":"Change"/);
  assert.match(page, /setActiveTask\(current=>current===task\?"":task\)/);
});

test("D674 — the open column closes from its non-interactive surface", () => {
  assert.match(page, /className="task-panel open-task-column" onClick=/);
  assert.match(page, /target\.closest\("button,a,input,textarea,select,label,summary,\[role='button'\],\[contenteditable='true'\],\[draggable='true'\]"\)\)return/);
  assert.match(page, /event\.currentTarget\.previousElementSibling/);
  assert.match(page, /holdRowInPlace\(rowElement\);openRow\(row\.target,row\.task\)/);
});
