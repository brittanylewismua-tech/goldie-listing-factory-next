import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("saved mockup sets remain reachable without removing listing photos", async () => {
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

  assert.doesNotMatch(layout, /notFound\(\)/, "the /mockups route must render");
  assert.match(navigation, /label: "Mockup Sets"[\s\S]*href: "\/mockups"/);
  assert.doesNotMatch(factory, /function MockupSetSelector|fetch\("\/api\/mockups\/library"\)/);
  assert.match(uploads, /Add listing photos/);
  assert.match(order, /uploaded/i, "uploaded listing photos must remain available to the final photo order");
});
