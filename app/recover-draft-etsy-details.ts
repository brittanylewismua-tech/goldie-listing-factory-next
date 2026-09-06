/** Background preparation can finish after its product leaves the screen.
 * Its draft result is durable; recover it only for that exact design and only
 * when the batch has no local Etsy details. Never overwrite the seller's edits. */
export function recoverDraftEtsyDetails<E extends {blurb?:string}, T extends {id:string;etsy?:E;blurb?:string;etsyError?:string}>(
  design:T, draft?:{clientId:string;etsyDetails?:E|null},
):T {
  if(design.etsy||draft?.clientId!==design.id||!draft.etsyDetails)return design;
  return {...design,etsy:draft.etsyDetails,blurb:design.blurb?.trim()?design.blurb:draft.etsyDetails.blurb,etsyError:""};
}
