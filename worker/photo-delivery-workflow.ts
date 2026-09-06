import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {runDeliveryTick,deliveryStatus,type DeliveryEnv} from '../app/api/listing-photos/delivery/service';
/** Separate from the retired publishing queue. Only explicitly prepared photo sets enter here. */
export class PhotoDeliveryWorkflow extends WorkflowEntrypoint<DeliveryEnv,{id:string;owner:string}>{
 async run(event:WorkflowEvent<{id:string;owner:string}>,step:WorkflowStep){
  const {id,owner}=event.payload;let checks=0;
  for(let operation=0;operation<240;operation++){
   const result=await step.do(`photos-${operation}`,{retries:{limit:2,delay:'10 seconds',backoff:'constant'},timeout:'10 minutes'},()=>runDeliveryTick(id,owner));
   if(result.done)return;
   if(!result.progress)checks++;
   await step.sleep(`wait-${operation}`,'waitMs' in result?result.waitMs!:result.progress?'1 second':checks<=20?'30 seconds':checks<=45?'2 minutes':'10 minutes');
  }
  await step.do('end-bounded-delivery',()=>deliveryStatus(id,owner,'expired','Automatic checking ended. Prepare photo delivery again when ready.'));
 }
}
