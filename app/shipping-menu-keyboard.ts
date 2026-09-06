type MenuKey={key:string;preventDefault():void;stopPropagation():void};
// Navigation changes focus only; Enter/Space retain the buttons' normal selection.
export function shippingMenuKeyboard(event:MenuKey,root:HTMLElement,close:()=>void){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  const options=[...root.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')];
  if(!options.length)return;
  const index=options.indexOf(root.ownerDocument.activeElement as HTMLButtonElement);
  let next:number;
  if(event.key==='ArrowDown')next=(index+1)%options.length;
  else if(event.key==='ArrowUp')next=index<=0?options.length-1:index-1;
  else if(event.key==='Home'&&index>=0)next=0;
  else if(event.key==='End'&&index>=0)next=options.length-1;
  else return;
  event.preventDefault();options[next].focus();
}
