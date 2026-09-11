type ProgressRow={status:string;transfer_json?:string|null;draft_json?:string|null;draft_state_json?:string|null;state_json?:string|null;candidate_listing_id?:number|null;candidate_seen_at?:number|null;photos_json?:string|null};
const read=<T,>(value:string|null|undefined):T|null=>{try{return value?JSON.parse(value) as T:null}catch{return null}};
/** Durable workflow milestones only. This never estimates progress from elapsed time. */
export function deliveryProgress(row:ProgressRow){
 if(row.status==='completed')return {progress:100,stage:'Verified on Etsy'};
 const transfer=read<{phase?:string}>(row.transfer_json),draft=read<{properties?:unknown[]}>(row.draft_json),metadata=read<{index?:number;verified?:boolean}>(row.draft_state_json),photos=read<{uploaded?:unknown[]}>(row.state_json),selected=read<unknown[]>(row.photos_json)||[];
 let progress=row.status==='preparing'?5:row.status==='waiting'?10:row.status==='delivering'?30:0,stage=row.status==='preparing'?'Saving the listing package':'Starting the Etsy drafts';
 if(transfer?.phase==='submitted'){progress=Math.max(progress,20);stage='Sending the hidden Printify draft'}
 if(transfer?.phase==='accepted'){progress=Math.max(progress,28);stage='Waiting for Etsy to create the draft'}
 if(row.candidate_listing_id){progress=Math.max(progress,36);stage='Confirming the new Etsy draft'}
 if(row.candidate_seen_at){progress=Math.max(progress,42);stage='Saving the Etsy listing details'}
 if(metadata){
  const total=Math.max(2,2+(draft?.properties?.length||0)),done=Math.min(total,Math.max(0,Number(metadata.index)||0));
  progress=Math.max(progress,42+Math.round(33*(done/total)));stage=metadata.verified?'Transferring the listing photos':'Saving the Etsy listing details';
  if(metadata.verified)progress=Math.max(progress,75);
 }
 if(photos){
  const total=Math.max(1,selected.length),done=Math.min(total,photos.uploaded?.length||0);
  progress=Math.max(progress,78+Math.round(17*(done/total)));stage='Transferring the listing photos';
 }
 if(['failed','expired','canceled','needs_attention'].includes(row.status))stage='Needs attention';
 return {progress:Math.min(99,progress),stage};
}
