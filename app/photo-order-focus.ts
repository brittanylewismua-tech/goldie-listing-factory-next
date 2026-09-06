// React can blur a focused button when a reorder makes it disabled.
// Keep keyboard users on the moved photo and prefer their current direction.
export function focusPhotoMoveControl(strip:HTMLElement,id:string,direction:-1|1){
  const card=[...strip.querySelectorAll<HTMLElement>('[data-photo-id]')].find(item=>item.dataset.photoId===id);
  if(!card)return;
  const buttons=card.querySelectorAll<HTMLButtonElement>('.photo-order-buttons button');
  const preferred=buttons[direction===-1?0:1];
  const target=preferred&&!preferred.disabled?preferred:[...buttons].find(button=>!button.disabled);
  target?.focus({preventScroll:true});
}
