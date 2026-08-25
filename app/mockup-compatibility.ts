/* D543 - one rule, one place. This existed twice: compatibleTemplate() in
   integrated-mockups.tsx and productAcceptsMockup() in listing-factory-app.tsx,
   both answering "may this scene be used for this product". D529 fixed the first
   one after a Ceramic Mug batch was offered ten BACH TEES scenes. The second one
   was never touched, and it is the one that fills the Mockup set dropdown.

   Measured live on her three-product bundle, on Gildan Hoodie: the dropdown
   offered "white mugs" and nothing else. Her ten apparel scenes were hidden and
   four mug scenes were offered for a hoodie - the exact inverse of correct, from
   two separate defects in that copy:
     1. it returned true for any non-apparel scene, so mugs passed for anything
     2. a hoodie demanded surfaceKind==="hoodie" exactly, so her scenes saved as
        the generic "apparel" were all rejected
   Both are gone, because there is now nothing to keep in sync. */

export type SurfaceFamily = "apparel" | "curved" | "flat" | "";

export function garmentKind(productName:string){
  const name=(productName||"").toLowerCase();
  if(/hoodie|hooded/.test(name))return"hoodie";
  if(/sweatshirt|crewneck|sweater/.test(name))return"sweatshirt";
  if(/t[ -]?shirt|\btee\b/.test(name))return"t-shirt";
  return"";
}

export function productSurfaceFamily(productName:string):SurfaceFamily{
  const name=(productName||"").toLowerCase();
  /* D543 - these were bare substrings, and "Stainless Steel Tumbler" was read as
     apparel because "sTEEl" contains "tee". Any product with Steel in its name
     was offered garment scenes. Bounded now, and pinned by test. */
  if(garmentKind(name)||/\bshirts?\b|\btees?\b|hoodie|sweatshirt|crewneck|\btanks?\b|apparel/.test(name))return"apparel";
  if(/mug|tumbler|bottle|can |cup|stein/.test(name))return"curved";
  if(/poster|print|canvas|paper|card|sticker|towel|mat|puzzle/.test(name))return"flat";
  return"";
}

export function templateSurfaceFamily(kind:string):SurfaceFamily{
  if(["t-shirt","sweatshirt","hoodie","other-apparel","apparel"].includes(kind))return"apparel";
  if(kind==="curved")return"curved";
  return"flat";
}

/* The one answer. An unrecognised product still sees everything - guessing wrong
   should not hide her own scenes. A recognised one only sees its own surface. */
export function productAcceptsMockup(surfaceKind:string,productName:string){
  const templateKind=surfaceKind||"rigid-flat";
  const productKind=garmentKind(productName);
  const productFamily=productSurfaceFamily(productName),templateFamily=templateSurfaceFamily(templateKind);
  if(productFamily&&templateFamily!==productFamily)return false;
  if(templateFamily!=="apparel")return true;
  /* A scene saved as the generic "apparel" fits any garment: she photographs a
     flat lay once and uses it for the tee, the crewneck and the hoodie. Only a
     scene that names a different garment is refused. */
  if(!productKind)return templateKind==="other-apparel"||templateKind==="apparel";
  return templateKind===productKind||templateKind==="apparel"||templateKind==="other-apparel";
}
