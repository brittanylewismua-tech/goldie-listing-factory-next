import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {executeDraftJob,type DraftJobBindings,type DraftJobInput} from '../app/api/printify/drafts/execute-job';
import {pendingDraftJob,readJobObject} from '../app/api/printify/draft-job-store';
import {RejectedProductCreation} from '../app/api/printify/product-creation';
import {RetryDraftLater} from '../app/api/printify/retry-after';
type Params={key:string;owner:string};
/** Browser connections do not own this execution. All irreversible writes have
 * a durable preflight checkpoint; interrupted writes are reconciled read-only. */
export class DraftCreationWorkflow extends WorkflowEntrypoint<DraftJobBindings,Params>{
  async run(event:WorkflowEvent<Params>,step:WorkflowStep){
    const {key,owner}=event.payload;
    for(let attempt=0;attempt<48;attempt++){
      const result=await step.do(`complete-draft-${attempt}`,{retries:{limit:2,delay:'5 seconds',backoff:'exponential'},timeout:'10 minutes'},async()=>{
        const row=await this.env.DB.prepare('SELECT status,response_json FROM printify_draft_results WHERE request_key=? AND user_id=?').bind(key,owner).first<{status:string;response_json:string|null}>();
        if(row?.status==='succeeded')return {done:true};
        const job=pendingDraftJob(row?.response_json||null);
        if(!job||job.workflowId!==event.instanceId||row?.status==='failed')return {done:true};
        try{
          const input=await readJobObject<DraftJobInput>(this.env.ARTWORK,owner,job.workflowId,job.inputKey);
          if(input.userId!==owner)throw Error('Draft checkpoint ownership mismatch.');
          await executeDraftJob(input,key,job,this.env);
          return {done:true};
        }catch(error){
          if(error instanceof RetryDraftLater)return {done:false,wait: error.milliseconds};
          const current=await this.env.DB.prepare('SELECT response_json,status FROM printify_draft_results WHERE request_key=? AND user_id=?').bind(key,owner).first<{response_json:string|null;status:string}>();
          if(current?.status==='succeeded')return {done:true};
          const checkpoint=pendingDraftJob(current?.response_json||null);
          if(!checkpoint||checkpoint.workflowId!==event.instanceId)return {done:true};
          const rejected=error instanceof RejectedProductCreation;
          const unresolved=checkpoint.phase==='creating'&&!rejected;
          const terminal=rejected||(attempt>=5&&checkpoint.phase!=='created'&&!unresolved);
          const message=error instanceof Error?error.message:'Draft processing was interrupted.';
          await this.env.DB.prepare("UPDATE printify_draft_results SET status=?,response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_key=? AND user_id=? AND status!='succeeded' AND json_extract(response_json,'$.workflowId')=?").bind(terminal?'failed':unresolved?'uncertain':'running',JSON.stringify({...checkpoint,...(rejected?{phase:'uploaded'}:{}),error:message}),key,owner,event.instanceId).run();
          return {done:terminal};
        }
      });
      if(result.done)return;
      await step.sleep(`wait-before-recovery-${attempt}`,'wait' in result?result.wait as number:Math.min(600000,5000*2**Math.min(attempt,7)));
    }
    // Preserve the uncertain reservation. Elapsed time is never evidence that
    // Printify did not create the product, so do not permit a duplicate POST.
  }
}
