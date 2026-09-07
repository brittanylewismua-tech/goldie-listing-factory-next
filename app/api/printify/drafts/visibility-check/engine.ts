type Product={id:string;visible?:boolean;is_locked?:boolean;external?:{id?:string|number};title?:string;description?:string;tags?:string[];variants?:unknown[];print_areas?:unknown[]};
export async function checkHiddenSetting(io:{read():Promise<Product>;hide():Promise<void>;backup(product:Product):Promise<void>},write=false){
 const before=await io.read();
 if(before.id!=='6a9c8aad7a375e2c1704b171'||before.title!=='QA Books T-Shirt — Do Not Publish'||before.external?.id||before.is_locked)throw Error('Only the existing, unpublished QA tee can be checked.');
 if(!write)return {id:before.id,visible:before.visible,linked:false,locked:false};
 await io.backup(before);
 if(before.visible!==false)await io.hide();
 const after=await io.read();
 const stable=(p:Product)=>JSON.stringify({id:p.id,title:p.title,description:p.description,tags:p.tags,variants:p.variants,print_areas:p.print_areas});
 if(after.external?.id||after.is_locked||stable(before)!==stable(after))throw Error('QA product changed unexpectedly. No publishing was attempted.');
 return {id:after.id,beforeVisible:before.visible,afterVisible:after.visible,hiddenVerified:after.visible===false,linked:false,locked:false};
}
