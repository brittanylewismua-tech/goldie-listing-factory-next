import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("D671 — saved mockup sets are retired without removing listing photos", async () => {
  const [layout, factory, navigation, operations, signup, usage, uploads, order] = await Promise.all([
    read("app/mockups/layout.tsx"),
    read("app/listing-factory-app.tsx"),
    read("app/factory-shell.tsx"),
    read("app/operations/page.tsx"),
    read("app/signup/signup-client.tsx"),
    read("app/usage/page.tsx"),
    read("app/uploaded-listing-photos.tsx"),
    read("app/listing-photo-order.tsx"),
  ]);

  assert.match(layout, /notFound\(\)/, "the retired /mockups route must not render its old page");
  for (const source of [factory, navigation, operations, signup, usage]) {
    assert.doesNotMatch(source, /href="\/mockups"|Mockup Library|Mockup Sets|saved mockup sets|AI lifestyle mockups/i);
  }
  assert.doesNotMatch(factory, /function MockupSetSelector|fetch\("\/api\/mockups\/library"\)/);
  assert.match(uploads, /Add listing photos/);
  assert.match(order, /uploaded/i, "uploaded listing photos must remain available to the final photo order");
});
