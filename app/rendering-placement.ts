// Numeric geometry only: never mount or execute SVG supplied by a provider.
export type Matrix = [number, number, number, number, number, number];
export type RenderingArea = { viewBox: number[]; width: number; height: number; matrix: Matrix };
const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function numbers(raw: string) { return raw.trim().split(/[\s,]+/).filter(Boolean).map(Number); }
export function svgTransform(raw = ''): Matrix | null {
  let matrix = identity;
  const pattern = /([A-Za-z]+)\s*\(([^)]*)\)/g;
  let end = 0;
  for (const match of raw.matchAll(pattern)) {
    if (raw.slice(end, match.index).trim()) return null;
    end = match.index! + match[0].length;
    const n = numbers(match[2]); if (!n.length || !n.every(Number.isFinite)) return null;
    let next: Matrix;
    if (match[1] === 'translate' && n.length <= 2) next = [1,0,0,1,n[0],n[1]||0];
    else if (match[1] === 'scale' && n.length <= 2) next = [n[0],0,0,n[1]??n[0],0,0];
    else if (match[1] === 'matrix' && n.length === 6) next = n as Matrix;
    else if (match[1] === 'rotate' && (n.length === 1 || n.length === 3)) {
      const radians=n[0]*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),x=n[1]||0,y=n[2]||0;
      next=[c,s,-s,c,x-c*x+s*y,y-s*x-c*y];
    } else return null;
    matrix = multiply(matrix,next);
  }
  return raw.slice(end).trim() ? null : matrix;
}
export function readRenderingArea(xml: string, side: string): RenderingArea | null {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const stack: Array<{tag:string;matrix:Matrix|null;inDefs:boolean}> = [];
  let viewBox: number[] | undefined;
  const normalize=(value:string)=>value.toLowerCase().replace(/[_\s]+/g,'-');
  for (const match of xml.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<\/?([\w:-]+)\b([^>]*?)>/g)) {
    const tag=match[1].toLowerCase(),raw=match[0];
    if(raw.startsWith('</')) { if(stack.at(-1)?.tag!==tag)return null;stack.pop();continue; }
    const attrs:Record<string,string>={};
    for(const attribute of match[2].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))attrs[attribute[1]]=attribute[3];
    if(tag==='svg'&&!viewBox){viewBox=numbers(attrs.viewBox||'');if(viewBox.length!==4||!viewBox.every(Number.isFinite)||viewBox[2]<=0||viewBox[3]<=0)return null;}
    const parent=stack.at(-1),own=svgTransform(attrs.transform),matrix=own&&(parent?.matrix===null?null:multiply(parent?.matrix||identity,own));
    const inDefs=Boolean(parent?.inDefs)||tag==='defs';
    if(!inDefs&&tag==='svg'&&normalize(attrs.id||'')===`placeholder-${normalize(side)}`){
      const width=Number(attrs.width),height=Number(attrs.height),x=Number(attrs.x||0),y=Number(attrs.y||0);
      if(!viewBox||!matrix||![width,height,x,y].every(Number.isFinite)||width<=0||height<=0)return null;
      // Printify's placeholder SVGs use a matching local viewport. Unsupported
      // viewports must not silently place artwork using made-up coordinates.
      const local=attrs.viewBox?numbers(attrs.viewBox):[0,0,width,height];
      if(local.length!==4||local[0]!==0||local[1]!==0||local[2]!==width||local[3]!==height)return null;
      return {viewBox,width,height,matrix:multiply(matrix,[1,0,0,1,x,y])};
    }
    if(!raw.endsWith('/>'))stack.push({tag,matrix,inDefs});
  }
  return null;
}
export function artworkInRendering(area: RenderingArea, placement: {x:number;y:number;scale:number;angle?:number}, printWidth:number, printHeight:number, artworkAspect:number) {
  if(![placement.x,placement.y,placement.scale,printWidth,printHeight,artworkAspect].every(Number.isFinite)||placement.scale<=0||printWidth<=0||printHeight<=0||artworkAspect<=0)return null;
  const width=area.width*placement.scale,height=area.height*placement.scale*printWidth/printHeight/artworkAspect;
  const cx=area.width*placement.x,cy=area.height*placement.y;
  return {x:cx-width/2,y:cy-height/2,width,height,rotation:`rotate(${placement.angle||0} ${cx} ${cy})`};
}
