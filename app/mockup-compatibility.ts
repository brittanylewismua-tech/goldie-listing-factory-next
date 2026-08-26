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
  if(/mug|tumbler|bottle|can |cup|stein|flask|thermos/.test(name))return"curved";
  /* D575 - Goldie is not a garment tool. Shower curtains, notebooks, blankets,
     pillows, phone cases and the rest were matching nothing here, so they fell
     through as unrecognised. They are flat printed surfaces and they belong. */
  if(/poster|print|canvas|paper|card|sticker|towel|mat|puzzle|shower curtain|curtain|notebook|journal|spiral|blanket|throw|tapestry|pillow|cushion|flag|banner|rug|apron|phone case|case\b|mouse ?pad|coaster|magnet|ornament|tote|bag|backpack|pouch|placemat|napkin|duvet|comforter|sheet|beach|garden/.test(name))return"flat";
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

/* D575 - what a print area may plausibly look like on each family, as fractions
   of the photograph. These live here, beside the family classifier, because a
   rule that exists in two places is the bug that offered her hoodie nothing but
   mugs (D529/D543). One family answer, one geometry answer, one module.

   The ceilings matter as much as the floors. A poster, a shower curtain or a
   notebook cover is printed almost edge to edge, so a print area covering most
   of the photograph is correct for them and wrong for a t-shirt. Judging every
   product by the garment rule would have rejected exactly the products she
   named. */
export type PrintAreaBounds = {
  minWidth: number; maxWidth: number; minHeight: number; maxHeight: number;
  minCentreY: number; maxCentreY: number; maxRatio: number;
};

export function printAreaBounds(productName: string): PrintAreaBounds {
  switch (productSurfaceFamily(productName)) {
    case "apparel":
      // A chest or back panel: a fraction of the garment, on the torso.
      return { minWidth: .08, maxWidth: .7, minHeight: .06, maxHeight: .8, minCentreY: .12, maxCentreY: .8, maxRatio: 6 };
    case "curved":
      // The face turned toward the camera, never the whole mug and never the handle.
      return { minWidth: .06, maxWidth: .6, minHeight: .06, maxHeight: .8, minCentreY: .1, maxCentreY: .9, maxRatio: 5 };
    case "flat":
      // Printed nearly edge to edge. The only real limits are "not the entire
      // photograph" and "not a sliver".
      return { minWidth: .05, maxWidth: .96, minHeight: .05, maxHeight: .96, minCentreY: .04, maxCentreY: .96, maxRatio: 8 };
    default:
      // Unrecognised: stay permissive rather than refuse a seller's real product.
      return { minWidth: .04, maxWidth: .96, minHeight: .04, maxHeight: .96, minCentreY: .03, maxCentreY: .97, maxRatio: 8 };
  }
}
