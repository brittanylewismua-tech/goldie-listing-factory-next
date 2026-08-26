/* D573 - the placement contract, in one place with no React around it so it can
   be tested directly. Printify controls the artwork's size and position; the
   lifestyle scene controls only which surface it lands on and what stays in
   front of it. */
import type { ResolvedPlacement, PrintSide } from "../placement-math";

type Adjustment = { scale: number; x: number; y: number };
export type QuadMeaning = "garment" | "print-area";
type SurfaceKind = string;

export function placementAdjustment(placement?:ResolvedPlacement,kind:SurfaceKind="rigid-flat",quadMeans:QuadMeaning="garment"):Adjustment|null{
  if(quadMeans==="print-area"&&placement&&Number.isFinite(placement.scale)&&placement.scale>0)
    return{scale:Math.min(1,Math.max(.01,placement.scale)),x:(placement.x??.5)-.5,y:(placement.y??.5)-.5};
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
