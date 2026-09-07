export const DRAFT_TASK_STAGES = [
  {id:'design',label:'Design & options',tasks:['placement','draft-colors','draft-sizes']},
  {id:'details',label:'Pricing & shipping',tasks:['draft-pricing','draft-shipping']},
  {id:'photos',label:'Listing photos',tasks:['photos']},
] as const;
export function draftTaskStage(task?:string){return DRAFT_TASK_STAGES.find(stage=>stage.tasks.some(value=>value===task))?.id;}
export function visibleDraftStage(rows:Array<{task?:string;done:boolean}>,activeTask:string,remembered?:string){
  return draftTaskStage(activeTask)||DRAFT_TASK_STAGES.find(stage=>stage.id===remembered)?.id||draftTaskStage(rows.find(row=>!row.done)?.task)||'design';
}
