/** A definite capacity refusal means the mutation was not accepted. Never use this for timeouts or 5xx. */
export class EtsyRateLimited extends Error {}
export const RESERVE_ETSY_SLOT_SQL=`UPDATE etsy_request_pacing SET next_at_ms=MAX(next_at_ms,?1)+?2,updated_at=?3 WHERE id=1 AND next_at_ms<=?1+30000 RETURNING next_at_ms`;
export function etsyRequestInterval(qps:number){return Math.ceil(1000/Math.max(1,Math.floor((Number.isFinite(qps)&&qps>0?qps:5)*.7)))}
export async function paceEtsyRequest(io:{now():number;read():Promise<{pausedUntil:number;qps:number}>;reserve(now:number,interval:number):Promise<number|null>;wait(ms:number):Promise<void>}){
 let state=await io.read();if(state.pausedUntil>io.now())throw new EtsyRateLimited('Etsy asked Goldie to slow down. Your saved work will continue automatically.');
 const interval=etsyRequestInterval(state.qps),slot=await io.reserve(io.now(),interval);
 if(slot===null)throw new EtsyRateLimited('Your batch is queued behind other saved work. Goldie will continue automatically.');
 const delay=Math.max(0,slot-interval-io.now());
 if(delay>30000)throw new EtsyRateLimited('Your batch is queued behind other saved work. Goldie will continue automatically.');
 if(delay)await io.wait(delay);
 // Another worker may have received a cooldown while this request waited for its slot.
 state=await io.read();if(state.pausedUntil>io.now())throw new EtsyRateLimited('Etsy asked Goldie to slow down. Your saved work will continue automatically.');
}
