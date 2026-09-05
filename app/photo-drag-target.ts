export type PhotoSlot = {left:number;top:number;width:number;height:number};

// Capture slots before moving cards. Reflow must not move the drop targets.
export function closestPhotoSlot(slots:PhotoSlot[],x:number,y:number):number {
  let target=-1,distance=Infinity;
  slots.forEach((slot,index)=>{
    const next=Math.hypot(x-slot.left-slot.width/2,y-slot.top-slot.height/2);
    if(next<distance){distance=next;target=index;}
  });
  return target;
}

export function movePhotoToSlot(order:string[],source:string,target:number):string[] {
  if(!order.includes(source)||target<0||target>=order.length)return order;
  const next=order.filter(id=>id!==source);
  next.splice(target,0,source);
  return next;
}
