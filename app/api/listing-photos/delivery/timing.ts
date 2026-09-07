/** Automatic transfers are already hidden and unlocked before candidate confirmation.
 * Keep a second independent link read; legacy active-photo delivery retains its longer grace period.
 */
export function candidateWaitMs(automatic:boolean,seenAt:number|null,now:number){
 const settle=automatic?5000:30000;
 return seenAt===null?settle:Math.max(0,settle-(now-seenAt));
}
/** Poll quickly only while a recent automatic transfer is processing, then retain bounded backoff. */
export function transferPollMs(transfer:{phase:string;submittedAt?:number}|null,now:number){
 return transfer&&['submitted','accepted'].includes(transfer.phase)&&typeof transfer.submittedAt==='number'&&now-transfer.submittedAt<120000?10000:undefined;
}
