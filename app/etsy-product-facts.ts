type Property={label:string;value:string;valueId:number|null;possibleValues:Array<{value_id:number;name:string}>};
/** Keep the displayed fact and Etsy's enum identifier in agreement. */
export function applyProductFacts<T extends {attributes:Record<string,string>;properties?:Property[]}>(details:T,facts:Record<string,string>):T{
  const properties=details.properties?.map(property=>{
    const fact=facts[property.label];if(!fact)return property;
    if(!property.possibleValues.length)return {...property,value:fact,valueId:null};
    const option=property.possibleValues.find(option=>option.name.trim().toLowerCase()===fact.trim().toLowerCase());
    return option?{...property,value:option.name,valueId:option.value_id}:property;
  });
  return {...details,attributes:{...details.attributes,...facts},properties};
}
