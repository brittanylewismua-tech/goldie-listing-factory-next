let period=90;
let selectedId=1;
const byId=id=>document.getElementById(id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[char]);
const units=product=>product[period===90?"units90":"units30"];
const ranked=()=>[...products].sort((a,b)=>units(b)-units(a)||a.id-b.id);
const shopTotal=()=>products.reduce((sum,product)=>sum+units(product),period===90?8:4);
const diagnoses={
  1:"The same artwork is already on a sweatshirt.",
  2:"Its motherhood message is working across products. Check what the current range covers.",
  3:"Compare related tees before making another variation.",
  4:"Six purchases came in the last 30 days. Check what changed.",
  5:"Three purchases are a smaller signal. Verify the format before expanding."
};
const themeExamples={
  90:[["Bodily autonomy",44,3],["Feminist motherhood",30,2],["Anti-patriarchy humor",14,2]],
  30:[["Bodily autonomy",48,3],["Feminist motherhood",28,2],["Anti-patriarchy humor",15,2]]
};
const visibleReviews=[
  {group:0,index:0,tag:"RISING"},
  {group:1,index:0,tag:"EXISTING VERSION"},
  {group:2,index:0,tag:"AVAILABILITY"}
];
function listingButton(product,index){
  return '<button class="listing-choice" type="button" data-product="'+product.id+'" aria-pressed="'+(product.id===selectedId)+'">'
    +'<img src="assets/'+escapeHtml(product.image)+'" alt="">'
    +'<span><b>'+(index+1)+'. '+escapeHtml(product.short)+'</b><small>'+units(product)+' purchased</small></span></button>';
}
function reviewButton(item,group,index,tag){
  return '<button class="review-row" type="button" data-review="'+group+':'+index+'">'
    +'<img src="assets/'+escapeHtml(item.image)+'" alt="">'
    +'<span><small>'+escapeHtml(tag)+'</small><strong>'+escapeHtml(item.title)+'</strong>'
    +'<em>'+escapeHtml(item.brief)+'</em></span><b aria-hidden="true">›</b></button>';
}
function render(){
  const order=ranked();
  if(!order.some(product=>product.id===selectedId))selectedId=order[0].id;
  const selected=order.find(product=>product.id===selectedId);
  const index=order.findIndex(product=>product.id===selectedId);
  const paths=selected.paths.slice(0,3);
  byId("focus").innerHTML='<div class="focus-art"><img src="assets/'+escapeHtml(selected.image)+'" alt="'+escapeHtml(selected.title)+'"></div>'
    +'<div class="focus-body"><div class="pager"><button type="button" id="prev" aria-label="Previous top listing" '+(index===0?'disabled':'')+'>‹</button>'
    +'<span>Listing '+(index+1)+' of '+order.length+'</span><button type="button" id="next" aria-label="Next top listing" '+(index===order.length-1?'disabled':'')+'>›</button></div>'
    +'<h3>'+escapeHtml(selected.title)+'</h3><div class="vote"><strong>'+units(selected)+'</strong><span>units purchased</span><i>·</i><strong>'+Math.round(units(selected)/shopTotal()*100)+'%</strong><span>of shop purchases</span></div>'
    +'<p class="interpret">'+escapeHtml(diagnoses[selected.id])+'</p><h4 class="ideas-head">Ideas and checks</h4>'
    +'<div class="path-list">'+paths.map((path,pathIndex)=>'<button class="path-row" type="button" data-path="'+pathIndex+'"><span>'+escapeHtml(path.title)+'</span><b aria-hidden="true">›</b></button>').join('')+'</div></div>';
  byId("prev").addEventListener("click",()=>{selectedId=order[index-1].id;render()});
  byId("next").addEventListener("click",()=>{selectedId=order[index+1].id;render()});
  document.querySelectorAll("[data-path]").forEach(button=>button.addEventListener("click",()=>openPath(selected,Number(button.dataset.path))));
  byId("listing-strip").innerHTML=order.slice(0,3).map(listingButton).join("");
  byId("more-listing-items").innerHTML=order.slice(3).map((product,offset)=>listingButton(product,offset+3)).join("");
  byId("more-listings").hidden=order.length<=3;
  byId("more-listings").querySelector("summary").textContent="View listings 4–"+order.length;
  document.querySelectorAll("[data-product]").forEach(button=>button.addEventListener("click",()=>{
    selectedId=Number(button.dataset.product);render();
  }));
  byId("period-label").textContent="Last "+period+" days";
  document.querySelectorAll("[data-period]").forEach(button=>button.setAttribute("aria-pressed",String(Number(button.dataset.period)===period)));
  byId("patterns").innerHTML=themeExamples[period].map(([label,percent,count])=>
    '<div class="pattern"><strong>'+escapeHtml(label)+'</strong><span class="percent">'+percent+'%</span>'
    +'<span class="bar" aria-hidden="true"><i style="width:'+percent+'%"></i></span>'
    +'<small>'+count+' related listings in this shop</small></div>').join("");
  byId("reviews").innerHTML=visibleReviews.map(({group,index,tag})=>reviewButton(shopGroups[group].items[index],group,index,tag)).join("");
  byId("deeper-inner").innerHTML=shopGroups.map((group,groupIndex)=>{
    const entries=group.items.map((item,index)=>({item,index}))
      .filter(({index})=>!visibleReviews.some(row=>row.group===groupIndex&&row.index===index));
    return entries.length?'<section class="deep-group"><h3>'+escapeHtml(group.name)+'</h3>'
      +entries.map(({item,index})=>reviewButton(item,groupIndex,index,"SHOP FINDING")).join("")+'</section>':"";
  }).join("");
  document.querySelectorAll("[data-review]").forEach(button=>button.addEventListener("click",()=>{
    const [group,index]=button.dataset.review.split(":").map(Number);
    const item=shopGroups[group].items[index];
    if(item.productId)openPath(products.find(product=>product.id===item.productId),item.path);
    else openDetail(item.detail);
  }));
}
function openPath(product,index){
  const path=product.paths[index];
  openDetail({title:path.title,brief:path.brief,sources:path.sources,checks:path.checks,kicker:product.title});
}
function openDetail(detail){
  byId("dialog-kicker").textContent=detail.kicker||"SHOP FINDING";
  byId("dialog-title").textContent=detail.title;
  byId("dialog-intro").textContent=detail.brief;
  byId("dialog-sources").innerHTML=detail.sources.map(source=>'<span>'+escapeHtml(source)+'</span>').join("");
  byId("dialog-points").innerHTML=detail.checks.map(check=>'<li>'+escapeHtml(check)+'</li>').join("");
  byId("detail").showModal();
}
document.querySelectorAll("[data-period]").forEach(button=>button.addEventListener("click",()=>{
  period=Number(button.dataset.period);
  selectedId=ranked()[0].id;
  render();
}));
byId("dialog-close").addEventListener("click",()=>byId("detail").close());
byId("detail").addEventListener("click",event=>{if(event.target===byId("detail"))byId("detail").close()});
render();
