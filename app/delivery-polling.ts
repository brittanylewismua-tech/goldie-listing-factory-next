/** These reads use Goldie's saved receipts, never the Etsy/Printify APIs. */
export function deliveryPollDelay(ageMs:number,failures:number){
 if(failures>0)return Math.min(60000,15000*2**Math.min(failures-1,2));
 return ageMs<120000?5000:15000;
}
