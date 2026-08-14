"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import "./mockups.css";

type Point = [number, number];
type SurfaceKind = "rigid-flat" | "fabric" | "curved" | "irregular";
type Template = { id: string; name: string; theme: string; src: string; corners: [Point, Point, Point, Point]; normalized?: boolean; custom?: boolean; foregroundPrompt?: string; surfaceKind?: SurfaceKind };
type Rendered = { name: string; url: string; template: string };

const templates: Template[] = [
  { id:"pink-1",theme:"Pink Dorm",name:"Leaning frame",src:"/mockups/pink-dorm-01-leaning-frame.png",corners:[[230,382],[810,328],[798,1321],[197,1254]] },
  { id:"pink-2",theme:"Pink Dorm",name:"Hanging wall art",src:"/mockups/pink-dorm-02-hanging-poster.png",corners:[[546,105],[1065,79],[1065,929],[546,896]],foregroundPrompt:"woman" },
  { id:"pink-3",theme:"Pink Dorm",name:"Maximalist bedroom",src:"/mockups/pink-dorm-03-maximalist-bed.png",corners:[[305,101],[878,125],[879,985],[305,988]] },
  { id:"pink-4",theme:"Pink Dorm",name:"Chair and plants",src:"/mockups/pink-dorm-04-chair-and-plants.png",corners:[[346,104],[870,123],[868,930],[346,942]] },
  { id:"pink-5",theme:"Pink Dorm",name:"Bed and plants",src:"/mockups/pink-dorm-05-bed-and-plants.png",corners:[[462,150],[868,150],[868,699],[462,699]] },
];

const SURFACE_LABELS: Record<SurfaceKind,string> = {
  "rigid-flat":"Poster, canvas, framed art, card or sticker",
  fabric:"T-shirt, sweatshirt, tote, pillow or blanket",
  curved:"Mug, tumbler or other curved product",
  irregular:"Irregular or die-cut product",
};

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

function triangle(ctx: CanvasRenderingContext2D, image: HTMLImageElement, source: Point[], dest: Point[]) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(...dest[0]); ctx.lineTo(...dest[1]); ctx.lineTo(...dest[2]); ctx.closePath(); ctx.clip();
  affine(ctx, source, dest); ctx.drawImage(image, 0, 0); ctx.restore();
}

async function makeMockup(file: File, template: Template): Promise<Rendered> {
  const [master, art, foregrounds] = await Promise.all([loadImage(template.src), loadImage(URL.createObjectURL(file)), foregroundLayers(template)]);
  const canvas = document.createElement("canvas"); canvas.width = master.naturalWidth; canvas.height = master.naturalHeight;
  const rawCorners = template.normalized ? template.corners.map(([x,y])=>[x*master.naturalWidth,y*master.naturalHeight] as Point) as Template["corners"] : template.corners;
  const kind=template.surfaceKind||"rigid-flat";
  if(kind!=="rigid-flat") throw new Error(`${SURFACE_LABELS[kind]} mockups require Goldie’s ${kind === "fabric" ? "fabric-drape" : kind === "curved" ? "curved-wrap" : "shape-mask"} renderer. This mockup was blocked instead of being rendered inaccurately.`);
  const detectedCorners=refineRigidSurface(master,rawCorners);
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
    const s00:[number,number]=[u0*art.width,v0*art.height],s10:[number,number]=[u1*art.width,v0*art.height],s11:[number,number]=[u1*art.width,v1*art.height],s01:[number,number]=[u0*art.width,v1*art.height];
    const d00=bilinear(corners,u0,v0),d10=bilinear(corners,u1,v0),d11=bilinear(corners,u1,v1),d01=bilinear(corners,u0,v1);
    triangle(ctx,art,[s00,s10,s11],[d00,d10,d11]); triangle(ctx,art,[s00,s11,s01],[d00,d11,d01]);
  }
  ctx.globalCompositeOperation="multiply"; ctx.globalAlpha=.12; ctx.drawImage(master,0,0);
  ctx.restore();
  for (const foreground of foregrounds) ctx.drawImage(await loadImage(foreground),0,0,canvas.width,canvas.height);
  const blob = await new Promise<Blob>((resolve)=>canvas.toBlob(b=>resolve(b!),"image/jpeg",.93));
  const safe=file.name.replace(/\.[^.]+$/," ").trim().replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"");
  return { name:`${safe}-${template.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.jpg`, url:URL.createObjectURL(blob), template:template.name };
}

export default function Home() {
  const [design,setDesign]=useState<File|null>(null); const [placementReference,setPlacementReference]=useState<File|null>(null); const [results,setResults]=useState<Rendered[]>([]); const [busy,setBusy]=useState(false); const [progress,setProgress]=useState(0); const [drag,setDrag]=useState(false); const [generationError,setGenerationError]=useState("");
  const [expandedIndex,setExpandedIndex]=useState<number|null>(null);
  const [library,setLibrary]=useState<Template[]>(templates); const [selected,setSelected]=useState<Set<string>>(new Set(templates.map(t=>t.id))); const [themeName,setThemeName]=useState("My mockup set"); const [surfaceKind,setSurfaceKind]=useState<SurfaceKind>("rigid-flat"); const [calibrating,setCalibrating]=useState<Template|null>(null); const [points,setPoints]=useState<Point[]>([]);
  const fileInput=useRef<HTMLInputElement>(null); const referenceInput=useRef<HTMLInputElement>(null);
  const mockupInput=useRef<HTMLInputElement>(null); const chosen=library.filter(t=>selected.has(t.id)); const total=design?chosen.length:0;
  const validImage=(file:File|undefined)=>file&&/^image\/(png|jpeg|webp)$/.test(file.type)?file:null;
  const changed=(e:ChangeEvent<HTMLInputElement>)=>{setDesign(validImage(e.target.files?.[0]));setResults([]);e.target.value="";};
  const referenceChanged=(e:ChangeEvent<HTMLInputElement>)=>{setPlacementReference(validImage(e.target.files?.[0]));e.target.value="";};
  const dropped=(e:DragEvent)=>{e.preventDefault();setDrag(false);setDesign(validImage(Array.from(e.dataTransfer.files)[0]));setResults([]);};
  const generate=async()=>{if(!design)return;setBusy(true);setGenerationError("");setResults([]);setProgress(0);const made:Rendered[]=[];try{for(const template of chosen){made.push(await makeMockup(design,template));setProgress(made.length);setResults([...made]);await new Promise(r=>setTimeout(r,0));}}catch(error){setGenerationError(error instanceof Error?error.message:"Goldie could not create a safe mockup.");}finally{setBusy(false);}};
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
  const addMockups=(e:ChangeEvent<HTMLInputElement>)=>{const incoming=Array.from(e.target.files||[]).filter(f=>/^image\/(png|jpeg|webp)$/.test(f.type));const added=incoming.map((f,i):Template=>({id:`custom-${Date.now()}-${i}`,theme:themeName.trim()||"My mockup set",name:f.name.replace(/\.[^.]+$/,"")||`Mockup ${i+1}`,src:URL.createObjectURL(f),corners:[[.15,.12],[.85,.12],[.85,.88],[.15,.88]],normalized:true,custom:true,surfaceKind}));setLibrary(x=>[...x,...added]);setSelected(x=>new Set([...x,...added.map(t=>t.id)]));if(added[0]){setPoints([]);setCalibrating(added[0]);}e.target.value="";};
  const toggle=(id:string)=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n});
  const calibrateClick=(e:React.MouseEvent<HTMLImageElement>)=>{if(!calibrating)return;const r=e.currentTarget.getBoundingClientRect();const next=[...points,[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height] as Point];setPoints(next);if(next.length===4){setLibrary(x=>x.map(t=>t.id===calibrating.id?{...t,corners:next as Template["corners"]}:t));const remaining=library.filter(t=>t.custom&&t.theme===calibrating.theme&&t.id!==calibrating.id&&t.corners[0][0]===.15);setTimeout(()=>{setPoints([]);setCalibrating(remaining[0]||null)},250);}};

  return <main className="mockupFactory">
    <header className="mockupTopbar"><div className="brand"><span className="brandGold">GOLDIE</span><span>MOCKUP FACTORY</span></div><nav className="factoryNav" aria-label="Goldie factories"><a href="/">Listing Factory</a><a className="active" href="/mockups">Mockup Factory</a></nav><span className="privateNote">Artwork never leaves your device</span></header>
    <section className="mockupHero"><p className="mockupEyebrow">FROM FINISHED DESIGN TO LIFESTYLE MOCKUPS</p><h1>Batch-create your mockups.<br/><em>Done for you.</em></h1><p className="lede">Add one finished design, then choose the mockups you want Goldie to create. Each result is sized, positioned, and ready to download.</p></section>
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
      <div className="mockupStep"><div className="stepHead"><span>2</span><div><h2>Choose your mockups</h2><p>Select every scene, or choose only the ones you want for this design.</p></div></div>
        {[...new Set(library.map(t=>t.theme))].map(theme=><div className="collection" key={theme}><div className="collectionTitle"><div><span className="selected">MOCKUP SET</span><h3>{theme}</h3><p>{library.filter(t=>t.theme===theme&&selected.has(t.id)).length} of {library.filter(t=>t.theme===theme).length} selected</p></div><button className="selectSet" onClick={()=>{const ids=library.filter(t=>t.theme===theme).map(t=>t.id);const all=ids.every(id=>selected.has(id));setSelected(s=>{const n=new Set(s);ids.forEach(id=>all?n.delete(id):n.add(id));return n})}}>{library.filter(t=>t.theme===theme).every(t=>selected.has(t.id))?"Deselect all":"Select all"}</button></div><div className="thumbs">{library.filter(t=>t.theme===theme).map(t=><button className={`mockChoice ${selected.has(t.id)?"chosen":""}`} aria-pressed={selected.has(t.id)} key={t.id} onClick={()=>toggle(t.id)}><span className="choiceVisual"><img src={t.src} alt={t.name}/>{selected.has(t.id)&&<i className="choiceCheck" aria-hidden="true">✓</i>}</span><span className="choiceName">{t.name}</span>{t.custom&&<small onClick={e=>{e.stopPropagation();setPoints([]);setCalibrating(t)}}>Reset product area</small>}</button>)}</div></div>)}
        <div className="addSet"><div className="addSetIntro"><span className="addSetIcon" aria-hidden="true">＋</span><div><span className="addSetLabel">BUILD YOUR LIBRARY</span><strong>Add another themed mockup set</strong><p>Name the collection, choose the product surface, and add one or several blank mockups.</p></div></div><div className="setControls"><label><span>Product surface</span><select value={surfaceKind} onChange={e=>setSurfaceKind(e.target.value as SurfaceKind)}>{Object.entries(SURFACE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Name this mockup set</span><input value={themeName} onChange={e=>setThemeName(e.target.value)} aria-label="Mockup set name" placeholder="Example: Neutral Lifestyle"/></label><button onClick={()=>mockupInput.current?.click()}><span aria-hidden="true">↑</span> Choose blank mockups</button><small>PNG, JPG, or WEBP · select one or several</small><input ref={mockupInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addMockups}/></div></div>
      </div>
      <div className="mockupStep actionStep"><div className="stepHead"><span>3</span><div><h2>Create your mockups</h2><p>{design?`1 design × ${chosen.length} selected scenes = ${total} finished mockups`:"Add the required finished design above to begin."}</p></div></div><button className="generate" disabled={!design||!chosen.length||busy} onClick={generate}>{busy?`Analyzing and creating ${progress} of ${total}…`:`Create ${total||"my"} mockups`}</button>{busy&&<div className="progress"><i style={{width:`${total?progress/total*100:0}%`}}/></div>}{generationError&&<p className="smartError" role="alert"><b>This scene was not safe to render.</b><span>{generationError}</span></p>}</div>
    </section>
    {results.length>0&&<section className="mockupResults"><div className="resultsHead"><div><p className="mockupEyebrow">YOUR FINISHED MOCKUPS</p><h2>{busy?"They’re appearing as they finish.":`${results.length} mockups are ready.`}</h2></div>{!busy&&<button className="downloadAll" onClick={downloadAll}>Download all as ZIP</button>}</div>{grouped.map(g=>g.items.length>0&&<article key={g.file.name}><h3>{g.file.name}</h3><div className="resultGrid">{g.items.map((item,index)=><figure key={item.name}><button className="expandMockup" onClick={()=>setExpandedIndex(index)} aria-label={`View ${item.template} mockup larger`}><img src={item.url} alt={`${g.file.name} in ${item.template}`}/><span>View larger</span></button><figcaption><span>{item.template}</span><a href={item.url} download={item.name}>Download</a></figcaption></figure>)}</div></article>)}</section>}
    {expandedIndex!==null&&results[expandedIndex]&&<div className="mockupLightbox" role="dialog" aria-modal="true" aria-label={`${results[expandedIndex].template} mockup preview`} onMouseDown={event=>{if(event.target===event.currentTarget)setExpandedIndex(null)}}><button className="lightboxClose" onClick={()=>setExpandedIndex(null)} aria-label="Close enlarged mockup">×</button>{results.length>1&&<button className="lightboxPrevious" onClick={()=>moveExpanded(-1)} aria-label="Previous mockup">‹</button>}<div className="lightboxContent"><img src={results[expandedIndex].url} alt={`${results[expandedIndex].template} mockup enlarged`}/><div><strong>{results[expandedIndex].template}</strong><a href={results[expandedIndex].url} download={results[expandedIndex].name}>Download this mockup</a></div></div>{results.length>1&&<button className="lightboxNext" onClick={()=>moveExpanded(1)} aria-label="Next mockup">›</button>}</div>}
    {calibrating&&<div className="modal"><div className="calibrator"><button className="close" onClick={()=>setCalibrating(null)}>×</button><p className="mockupEyebrow">SET THE PRODUCT AREA</p><h2>Click the {['top-left','top-right','bottom-right','bottom-left'][points.length]} inside corner.</h2><p>Four clicks and this mockup is ready to reuse.</p><div className="calImage"><img src={calibrating.src} alt="Blank mockup" onClick={calibrateClick}/>{points.map((p,i)=><i key={i} style={{left:`${p[0]*100}%`,top:`${p[1]*100}%`}}>{i+1}</i>)}</div><button className="resetPoints" onClick={()=>setPoints([])}>Start these four points over</button></div></div>}
    <footer className="mockupFooter"><span>GOLDIE MOCKUP FACTORY</span><p>Fast production. Exact artwork. No AI regeneration.</p></footer>
  </main>;
}
