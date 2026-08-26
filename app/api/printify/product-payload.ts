import { artworkPlacement } from "../../placement-math.ts";
type TemplateImage = { id?: string; x?: number; y?: number; scale?: number; angle?: number };
type TemplateArea = {
  variant_ids: number[];
  placeholders: Array<{ position: string; images?: TemplateImage[] }>;
  background?: string;
};

/* D594 - a neck label is not the listing's artwork.

   This replaced the image in EVERY placeholder that had one, so the seller's
   design was printed on the neck label too. Confirmed on a real draft: the
   Printify preview showed the design a second time, small, at the collar, and
   the created product came back with positions ["front","back","neck"] and
   imageCounts [1,0,2].

   Label placeholders keep whatever the saved product had - that artwork is a
   deliberate branding choice and Goldie has no business overwriting it. Only the
   real print sides receive the design. */
const LABEL_POSITION = /neck|label|collar|inner|tag/i;

export function isLabelPlaceholder(position?: string) {
  return LABEL_POSITION.test(String(position || ""));
}

export function printAreasWithOnlyCurrentArtwork(areas: TemplateArea[], currentImageId: string, bounds?:{left:number;top:number;right:number;bottom:number}, maxPlacementScale?:number) {
  if (!currentImageId) throw new Error("The current Printify image ID is missing.");
  const result = areas.map((area) => ({
    variant_ids: area.variant_ids,
    placeholders: area.placeholders.flatMap((placeholder) => {
      const placement = placeholder.images?.[0];
      if (!placement) return [];
      // A label keeps its own artwork, exactly as the saved product had it.
      if (isLabelPlaceholder(placeholder.position)) {
        return [{ position: placeholder.position, images: placeholder.images ?? [] }];
      }
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

  /* The guard still stands, narrowed to where it belongs. Every PRINT SIDE must
     carry this design and nothing inherited - that is the leak it was written to
     catch. Labels are exempt by definition, but the design must never appear on
     one, which is the bug this commit fixes. */
  const printSides = result.flatMap((area) => area.placeholders.filter((p) => !isLabelPlaceholder(p.position)));
  const outgoingIds = new Set(printSides.flatMap((placeholder) => placeholder.images.map((image) => image.id)));
  if (outgoingIds.size !== 1 || !outgoingIds.has(currentImageId)) {
    throw new Error("Goldie blocked a draft containing an inherited template image ID.");
  }
  const labels = result.flatMap((area) => area.placeholders.filter((p) => isLabelPlaceholder(p.position)));
  if (labels.some((placeholder) => placeholder.images.some((image) => image.id === currentImageId))) {
    throw new Error("Goldie blocked a draft that would print the design on a label.");
  }
  return result;
}
