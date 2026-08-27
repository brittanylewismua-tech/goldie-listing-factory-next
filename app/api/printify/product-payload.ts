import { artworkPlacement } from "../../placement-math.ts";
type TemplateImage = { id?: string; src?: string; x?: number; y?: number; scale?: number; angle?: number };
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

/* D613 - D594 preserved neck-label artwork by passing the SAVED TEMPLATE'S
   image objects straight through. Those objects carry the template product's own
   image IDs, so every new product request went out naming an image that belonged
   to a different product. Printify rejected the whole request with 400 / 8253,
   "Provided images do not exist" - correctly, and about the label, not about the
   design we had just uploaded.

   That is why re-uploading the design never helped: the stale ID stayed in the
   payload on every retry. It is why the failure was perfectly deterministic, why
   it was 400 and never 402/403/429, and why a byte-identical file that worked at
   13:3x failed from 13:47 onward - the moment D594 shipped.

   The rule the file already stated three lines above was the right one:
   only an image uploaded FOR THIS REQUEST may be referenced in it. A label is not
   an exception to that; it just needs its own fresh upload.

   labelImageIds maps each inherited template image ID to a newly uploaded one.
   The caller supplies it. A label with no mapping is a failure, never a silent
   omission - dropping the seller's branding without saying so is exactly the kind
   of quiet damage this codebase keeps having to undo. */
export function printAreasWithOnlyCurrentArtwork(areas: TemplateArea[], currentImageId: string, bounds?:{left:number;top:number;right:number;bottom:number}, maxPlacementScale?:number, labelImageIds?: Map<string, string>) {
  if (!currentImageId) throw new Error("The current Printify image ID is missing.");
  const result = areas.map((area) => ({
    variant_ids: area.variant_ids,
    placeholders: area.placeholders.flatMap((placeholder) => {
      const placement = placeholder.images?.[0];
      if (!placement) return [];
      /* A label keeps its artwork, but never the template's ID for it. */
      if (isLabelPlaceholder(placeholder.position)) {
        const images = (placeholder.images ?? []).map((image) => {
          const replacement = image.id ? labelImageIds?.get(image.id) : undefined;
          if (!replacement) {
            throw new Error("Goldie could not re-upload the neck label artwork for this draft, so it created nothing rather than publish a listing with the label missing. Try again in a moment.");
          }
          return { ...image, id: replacement };
        });
        return [{ position: placeholder.position, images }];
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
  /* D613 - and nothing inherited leaves, from any placeholder. This is the guard
     D594 narrowed away, restored to cover labels as well: every ID in the
     outgoing payload must have been uploaded for THIS request. */
  const inherited = new Set(areas.flatMap((area) => area.placeholders.flatMap((placeholder) => (placeholder.images ?? []).map((image) => image.id))));
  const outgoing = result.flatMap((area) => area.placeholders.flatMap((placeholder) => placeholder.images.map((image) => image.id)));
  const fresh = new Set<string>([currentImageId, ...(labelImageIds ? [...labelImageIds.values()] : [])]);
  /* A replacement that IS the inherited ID is not a replacement. Without this the
     guard could be satisfied by mapping an ID to itself. */
  for (const replacement of labelImageIds?.values() ?? []) {
    if (inherited.has(replacement)) {
      throw new Error("Goldie blocked a draft containing an inherited template image ID.");
    }
  }
  for (const id of outgoing) {
    if (id && inherited.has(id) && !fresh.has(id)) {
      throw new Error("Goldie blocked a draft containing an inherited template image ID.");
    }
  }
  return result;
}
