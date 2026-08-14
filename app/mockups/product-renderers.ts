export type ProductKind = "apparel" | "soft-goods" | "curved" | "irregular";

export function rendererFor(kind: ProductKind) {
  return kind === "apparel"
    ? "fal-ai/qwen-image-edit-plus-lora-gallery/shirt-design"
    : "fal-ai/bytedance/seedream/v5/lite/edit";
}

export function rendererInput(kind:ProductKind,imageUrls:string[]){
  const prompt=promptFor(kind,imageUrls.length>2);
  return kind==="apparel"
    ? {image_urls:imageUrls,prompt,guidance_scale:1,num_inference_steps:8,acceleration:"regular",negative_prompt:"altered text, misspelled words, changed artwork, extra graphics, warped letters, fake logo, changed person, changed background, floating print, print outside product",enable_safety_checker:true,output_format:"png",num_images:1,lora_scale:1}
    : {image_urls:imageUrls,prompt,image_size:"auto_2K",num_images:1,max_images:1,enable_safety_checker:true};
}

export function promptFor(kind: ProductKind, hasReference: boolean) {
  if (kind === "apparel") return [
    "Put the exact design from the second image onto the garment in the first image.",
    "Preserve every word, letter, color, shape, spacing, and design detail exactly.",
    "Make the print follow the garment fabric, folds, perspective, lighting, and shadows naturally.",
    "Keep the person, garment, pose, background, and image composition unchanged.",
    hasReference ? "Use the third image only as the placement reference. Match the design's relative width, height, center position, and scale on the garment." : "Place the design naturally in the centered chest print area.",
    "Do not add, remove, rewrite, restyle, crop, or regenerate any part of the design.",
  ].join(" ");
  if (kind === "soft-goods") return [
    "Put the exact design from the second image onto the soft product in the first image.",
    "Preserve every word, letter, color, shape, spacing, and design detail exactly.",
    "Make the print follow the product fabric, seams, folds, perspective, lighting, and shadows naturally.",
    hasReference ? "Use the third image only as the placement reference. Match the design's relative scale, position, and orientation." : "Use a centered, commercially realistic printable placement.",
    "Keep the product, scene, and composition unchanged. Do not add, remove, rewrite, restyle, crop, or regenerate any part of the design.",
  ].join(" ");
  return [
    "Apply the exact design from the second image to the product in the first image.",
    "Preserve every word, letter, color, shape, spacing, and design detail exactly.",
    kind === "curved" ? "Wrap it naturally around the visible curved printable surface with correct perspective, lighting, highlights, and shadows." : "Conform it naturally to the visible product shape and printable surface with correct perspective, lighting, and shadows.",
    hasReference ? "Use the third image only as the placement reference. Match relative size, position, orientation, and visible coverage." : "Use a centered, commercially realistic placement.",
    "Keep the scene and product unchanged. Do not add, remove, rewrite, restyle, crop, or regenerate any part of the design.",
  ].join(" ");
}
