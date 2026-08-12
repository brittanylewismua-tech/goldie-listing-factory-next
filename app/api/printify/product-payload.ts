type TemplateImage = { id?: string; x?: number; y?: number; scale?: number; angle?: number };
type TemplateArea = {
  variant_ids: number[];
  placeholders: Array<{ position: string; images?: TemplateImage[] }>;
  background?: string;
};

export function printAreasWithOnlyCurrentArtwork(areas: TemplateArea[], currentImageId: string) {
  if (!currentImageId) throw new Error("The current Printify image ID is missing.");
  const result = areas.map((area) => ({
    variant_ids: area.variant_ids,
    placeholders: area.placeholders.flatMap((placeholder) => {
      const placement = placeholder.images?.[0];
      if (!placement) return [];
      return [{
        position: placeholder.position,
        images: [{
          id: currentImageId,
          x: placement.x ?? 0.5,
          y: placement.y ?? 0.5,
          scale: placement.scale ?? 1,
          angle: placement.angle ?? 0,
        }],
      }];
    }),
    ...(area.background ? { background: area.background } : {}),
  })).filter((area) => area.placeholders.length > 0);

  const outgoingIds = new Set(result.flatMap((area) => area.placeholders.flatMap((placeholder) => placeholder.images.map((image) => image.id))));
  if (outgoingIds.size !== 1 || !outgoingIds.has(currentImageId)) {
    throw new Error("Goldie blocked a draft containing an inherited template image ID.");
  }
  return result;
}
