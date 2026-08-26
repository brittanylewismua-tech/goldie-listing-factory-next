/* D573 - the placement contract, in one place with no React around it so it can
   be tested directly. Printify controls the artwork's size and position; the
   lifestyle scene controls only which surface it lands on and what stays in
   front of it. */
import type { ResolvedPlacement, PrintSide } from "../placement-math";

type Adjustment = { scale: number; x: number; y: number; angle?: number };
export type QuadMeaning = "garment" | "print-area";
type SurfaceKind = string;

export function placementAdjustment(placement?:ResolvedPlacement,kind:SurfaceKind="rigid-flat",quadMeans:QuadMeaning="garment"):Adjustment|null{
  if(quadMeans==="print-area"&&placement&&Number.isFinite(placement.scale)&&placement.scale>0)
    /* D573 - rotation was being dropped. Printify gives an angle in degrees and
       the renderer never looked at it, so a design placed on an angle came out
       straight. It is carried here and applied to the artwork layer only. */
    return{scale:Math.min(1,Math.max(.01,placement.scale)),x:(placement.x??.5)-.5,y:(placement.y??.5)-.5,angle:Number.isFinite(placement.angle)?Number(placement.angle):0};
  /* D573 - there is no constant here any more. `return {scale:.42,x:0,y:0}` was
     a number with no relationship to where Printify put the artwork, and it made
     every design on an unconfirmed scene the same size in the same place. When
     the real placement cannot be reproduced this refuses, and the caller names
     the scene instead of rendering something that looks convincing and is wrong. */
  return null;
}
/* D573 - a scene only renders a print it can actually show. A back print on a
   front-facing photograph is a fake, and no amount of placement maths fixes it,
   so the scene is held back and named rather than rendered wrong. */
export function sceneAcceptsSide(scene:{printSide?:PrintSide},placement?:ResolvedPlacement){
  const wanted=placement?.side;
  if(!wanted||wanted==="other")return true;
  return (scene.printSide||"front")===wanted;
}
/* D573 - a back print that runs under a hood, hair or straps needs the saved
   foreground painted back over it. Without a confirmed mask the render is
   visibly wrong, so the scene is not ready. Front prints do not need one. */
export function sceneNeedsOcclusion(scene:{printSide?:PrintSide;occlusionConfirmed?:boolean},placement?:ResolvedPlacement){
  const side=placement?.side||scene.printSide||"front";
  return side==="back"&&!scene.occlusionConfirmed;
}

/* D573 - classifying what is already in the library, per her section 10. A quad
   that differs from the placeholder is not automatically trustworthy: before
   D573 nothing recorded whether a quad was a print area or a region of the
   garment, so "not the placeholder" only means someone drew something once. */
export type SceneStatus = "ready" | "needs-review" | "needs-marking" | "needs-foreground";

const PLACEHOLDER: Array<[number, number]> = [[.15, .12], [.85, .12], [.85, .88], [.15, .88]];

export function isPlaceholderQuad(corners?: Array<[number, number]> | null) {
  if (!corners || corners.length !== 4) return true;
  return corners.every((point, index) =>
    Math.abs(point[0] - PLACEHOLDER[index][0]) < .001 && Math.abs(point[1] - PLACEHOLDER[index][1]) < .001);
}

export function sceneStatus(scene: {
  corners?: Array<[number, number]> | null;
  quadMeans?: QuadMeaning;
  printSide?: PrintSide;
  occlusionConfirmed?: boolean;
}): SceneStatus {
  if (isPlaceholderQuad(scene.corners)) return "needs-marking";
  // A quad that predates the contract has no recorded relationship to the print
  // area, so it cannot carry Printify's scale and must be looked at once.
  if ((scene.quadMeans || "garment") !== "print-area") return "needs-review";
  if (scene.printSide === "back" && !scene.occlusionConfirmed) return "needs-foreground";
  return "ready";
}

export function sceneIsReady(scene: Parameters<typeof sceneStatus>[0]) {
  return sceneStatus(scene) === "ready";
}

/* D573 - what each render actually did. Not shown to sellers, but when a mockup
   comes out wrong this is the difference between reading the code and knowing.
   Kept in memory, capped, and readable from the console as __goldieRenders. */
export type RenderRecord = {
  scene: string; sceneId: string; printSide?: PrintSide; quadMeans: QuadMeaning;
  placement?: { x: number; y: number; scale: number; angle: number; side?: PrintSide } | null;
  applied?: { scale: number; x: number; y: number; angle?: number } | null;
  usedForeground: boolean; source: "printify" | "preview-analysis" | "refused";
  ms: number; failure?: string; width?: number; height?: number;
};

const records: RenderRecord[] = [];

export function recordRender(record: RenderRecord) {
  records.push(record);
  if (records.length > 200) records.splice(0, records.length - 200);
  if (typeof window !== "undefined") (window as unknown as { __goldieRenders?: RenderRecord[] }).__goldieRenders = records;
}

export function renderRecords() { return records.slice(); }
