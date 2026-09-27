import { protectedResourceResponse } from "@/app/masterbot/protected-resource";

export function GET() {
  return protectedResourceResponse();
}
