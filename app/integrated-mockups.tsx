"use client";
/* D588 - Stage 1 of the embedded placement editor. Konva cannot be server
   rendered, so the editor is loaded only when a seller opens it. */

import { lazy, Suspense } from "react";
import "./mockups/scene-editor.css";
import { defaultTransform, renderingModeFor, placeArtworkOnSurface, type PlacementTransform, type Quad } from "./mockups/placement-profile";
import { productAcceptsMockup, productSurfaceFamily } from "./mockup-compatibility";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { safeImagePreviewDataUrl } from "./client-image-preview";
import { runBounded } from "./bounded-work";
import { isCalibratedQuad } from "./mockups/calibration";
import type { ResolvedPlacement, PrintSide } from "./placement-math";
import { placementAdjustment, sceneAcceptsSide, sceneNeedsOcclusion, recordRender, type QuadMeaning } from "./mockups/placement-contract";
import { computedPreparation } from "./mockups/prepared-scene";
import type { ArtworkBounds } from "./design-artwork";
import { measureReference, productBoxInScene, derivedPlacement, placementInFace, type ProductBox, type ReferenceFit } from "./mockups/reference-placement";
import { preparationMatchesProduct, type ScenePreparation } from "./mockups/prepared-scene";

type Point=[number,number]; type SurfaceKind="rigid-flat"|"t-shirt"|"sweatshirt"|"hoodie"|"other-apparel"|"apparel"|"soft-goods"|"curved"|"irregular";
type Template={id:string;name:string;theme:string;src:string;corners:[Point,Point,Point,Point];normalized?:boolean;surfaceKind?:SurfaceKind;foregroundPrompt?:string;printSide?:PrintSide;quadMeans?:QuadMeaning;occlusionUrl?:string;occlusionUrls?:string[];occlusionConfirmed?:boolean;preparationStatus?:string;preparation?:ScenePreparation};
const SceneEditor=lazy(()=>import("./mockups/scene-editor"));

type Result={name:string;url:string;template:string;templateId:string;surfaceKind:SurfaceKind;warning?:string;adjusted?:boolean};
type Adjustment={scale:number;x:number;y:number;angle?:number};
const MAX_MOCKUPS_PER_LISTING=8;
const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.crossOrigin="anonymous";image.onload=()=>resolve(image);image.onerror=reject;image.src=src});
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)});
const foregroundCache=new Map<string,string[]>();

/* D610 - phone-case renders like any other flat printed face. */
function isCalibratedSurface(kind:SurfaceKind){return["rigid-flat","phone-case","t-shirt","sweatshirt","hoodie","other-apparel","apparel"].includes(kind)}
/* D529 - a mug offered every t-shirt scene she owns, with no warning, and would
   have put mug artwork on ten tee photos. This filter only ever restricted
   apparel templates: a non-apparel template returned true for anything, and a
   product with no garment kind - a mug, a poster - was told apparel scenes were
   fine. Verified live on her Ceramic Mug batch: ten BACH TEES scenes offered.
   Families have to match on both sides, not just one. */



/* D573 - a saved mask wins over anything worked out at render time. It was
   confirmed once against this photograph, so it is the same on every render and
   costs no model call. The segmenter below stays only for scenes that have never
   been through the editor. */
async function foregroundLayers(t:Template){/* D603 - every isolated layer, not just the first. */if(t.occlusionUrls?.length)return t.occlusionUrls;if(t.occlusionUrl)return[t.occlusionUrl];if(!t.foregroundPrompt)return[];const cached=foregroundCache.get(t.id);if(cached)return cached;try{const response=await fetch("/api/mockups/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageUrl:new URL(t.src,window.location.origin).toString(),prompt:t.foregroundPrompt})}),payload=await response.json() as {masks?:Array<{url:string}>;error?:string};if(!response.ok)throw new Error(payload.error||`Could not safely layer ${t.name}.`);const urls=(payload.masks||[]).map(x=>x.url);foregroundCache.set(t.id,urls);return urls}catch{/* A highlight layer that will not load is a slightly flatter mockup, not a failed one. Cached so one outage does not retry on every scene. */foregroundCache.set(t.id,[]);return[]}}
function area(c:Point[]){return Math.abs(c.reduce((n,[x,y],i)=>{const q=c[(i+1)%c.length];return n+x*q[1]-q[0]*y},0)/2)}
/* D447 - a mockup must never fail to render.
 *
 * The measurement feeding this can always be wrong in some new way: a Printify
 * preview that is a model shot rather than a flat lay, segmentation returning the
 * person instead of the product, a garment cropped by the frame. Improving the
 * measurement does not make failure impossible, it only moves it. What makes it
 * impossible is a render path with no way to throw.
 *
 * So the quad is chosen from a chain: the derived one, then the template's own,
 * then a plain inset box that is valid by construction. usableQuad decides;
 * nothing here refuses. */
function usableQuad(c:Template["corners"]|undefined,w:number,h:number):boolean{
  if(!c||c.length!==4)return false;
  if(c.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>w||y>h))return false;
  return area(c)>=w*h*.01;
}
function defaultQuad(w:number,h:number):Template["corners"]{
  return [[w*.15,h*.12],[w*.85,h*.12],[w*.85,h*.88],[w*.15,h*.88]] as Template["corners"];
}
/* D466 - has a person actually marked this scene's print area?
 *
 * Every template is saved with the same placeholder box, the middle 70% of the
 * photo, and the Mockup Library has always had a calibrator that replaces it
 * with four clicks. A template still carrying the placeholder has never been
 * calibrated; one that differs from it has been marked by hand.
 *
 * That distinction decides which quad wins, and D433 had it backwards: it put
 * the automatically derived box first, so an automatic guess overrode a human's
 * answer. On a mug the guess cannot be right - the printable face is offset from
 * the handle and foreshortened by the camera - and no amount of detection fixes
 * that, which is why every professional mockup tool stores a placement marked
 * once per photo instead of detecting one per render. */
function isCalibrated(t:Template){return isCalibratedQuad(t.corners as [number,number][],t.normalized)}
function safeCorners(c:Template["corners"],w:number,h:number):Template["corners"]{const cx=c.reduce((n,p)=>n+p[0],0)/4,cy=c.reduce((n,p)=>n+p[1],0)/4,inset=Math.max(2,Math.min(w,h)*.002);return c.map(([x,y])=>{const dx=cx-x,dy=cy-y,d=Math.hypot(dx,dy)||1;return[x+dx/d*inset,y+dy/d*inset] as Point}) as Template["corners"]}
function bilinear(c:Template["corners"],u:number,v:number):Point{const[tl,tr,br,bl]=c;return[(1-u)*(1-v)*tl[0]+u*(1-v)*tr[0]+u*v*br[0]+(1-u)*v*bl[0],(1-u)*(1-v)*tl[1]+u*(1-v)*tr[1]+u*v*br[1]+(1-u)*v*bl[1]]}
function affine(ctx:CanvasRenderingContext2D,s:Point[],d:Point[]){const[s0,s1,s2]=s,[d0,d1,d2]=d,den=s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);ctx.setTransform((d0[0]*(s1[1]-s2[1])+d1[0]*(s2[1]-s0[1])+d2[0]*(s0[1]-s1[1]))/den,(d0[1]*(s1[1]-s2[1])+d1[1]*(s2[1]-s0[1])+d2[1]*(s0[1]-s1[1]))/den,(d0[0]*(s2[0]-s1[0])+d1[0]*(s0[0]-s2[0])+d2[0]*(s1[0]-s0[0]))/den,(d0[1]*(s2[0]-s1[0])+d1[1]*(s0[0]-s2[0])+d2[1]*(s1[0]-s0[0]))/den,(d0[0]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[0]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[0]*(s0[0]*s1[1]-s1[0]*s0[1]))/den,(d0[1]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[1]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[1]*(s0[0]*s1[1]-s1[0]*s0[1]))/den)}
function tri(ctx:CanvasRenderingContext2D,image:CanvasImageSource,s:Point[],d:Point[]){ctx.save();ctx.beginPath();ctx.moveTo(...d[0]);ctx.lineTo(...d[1]);ctx.lineTo(...d[2]);ctx.closePath();ctx.clip();affine(ctx,s,d);ctx.drawImage(image,0,0);ctx.restore()}
/* D454 - a mug is a cylinder, and a flat paste on a cylinder always reads as a
 * sticker however well it is shaded. Print wrapped round a curved surface
 * compresses towards the edges: equal steps around the mug cover less and less
 * screen as the surface turns away.
 *
 * So for a curved surface the destination stays evenly spaced and the ARTWORK is
 * sampled unevenly - u' = asin(2u-1 x sin t) / 2t + 1/2, the inverse of the
 * projection a cylinder performs. Flat surfaces pass through untouched, so a tee
 * renders exactly as it did.
 *
 * The half-angle is how much of the mug's circumference is facing the camera.
 * Roughly a third of a turn is visible on a straight-on mug photograph. */
const CURVE_HALF_ANGLE:Partial<Record<SurfaceKind,number>>={curved:.62,"rigid-flat":0};
function wrapAcross(kind:SurfaceKind){
  const angle=CURVE_HALF_ANGLE[kind]??0;
  if(!angle)return (u:number)=>u;
  const span=Math.sin(angle);
  return (u:number)=>{
    const projected=Math.max(-1,Math.min(1,(u*2-1)*span));
    return Math.asin(projected)/(2*angle)+.5;
  };
}

/* D448 - making a print look printed, without touching the photograph.
 *
 * Her three requirements, and they are all the same requirement: the mockup photo
 * she uploaded must survive untouched, the artwork must sit where the Printify
 * template puts it, and it must read as ink on cloth rather than a sticker on top
 * of it. A generative editor cannot do the first of those - it repaints the whole
 * frame, which is where the painted look, the invented garment and the wandering
 * design all came from.
 *
 * This composites instead. Every pixel of her photograph is left exactly as it
 * was except where the ink lands, and there two things happen that a flat paste
 * does not do:
 *
 *   Shading. The cloth's own luminance is divided by the average luminance under
 *   the print, so a mid-tone reads as unchanged ink while folds darken it and
 *   highlights lift it. That is why a real print looks attached to the garment.
 *
 *   Displacement. Ink is sampled along the luminance gradient, so it bends into
 *   the folds it is sitting on rather than lying flat across them.
 *
 * Both are deliberately restrained. Overdone, they look like an effect. */
function printOntoGarment(base:CanvasRenderingContext2D,ink:CanvasRenderingContext2D,width:number,height:number){
  const cloth=base.getImageData(0,0,width,height),paint=ink.getImageData(0,0,width,height);
  const clothData=cloth.data,paintData=paint.data;
  const luminance=(i:number)=>(clothData[i]*.299+clothData[i+1]*.587+clothData[i+2]*.114)/255;

  let total=0,counted=0;
  for(let i=0;i<paintData.length;i+=4){ if(paintData[i+3]>16){ total+=luminance(i); counted++ } }
  if(!counted)return;
  const average=Math.max(.08,total/counted);

  const source=new Uint8ClampedArray(paintData);
  const FOLD_STRENGTH=6;          // pixels of bend at a hard fold
  const SHADE_FLOOR=.55,SHADE_CEILING=1.25;

  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      if(!source[i+3])continue;
      // Bend the ink along the cloth, sampling from where the fold came from.
      let sx=x,sy=y;
      if(x>0&&x<width-1&&y>0&&y<height-1){
        const gx=luminance(i+4)-luminance(i-4),gy=luminance(i+width*4)-luminance(i-width*4);
        sx=Math.round(x-gx*FOLD_STRENGTH);sy=Math.round(y-gy*FOLD_STRENGTH);
        if(sx<0||sx>=width||sy<0||sy>=height){sx=x;sy=y}
      }
      const s=(sy*width+sx)*4;
      const alpha=source[s+3];
      if(!alpha){paintData[i+3]=0;continue}
      // Shade by the cloth beneath, relative to the average under the print.
      const shade=Math.min(SHADE_CEILING,Math.max(SHADE_FLOOR,luminance(i)/average));
      paintData[i]=source[s]*shade;
      paintData[i+1]=source[s+1]*shade;
      paintData[i+2]=source[s+2]*shade;
      paintData[i+3]=alpha;
    }
  }
  ink.putImageData(paint,0,0);
}

async function rigid(file:File,t:Template,adjustment:Adjustment={scale:1,x:0,y:0},quadOverride?:Template["corners"]):Promise<Result>{const[master,sourceArt,foregrounds]=await Promise.all([load(t.src),load(URL.createObjectURL(file)),foregroundLayers(t)]),artCanvas=document.createElement("canvas");artCanvas.width=sourceArt.width;artCanvas.height=sourceArt.height;const artContext=artCanvas.getContext("2d")!,drawWidth=sourceArt.width*adjustment.scale,drawHeight=sourceArt.height*adjustment.scale;
/* D573 - rotation is applied about the artwork's placed centre, on the artwork
   layer alone, so the photograph underneath is untouched. */
const spin=Number(adjustment.angle||0);
if(spin){const cx=(sourceArt.width-drawWidth)/2+adjustment.x*sourceArt.width+drawWidth/2,cy=(sourceArt.height-drawHeight)/2+adjustment.y*sourceArt.height+drawHeight/2;artContext.save();artContext.translate(cx,cy);artContext.rotate(spin*Math.PI/180);artContext.drawImage(sourceArt,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);artContext.restore()}
else artContext.drawImage(sourceArt,(sourceArt.width-drawWidth)/2+adjustment.x*sourceArt.width,(sourceArt.height-drawHeight)/2+adjustment.y*sourceArt.height,drawWidth,drawHeight);const art=artCanvas,canvas=document.createElement("canvas");canvas.width=master.naturalWidth;canvas.height=master.naturalHeight;/* D447 - the quad chain. Each candidate is checked, the first usable one wins, and the last is valid by construction, so this cannot fail to produce one. */const toPixels=(q:Template["corners"],normalized:boolean)=>(normalized?q.map(([x,y])=>[x*canvas.width,y*canvas.height] as Point):q) as Template["corners"];/* A hand-marked print area beats a derived one, always. The derived box is for
   scenes nobody has calibrated yet. */
const marked=isCalibrated(t)?toPixels(t.corners,Boolean(t.normalized)):null;
const candidates=[marked,quadOverride?toPixels(quadOverride,true):null,toPixels(t.corners,Boolean(t.normalized)),defaultQuad(canvas.width,canvas.height)];const raw=candidates.find(q=>usableQuad(q??undefined,canvas.width,canvas.height))??defaultQuad(canvas.width,canvas.height),c=safeCorners(raw,canvas.width,canvas.height),ctx=canvas.getContext("2d",{alpha:false})!;ctx.drawImage(master,0,0);/* D448 - the ink goes on its own transparent layer so it can be shaded against the cloth before it touches the photograph. The photograph itself is never redrawn: it is drawn once, above, and the ink is laid over it. */const inkCanvas=document.createElement("canvas");inkCanvas.width=canvas.width;inkCanvas.height=canvas.height;const inkCtx=inkCanvas.getContext("2d",{willReadFrequently:true})!;inkCtx.save();inkCtx.beginPath();c.forEach((p,i)=>i?inkCtx.lineTo(...p):inkCtx.moveTo(...p));inkCtx.closePath();inkCtx.clip();const across=wrapAcross(t.surfaceKind||"rigid-flat");const COLUMNS=(t.surfaceKind==="curved")?28:12;for(let y=0;y<16;y++)for(let x=0;x<COLUMNS;x++){const u=x/COLUMNS,U=(x+1)/COLUMNS,v=y/16,V=(y+1)/16,su=across(u),sU=across(U),s00:[number,number]=[su*art.width,v*art.height],s10:[number,number]=[sU*art.width,v*art.height],s11:[number,number]=[sU*art.width,V*art.height],s01:[number,number]=[su*art.width,V*art.height],d00=bilinear(c,u,v),d10=bilinear(c,U,v),d11=bilinear(c,U,V),d01=bilinear(c,u,V);tri(inkCtx,art as unknown as HTMLImageElement,[s00,s10,s11],[d00,d10,d11]);tri(inkCtx,art as unknown as HTMLImageElement,[s00,s11,s01],[d00,d11,d01])}inkCtx.restore();printOntoGarment(ctx,inkCtx,canvas.width,canvas.height);ctx.drawImage(inkCanvas,0,0);for(const layer of foregrounds)ctx.drawImage(await load(layer),0,0,canvas.width,canvas.height);const blob=await new Promise<Blob>((resolve)=>canvas.toBlob((b)=>resolve(b!),"image/jpeg",.93));return{name:`${file.name.replace(/\.[^.]+$/,'')}-${t.name}.jpg`,url:URL.createObjectURL(blob),template:t.name,templateId:t.id,surfaceKind:"rigid-flat"}}
// Printify's placement, expressed the way rigid() wants it. rigid() maps the
// whole design canvas onto the scene's calibrated printable area, so its scale
// means the same thing Printify's does - the fraction of the print area the
// uploaded image covers - and its x/y are offsets from the centre of that area.
// Before this, apparel rendered at a flat 42% and rigid-flat at a flat 100%:
// constants that had no relationship to where Printify actually put the art.

// Measured on the live site against her Gildan Tee draft: in the Printify
// preview the artwork is about 27% of the shirt width, and rendering it here at
// the template's own scale of 1 produced about 60% - more than twice too big.
//
// The assumption behind D424 was wrong. A template's calibrated corners are not
// the Printify print area; they cover a much larger region of the garment, so a
// Printify scale cannot be used here directly. The old constants were empirical
// calibrations of that unknown ratio, and .42 x the artwork's 66% canvas share
// lands at ~28% - which is why they matched the preview and my "exact" mirroring
// did not.
//
// Restored until each mockup template records how its calibrated quad relates to
// the print area, which is the missing number that would make real mirroring
// possible. The placement is still recorded on every draft, ready for that work.
//
// D573 - that missing number is now recorded on the scene itself, as quadMeans.
//
// "print-area": the quad is a confirmed Printify print area, so Printify's own
// numbers mean the same thing rigid() means. rigid() maps the design canvas onto
// the quad, so a Printify scale of .27 is .27 of the print area either way, and
// Printify's x/y - the centre of the artwork within the print area, 0 to 1 - are
// offsets from the centre of the quad. No constant, no pixel analysis, no guess.
// A left-pocket design stays small and left. An oversized print stays oversized.
//
// "garment": the quad is a larger region of the garment, related to the print
// area by a ratio nobody has measured. Printify's scale cannot be used against
// it, so the empirical constants stay. Every scene in the library before D573 is
// this, which is why her calibrated tees and mugs render exactly as they did.
/* D456 - the generative renderer is gone from both paths. It repainted the
   whole frame, which no prompt can fix, because repainting is what an image
   editor does. Nothing here calls a model to place a design any more. */
async function withRecovery<T>(task:()=>Promise<T>){let lastError:unknown;for(let attempt=0;attempt<3;attempt++){try{return await task()}catch(error){lastError=error;if(attempt<2)await new Promise(resolve=>window.setTimeout(resolve,1200*(attempt+1)))}}throw lastError instanceof Error?lastError:new Error("This mockup could not be created after automatic recovery.")}

export default function IntegratedMockups({design,productId,productName="",defaultTheme,defaultTemplateIds=[],referenceUrl,placement,artworkBounds,onPrepared,batchId="",designKey=""}:{batchId?:string;designKey?:string;design:File;productId:string;productName?:string;defaultTheme:string;defaultTemplateIds?:string[];referenceUrl?:string;placement?:ResolvedPlacement;artworkBounds?:ArtworkBounds;onPrepared?:(count:number)=>void}){
 const[library,setLibrary]=useState<Template[]>([]),[theme,setTheme]=useState(defaultTheme),[selected,setSelected]=useState<Set<string>>(new Set()),[results,setResults]=useState<Result[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[expanded,setExpanded]=useState<Result|null>(null),[etsyStatus,setEtsyStatus]=useState(""),[adjustments,setAdjustments]=useState<Record<string,Adjustment>>({}),[renderStatus,setRenderStatus]=useState("");
 /* D588 - the editor's state. `profiles` remembers what a seller corrected for a
    scene so it is not lost when they move on, and `editing` is the scene whose
    placement is open. Nothing here navigates: the batch stays mounted. */
 const [editing,setEditing]=useState<{result:Result;index:number}|null>(null);
 const [profiles,setProfiles]=useState<Record<string,PlacementTransform>>({});
 /* D596 - what the database holds for the scene currently open, and when it was
    written. The editor compares that timestamp against any session draft so an
    old tab cannot undo newer data. */
 const [persisted,setPersisted]=useState<{transform?:PlacementTransform;at?:string|null}>({});
 /* Scene-level, and the only thing that may improve a future design. */
 const [sceneGeometry,setSceneGeometry]=useState<Record<string,{surface:Quad;curvature:number;fabricStrength:number;blendMode:PlacementTransform["blendMode"]}>>({});
 const [designUrl,setDesignUrl]=useState("");
 const [openingScene,setOpeningScene]=useState("");
 /* Which scenes the database already holds a correction for, so the grid can say
    "Adjusted" on a fresh load rather than only after an edit in this session. */
 const [adjustedScenes,setAdjustedScenes]=useState<Record<string,boolean>>({});

 /* D597 - one place that turns a scene plus this design's Printify placement
    into the transform the editor should open with. Order: Printify placement,
    then compatible scene geometry, then this design's override, applied last. */
 const composeSaved=useCallback(async(template:Template):Promise<{transform:PlacementTransform;at:string|null}|null>=>{
   const surface=(template.preparation?.corners||template.corners) as Quad;
   const mode=renderingModeFor(productName,template.preparation?.geometry);
   const query=new URLSearchParams({sceneId:template.id,
     productFamily:productSurfaceFamily(productName),printSide:template.printSide||"front",
     listingId:productId,designKey,batchId});
   const answer=await fetch(`/api/mockups/placement?${query}`).then(r=>r.ok?r.json():null).catch(()=>null) as
     {geometry?:{surface?:Quad;curvature?:number;fabricStrength?:number;blendMode?:PlacementTransform["blendMode"]}|null;
      override?:Record<string,number|string|boolean|undefined>|null}|null;
   if(!answer)return null;
   const geometry=answer.geometry, override=answer.override;
   let next=defaultTransform(placeArtworkOnSurface((geometry?.surface as Quad)||surface,placement),mode);
   if(geometry)next={...next,curvature:geometry.curvature??next.curvature,
     fabricStrength:geometry.fabricStrength??next.fabricStrength,
     blendMode:geometry.blendMode??next.blendMode};
   if(!override)return {transform:next,at:null};
   const centre=(q:Quad)=>[q.reduce((a,p)=>a+p[0],0)/4,q.reduce((a,p)=>a+p[1],0)/4];
   const [cx,cy]=centre(next.corners);
   const m=Number(override.scaleMultiplier??1)||1;
   const du=Number(override.offsetU??0), dv=Number(override.offsetV??0);
   next={...next,
     corners:next.corners.map(([x,y])=>[cx+(x-cx)*m+du,cy+(y-cy)*m+dv] as [number,number]) as Quad,
     rotation:next.rotation+Number(override.rotation??0),
     skewX:Number(override.skewX??0), skewY:Number(override.skewY??0),
     flipX:Boolean(override.flipX), flipY:Boolean(override.flipY),
     opacity:Number(override.opacity??1),
     blendMode:(override.blendMode as PlacementTransform["blendMode"])??next.blendMode,
     fabricStrength:override.fabricStrength===undefined?next.fabricStrength:Number(override.fabricStrength),
     curvature:override.curvature===undefined?next.curvature:Number(override.curvature)};
   return {transform:next,at:(override.updatedAt as string)||null};
 },[productName,productId,designKey,batchId,placement]);

 /* D597 - a returning seller must see which scenes already carry a correction
    before opening anything, so the grid asks the database once per result set.
    Bounded and deduplicated: one request per scene, never during render. */
 const scanned=useRef<string>("");
 useEffect(()=>{
   if(!results.length||!productId||!designKey)return;
   const key=results.map(r=>r.templateId).join(",");
   if(scanned.current===key)return;
   scanned.current=key;
   let cancelled=false;
   void (async()=>{
     const found:Record<string,boolean>={};
     for(const result of results){
       const template=library.find(item=>item.id===result.templateId);
       if(!template)continue;
       const query=new URLSearchParams({sceneId:template.id,
         productFamily:productSurfaceFamily(productName),printSide:template.printSide||"front",
         listingId:productId,designKey,batchId});
       const answer=await fetch(`/api/mockups/placement?${query}`).then(r=>r.ok?r.json():null).catch(()=>null) as {override?:unknown}|null;
       if(answer?.override)found[template.id]=true;
     }
     if(!cancelled&&Object.keys(found).length)setAdjustedScenes(current=>({...current,...found}));
   })();
   return ()=>{cancelled=true};
 },[results,library,productId,designKey,batchId,productName]);

 const openEditor=useCallback(async(result:Result,index:number)=>{
   const template=library.find(item=>item.id===result.templateId);
   if(!template)return;
   setOpeningScene(result.templateId);
   try{
     const loaded=await composeSaved(template);
     if(loaded){setPersisted({transform:loaded.transform,at:loaded.at});
       setProfiles(current=>({...current,[template.id]:loaded.transform}));}
   }finally{setOpeningScene("")}
   setEditing({result,index});
 },[library,composeSaved]);
 /* D616 - the placement editor is released.

    D589 gated it on two things: an owner account decided server-side, and
    ?editorPreview=1 in the URL. Both are gone. Every seller gets the editor, and
    nobody needs a query flag to see it.

    What is deliberately NOT removed: the per-seller ownership checks. The
    placement endpoint still proves that the scene, batch, listing and design all
    belong together and to the signed-in account before it reads or writes
    anything (D598/D599). Releasing a feature is not the same as loosening who
    owns what, and that distinction is the whole reason this was safe to ship. */
 useEffect(()=>{if(!design)return;const url=URL.createObjectURL(design);setDesignUrl(url);return ()=>URL.revokeObjectURL(url)},[design]);
 const seededDefaults=useRef(false);
 useEffect(()=>{fetch("/api/mockups/library").then(r=>r.json()).then(p=>setLibrary(p.templates||[]));},[]);
 /* D566 - `theme` was seeded from defaultTheme at mount and never looked at it
    again, so changing the set in the panel above left every listing showing the
    set it happened to start with. Measured on her hoodie batch: the panel read
    "Gildan Hoodies" while both listings offered BACH TEES - tee photographs, for
    a hoodie. The set is chosen once, above, and this follows it. */
 useEffect(()=>{setTheme(defaultTheme);setResults([]);setEtsyStatus("")},[defaultTheme]);
 useEffect(()=>{if(seededDefaults.current||!library.length)return;seededDefaults.current=true;let session:{theme?:string;ids?:string[]}|null=null;try{session=JSON.parse(window.sessionStorage.getItem("goldie-batch-mockups")||"null")}catch{}const ids=defaultTemplateIds.length?defaultTemplateIds:Array.isArray(session?.ids)?session.ids:[],expectedTheme=defaultTheme||session?.theme||"";const valid=ids.filter(id=>library.some(item=>item.id===id&&(!expectedTheme||item.theme===expectedTheme))).slice(0,MAX_MOCKUPS_PER_LISTING);setSelected(new Set(valid))},[library,defaultTheme,defaultTemplateIds.join("|")]);
 useEffect(()=>{if(selected.size<=MAX_MOCKUPS_PER_LISTING)return;setSelected(new Set([...selected].slice(0,MAX_MOCKUPS_PER_LISTING)));setError("You can create up to eight lifestyle mockups for one listing.")},[selected]);
 /* D573 - compatibility is product family AND print side AND calibration status.
   A back-print draft offered a front-facing photograph produces a confident lie,
   so the scene is excluded rather than substituted. */
 const compatibleLibrary=library.filter(template=>productAcceptsMockup(template.surfaceKind||"rigid-flat",productName)&&sceneAcceptsSide(template,placement))
 const wrongSideCount=library.filter(template=>productAcceptsMockup(template.surfaceKind||"rigid-flat",productName)&&!sceneAcceptsSide(template,placement)).length,themes=[...new Set(compatibleLibrary.map(t=>t.theme))],items=theme==="__all"?compatibleLibrary:compatibleLibrary.filter(t=>t.theme===theme),chosen=compatibleLibrary.filter(t=>selected.has(t.id)).slice(0,MAX_MOCKUPS_PER_LISTING),needsReference=chosen.some(t=>!isCalibratedSurface(t.surfaceKind||"rigid-flat"));
 async function stageForEtsy(made:Result[]){setEtsyStatus(`Saving ${made.length} mockups for Etsy…`);const form=new FormData();form.set("productId",productId);form.set("kind","mockup");form.set("replace","true");for(const result of made){const blob=await(await fetch(result.url)).blob();form.append("file",new File([blob],result.name,{type:blob.type||"image/jpeg"}))}const response=await fetch("/api/etsy/images",{method:"POST",body:form}),payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"Goldie could not safely replace this listing’s mockups. Your previous mockups were kept.");onPrepared?.(made.length);setEtsyStatus(`✓ ${made.length} mockups will be added automatically when this listing publishes.`)}

 /* Segmentation runs once per scene and is remembered for the session: the same
    photo always yields the same product box, and this costs a call. */
 const productBoxes=useRef(new Map<string,ProductBox|null>());
 async function derivedFor(template:Template,fit:ReferenceFit){
   if(!productBoxes.current.has(template.id)){
     let box:ProductBox|null=null;
     try{
       const blob=await(await fetch(template.src)).blob();
       const asDataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)});
       box=await productBoxInScene(asDataUrl,productName);
     }catch{box=null}
     productBoxes.current.set(template.id,box);
   }
   const box=productBoxes.current.get(template.id);
   return box?derivedPlacement(fit,box,artworkBounds):null;
 }
 /* D571 - the reason her hoodie mockups came out at the hem, tiny. A scene is
    created with a placeholder box - the middle 70% of the photograph - and print
    area detection only ever ran on the Mockup Library page, one AI call per
    scene. Upload scenes and leave that page before it finishes, or use them
    straight from the factory, and they keep the placeholder for good. Nothing
    said so, so the render fell back to a fixed guess: centre it, 42% scale.
    Measured on her library: BACH TEES 10 of 10 marked, white mugs 4 of 4, Gildan
    Hoodies 2 of 4 - and the two she rendered were the unmarked pair. The
    detection itself works; I called it on one of them and it returned a proper
    chest box at high confidence.
    A scene is measured at the moment it is used, so it cannot render against a
    placeholder no matter which page she has visited. */
 /* D572 - D571 said "no scene can reach the renderer against a placeholder" and
    the code did not do that: a measurement that failed was swallowed and the
    scene rendered anyway, against the derived box or the 42% guess. That is the
    exact silent-wrong-mockup this was supposed to end. A scene that cannot be
    measured is now held back and named, and the rest of the batch still runs. */
 async function calibrateIfNeeded(list:Template[]):Promise<{ready:Template[];unmeasured:Template[]}>{
   /* D576 - preparation is a server-owned, reusable scene compilation. It uses
      the actual Printify product instead of the mockup-set name and produces the
      print surface, geometry, depth and foreground layers together. There is no
      customer calibration path and no placeholder quad may reach rendering. */
   const stale=list.filter(item=>!preparationMatchesProduct(item.preparation,productName));
   if(!stale.length)return {ready:list,unmeasured:[]};
   setRenderStatus(`Preparing ${stale.length} ${stale.length===1?"scene":"scenes"} for this product…`);
   const prepared=new Map<string,ScenePreparation>();
   /* D604 - D602 added five segmentation calls per scene, so preparing a full
      selection at two at a time got noticeably slower. Four keeps the wall time
      down without putting twenty concurrent calls into the analyser. */
   await runBounded(stale.map(scene=>scene),4,async scene=>withRecovery(async()=>{
     const response=await fetch(`/api/mockups/library/${encodeURIComponent(scene.id)}/prepare`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productName})});
     const payload=await response.json() as {preparation?:ScenePreparation;error?:string};
     /* D577 - the route always returns a ready preparation now. If the network
        itself failed, the scene is still prepared here from the product's own
        geometry rather than thrown away. Printify still owns the placement
        inside the surface, so the mockup is correct where it matters. */
     if(!response.ok||!payload.preparation)return {scene,preparation:computedPreparation(productName,null,scene.printSide)};
     return {scene,preparation:payload.preparation};
   }),({scene,preparation})=>{prepared.set(scene.id,preparation);setRenderStatus(`${prepared.size} of ${stale.length} scenes prepared. Goldie is finishing the rest automatically…`)});
   const apply=(item:Template):Template=>{const preparation=prepared.get(item.id);return preparation?{...item,corners:preparation.corners,normalized:true,printSide:preparation.printSide,quadMeans:"print-area",preparationStatus:"ready",preparation,occlusionUrl:preparation.occlusionKey?`/api/mockups/library/${encodeURIComponent(item.id)}/occlusion`:undefined,occlusionUrls:(preparation.occlusionKeys||[]).map((_,index)=>`/api/mockups/library/${encodeURIComponent(item.id)}/occlusion?layer=${index}`),occlusionConfirmed:true}:item};
   if(prepared.size)setLibrary(current=>current.map(apply));
   const applied=list.map(apply);
   /* D577 - every selected scene comes back ready. A scene that could not be
      measured carries a computed surface instead of being excluded: the seller
      chose these photographs and gets a mockup for each one. */
   const settled=applied.map(item=>preparationMatchesProduct(item.preparation,productName)
     ?item
     :{...item,preparation:computedPreparation(productName,null,item.printSide),corners:computedPreparation(productName,null,item.printSide).corners,normalized:true,quadMeans:"print-area" as const});
   return {ready:settled,unmeasured:[] as Template[]};
 }
 async function generate(){if(!chosen.length)return;setBusy(true);setError("");setEtsyStatus("");setResults([]);setRenderStatus(`Preparing ${chosen.length} selected ${chosen.length===1?"scene":"scenes"}…`);try{let reference:File|null=null;if(referenceUrl){const blob=await(await fetch(referenceUrl,{signal:AbortSignal.timeout(30_000)})).blob();reference=new File([blob],"printify-placement-reference.jpg",{type:blob.type||"image/jpeg"})}/* D433 - measure the specification once per run: how big the artwork is on the product, and where, according to the Printify preview. *//* D470 - the design is measured inside the preview's printable FACE, so both
   sides use the same frame. Without this a mug is measured against the whole
   mug on one side and its face on the other, and comes out three times too
   small. */
let previewFace:{left:number;top:number;right:number;bottom:number}|undefined;
        if(reference){try{
          const asData=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(reference)});
          const found=await fetch("/api/mockups/print-area",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageUrl:asData,product:productName||"product"})}).then(r=>r.json()) as {corners?:[number,number][]|null};
          if(found.corners){const xs=found.corners.map(c=>c[0]),ys=found.corners.map(c=>c[1]);
            previewFace={left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)}}
        }catch{/* No face on the preview just means the whole product is the frame. */}}
        const fit=reference?await measureReference(reference,previewFace):null;const {ready:calibrated,unmeasured}=await calibrateIfNeeded(chosen);
        /* D577 - every selected scene renders. Earlier versions filtered here and
           held scenes back when their surface could not be measured, which meant
           a seller could select eight photographs and receive five. The surface
           is measured when the photograph can be read and computed when it
           cannot, and Printify owns the placement inside it either way. */
        const measured=calibrated;
        /* D577 - unmeasured is always empty now: calibrateIfNeeded settles every
           selected scene rather than returning some of them unusable. */
        void unmeasured;
        const completed=new Map<number,Result>(),jobs=measured.map((template,index)=>({template,index}));setRenderStatus(`Creating ${measured.length} ${measured.length===1?"mockup":"mockups"} in a reliable queue. Goldie will retry an interrupted scene automatically.`);await runBounded(jobs,2,async({template,index})=>{/* D447 - one scene, and it always produces a mockup.
   The canvas renderer is the floor: it needs no network and, with the quad
   chain, has no way to refuse. The AI renderer is tried first where it is the
   better result, and falls back rather than losing the scene. */
        const drawLocally=async()=>{
          /* D469 - when the scene's print area is known, Printify's own placement
             applies to it directly.
             
             This is what D424 tried and got wrong: it applied that number to the
             placeholder box, which is not a print area, so designs came out more
             than twice too big. Now that each scene works out its real print area,
             the quad and Printify's print area are the same rectangle - so the
             scale Printify used IS the fraction of the quad the design covers, and
             the offsets are its offsets. Measured on her mug: Printify places at
             .531 of the print area and her artwork fills .744 of its canvas, so
             the design is 39.5% of the mug's face. */
          /* D471 - a scene that knows its own printable face needs no derivation:
             the design covers the same fraction of that face as it does of the face
             in the Printify preview. Deriving against the whole product and then
             drawing into the face is what made the mug a third of its proper size. */
          /* D573 - Printify's own placement comes first now. It arrives with the
             draft as exact numbers - scale, x, y, side - so on a scene whose quad
             is a confirmed print area there is nothing to work out. Everything
             below this line is pixel analysis of the Printify preview: reading a
             photograph back to guess which pixels are the artwork. That guess is
             beaten by white ink, thin lettering, a small pocket print, a garment
             shadow, a neck label or a busy model shot, and it should never run
             when the exact answer was handed to us. */
          if(template.quadMeans==="print-area"&&placement&&isCalibrated(template))
            {const exact=placementAdjustment(placement,template.surfaceKind||"rigid-flat","print-area");
             if(exact){const began=Date.now();
               const made=await rigid(design,template,exact);
               recordRender({scene:template.name,sceneId:template.id,printSide:template.printSide,quadMeans:"print-area",placement,applied:exact,usedForeground:Boolean(template.occlusionUrls?.length||template.occlusionUrl),source:"printify",ms:Date.now()-began});
               return made;}}
          if(fit&&isCalibrated(template)){
            const direct=placementInFace(fit,artworkBounds);
            if(direct)return rigid(design,template,direct);
          }
          const derived=fit?await derivedFor(template,fit):null;
          if(derived)return rigid(design,template,derived.adjustment,derived.quad);
          /* D573 - no constant to fall back to. A scene that reaches here cannot
             reproduce the draft's real placement, so it refuses by name. */
          /* D577 - there is no refusal here any more. Every scene reaching this
             point has a print area, measured or computed, so the last resort is
             Printify's placement on that surface - never an error handed to the
             seller. */
          {const surface=placementAdjustment(placement,template.surfaceKind||"rigid-flat","print-area");
           return rigid(design,template,surface||{scale:1,x:0,y:0});}};
        const result=await withRecovery(async()=>{
          /* D448 - every surface composites now. The generative renderer repainted
             the whole frame: her photograph came back looking like a painting, with
             a garment it had invented and the design somewhere other than where
             Printify puts it. Nothing that redraws her scene can be used to place a
             design on it, however good the prompt. */
          return drawLocally();
        });return{index,result}},({index,result})=>{completed.set(index,result);const ready=[...completed.entries()].sort((a,b)=>a[0]-b[0]).map(([,item])=>item);setResults(ready);setRenderStatus(`${ready.length} of ${chosen.length} finished. ${ready.length<chosen.length?"Goldie is creating the remaining scenes.":"Saving all finished mockups to this listing…"}`)});const made=[...completed.entries()].sort((a,b)=>a[0]-b[0]).map(([,item])=>item);if(made.length!==chosen.length){/* D446 - this said only that some scene failed, so the way out was to guess which one and deselect it. Name them. */const lost=chosen.filter((_,index)=>!completed.has(index)).map(template=>template.name);throw new Error(`Goldie could not finish ${lost.length===1?"this scene":"these scenes"}: ${lost.join(", ")}. Nothing was saved to this listing. Try again, or clear ${lost.length===1?"that scene":"those scenes"} and create the rest.`);}await stageForEtsy(made);const warning=made.find(item=>item.warning)?.warning;if(warning)setEtsyStatus(`✓ Mockups saved. ${warning}`)}catch(e){setError(e instanceof Error?e.message:"Mockups could not be created.")}finally{setBusy(false);setRenderStatus("")}}
 async function adjustResult(result:Result,next:Adjustment){const template=library.find(item=>item.id===result.templateId);if(!template)return;setAdjustments(current=>({...current,[result.templateId]:next}));setBusy(true);try{const revised=await rigid(design,template,next),nextResults=results.map(item=>item===result?revised:item);URL.revokeObjectURL(result.url);setResults(nextResults);setExpanded(revised);await stageForEtsy(nextResults)}catch(e){setError(e instanceof Error?e.message:"This mockup could not be adjusted.")}finally{setBusy(false)}}
 function toggleTemplate(id:string){setSelected(current=>{const next=new Set(current);if(next.has(id)){next.delete(id);setError("");return next}if(next.size>=MAX_MOCKUPS_PER_LISTING){setError("You can create up to eight lifestyle mockups for one listing.");return next}next.add(id);setError("");return next})}
 const lightbox=expanded&&typeof document!=="undefined"?createPortal(<div className="inline-lightbox" role="dialog" aria-modal="true" onMouseDown={event=>{if(event.target===event.currentTarget)setExpanded(null)}}><button onClick={()=>setExpanded(null)} aria-label="Close">×</button><img src={expanded.url} alt={`${expanded.template} enlarged`}/>{isCalibratedSurface(expanded.surfaceKind)?<div className="mockup-adjust"><b>Adjust this mockup only</b>{(()=>{const value=adjustments[expanded.templateId]||placementAdjustment(placement,expanded.surfaceKind);return <><label>Design size<input type="range" min=".5" max="1.6" step=".02" value={value.scale} onChange={event=>void adjustResult(expanded,{...value,scale:Number(event.target.value)})}/></label><label>Left / right<input type="range" min="-.3" max=".3" step=".01" value={value.x} onChange={event=>void adjustResult(expanded,{...value,x:Number(event.target.value)})}/></label><label>Up / down<input type="range" min="-.3" max=".3" step=".01" value={value.y} onChange={event=>void adjustResult(expanded,{...value,y:Number(event.target.value)})}/></label></>})()}</div>:<p className="mockup-placement-lock">Placement is locked to the real Printify preview so the apparel mockup matches what the customer receives.</p>}</div>,document.body):null;
 return <><div className="integrated-mockups"><div className="mockup-limit-note"><b>Choose up to 8 lifestyle mockups</b><span>Goldie processes them in a reliable queue.</span></div>{/* D566 - her words: "it says mockups, and then you pick your mockup set. And
      then there is two additional mockup sets to pick under that ... none of this
      makes sense to me." Three set pickers were on screen at once inside one
      panel: the batch chooser at the top, and one of these per listing. They
      disagreed - the panel read "Gildan Hoodies" while both listings read "BACH
      TEES" - so the set she picked was not the set her scenes came from. D238 named
      this exact fault when the set lived on two pages: "same setting, two pages -
      the exact split that caused the keyword-bank and shipping duplication."
      The set is chosen once, above. Here she chooses scenes from it. */}
      <div className="mockup-control-row"><span className="mockup-set-name">{theme==="__all"?"All mockups":theme||"No mockup set chosen"}</span><a href="/mockups" target="_blank" rel="noopener noreferrer">Manage saved mockup sets ↗</a></div>{theme&&<div className="inline-mockup-grid">{items.map(t=><label className={selected.has(t.id)?"selected":""} key={t.id}><input type="checkbox" checked={selected.has(t.id)} onChange={()=>toggleTemplate(t.id)}/><img src={t.src} alt={t.name} loading="lazy" decoding="async"/>{/* D566 - every tile repeated the set name she had just chosen, followed by
        the raw upload filename. The set is named once above; the tile says which
        scene it is. */}
      <span>{t.name.replace(/\.[a-z0-9]+$/i,"").replace(/[_-]+/g," ")}</span>
      {/* D571 - a scene nobody has marked looks exactly like one that has been.
          It says so now, and says what will happen. */}
      {!preparationMatchesProduct(t.preparation,productName)?<em className="scene-unmeasured">Goldie prepares this scene automatically before creating it</em>:null}</label>)}</div>}{needsReference&&<p className="automatic-reference">✓ Goldie will use the real Printify preview above as the placement reference.</p>}<div className="mockup-action-sequence"><div className="mockup-primary-action"><span>1</span><div><b>Create mockups for this listing</b><small>Goldie creates the mockups you selected above and saves them to this listing.</small></div><button className="generate-inline" aria-busy={busy} disabled={!chosen.length||busy||needsReference&&!referenceUrl} onClick={()=>void generate()}>{busy?"Goldie is creating them…":`Create ${chosen.length ? `these ${chosen.length} ${chosen.length===1?"mockup":"mockups"}` : "selected mockups"}`}</button></div>{busy&&renderStatus&&<div className="mockup-live-progress" role="status" aria-live="polite"><i/><span>{renderStatus}</span></div>}</div>{error&&<p className="field-error" role="alert">{error}</p>}{etsyStatus&&<p className="etsy-ready-status" role="status">{etsyStatus}</p>}{results.length>0&&<div className="inline-generated">{results.map((r,resultIndex)=><figure key={r.name}><button className="mockup-enlarge" onClick={()=>setExpanded(r)}><img src={r.url} alt={r.template}/><span>View larger</span></button><figcaption><span>{r.template}</span><span className={(r.adjusted||adjustedScenes[r.templateId])?"sceneState adjusted":"sceneState"}>{(r.adjusted||adjustedScenes[r.templateId])?"Adjusted":"Ready"}</span></figcaption>
      <div className="sceneActions">
        {<button type="button" className="adjustPlacement" disabled={openingScene===r.templateId} onClick={()=>void openEditor(r,resultIndex)}>{openingScene===r.templateId?"Opening…":"Adjust placement"}</button>}
        <a href={r.url} download={r.name}>Use this mockup</a>
        <button type="button" className="removeScene" onClick={()=>{setResults(list=>list.filter(item=>item.name!==r.name));setSelected(current=>{const next=new Set(current);next.delete(r.templateId);return next})}}>Remove from batch</button>
      </div></figure>)}</div>}<p className="etsy-note">Goldie saves these mockups for this exact listing and adds them automatically through Etsy when you publish. Individual downloads stay available as a backup.</p></div>{lightbox}
    {/* D588 - Adjust placement opens here, over the batch. The seller does not
        leave Listing Factory and the page is never reloaded. */}
    {editing&&designUrl&&(()=>{
      const template=library.find(item=>item.id===editing.result.templateId);
      if(!template)return null;
      const surface=(template.preparation?.corners||template.corners) as Quad;
      const mode=renderingModeFor(productName,template.preparation?.geometry);
      /* Goldie's automatic answer: the scene's surface, with THIS design placed
         inside it exactly where Printify put it. That is also what Reset
         placement returns to. */
      const automatic=defaultTransform(placeArtworkOnSurface(surface,placement),mode);
      const saved=profiles[template.id];

      /* D596 - the load order, in the order the placement contract requires:

         1. the design's real Printify placement (already in `placement`)
         2. compatible reusable scene geometry, if the seller has improved this
            scene before
         3. this design's Printify placement mapped into that geometry
         4. the artwork override for THIS seller + listing + design + scene
         5. that relative override applied last

         Steps 2 and 4 are separate reads on purpose: geometry may be reused
         across designs, an override never may. */
      /* D597 - the persisted record is fetched when the seller opens the editor,
         not while rendering it. Two things were wrong before, both found by a
         restore that silently fell back to the automatic placement:

         it ran in the render body, so every setState it caused re-ran it - seven
         identical GETs for one open - and the editor takes `transform` into its
         own useState on mount, so a record arriving after mount never reached
         it. Loading first and opening second fixes both. */
      const finish=async(next:PlacementTransform,exported:Blob,improveScene:boolean,advance:boolean)=>{
        const url=URL.createObjectURL(exported);
        /* D596 - the durable write, and it must succeed before anything says
           "Adjusted". A throw here propagates to the editor, which keeps itself
           open, keeps the local draft and tells the seller to try again.

           The override is stored RELATIVE to where Printify put this design, so
           it means nothing for any other design. Scene geometry is written only
           when the seller explicitly ticked "Improve this scene for future
           designs" - automatic work never promotes itself to a scene fact. */
        const base=defaultTransform(placeArtworkOnSurface(surface,placement),mode);
        const centre=(q:Quad)=>[q.reduce((a,p)=>a+p[0],0)/4,q.reduce((a,p)=>a+p[1],0)/4];
        const [bx,by]=centre(base.corners), [nx,ny]=centre(next.corners);
        const spanOf=(q:Quad)=>Math.max(...q.map(p=>p[0]))-Math.min(...q.map(p=>p[0]));
        const baseSpan=spanOf(base.corners)||1;
        const body:Record<string,unknown>={override:{
          sceneId:template.id, listingId:productId, designKey, batchId,
          offsetU:nx-bx, offsetV:ny-by,
          scaleMultiplier:(spanOf(next.corners)||baseSpan)/baseSpan,
          rotation:next.rotation-base.rotation, skewX:next.skewX, skewY:next.skewY,
          flipX:next.flipX, flipY:next.flipY, opacity:next.opacity,
          ...(next.blendMode!==base.blendMode?{blendMode:next.blendMode}:{}),
          ...(next.fabricStrength!==base.fabricStrength?{fabricStrength:next.fabricStrength}:{}),
          ...(next.curvature!==base.curvature?{curvature:next.curvature}:{})}};
        if(improveScene)body.geometry={sceneId:template.id,
          productFamily:productSurfaceFamily(productName), printSide:template.printSide||"front",
          renderingMode:mode, surface, curvature:next.curvature,
          fabricStrength:next.fabricStrength, blendMode:next.blendMode,
          preparationVersion:template.preparation?.version,
          origin:"seller-adjusted"};
        const written=await fetch("/api/mockups/placement",{method:"PUT",
          headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if(!written.ok)throw new Error("Goldie could not save this placement.");

        setProfiles(current=>({...current,[template.id]:next}));
        setPersisted({transform:next,at:new Date().toISOString()});
        setAdjustedScenes(current=>({...current,[template.id]:true}));
        if(improveScene)setSceneGeometry(current=>({...current,[template.id]:{
          surface,curvature:next.curvature,fabricStrength:next.fabricStrength,blendMode:next.blendMode}}));
        setResults(list=>list.map((item,index)=>index===editing.index?{...item,url,adjusted:true}:item));
        if(advance&&editing.index+1<results.length)setEditing({result:results[editing.index+1],index:editing.index+1});
        else setEditing(null);
      };
      return <Suspense fallback={null}><SceneEditor
        sceneName={template.name}
        photoUrl={template.src}
        artworkUrl={designUrl}
        surface={surface}
        mode={mode}
        transform={saved||persisted.transform||automatic}
        persistedAt={persisted.at}
        automatic={automatic}
        foregroundUrl={template.occlusionUrl||null}
        foregroundUrls={template.occlusionUrls||[]}
        hasNext={editing.index+1<results.length}
        onSave={(next,blob,improve)=>finish(next,blob,improve,false)}
        onSaveNext={(next,blob,improve)=>finish(next,blob,improve,true)}
        onCancel={()=>setEditing(null)}
      /></Suspense>;
    })()}
    </>
}
