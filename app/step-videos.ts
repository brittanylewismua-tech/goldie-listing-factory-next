/* D705 · A walkthrough video that follows the screen you are on.
 *
 * Her request: "a small video icon next to the question mark in the bottom
 * right ... is it possible that we have that video icon there, but it
 * automatically changes the video based on what step they're on."
 *
 * The obvious way to build this is a list of the four numbered steps. That
 * would be wrong, and it is worth writing down why, because the page count is
 * not what the rail says it is. The rail shows four steps; the app renders
 * more screens than that:
 *
 *   connect            connect Printify and Etsy
 *   setup              STEP 1 · PRODUCT
 *   designs            STEP 2, before drafts exist - upload art, create drafts
 *   images             STEP 2, after drafts exist - placement, photos, order
 *   details            STEP 3 · LISTING - titles, tags, descriptions
 *   etsy               STEP 3 · LISTING - Etsy category and attributes
 *   mockups            choosing the listing images
 *   final              STEP 4 · PUBLISH
 *
 * Step 2 is two screens either side of `complete`, and step 3 is three phases.
 * So the key is derived from the same state the page itself branches on -
 * workflowStep, finishPhase and complete - rather than from a hand-written list
 * of four, which is how a video ends up playing on the wrong screen.
 */

export type WorkflowScreen =
  | "connect" | "setup" | "designs" | "images"
  | "details" | "etsy" | "mockups" | "final";

export function workflowScreen(
  workflowStep: string,
  finishPhase: string,
  complete: boolean,
): WorkflowScreen {
  if (workflowStep === "connect") return "connect";
  if (workflowStep === "setup") return "setup";
  /* The same workflowStep renders two different screens. Before any draft
     exists you are uploading artwork; after, you are working on images. */
  if (workflowStep === "designs") return complete ? "images" : "designs";
  if (finishPhase === "etsy") return "etsy";
  if (finishPhase === "mockups") return "mockups";
  if (finishPhase === "final") return "final";
  return "details";
}

/* Loom video ids, not full URLs: the same id builds both the embed src and the
   share link, and pasting a share URL into a map of embed URLs is the kind of
   mistake that only shows up as a blank frame. Take the id out of any Loom
   link - it is the hex string after /share/ or /embed/.

   A screen with no id yet renders NO button rather than a dead one. Filling
   these in is the whole job of adding a video. */
export const STEP_VIDEOS: Partial<Record<WorkflowScreen, string>> = {
  setup: "3a71cf8db4b74ea198723df62c951329",
};

export const STEP_VIDEO_TITLES: Record<WorkflowScreen, string> = {
  connect: "Connecting Printify and Etsy",
  setup: "Choosing your product",
  designs: "Uploading your designs",
  images: "Listing images and placement",
  details: "Titles, tags and descriptions",
  etsy: "Etsy details",
  mockups: "Choosing listing photos",
  final: "Reviewing and publishing",
};

export function stepVideoId(screen: WorkflowScreen): string {
  return STEP_VIDEOS[screen] || "";
}

export function loomEmbedUrl(id: string): string {
  return `https://www.loom.com/embed/${id}?hide_owner=true&hide_share=true&hideEmbedTopBar=true`;
}
