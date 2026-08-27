import { artworkPlacement } from "../../placement-math.ts";
type TemplateImage = { id?: string; src?: string; x?: number; y?: number; scale?: number; angle?: number };
type TemplateArea = {
  variant_ids: number[];
  placeholders: Array<{ position: string; images?: TemplateImage[] }>;
  background?: string;
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

export function printAreasWithOnlyCurrentArtwork(areas: TemplateArea[], currentImageId: string, bounds?:{left:number;top:number;right:number;bottom:number}, maxPlacementScale?:number) {
  if (!currentImageId) throw new Error("The current Printify image ID is missing.");
  const result = areas.map((area) => ({
    variant_ids: area.variant_ids,
    placeholders: area.placeholders.flatMap((placeholder) => {
      const placement = placeholder.images?.[0];
      if (!placement) return [];
      /* Left out of the request altogether. */
      if (isLabelPlaceholder(placeholder.position)) return [];
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
