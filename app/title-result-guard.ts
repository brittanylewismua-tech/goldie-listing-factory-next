type EditableTitle={id:string;title:string;tags:string[]};
type Ticket={scope:string;id:string;revision:number};

/** Reject a generated title after any intervening seller edit or scope change,
 * including an edit that is subsequently changed back to its original value. */
export function titleResultGuard(){
  let scope="",revision=0;
  const entries=new Map<string,{fingerprint:string;revision:number}>();
  return {
    update(nextScope:string,designs:EditableTitle[]){
      if(scope!==nextScope){scope=nextScope;entries.clear();revision++;}
      const present=new Set(designs.map(design=>design.id));
      for(const id of entries.keys())if(!present.has(id))entries.delete(id);
      for(const design of designs){
        const fingerprint=JSON.stringify([design.title,design.tags]);
        if(entries.get(design.id)?.fingerprint!==fingerprint)entries.set(design.id,{fingerprint,revision:++revision});
      }
    },
    begin(id:string):Ticket|null{
      const entry=entries.get(id);if(!entry)return null;
      entry.revision=++revision;
      return {scope,id,revision:entry.revision};
    },
    current(ticket:Ticket|null){return Boolean(ticket&&ticket.scope===scope&&entries.get(ticket.id)?.revision===ticket.revision);},
    inScope(expected:string){return scope===expected;},
    clear(){entries.clear();revision++;},
  };
}
