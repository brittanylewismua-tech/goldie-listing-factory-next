export type MockupEntry={src:string;index:number};
type Color={id:number;ids?:number[];title:string;variantIds?:number[]};
type Variant={id:number;colorId?:number|null;options?:number[]};
type Detail={src:string;position:string;variantIds:number[]};
export function mockupViewGroups(entries:MockupEntry[],colors:Color[]=[],variants:Variant[]=[],details:Detail[]=[],preferences:{selectedIndices?:number[];colorIds?:number[]}={}){
  const groups=new Map<string,{key:string;label:string;primary:boolean;entries:Array<MockupEntry&{color:string;label:string}>}>();
  for(const entry of entries){
    let camera='',variantId=0;
    try{const url=new URL(entry.src);camera=url.searchParams.get('camera_label')||'';variantId=Number(url.pathname.match(/\/mockup\/[^/]+\/(\d+)\//)?.[1]||0)}catch{}
    const detail=details.find(item=>item.src===entry.src);
    camera=(camera||detail?.position||'other views').trim().toLowerCase().replace(/[_\s]+/g,'-');
    // Only explicit plain/flat views lead. Unknown cameras are never called flat lays.
    const front=/^(?:front|flat-front|front-flat|flat-lay-front)$/.test(camera),back=/^(?:back|flat-back|back-flat|flat-lay-back)$/.test(camera);
    const key=front?'front':back?'back':camera;
    const label=front?'Front':back?'Back':camera.replace(/-/g,' ').replace(/\bperson\b/g,'model').replace(/^./,c=>c.toUpperCase());
    // Printify may mark one camera with variants from several colors. Its URL identifies the rendered variant.
    const ids=variantId?[variantId]:detail?.variantIds||[];
    const matches=colors.filter(color=>ids.some(id=>{const variant=variants.find(item=>item.id===id);const colorIds=color.ids||[color.id];return color.variantIds?.includes(id)||colorIds.includes(variant?.colorId??-1)||variant?.options?.some(option=>colorIds.includes(option))}));
    const color=matches.length===1?matches[0].title:'';
    if(!groups.has(key))groups.set(key,{key,label,primary:front||back,entries:[]});
    groups.get(key)!.entries.push({...entry,color,label});
  }
  // Different sizes and refreshed URLs can represent the same color/view.
  // Keep every original index accessible, but give the main gallery one per chosen color.
  for(const group of [...groups.values()].filter(item=>item.primary)){
    const chosen=new Set(preferences.selectedIndices||[]),seen=new Set<string>(),main:typeof group.entries=[],extra:typeof group.entries=[];
    const allowed=preferences.colorIds?.length?new Set(colors.filter(color=>(color.ids||[color.id]).some(id=>preferences.colorIds!.includes(id))).map(color=>color.title)):null;
    for(const entry of [...group.entries].sort((a,b)=>Number(chosen.has(b.index))-Number(chosen.has(a.index)))){
      if(entry.color&&((allowed&&!allowed.has(entry.color))||seen.has(entry.color)))extra.push(entry);
      else{main.push(entry);if(entry.color)seen.add(entry.color)}
    }
    group.entries=main.sort((a,b)=>a.index-b.index);
    if(extra.length)groups.set(`additional-${group.key}`,{key:`additional-${group.key}`,label:`Additional ${group.label.toLowerCase()} variants`,primary:false,entries:extra.sort((a,b)=>a.index-b.index)});
  }
  return [...groups.values()].sort((a,b)=>Number(b.key==='front')-Number(a.key==='front')||Number(b.key==='back')-Number(a.key==='back')||a.label.localeCompare(b.label));
}
