/** One explicit zone/locale keeps server and browser markup identical. */
export function standardTime(value:string){
 const normalized=value.replace(" ","T");
 const date=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)?normalized:normalized+"Z");
 if(Number.isNaN(date.getTime()))return value;
 return new Intl.DateTimeFormat("en-US",{timeZone:"UTC",timeZoneName:"short",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"}).format(date);
}
