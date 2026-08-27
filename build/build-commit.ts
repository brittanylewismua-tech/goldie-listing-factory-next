import { execSync } from "node:child_process";

/* D630 · D629 read VERCEL_GIT_COMMIT_SHA, which this project never sets - it
   builds with Vinext on Vite and deploys to Cloudflare, not to Vercel's Node
   runtime. Production answered {"build":"D629","commit":""}, so the half of
   D629 that was supposed to make the marker impossible to forget did nothing.
   
   The build is the only place that reliably knows which commit it is. Ask git
   first, because the deploy builds from a checkout; fall back to whichever CI
   variable happens to exist, so this keeps working if the builder changes. */
const CI_COMMIT_VARIABLES = [
  "WORKERS_CI_COMMIT_SHA",
  "CF_PAGES_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
  "COMMIT_SHA",
];

export function resolveBuildCommit(): string {
  for (const name of CI_COMMIT_VARIABLES) {
    const value = (process.env[name] || "").trim();
    if (/^[0-9a-f]{7,40}$/i.test(value)) return value.slice(0, 40);
  }
  try {
    const value = execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (/^[0-9a-f]{40}$/i.test(value)) return value;
  } catch {
    /* No .git in the build context. An empty commit degrades to the readable
       marker, which is exactly how D629 behaves today - never worse. */
  }
  return "";
}
