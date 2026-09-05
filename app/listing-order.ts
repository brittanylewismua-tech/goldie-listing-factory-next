/** Completion order must never become the seller's listing order. */
export function draftsInDesignOrder<T extends {clientId:string}>(drafts:readonly T[],designs:readonly {id:string}[]):T[]{
  const order=new Map(designs.map((design,index)=>[design.id,index]));
  return drafts.map((draft,index)=>({draft,index})).sort((a,b)=>
    (order.get(a.draft.clientId)??designs.length)-(order.get(b.draft.clientId)??designs.length)||a.index-b.index
  ).map(entry=>entry.draft);
}
