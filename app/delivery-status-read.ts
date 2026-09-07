/** An unreadable receipt response cannot mean that no draft exists. */
export async function readDeliveryStatus<T>(response:Response):Promise<T[]>{
 if(response.status===401)throw Error('Sign in to Goldie in another tab, then choose Check saved progress here. Your saved drafts have not been changed.');
 const payload=await response.json() as {error?:string;deliveries?:T[]};
 if(!response.ok)throw Error(payload.error||'Photo delivery status could not be loaded.');
 if(!Array.isArray(payload.deliveries))throw Error('Saved progress could not be read. Choose Check saved progress to try again.');
 return payload.deliveries;
}
