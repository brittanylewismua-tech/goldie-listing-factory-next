export function validEtsyTags(values:string[]){
  return [...new Set(values.map(value=>value.trim().toLocaleLowerCase()).filter(value=>value&&value.length<=20))].slice(0,13);
}

export function completedGeneratedTags(returned:string[],selected:string[],bank:string[]){
  return validEtsyTags([...returned,...selected,...bank]);
}
