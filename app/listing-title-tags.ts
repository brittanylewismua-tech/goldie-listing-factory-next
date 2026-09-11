export function validEtsyTags(values:string[]){
  return [...new Set(values.map(value=>value.trim().toLocaleLowerCase()).filter(value=>value&&value.length<=20))].slice(0,13);
}

export function completedGeneratedTags(returned:string[],selected:string[],bank:string[]){
  /* A generated result may only use phrases the vision pass actually selected
     for this design.  The old third spread filled every empty Etsy tag slot
     from the rest of the bank.  That turned an intentionally short, relevant
     answer into thirteen unrelated phrases and made a mixed or wrongly chosen
     bank leak "summerween" and "queer shirt" into unrelated artwork. */
  const allowed=new Map(bank.map(value=>[value.trim().toLocaleLowerCase(),value]));
  const selectedFromThisBank=[...returned,...selected]
    .map(value=>allowed.get(value.trim().toLocaleLowerCase()))
    .filter((value):value is string=>Boolean(value));
  return validEtsyTags(selectedFromThisBank);
}
