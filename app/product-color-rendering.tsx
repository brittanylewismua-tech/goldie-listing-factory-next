"use client";
import {useEffect,useId,useState,type CSSProperties} from 'react';
import {readRenderingArea,artworkInRendering,type RenderingArea} from './rendering-placement';
const geometryCache=new Map<string,Promise<RenderingArea|null>>();
function geometry(url:string,side:string){
  const key=`${url}|${side}`;
  if(!geometryCache.has(key))geometryCache.set(key,(async()=>{
    try{
      const parsed=new URL(url);
      if(parsed.protocol!=='https:'||parsed.hostname!=='images.printify.com')return null;
      const response=await fetch(url,{signal:AbortSignal.timeout(2500),credentials:'omit'});
      if(!response.ok)return null;
      return readRenderingArea(await response.text(),side);
    }catch{return null;}
  })());
  return geometryCache.get(key)!;
}
export default function ProductColorRendering({color,artworkUrl,productRenderingUrl,placement,side,printWidth,printHeight}:{color:string;artworkUrl?:string;productRenderingUrl?:string;placement?:{x:number;y:number;scale:number;angle?:number};side:string;printWidth?:number|null;printHeight?:number|null}){
  const [resolved,setResolved]=useState<{key:string;area:RenderingArea|null}|null>(null);
  const [image,setImage]=useState<{url:string;aspect:number}|null>(null);
  const clip=useId().replace(/:/g,'');
  const key=`${productRenderingUrl}|${side}`;
  useEffect(()=>{let active=true;if(productRenderingUrl)void geometry(productRenderingUrl,side).then(area=>{if(active)setResolved({key,area})});return()=>{active=false}},[key,side,productRenderingUrl]);
  useEffect(()=>{let active=true;if(!artworkUrl)return;const source=new Image();source.onload=()=>{if(active&&source.naturalHeight)setImage({url:artworkUrl,aspect:source.naturalWidth/source.naturalHeight})};source.src=artworkUrl;return()=>{active=false}},[artworkUrl]);
  const area=resolved?.key===key?resolved.area:null;
  const art=area&&placement&&image?.url===artworkUrl?artworkInRendering(area,placement,Number(printWidth),Number(printHeight),image.aspect):null;
  return <div className="product-color-rendering" style={{'--product-glyph-color':color||'#ddd'} as CSSProperties}>
    {productRenderingUrl?<><span className="product-color-rendering-fill" style={{WebkitMaskImage:`url(${productRenderingUrl})`,maskImage:`url(${productRenderingUrl})`}}/><img className="product-color-rendering-base" src={productRenderingUrl} alt="Product color rendering"/></>:<span>Open Preview to view this product.</span>}
    {area&&art&&artworkUrl?<svg className="product-color-rendering-overlay" viewBox={area.viewBox.join(' ')} aria-label="Design positioned on product" role="img"><defs><clipPath id={clip}><rect width={area.width} height={area.height}/></clipPath></defs><g transform={`matrix(${area.matrix.join(' ')})`}><g clipPath={`url(#${clip})`}><image href={artworkUrl} x={art.x} y={art.y} width={art.width} height={art.height} transform={art.rotation} preserveAspectRatio="none"/></g></g></svg>:null}
    {resolved?.key===key&&!art?<span className="rendering-placement-note">Open Preview to check artwork placement.</span>:null}
  </div>;
}
