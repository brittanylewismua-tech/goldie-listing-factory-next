import {readFileSync} from 'node:fs';
/** Creation moved behind a durable worker. Existing contract tests inspect the
 * complete active implementation, not a stale copy of the former HTTP body. */
export const readDraftImplementation=()=>['app/api/printify/drafts/route.ts','app/api/printify/drafts/execute-job.ts','app/api/printify/draft-job-store.ts','worker/draft-creation-workflow.ts'].map(path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')).join('\n');
