export function shouldOpenEtsyDetails(details:{category?:string;properties?:Array<{required:boolean;value:string}>}):boolean {
  return !details.category?.trim()||Boolean(details.properties?.some(property=>property.required&&!property.value.trim()));
}
