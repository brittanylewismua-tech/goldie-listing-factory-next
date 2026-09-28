import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("watched phrase load failures stay separate from trademark search failures",()=>{
  const page=readFileSync("app/trademark/page.tsx","utf8");
  assert.match(page,/const \[watchError,setWatchError\]=useState\(""\)/);
  assert.match(page,/setWatchError\(cause instanceof Error/);
  assert.match(page,/tm-watch-load-error/);
  const loader=page.slice(page.indexOf("const loadWatches"),page.indexOf("useEffect(() => { void loadWatches"));
  assert.doesNotMatch(loader,/setError\(/);
});
