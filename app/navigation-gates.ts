export type NavigationGateState={
  connected:boolean;etsyConnected:boolean;productSelected:boolean;templateReady:boolean;shippingReady:boolean;variantsReady:boolean;colorsReady:boolean;pricesReady:boolean;designCount:number;designsReady:boolean;etsyShippingProfileReady:boolean;pricingApproved:boolean;draftsComplete:boolean;createdDraftCount:number;titlesReady:boolean;tagsReady:boolean;descriptionReady:boolean;etsyDetailsReady:boolean;personalizationReady:boolean;imagesReady:boolean;
};

export function navigationIssues(index:number,state:NavigationGateState){
  const issues:string[]=[];
  if(index>0&&!state.connected)issues.push("Connect Printify first.");
  if(index>0&&!state.etsyConnected)issues.push("Connect Etsy first.");
  if(index>=2&&!state.productSelected)issues.push("Choose a saved product.");
  if(index>=2&&!state.templateReady)issues.push("Reconnect the saved Printify product.");
  if(index>=2&&!state.shippingReady)issues.push("Import a valid Printify shipping profile.");
  if(index>=2&&!state.variantsReady)issues.push("Enable at least one product variant.");
  if(index>=2&&!state.colorsReady)issues.push("Choose at least one available product color.");
  if(index>=3&&!state.pricesReady)issues.push("The selected colors need available prices.");
  if(index>=3&&!state.designCount)issues.push("Add at least one finished design.");
  if(index>=3&&!state.designsReady)issues.push("Wait for every design check to finish.");
  if(index>=5&&!state.etsyShippingProfileReady)issues.push("Choose the Etsy shipping profile.");
  if(index>=5&&!state.pricingApproved)issues.push("Approve prices and buyer-paid shipping.");
  if(index>=5&&!state.draftsComplete)issues.push("Finish creating the Printify drafts.");
  if(index>=5&&!state.createdDraftCount)issues.push("Create at least one Printify draft.");
  if(index>=6&&!state.titlesReady)issues.push("Finish every listing title.");
  if(index>=6&&!state.tagsReady)issues.push("Finish every listing’s tags.");
  if(index>=6&&!state.descriptionReady)issues.push("Add the reusable product description.");
  if(index>=7&&!state.etsyDetailsReady)issues.push("Review and save every listing’s Etsy details.");
  if(index>=7&&!state.personalizationReady)issues.push("Finish the required personalization settings.");
  if(index>=8&&!state.imagesReady)issues.push("Add at least one photo to every listing.");
  return [...new Set(issues)];
}
