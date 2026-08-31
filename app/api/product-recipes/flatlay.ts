/* D848 · Which Printify photo a 52px tile can actually read, and which saved
   products still need one. Kept out of the route so it can be tested without a
   Worker: the route's job is fetching, this is the judgement. */

export type ProductImage = { src?: string; is_default?: boolean; position?: string };

export function productIdFromUrl(value: string) {
  const fromPath = (String(value).match(/\/editor\/([a-zA-Z0-9]+)/) || String(value).match(/\/products\/([a-zA-Z0-9]+)/))?.[1];
  if (fromPath) return fromPath;
  const bare = String(value).trim();
  return /^[a-f0-9]{20,32}$/i.test(bare) ? bare : "";
}

/* Printify names the camera angle in `position` and marks one image default.
   A front flatlay is the only one legible at tile size - a back or folded shot
   shrinks to a grey rectangle, which is the defect being fixed. */
export function flatlayOf(images: ProductImage[] | undefined) {
  const usable = (images || []).filter((image) => typeof image.src === "string" && image.src);
  if (!usable.length) return "";
  const front = usable.find((image) => /front/i.test(image.position || ""));
  return (front || usable.find((image) => image.is_default) || usable[0]).src || "";
}

/* A recipe needs a backfill only if it has no photo AND its saved link still
   identifies a product. Anything else would spend a Printify round trip to
   learn nothing. */
export type RecipeLike = { templateUrl?: string | null; previewImage?: unknown };
export function needsPhoto(recipe: RecipeLike) {
  if (typeof recipe.previewImage === "string" && recipe.previewImage) return false;
  return Boolean(productIdFromUrl(String(recipe.templateUrl || "")));
}
