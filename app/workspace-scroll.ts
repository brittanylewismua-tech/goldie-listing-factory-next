/** The fixed shell scrolls .factory-main, not the browser window. */
export function scrollWorkspaceTo(target:Element|null){
 if(!target)return;
 const panel=target.closest<HTMLElement>('.factory-main');
 if(panel){panel.scrollTo(0,Math.max(0,panel.scrollTop+target.getBoundingClientRect().top-panel.getBoundingClientRect().top-88));return;}
 window.scrollTo(0,Math.max(0,target.getBoundingClientRect().top+window.scrollY-24));
}
