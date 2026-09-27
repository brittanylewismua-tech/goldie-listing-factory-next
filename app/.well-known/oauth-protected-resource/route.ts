import { protectedResourceResponse } from "@/app/masterbot/protected-resource";

/* Some clients ask at the origin root instead of the path-suffixed URL. The
   only protected resource on this origin is MasterBot, so both answer. */
export function GET() {
  return protectedResourceResponse();
}
