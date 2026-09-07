export const DRAFT_TASK_STAGES = [
  {id:'design',label:'Artwork, colors & sizes',tasks:['placement','draft-colors','draft-sizes']},
  {id:'details',label:'Pricing & shipping',tasks:['draft-pricing','draft-shipping']},
  {id:'photos',label:'Listing photos',tasks:['photos']},
] as const;
export function draftTaskStage(task?:string){return DRAFT_TASK_STAGES.find(stage=>stage.tasks.some(value=>value===task))?.id;}
export function draftStageLabel(stageId:string,tasks:string[]){
  if(stageId!=='design')return DRAFT_TASK_STAGES.find(stage=>stage.id===stageId)?.label||'';
  const colors=tasks.includes('draft-colors'),sizes=tasks.includes('draft-sizes');
  if(colors&&sizes)return 'Artwork, colors & sizes';
  if(colors)return 'Artwork & colors';
  if(sizes)return 'Artwork & sizes';
  return 'Artwork placement';
}
export function visibleDraftStage(rows:Array<{task?:string;done:boolean}>,activeTask:string,remembered?:string){
  return draftTaskStage(activeTask)||DRAFT_TASK_STAGES.find(stage=>stage.id===remembered)?.id||draftTaskStage(rows.find(row=>!row.done)?.task)||'design';
}
