import { artworkPlacement } from "../../placement-math.ts";
type TemplateImage = { id?: string; src?: string; x?: number; y?: number; scale?: number; angle?: number };
type TemplateArea = {
  variant_ids: number[];
  placeholders: Array<{ position: string; images?: TemplateImage[] }>;
  background?: string;
};

export type ArtworkAssignment = {
  /** The exact Printify placeholder, normally `front` or `back`. */
  position: string;
  /** Printify variant ids receiving this artwork on this side. */
  variantIds: number[];
  /** A caller-owned key resolved to the freshly uploaded Printify image id. */
  artworkKey: string;
  bounds?: { left: number; top: number; right: number; bottom: number };
  maxPlacementScale?: number;
};

/* D614 - internal label placeholders are excluded from new products.

   D594 saw a small copy of the design at the collar and concluded the seller had
   deliberate neck-label branding worth preserving. That was the wrong reading.
   The design was at the collar because the code was writing it into EVERY
   populated placeholder - the collar copy was the bug's symptom, not the
   seller's artwork.

   The "neck" entry lives in Printify's internal product data. It is provider
   metadata or a generated asset; nothing in the seller's setup selected an
   inside-label as a feature. So D594 preserved something that was never chosen,
   and to do it, it carried the template product's own image IDs into new product
   requests. Printify rejected those with 400 / 8253, "Provided images do not
   exist", and every draft failed for six hours.

   D613 then tried to re-upload that artwork to get a valid ID, which invented a
   further requirement and broke the flow a different way.

   The rule is simply: Goldie prints on the print side the seller chose. Internal
   label, neck, collar, inner and tag placeholders are left out of the payload
   entirely - not copied, not re-uploaded, and never given the design. */
const LABEL_POSITION = /neck|label|collar|inner|tag/i;

export function isLabelPlaceholder(position?: string) {
  return LABEL_POSITION.test(String(position || ""));
}

/* Whether the saved product carries artwork in one of those internal
   placeholders, so the seller can be told plainly that it is not carried over. */
export function templateHasLabelArtwork(areas: TemplateArea[] | undefined) {
  return Boolean(areas?.some((area) => area.placeholders?.some((placeholder) =>
    isLabelPlaceholder(placeholder.position) && (placeholder.images?.length ?? 0) > 0)));
}

/* D884 - a second print side is a charge, so it is never assumed.

   This is the path taken when the seller uploaded one design and assigned no
   per-colour or back artwork. It wrote that design into EVERY populated
   placeholder the saved product carried. On a template that keeps a back print
   area - which is the entire point of a product saved as "back print" - one
   uploaded design was printed front AND back, and Printify charged the second
   location on every garment colour. Measured on the deployed build: 18.54 a
   unit against 12.38 for the same shirt with one print, a silent 6.16 the
   seller never asked for. The listing's own artwork summary said "back: none"
   the whole time, so nothing on screen disagreed with the invoice.

   Goldie prints where the seller put artwork. One design means the front. A
   back print is added deliberately, in the artwork step, and shows up in the
   cost review before it is approved. The only exception is a product with no
   front-ish side at all, where the back IS the print side and skipping it
   would produce a blank garment. */
export function isBackPlaceholder(position?: string) {
  return /back/i.test(String(position || ""));
}

export function printAreasWithOnlyCurrentArtwork(areas: TemplateArea[], currentImageId: string, bounds?:{left:number;top:number;right:number;bottom:number}, maxPlacementScale?:number) {
  if (!currentImageId) throw new Error("The current Printify image ID is missing.");
  const printableSides = areas.flatMap((area) => area.placeholders
    .filter((placeholder) => placeholder.images?.[0] && !isLabelPlaceholder(placeholder.position))
    .map((placeholder) => placeholder.position));
  const backIsTheOnlySide = printableSides.length > 0 && printableSides.every(isBackPlaceholder);
  const result = areas.map((area) => ({
    variant_ids: area.variant_ids,
    placeholders: area.placeholders.flatMap((placeholder) => {
      const placement = placeholder.images?.[0];
      if (!placement) return [];
      /* Left out of the request altogether. */
      if (isLabelPlaceholder(placeholder.position)) return [];
      if (isBackPlaceholder(placeholder.position) && !backIsTheOnlySide) return [];
      const resolved = artworkPlacement(placement, bounds, maxPlacementScale);
      return [{
        position: placeholder.position,
        images: [{
          id: currentImageId,
          x: resolved.x,
          y: resolved.y,
          scale: resolved.scale,
          angle: resolved.angle,
        }],
      }];
    }),
    ...(area.background ? { background: area.background } : {}),
  })).filter((area) => area.placeholders.length > 0);

  /* Every image ID leaving here must be the one uploaded for THIS request.
     D594 narrowed this guard to print sides, which is exactly how the inherited
     label ID escaped. There is nothing to exempt now: labels are gone. */
  const outgoing = result.flatMap((area) => area.placeholders.flatMap((placeholder) => placeholder.images.map((image) => image.id)));
  if (outgoing.some((id) => id !== currentImageId)) {
    throw new Error("Goldie blocked a draft containing an inherited template image ID.");
  }
  if (result.some((area) => area.placeholders.some((placeholder) => isLabelPlaceholder(placeholder.position)))) {
    throw new Error("Goldie blocked a draft that would write to an inside-label placeholder.");
  }
  return result;
}

/**
 * Build Printify print areas for artwork that varies by garment variant and/or
 * print side. The saved product remains the source of placement geometry; only
 * freshly uploaded artwork ids may leave this function.
 *
 * Printify groups variants into print areas. A colour-artwork mapping may split
 * one saved area into several outgoing areas, each retaining the placement for
 * the requested side. Front and back assignments may coexist for the same
 * variants in the same outgoing area when they use the same artwork grouping.
 */
export function printAreasForArtworkAssignments(
  areas: TemplateArea[],
  assignments: ArtworkAssignment[],
  uploadedImageIds: Record<string, string>,
) {
  if (!assignments.length) throw new Error("Choose artwork for at least one print area.");
  const canonicalPosition=(position:string)=>/front|chest/i.test(position)?"front":/back/i.test(position)?"back":position.toLowerCase();

  const claimed = new Set<string>();
  for (const assignment of assignments) {
    if (!assignment.artworkKey || !uploadedImageIds[assignment.artworkKey]) {
      throw new Error(`Artwork for ${assignment.position || "a print area"} was not uploaded.`);
    }
    if (isLabelPlaceholder(assignment.position)) {
      throw new Error("Goldie blocked artwork assigned to an inside-label placeholder.");
    }
    for (const variantId of assignment.variantIds) {
      const key = `${canonicalPosition(assignment.position)}:${variantId}`;
      if (claimed.has(key)) throw new Error(`Variant ${variantId} has more than one artwork assignment for ${assignment.position}.`);
      claimed.add(key);
    }
  }

  const result: Array<{ variant_ids: number[]; placeholders: Array<{ position: string; images: Array<{ id: string; x: number; y: number; scale: number; angle: number }> }>; background?: string }> = [];
  for (const area of areas) {
    const grouped=new Map<string,{variant_ids:number[];placeholders:Array<{position:string;images:Array<{id:string;x:number;y:number;scale:number;angle:number}>}>;background?:string}>();
    for(const variantId of area.variant_ids){
      const matching=assignments.filter(assignment=>assignment.variantIds.includes(variantId));
      if(!matching.length)continue;
      const placeholders=matching.map(assignment=>{
        const requestedPosition=assignment.position.toLowerCase();
        const matchesPosition=(actual:string)=>actual.toLowerCase()===requestedPosition||(requestedPosition==="front"&&/front|chest/i.test(actual))||(requestedPosition==="back"&&/back/i.test(actual));
        const placeholder=area.placeholders.find(candidate=>matchesPosition(candidate.position));
        if(!placeholder?.images?.[0])throw new Error(`The saved Printify product does not have prepared placement for ${assignment.position}.`);
        const placement=artworkPlacement(placeholder.images[0],assignment.bounds,assignment.maxPlacementScale);
        return {position:placeholder.position,images:[{id:uploadedImageIds[assignment.artworkKey],x:placement.x,y:placement.y,scale:placement.scale,angle:placement.angle}]};
      }).sort((left,right)=>left.position.localeCompare(right.position));
      const signature=JSON.stringify(placeholders);
      const existing=grouped.get(signature);
      if(existing)existing.variant_ids.push(variantId);
      else grouped.set(signature,{variant_ids:[variantId],placeholders,...(area.background?{background:area.background}:{})});
    }
    result.push(...grouped.values());
  }

  const requested = new Set(assignments.flatMap((assignment) => assignment.variantIds.map((id) => `${canonicalPosition(assignment.position)}:${id}`)));
  const produced = new Set(result.flatMap((area) => area.placeholders.flatMap((placeholder) => area.variant_ids.map((id) => `${canonicalPosition(placeholder.position)}:${id}`))));
  const missing = [...requested].filter((key) => !produced.has(key));
  if (missing.length) throw new Error(`The saved Printify product cannot print ${missing.length} selected artwork assignment${missing.length === 1 ? "" : "s"}.`);

  const allowedIds = new Set(Object.values(uploadedImageIds));
  const outgoingIds = result.flatMap((area) => area.placeholders.flatMap((placeholder) => placeholder.images.map((image) => image.id)));
  if (outgoingIds.some((id) => !allowedIds.has(id))) {
    throw new Error("Goldie blocked a draft containing an inherited template image ID.");
  }
  return result;
}
