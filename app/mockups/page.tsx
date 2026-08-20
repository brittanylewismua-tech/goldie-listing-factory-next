"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import "./mockups.css";
import "./management.css";
import GoldieWordmark from "../goldie-wordmark";

type Point = [number, number];
type SurfaceKind = "rigid-flat" | "t-shirt" | "sweatshirt" | "hoodie" | "other-apparel" | "apparel" | "soft-goods" | "curved" | "irregular";
type Template = { id: string; name: string; theme: string; sourceTheme?: string; src: string; corners: [Point, Point, Point, Point]; normalized?: boolean; custom?: boolean; foregroundPrompt?: string; surfaceKind?: SurfaceKind };
type Rendered = { name: string; url: string; template: string };

const templates: Template[] = [];

const SURFACE_LABELS: Record<SurfaceKind,string> = {
  "rigid-flat":"Poster, canvas, framed art, card or sticker",
  "t-shirt":"T-shirt",
  sweatshirt:"Sweatshirt",
  hoodie:"Hoodie",
  "other-apparel":"Other worn apparel",
  apparel:"Legacy apparel set",
  "soft-goods":"Tote, pillow, blanket or other soft product",
  curved:"Mug, tumbler or other curved product",
  irregular:"Irregular or die-cut product",
};

function isCalibratedSurface(kind:SurfaceKind){return["rigid-flat","t-shirt","sweatshirt","hoodie","other-apparel","apparel"].includes(kind)}

function cleanArtworkBackground(image:HTMLImageElement){const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext("2d",{willReadFrequently:true})!;ctx.drawImage(image,0,0);const frame=ctx.getImageData(0,0,canvas.width,canvas.height),pixels=frame.data,total=canvas.width*canvas.height,seen=new Uint8Array(total),queue=new Uint32Array(total);let head=0,tail=0;const removable=(index:number)=>{const offset=index*4,r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];return pixels[offset+3]===0||(Math.max(r,g,b)-Math.min(r,g,b)<38&&(r+g+b)/3>138)};const add=(index:number)=>{if(seen[index]||!removable(index))return;seen[index]=1;queue[tail++]=index};for(let x=0;x<canvas.width;x++){add(x);add((canvas.height-1)*canvas.width+x)}for(let y=0;y<canvas.height;y++){add(y*canvas.width);add(y*canvas.width+canvas.width-1)}while(head<tail){const index=queue[head++],x=index%canvas.width;pixels[index*4+3]=0;if(x)add(index-1);if(x<canvas.width-1)add(index+1);if(index>=canvas.width)add(index-canvas.width);if(index<total-canvas.width)add(index+canvas.width)}ctx.putImageData(frame,0,0);return canvas}

function polygonArea(points: Point[]) { return Math.abs(points.reduce((sum,[x,y],i)=>{const [nx,ny]=points[(i+1)%points.length];return sum+x*ny-nx*y},0)/2); }
function cross(a:Point,b:Point,c:Point){return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);}
function validateSurface(corners: Template["corners"], width:number, height:number) {
  if (corners.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>width||y>height)) throw new Error("Goldie could not establish a safe printable boundary for this mockup.");
  const signs=corners.map((p,i)=>Math.sign(cross(p,corners[(i+1)%4],corners[(i+2)%4]))).filter(Boolean);
  if (!signs.length||!signs.every(s=>s===signs[0])||polygonArea(corners)<width*height*.01) throw new Error("Goldie could not establish a dependable printable surface in this mockup.");
}

function safeInset(corners:Template["corners"],width:number,height:number):Template["corners"]{
  const cx=corners.reduce((s,p)=>s+p[0],0)/4,cy=corners.reduce((s,p)=>s+p[1],0)/4;
  const inset=Math.max(2,Math.min(width,height)*.002);
  return corners.map(([x,y])=>{const dx=cx-x,dy=cy-y,d=Math.hypot(dx,dy)||1;return [x+dx/d*inset,y+dy/d*inset] as Point}) as Template["corners"];
}

function refineRigidSurface(image: HTMLImageElement, seed: Template["corners"]): Template["corners"] {
  const scan = document.createElement("canvas"); scan.width=image.naturalWidth; scan.height=image.naturalHeight;
  const scanCtx=scan.getContext("2d",{willReadFrequently:true})!; scanCtx.drawImage(image,0,0);
  const pixels=scanCtx.getImageData(0,0,scan.width,scan.height).data;
  const gray=(x:number,y:number)=>{const ix=Math.max(0,Math.min(scan.width-1,Math.round(x))),iy=Math.max(0,Math.min(scan.height-1,Math.round(y))),i=(iy*scan.width+ix)*4;return pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114};
  const center:Point=[seed.reduce((n,p)=>n+p[0],0)/4,seed.reduce((n,p)=>n+p[1],0)/4];
  const search=Math.max(10,Math.min(28,Math.round(Math.min(scan.width,scan.height)*.022)));
  const fit=(start:Point,end:Point):[Point,Point]=>{
    const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy)||1;
    let nx=-dy/length,ny=dx/length;
    const mid:Point=[(start[0]+end[0])/2,(start[1]+end[1])/2];
    if((center[0]-mid[0])*nx+(center[1]-mid[1])*ny<0){nx=-nx;ny=-ny;}
    let best:[Point,Point]=[start,end],bestScore=-Infinity;
    for(let a=-search;a<=search;a+=2) for(let b=-search;b<=search;b+=2){
      let edge=0,insideNoise=0,samples=0;
      for(let i=1;i<40;i++){
        const t=i/40,offset=a+(b-a)*t,x=start[0]+dx*t+nx*offset,y=start[1]+dy*t+ny*offset;
        edge+=Math.abs(gray(x+nx*2.5,y+ny*2.5)-gray(x-nx*2.5,y-ny*2.5));
        insideNoise+=Math.abs(gray(x+nx*7,y+ny*7)-gray(x+nx*13,y+ny*13)); samples++;
      }
      const score=edge/samples-insideNoise/samples*.16-(Math.abs(a)+Math.abs(b))*.025;
      if(score>bestScore){bestScore=score;best=[[start[0]+nx*a,start[1]+ny*a],[end[0]+nx*b,end[1]+ny*b]];}
    }
    return best;
  };
  const lines=seed.map((point,index)=>fit(point,seed[(index+1)%4]));
  const intersection=(a:[Point,Point],b:[Point,Point]):Point=>{
    const [[x1,y1],[x2,y2]]=a,[[x3,y3],[x4,y4]]=b,den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
    if(Math.abs(den)<.001)return a[1];
    return [((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/den,((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/den];
  };
  const refined=[intersection(lines[3],lines[0]),intersection(lines[0],lines[1]),intersection(lines[1],lines[2]),intersection(lines[2],lines[3])] as Template["corners"];
  const plausible=refined.every((point,index)=>Math.hypot(point[0]-seed[index][0],point[1]-seed[index][1])<=search*2.25);
  if(!plausible)return seed;
  try{validateSurface(refined,scan.width,scan.height);return refined;}catch{return seed;}
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function libraryImage(file:File){const source=await loadImage(URL.createObjectURL(file));const limit=1800,scale=Math.min(1,limit/Math.max(source.naturalWidth,source.naturalHeight)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));canvas.getContext("2d",{alpha:false})!.drawImage(source,0,0,canvas.width,canvas.height);return new Promise<File>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(new File([blob],`${file.name.replace(/\.[^.]+$/,"")}.jpg`,{type:"image/jpeg"})):reject(new Error("This mockup could not be prepared for saving.")),"image/jpeg",.9));}

const foregroundCache = new Map<string, string[]>();

async function imageForAnalysis(template: Template) {
  if (!template.src.startsWith("blob:")) return new URL(template.src, window.location.origin).toString();
  const blob = await (await fetch(template.src)).blob();
  return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

async function foregroundLayers(template: Template) {
  // Most correctly calibrated flat scenes have no object crossing the printable
  // area. In those scenes the sealed surface clip is the complete and accurate
  // solution; asking a segmenter to invent a foreground is both wrong and
  // wasteful. Only templates with a known crossing object request a mask.
  if (!template.foregroundPrompt) return [];
  const cached = foregroundCache.get(template.id); if (cached) return cached;
  const response = await fetch("/api/mockups/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ imageUrl:await imageForAnalysis(template), prompt:template.foregroundPrompt }) });
  const result = await response.json() as { masks?: Array<{url:string}>; error?:string };
  if (!response.ok) throw new Error(result.error || `Goldie could not safely layer “${template.name}.”`);
  const urls = (result.masks||[]).map(mask=>mask.url); foregroundCache.set(template.id, urls); return urls;
}

function affine(ctx: CanvasRenderingContext2D, s: Point[], d: Point[]) {
  const [s0,s1,s2] = s; const [d0,d1,d2] = d;
  const den = s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);
  const a = (d0[0]*(s1[1]-s2[1])+d1[0]*(s2[1]-s0[1])+d2[0]*(s0[1]-s1[1]))/den;
  const c = (d0[0]*(s2[0]-s1[0])+d1[0]*(s0[0]-s2[0])+d2[0]*(s1[0]-s0[0]))/den;
  const e = (d0[0]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[0]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[0]*(s0[0]*s1[1]-s1[0]*s0[1]))/den;
  const b = (d0[1]*(s1[1]-s2[1])+d1[1]*(s2[1]-s0[1])+d2[1]*(s0[1]-s1[1]))/den;
  const dd = (d0[1]*(s2[0]-s1[0])+d1[1]*(s0[0]-s2[0])+d2[1]*(s1[0]-s0[0]))/den;
  const f = (d0[1]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[1]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[1]*(s0[0]*s1[1]-s1[0]*s0[1]))/den;
  ctx.setTransform(a,b,c,dd,e,f);
}

function bilinear(c: Template["corners"], u: number, v: number): Point {
  const [tl,tr,br,bl] = c;
  return [
    (1-u)*(1-v)*tl[0]+u*(1-v)*tr[0]+u*v*br[0]+(1-u)*v*bl[0],
    (1-u)*(1-v)*tl[1]+u*(1-v)*tr[1]+u*v*br[1]+(1-u)*v*bl[1],
  ];
}

function triangle(ctx: CanvasRenderingContext2D, image: CanvasImageSource, source: Point[], dest: Point[]) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(...dest[0]); ctx.lineTo(...dest[1]); ctx.lineTo(...dest[2]); ctx.closePath(); ctx.clip();
  affine(ctx, source, dest); ctx.drawImage(image, 0, 0); ctx.restore();
}

async function makeMockup(file: File, template: Template): Promise<Rendered> {
  const [master, art, foregrounds] = await Promise.all([loadImage(template.src), loadImage(URL.createObjectURL(file)), foregroundLayers(template)]);
  const canvas = document.createElement("canvas"); canvas.width = master.naturalWidth; canvas.height = master.naturalHeight;
  const rawCorners = template.normalized ? template.corners.map(([x,y])=>[x*master.naturalWidth,y*master.naturalHeight] as Point) as Template["corners"] : template.corners;
  const kind=template.surfaceKind||"rigid-flat";
  if(!isCalibratedSurface(kind)) throw new Error(`${SURFACE_LABELS[kind]} mockups require product-aware rendering.`);
  const renderArt=document.createElement("canvas");renderArt.width=art.naturalWidth;renderArt.height=art.naturalHeight;
  const artScale=kind==="rigid-flat"?1:.42,artWidth=art.naturalWidth*artScale,artHeight=art.naturalHeight*artScale;
  renderArt.getContext("2d")!.drawImage(cleanArtworkBackground(art),(art.naturalWidth-artWidth)/2,(art.naturalHeight-artHeight)/2,artWidth,artHeight);
  const detectedCorners=kind==="rigid-flat"?refineRigidSurface(master,rawCorners):rawCorners;
  validateSurface(detectedCorners,master.naturalWidth,master.naturalHeight);
  const corners=safeInset(detectedCorners,master.naturalWidth,master.naturalHeight);
  const ctx = canvas.getContext("2d", { alpha: false })!; ctx.drawImage(master,0,0);
  // The entire artwork pass is clipped to the calibrated *inside* product
  // surface. Individual mesh triangles are still clipped below for the
  // perspective warp, but this outer clip is the non-negotiable boundary that
  // prevents antialiasing or transform spill from ever painting over a frame.
  ctx.save();
  ctx.beginPath(); corners.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p)); ctx.closePath(); ctx.clip();
  const cols = 12, rows = 16;
  for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
    const u0=x/cols,u1=(x+1)/cols,v0=y/rows,v1=(y+1)/rows;
    const s00:[number,number]=[u0*renderArt.width,v0*renderArt.height],s10:[number,number]=[u1*renderArt.width,v0*renderArt.height],s11:[number,number]=[u1*renderArt.width,v1*renderArt.height],s01:[number,number]=[u0*renderArt.width,v1*renderArt.height];
    const d00=bilinear(corners,u0,v0),d10=bilinear(corners,u1,v0),d11=bilinear(corners,u1,v1),d01=bilinear(corners,u0,v1);
    triangle(ctx,renderArt,[s00,s10,s11],[d00,d10,d11]); triangle(ctx,renderArt,[s00,s11,s01],[d00,d11,d01]);
  }
  ctx.globalCompositeOperation="multiply"; ctx.globalAlpha=.16; ctx.drawImage(master,0,0);
  ctx.restore();
  for (const foreground of foregrounds) ctx.drawImage(await loadImage(foreground),0,0,canvas.width,canvas.height);
  const blob = await new Promise<Blob>((resolve)=>canvas.toBlob(b=>resolve(b!),"image/jpeg",.93));
  const safe=file.name.replace(/\.[^.]+$/," ").trim().replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"");
  return { name:`${safe}-${template.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.jpg`, url:URL.createObjectURL(blob), template:template.name };
}

function asDataUrl(source:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(source);});}
async function makeProductMockup(file:File,template:Template,reference:File|null):Promise<Rendered>{
  if(isCalibratedSurface(template.surfaceKind||"rigid-flat"))return makeMockup(file,template);
  const sceneBlob=await (await fetch(template.src)).blob();
  const response=await fetch("/api/mockups/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:template.surfaceKind,scene:await asDataUrl(sceneBlob),design:await asDataUrl(file),reference:reference?await asDataUrl(reference):undefined})});
  const started=await response.json() as {jobId?:string;error?:string};if(!response.ok||!started.jobId)throw new Error(started.error||`Goldie could not start ${template.name}.`);let payload:{status?:string;image?:string;error?:string}={status:"queued"};while(payload.status!=="completed"){await new Promise(resolve=>window.setTimeout(resolve,2000));const poll=await fetch(`/api/mockups/render?jobId=${encodeURIComponent(started.jobId)}`);payload=await poll.json() as typeof payload;if(payload.status==="failed"||(!poll.ok&&poll.status!==202))throw new Error(payload.error||`Goldie could not render ${template.name}.`)}if(!payload.image)throw new Error(`Goldie finished ${template.name}, but the image is still being saved.`);
  const blob=await(await fetch(payload.image)).blob(),safe=file.name.replace(/\.[^.]+$/," ").trim().replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"");
  return{name:`${safe}-${template.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.png`,url:URL.createObjectURL(blob),template:template.name};
}

export default function Home() {
  const MAX_SELECTED_MOCKUPS=10; const MAX_MOCKUPS_PER_SET=50;
  const [design,setDesign]=useState<File|null>(null); const [placementReference,setPlacementReference]=useState<File|null>(null); const [results,setResults]=useState<Rendered[]>([]); const [busy,setBusy]=useState(false); const [progress,setProgress]=useState(0); const [drag,setDrag]=useState(false); const [generationError,setGenerationError]=useState("");
  const [expandedIndex,setExpandedIndex]=useState<number|null>(null); const [libraryPreview,setLibraryPreview]=useState<Template|null>(null); const [renamingTheme,setRenamingTheme]=useState(""); const [renameValue,setRenameValue]=useState(""); const [deletingTheme,setDeletingTheme]=useState("");
  const [library,setLibrary]=useState<Template[]>(templates); const [selected,setSelected]=useState<Set<string>>(new Set()); const [themeName,setThemeName]=useState("My mockup set"); const [surfaceKind,setSurfaceKind]=useState<SurfaceKind>("rigid-flat"); const [calibrating,setCalibrating]=useState<Template|null>(null); const [points,setPoints]=useState<Point[]>([]);
  const [activeTheme,setActiveTheme]=useState(""); const [showAddSet,setShowAddSet]=useState(false); const [selectionNotice,setSelectionNotice]=useState("");
  const [libraryBusy,setLibraryBusy]=useState(false); const [libraryProgress,setLibraryProgress]=useState(0); const [libraryTotal,setLibraryTotal]=useState(0);
  const fileInput=useRef<HTMLInputElement>(null); const referenceInput=useRef<HTMLInputElement>(null);
  const mockupInput=useRef<HTMLInputElement>(null); const addSetRef=useRef<HTMLDivElement>(null); const chosen=library.filter(t=>selected.has(t.id)); const total=design?chosen.length:0;
  useEffect(()=>{let alive=true;fetch("/api/mockups/library").then(async response=>response.ok?response.json():{templates:[],preferences:[]}).then((payload:{templates?:Template[];preferences?:{sourceTheme:string;displayName:string;hidden:boolean}[]})=>{if(!alive)return;const preferences=new Map((payload.preferences||[]).map(item=>[item.sourceTheme,item]));const builtIns=templates.filter(item=>!preferences.get(item.sourceTheme||item.theme)?.hidden).map(item=>({...item,theme:preferences.get(item.sourceTheme||item.theme)?.displayName||item.theme}));setLibrary([...builtIns,...(payload.templates||[])]);}).catch(()=>undefined);return()=>{alive=false};},[]);
  const validImage=(file:File|undefined)=>file&&/^image\/(png|jpeg|webp)$/.test(file.type)?file:null;
  const changed=(e:ChangeEvent<HTMLInputElement>)=>{setDesign(validImage(e.target.files?.[0]));setResults([]);e.target.value="";};
  const referenceChanged=(e:ChangeEvent<HTMLInputElement>)=>{setPlacementReference(validImage(e.target.files?.[0]));e.target.value="";};
  const dropped=(e:DragEvent)=>{e.preventDefault();setDrag(false);setDesign(validImage(Array.from(e.dataTransfer.files)[0]));setResults([]);};
  const generate=async()=>{if(!design)return;const kinds=new Set(chosen.map(template=>template.surfaceKind||"rigid-flat"));if(kinds.size>1){setGenerationError("Choose mockups for one product surface at a time so every scene uses the correct rendering method.");return;}if([...kinds].some(kind=>!isCalibratedSurface(kind))&&!placementReference){setGenerationError("Add one placement reference for this product so Goldie can match the print size and position across the set.");return;}setBusy(true);setGenerationError("");setResults([]);setProgress(0);const made:Rendered[]=[];try{for(const template of chosen){const kind=template.surfaceKind||"rigid-flat";made.push(isCalibratedSurface(kind)?await makeMockup(design,template):await makeProductMockup(design,template,placementReference));setProgress(made.length);await new Promise(r=>setTimeout(r,0));}setResults(made);}catch(error){made.forEach(item=>URL.revokeObjectURL(item.url));setResults([]);setGenerationError(error instanceof Error?error.message:"Goldie could not create the complete mockup set.");}finally{setBusy(false);}};
  const grouped=useMemo(()=>design?[{file:design,items:results}]:[],[design,results]);
  const clear=()=>{results.forEach(r=>URL.revokeObjectURL(r.url));setDesign(null);setPlacementReference(null);setResults([]);setProgress(0);setExpandedIndex(null);};
  const moveExpanded=(direction:number)=>setExpandedIndex(index=>index===null?null:(index+direction+results.length)%results.length);
  useEffect(()=>{
    if(expandedIndex===null)return;
    const previousOverflow=document.body.style.overflow; document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setExpandedIndex(null);if(event.key==="ArrowLeft")moveExpanded(-1);if(event.key==="ArrowRight")moveExpanded(1);};
    window.addEventListener("keydown",onKey);
    return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener("keydown",onKey);};
  },[expandedIndex,results.length]);
  const downloadAll=async()=>{const entries:Record<string,Uint8Array>={};for(const result of results){entries[result.name]=new Uint8Array(await (await fetch(result.url)).arrayBuffer());}const zip=zipSync(entries,{level:0});const url=URL.createObjectURL(new Blob([zip],{type:"application/zip"}));const a=document.createElement("a");a.href=url;a.download=`goldie-mockups-${new Date().toISOString().slice(0,10)}.zip`;a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const addMockups=async(e:ChangeEvent<HTMLInputElement>)=>{const incoming=Array.from(e.target.files||[]).filter(f=>/^image\/(png|jpeg|webp)$/.test(f.type));const theme=themeName.trim()||"My mockup set";e.target.value="";const added:Template[]=[];for(const original of incoming){const file=await libraryImage(original),form=new FormData();form.set("image",file);form.set("theme",theme);form.set("name",original.name.replace(/\.[^.]+$/,"").trim()||"Mockup");form.set("surfaceKind",surfaceKind);const response=await fetch("/api/mockups/library",{method:"POST",body:form});const payload=await response.json() as {template?:Template;error?:string};if(!response.ok||!payload.template){setGenerationError(payload.error||"This mockup could not be saved.");continue;}added.push(payload.template);setLibraryProgress(added.length);}if(!added.length)return;setLibrary(x=>[...x,...added]);setSelected(new Set());setActiveTheme(theme);if(isCalibratedSurface(surfaceKind)){setPoints([]);setCalibrating(added[0]);}};
  const toggleUnrestricted=(id:string)=>setSelected(s=>{const n=new Set(s),template=library.find(item=>item.id===id);if(!template)return n;if(n.has(id)){n.delete(id);return n;}const kind=template.surfaceKind||"rigid-flat";for(const selectedId of n){const selectedTemplate=library.find(item=>item.id===selectedId);if((selectedTemplate?.surfaceKind||"rigid-flat")!==kind)n.delete(selectedId);}n.add(id);return n});
  const toggle=(id:string)=>{if(!selected.has(id)&&selected.size>=MAX_SELECTED_MOCKUPS){setSelectionNotice("You can create up to 10 mockups at a time. Finish this group, then choose another group.");return;}setSelectionNotice("");toggleUnrestricted(id)};
  const addMockupsCapped=(e:ChangeEvent<HTMLInputElement>)=>{const theme=themeName.trim()||"My mockup set",existing=library.filter(item=>item.custom&&item.theme===theme).length,files=Array.from(e.target.files||[]);if(existing>=MAX_MOCKUPS_PER_SET){e.target.value="";setGenerationError("This mockup set already contains 50 mockups. Create another themed set to add more.");return;}if(files.length>MAX_MOCKUPS_PER_SET-existing){e.target.value="";setGenerationError(`Choose no more than ${MAX_MOCKUPS_PER_SET-existing} additional mockups for this set.`);return;}void addMockups(e)};
  const renameSet=async()=>{const next=renameValue.trim();if(!next||!renamingTheme)return;const sourceTheme=library.find(item=>item.theme===renamingTheme)?.sourceTheme;const response=await fetch("/api/mockups/library",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldTheme:renamingTheme,newTheme:next,sourceTheme})});const payload=await response.json() as {error?:string};if(!response.ok){setGenerationError(payload.error||"This mockup set could not be renamed.");return;}setLibrary(items=>items.map(item=>item.theme===renamingTheme?{...item,theme:next}:item));setActiveTheme(next);setRenamingTheme("");setRenameValue("")};
  const deleteSet=async()=>{if(!deletingTheme)return;const sourceTheme=library.find(item=>item.theme===deletingTheme)?.sourceTheme;const response=await fetch("/api/mockups/library",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({theme:deletingTheme,sourceTheme})});const payload=await response.json() as {error?:string};if(!response.ok){setGenerationError(payload.error||"This mockup set could not be deleted.");return;}const deletedIds=new Set(library.filter(item=>item.theme===deletingTheme).map(item=>item.id));setLibrary(items=>items.filter(item=>!deletedIds.has(item.id)));setSelected(current=>new Set([...current].filter(id=>!deletedIds.has(id))));if(activeTheme===deletingTheme)setActiveTheme("");setDeletingTheme("")};
  const calibrateClick=(e:React.MouseEvent<HTMLImageElement>)=>{if(!calibrating)return;const r=e.currentTarget.getBoundingClientRect();const next=[...points,[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height] as Point];setPoints(next);if(next.length===4){const corners=next as Template["corners"];setLibrary(x=>x.map(t=>t.id===calibrating.id?{...t,corners}:t));void fetch(`/api/mockups/library/${encodeURIComponent(calibrating.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({corners})});const remaining=library.filter(t=>t.custom&&t.theme===calibrating.theme&&t.id!==calibrating.id&&isCalibratedSurface(t.surfaceKind||"rigid-flat")&&t.corners[0][0]===.15);setTimeout(()=>{setPoints([]);setCalibrating(remaining[0]||null)},250);}};

  const addMockupsManaged=async(e:ChangeEvent<HTMLInputElement>)=>{const count=e.target.files?.length||0;if(!count)return;setLibraryBusy(true);setLibraryProgress(0);setLibraryTotal(count);try{const theme=themeName.trim()||"My mockup set",existing=library.filter(item=>item.custom&&item.theme===theme).length;if(existing>=MAX_MOCKUPS_PER_SET){e.target.value="";setGenerationError("This mockup set already contains 50 mockups. Create another themed set to add more.");return}if(count>MAX_MOCKUPS_PER_SET-existing){e.target.value="";setGenerationError(`Choose no more than ${MAX_MOCKUPS_PER_SET-existing} additional mockups for this set.`);return}await addMockups(e);setShowAddSet(false)}finally{setLibraryBusy(false);setLibraryProgress(0);setLibraryTotal(0)}};

  return <main className="management-page mockupFactory managementOnly">
    <nav className="management-nav" aria-label="Goldie tools"><GoldieWordmark/><a href="/listing-factory">Listing Factory</a><a href="/batches">Batch History</a><a href="/keywords">Keyword Banks</a><a className="active" href="/mockups">Mockup Sets</a><a href="/usage">Usage + Plan</a></nav>
    <header className="mockupHero"><p className="mockupEyebrow">YOUR SAVED MOCKUP LIBRARY</p><h1>Manage your mockup sets.</h1><p className="lede">Add and organize blank mockups here. You can choose from these sets when you create listing images in the Listing Factory.</p></header>
    <section className="mockupWorkspace"><div className="mockupStep managementLibrary"><div className="managementLibraryHead"><div><p className="mockupEyebrow">SAVED SETS</p><h2>{library.length?"Your mockup sets":"Create your first mockup set"}</h2><p>Each set can hold up to 50 blank mockups.</p></div><button className="newSetButton" onClick={()=>setShowAddSet(true)}>＋ Add mockup set</button></div>
      {generationError&&<p className="smartError" role="alert"><b>Goldie couldn’t complete that change.</b><span>{generationError}</span></p>}
      {libraryBusy&&<div className="librarySaving" role="status"><span className="librarySpinner"/><div><b>Saving {libraryProgress} of {libraryTotal} mockups…</b><small>Please keep this page open until every file is saved.</small></div></div>}
      <div className="setList managementSetList">{[...new Set(library.map(item=>item.theme))].map(theme=>{const items=library.filter(item=>item.theme===theme),open=activeTheme===theme;return <article className={`collection ${open?"open":"collapsed"}`} key={theme}><button className="collectionToggle" aria-expanded={open} onClick={()=>setActiveTheme(open?"":theme)}><div><span className="selected">MOCKUP SET</span><span className="setTitleRow"><h3>{theme}</h3></span><p>{items.length} {items.length===1?"mockup":"mockups"}</p></div><span className="collectionChevron">⌄</span></button>{open&&<><div className="collectionActions"><button className="selectSet" onClick={()=>{setRenamingTheme(theme);setRenameValue(theme)}}>Rename set</button><button className="deleteSet" onClick={()=>setDeletingTheme(theme)}>Delete set</button></div><div className="thumbs">{items.map(item=><div className="mockChoice" key={item.id}><button type="button" className="savedMockupPreview" onClick={()=>setLibraryPreview(item)} aria-label={`Enlarge ${item.name}`}><img src={item.src} alt={item.name}/><span>Enlarge</span></button><span className="choiceName">{item.name}</span>{item.custom&&isCalibratedSurface(item.surfaceKind||"rigid-flat")&&<button className="resetArea" onClick={()=>{setPoints([]);setCalibrating(item)}}>Reset product area</button>}</div>)}</div></>}</article>})}</div>
    </div></section>
    {showAddSet&&<div className="confirmOverlay" role="dialog" aria-modal="true" aria-labelledby="add-set-title"><div className="confirmDialog addSetDialog"><button className="closeAddSet" disabled={libraryBusy} onClick={()=>setShowAddSet(false)} aria-label="Close">×</button><p className="mockupEyebrow">ADD MOCKUP SET</p><h2 id="add-set-title">Build a reusable set</h2>{libraryBusy&&<div className="librarySaving modalSaving" role="status"><span className="librarySpinner"/><div><b>{libraryProgress} of {libraryTotal} files saved</b><small>Do not close this window until the set is complete.</small></div></div>}<div className="setControls"><label><span>Name this set</span><input value={themeName} disabled={libraryBusy} onChange={e=>setThemeName(e.target.value)} placeholder="Example: Palm Springs Models"/></label><label><span>Product surface</span><select value={surfaceKind} disabled={libraryBusy} onChange={e=>setSurfaceKind(e.target.value as SurfaceKind)}>{Object.entries(SURFACE_LABELS).filter(([value])=>value!=="apparel").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button disabled={libraryBusy||!themeName.trim()} onClick={()=>mockupInput.current?.click()}><span>↑</span>{libraryBusy?`Saving ${libraryProgress} of ${libraryTotal}…`:"Choose blank mockups"}</button><small>PNG, JPG, or WEBP · maximum 50 mockups per set</small><input ref={mockupInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event=>void addMockupsManaged(event)}/></div></div></div>}
    {renamingTheme&&<div className="confirmOverlay" role="dialog" aria-modal="true" aria-labelledby="rename-set-title"><div className="confirmDialog"><p className="mockupEyebrow">RENAME MOCKUP SET</p><h2 id="rename-set-title">Choose a new name</h2><input value={renameValue} onChange={event=>setRenameValue(event.target.value)} maxLength={80} autoFocus/><div className="confirmActions"><button className="cancelConfirm" onClick={()=>{setRenamingTheme("");setRenameValue("")}}>Cancel</button><button className="confirmRename" disabled={!renameValue.trim()} onClick={renameSet}>Save new name</button></div></div></div>}
    {deletingTheme&&<div className="confirmOverlay" role="dialog" aria-modal="true" aria-labelledby="delete-set-title"><div className="confirmDialog"><p className="mockupEyebrow">DELETE MOCKUP SET</p><h2 id="delete-set-title">Delete “{deletingTheme}”?</h2><p>This permanently removes the set and every saved mockup inside it.</p><div className="confirmActions"><button className="cancelConfirm" onClick={()=>setDeletingTheme("")}>Keep this set</button><button className="confirmDelete" onClick={deleteSet}>Yes, delete set</button></div></div></div>}
    {libraryPreview&&<div className="mockupLightbox" role="dialog" aria-modal="true" aria-label={`${libraryPreview.name} enlarged preview`} onMouseDown={event=>{if(event.target===event.currentTarget)setLibraryPreview(null)}}><button className="lightboxClose" onClick={()=>setLibraryPreview(null)} aria-label="Close enlarged mockup">×</button><div className="lightboxContent"><img src={libraryPreview.src} alt={`${libraryPreview.name} enlarged`}/><div><strong>{libraryPreview.name}</strong></div></div></div>}
    {calibrating&&<div className="modal"><div className="calibrator"><button className="close" onClick={()=>setCalibrating(null)}>×</button><p className="mockupEyebrow">SET THE PRODUCT AREA</p><h2>Click the {['top-left','top-right','bottom-right','bottom-left'][points.length]} inside corner.</h2><p>Four clicks and this mockup is ready to reuse.</p><div className="calImage"><img src={calibrating.src} alt="Blank mockup" onClick={calibrateClick}/>{points.map((point,index)=><i key={index} style={{left:`${point[0]*100}%`,top:`${point[1]*100}%`}}>{index+1}</i>)}</div><button className="resetPoints" onClick={()=>setPoints([])}>Start these four points over</button></div></div>}
  </main>;

  return <main className="mockupFactory">
    <header className="mockupTopbar"><div className="brand"><span className="brandGold">Goldie</span><span>LISTING FACTORY</span></div><nav className="factoryNav" aria-label="Goldie tools"><a href="/listing-factory">Listing Factory</a><a href="/batches">Batch History</a><a href="/keywords">Keyword Banks</a><a className="active" href="/mockups">Mockup Sets</a><a href="/usage">Usage + Plan</a></nav><span className="privateNote">Saved mockup library</span></header>
    <section className="mockupHero"><p className="mockupEyebrow">YOUR SAVED MOCKUP LIBRARY</p><h1>Manage your mockup sets.</h1><p className="lede">Create, rename, adjust, or delete your saved sets here. Use them to create listing images in the Listing Factory.</p></section>
    <section className="mockupWorkspace">
      <div className="mockupStep"><div className="stepHead"><span>1</span><div><h2>Add this design</h2><p>One design at a time · PNG, JPG, or WEBP · already upscaled if needed</p></div></div>
        <div className="uploadPair">
          <div className={`dropzone uploadSlot ${drag?"drag":""}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={dropped}>
            <span className="slotStatus required">REQUIRED</span><div className="uploadMark">＋</div><strong>Finished design</strong><p>The exact artwork Goldie will place into your selected mockups.</p><div className="uploadActions"><button onClick={()=>fileInput.current?.click()}>{design?"Replace design":"Choose design"}</button></div>
            <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={changed}/>
            {design&&<div className="singleFile"><img src={URL.createObjectURL(design)} alt="Your finished design"/><span>{design.name}</span><button aria-label="Remove finished design" onClick={()=>{setDesign(null);setResults([])}}>×</button></div>}
          </div>
          <div className="dropzone uploadSlot optionalSlot">
            <span className="slotStatus optional">OPTIONAL</span><div className="uploadMark referenceMark">◎</div><strong>Placement reference</strong><p>Add an existing product mockup when Goldie should copy the design’s size and position.</p><div className="uploadActions"><button className="secondary" onClick={()=>referenceInput.current?.click()}>{placementReference?"Replace reference":"Choose reference"}</button></div>
            <input ref={referenceInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={referenceChanged}/>
            {placementReference&&<div className="singleFile"><img src={URL.createObjectURL(placementReference)} alt="Placement reference"/><span>{placementReference.name}</span><button aria-label="Remove placement reference" onClick={()=>setPlacementReference(null)}>×</button></div>}
          </div>
        </div>
        {(design||placementReference)&&<div className="uploadFooter"><span>{design?"Required design added":"Add the required finished design to continue"}{placementReference?" · Placement reference added":""}</span><button className="textButton" onClick={clear}>Clear all / start over</button></div>}
      </div>
      <div className="mockupStep"><div className="stepHead"><span>2</span><div><h2>Choose your mockups</h2><p>Select up to 10 mockups to create at a time. Each themed set can hold up to 50.</p></div></div><div className={`selectionLimit ${selected.size===MAX_SELECTED_MOCKUPS?"full":""}`}><strong>{selected.size} of 10 selected</strong><span>Smaller groups create faster, more dependable results.</span></div>{selectionNotice&&<p className="selectionNotice" role="status">{selectionNotice}</p>}
        <div className="setList">
          <button type="button" className={`addSetCard ${showAddSet?"active":""}`} aria-expanded={showAddSet} onClick={()=>{setShowAddSet(open=>!open);if(!showAddSet)setTimeout(()=>addSetRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),60)}}><span aria-hidden="true">＋</span><strong>{library.some(item=>item.custom)?"Add another mockup set":"Add your first mockup set"}</strong><small>Upload and save a reusable group of scenes.</small></button>
          {[...new Set(library.map(t=>t.theme))].map(theme=>{const items=library.filter(t=>t.theme===theme),open=activeTheme===theme,count=items.filter(t=>selected.has(t.id)).length;return <div className={`collection ${open?"open":"collapsed"}`} key={theme}>
            <div className="collectionToggle" role="button" tabIndex={0} aria-expanded={open} onClick={()=>setActiveTheme(open?"":theme)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setActiveTheme(open?"":theme)}}}><div><span className="selected">MOCKUP SET</span><span className="setTitleRow"><h3>{theme}</h3>{open&&<button type="button" className="renameSet" aria-label={`Rename ${theme}`} title={`Rename ${theme}`} onClick={event=>{event.stopPropagation();setRenamingTheme(theme);setRenameValue(theme)}}>✎</button>}</span><p>{count} selected · {items.length} mockups</p>{!open&&<span className="setPreview">{items.slice(0,3).map(t=><img key={t.id} src={t.src} alt=""/>)}</span>}</div><span className="collectionChevron" aria-hidden="true">⌄</span></div>
            {open&&<><div className="collectionActions"><button type="button" className="deleteSet" onClick={()=>setDeletingTheme(theme)}>Delete set</button><button type="button" className="selectSet" onClick={()=>{const ids=items.map(t=>t.id),all=ids.every(id=>selected.has(id));setSelected(()=>{if(all){setSelectionNotice("");return new Set()}const next=new Set(ids.slice(0,MAX_SELECTED_MOCKUPS));setSelectionNotice(ids.length>MAX_SELECTED_MOCKUPS?"The first 10 mockups are selected. Create this group, then choose another group.":"");return next})}}>{items.every(t=>selected.has(t.id))?"Deselect all":items.length>MAX_SELECTED_MOCKUPS?"Select first 10":"Select all"}</button></div><div className="thumbs">{items.map(t=><div className={`mockChoice ${selected.has(t.id)?"chosen":""}`} key={t.id}><label className="mockChoiceSelect"><input className="choiceCheckbox" type="checkbox" checked={selected.has(t.id)} onChange={()=>toggle(t.id)} aria-label={`Use ${t.name}`}/><span className="choiceVisual"><img src={t.src} alt={t.name}/></span><span className="choiceName">{t.name}</span></label><button type="button" className="previewSavedSelection" onClick={()=>setLibraryPreview(t)}>View larger</button>{t.custom&&isCalibratedSurface(t.surfaceKind||"rigid-flat")&&<button type="button" className="resetArea" onClick={()=>{setPoints([]);setCalibrating(t)}}>Reset product area</button>}</div>)}</div></>}
          </div>})}
        </div>
        {showAddSet&&<div className="addSet" ref={addSetRef}><button type="button" className="closeAddSet" aria-label="Close mockup set builder" onClick={()=>setShowAddSet(false)}>×</button><div className="addSetIntro"><span className="addSetIcon" aria-hidden="true">＋</span><div><span className="addSetLabel">BUILD YOUR LIBRARY</span><strong>Add another themed mockup set</strong><p>Name the collection, choose the product surface, and add up to 50 blank mockups.</p></div></div><div className="setControls"><label><span>Product surface</span><select value={surfaceKind} onChange={e=>setSurfaceKind(e.target.value as SurfaceKind)}>{Object.entries(SURFACE_LABELS).filter(([value])=>value!=="apparel").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Name this mockup set</span><input value={themeName} onChange={e=>setThemeName(e.target.value)} aria-label="Mockup set name" placeholder="Example: Neutral Lifestyle"/></label><button onClick={()=>mockupInput.current?.click()}><span aria-hidden="true">↑</span> Choose blank mockups</button><small>PNG, JPG, or WEBP · maximum 50 mockups per set</small><input ref={mockupInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addMockupsCapped}/></div></div>}
      </div>
      <div className="mockupStep actionStep"><div className="stepHead"><span>3</span><div><h2>Create your mockups</h2><p>{design?`1 design × ${chosen.length} selected scenes = ${total} finished mockups`:"Add the required finished design above to begin."}</p></div></div><button className="generate" disabled={!design||!chosen.length||busy} onClick={generate}>{busy?`Analyzing and creating ${progress} of ${total}…`:`Create ${total||"my"} mockups`}</button>{busy&&<div className="progress"><i style={{width:`${total?progress/total*100:0}%`}}/></div>}{generationError&&<p className="smartError" role="alert"><b>The complete mockup set was not created.</b><span>{generationError}</span></p>}{results.length>0&&<div className="inlineResults"><div className="resultsHead"><div><p className="mockupEyebrow">YOUR FINISHED MOCKUPS</p><h2>{`${results.length} mockups are ready.`}</h2></div>{!busy&&<button className="downloadAll" onClick={downloadAll}>Download all as ZIP</button>}</div>{grouped.map(g=>g.items.length>0&&<article key={g.file.name}><h3>{g.file.name}</h3><div className="resultGrid">{g.items.map((item,index)=><figure key={item.name}><button className="expandMockup" onClick={()=>setExpandedIndex(index)} aria-label={`View ${item.template} mockup larger`}><img src={item.url} alt={`${g.file.name} in ${item.template}`}/><span>View larger</span></button><figcaption><span>{item.template}</span><a href={item.url} download={item.name}>Download</a></figcaption></figure>)}</div></article>)}</div>}</div>
    </section>
    {libraryPreview&&<div className="mockupLightbox" role="dialog" aria-modal="true" aria-label={`${libraryPreview.name} enlarged preview`} onMouseDown={event=>{if(event.target===event.currentTarget)setLibraryPreview(null)}}><button className="lightboxClose" onClick={()=>setLibraryPreview(null)} aria-label="Close enlarged mockup">×</button><div className="lightboxContent"><img src={libraryPreview.src} alt={`${libraryPreview.name} enlarged`}/><div><strong>{libraryPreview.name}</strong></div></div></div>}
    {expandedIndex!==null&&results[expandedIndex]&&<div className="mockupLightbox" role="dialog" aria-modal="true" aria-label={`${results[expandedIndex].template} mockup preview`} onMouseDown={event=>{if(event.target===event.currentTarget)setExpandedIndex(null)}}><button className="lightboxClose" onClick={()=>setExpandedIndex(null)} aria-label="Close enlarged mockup">×</button>{results.length>1&&<button className="lightboxPrevious" onClick={()=>moveExpanded(-1)} aria-label="Previous mockup">‹</button>}<div className="lightboxContent"><img src={results[expandedIndex].url} alt={`${results[expandedIndex].template} mockup enlarged`}/><div><strong>{results[expandedIndex].template}</strong><a href={results[expandedIndex].url} download={results[expandedIndex].name}>Download this mockup</a></div></div>{results.length>1&&<button className="lightboxNext" onClick={()=>moveExpanded(1)} aria-label="Next mockup">›</button>}</div>}
    {renamingTheme&&<div className="confirmOverlay" role="dialog" aria-modal="true" aria-labelledby="rename-set-title"><div className="confirmDialog"><p className="mockupEyebrow">RENAME MOCKUP SET</p><h2 id="rename-set-title">Choose a new name</h2><input value={renameValue} onChange={event=>setRenameValue(event.target.value)} maxLength={80} autoFocus/><div className="confirmActions"><button className="cancelConfirm" onClick={()=>{setRenamingTheme("");setRenameValue("")}}>Cancel</button><button className="confirmRename" disabled={!renameValue.trim()} onClick={renameSet}>Save new name</button></div></div></div>}
    {deletingTheme&&<div className="confirmOverlay" role="dialog" aria-modal="true" aria-labelledby="delete-set-title"><div className="confirmDialog"><p className="mockupEyebrow">DELETE MOCKUP SET</p><h2 id="delete-set-title">Delete “{deletingTheme}”?</h2><p>This permanently removes the set and every saved mockup inside it.</p><div className="confirmActions"><button className="cancelConfirm" onClick={()=>setDeletingTheme("")}>Keep this set</button><button className="confirmDelete" onClick={deleteSet}>Yes, delete set</button></div></div></div>}
    {calibrating&&<div className="modal"><div className="calibrator"><button className="close" onClick={()=>setCalibrating(null)}>×</button><p className="mockupEyebrow">SET THE PRODUCT AREA</p><h2>Click the {['top-left','top-right','bottom-right','bottom-left'][points.length]} inside corner.</h2><p>Four clicks and this mockup is ready to reuse.</p><div className="calImage"><img src={calibrating.src} alt="Blank mockup" onClick={calibrateClick}/>{points.map((p,i)=><i key={i} style={{left:`${p[0]*100}%`,top:`${p[1]*100}%`}}>{i+1}</i>)}</div><button className="resetPoints" onClick={()=>setPoints([])}>Start these four points over</button></div></div>}
    <footer className="mockupFooter"><span>GOLDIE MOCKUP FACTORY</span><p>Product-aware placement for reusable mockup sets.</p></footer>
  </main>;
}
