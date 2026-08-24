export type ProductKind = "apparel" | "soft-goods" | "curved" | "irregular";

export function rendererFor(_kind: ProductKind) {
  return "fal-ai/flux-2-flex/edit";
}

export function rendererInput(kind:ProductKind,imageUrls:string[]){
  const prompt=promptFor(kind,imageUrls.length>2);
  return {image_urls:imageUrls,prompt,image_size:"auto",output_format:"png",guidance_scale:2.5,num_inference_steps:32,enable_safety_checker:true};
}

export function promptFor(kind: ProductKind, hasReference: boolean) {
  if (kind === "apparel") return [
    "Edit @image1 only. Print the exact artwork from @image2 directly onto the existing garment in @image1.",
    "Do not create, replace, redraw, layer, or paste in a new shirt or garment. The original garment must remain exactly where it is with the same neckline, sleeves, hem, fabric, folds, fit, color, lighting, and shadows.",
    "Preserve every word, letter, color, shape, spacing, and design detail exactly.",
    "Blend only the printed ink into the existing fabric so it follows the garment folds, perspective, lighting, and shadows naturally.",
    "Keep the person, face, hair, hands, body, garment, pose, background, crop, and entire image composition unchanged.",
    /* D412 - "the centered chest print area" is not a placement instruction, it is
       a hope, and without a reference image it was the only thing telling the model
       where the print goes. Describe the standard adult front print the way a print
       shop specifies it - proportionally, since the model is looking at pixels -
       and rule out the places it was actually landing. */
    hasReference ? "Use @image3 only to measure the print's relative width, height, center position, and scale. Do not copy the garment, person, or background from @image3." : "Place the print on the front chest: centred left-to-right on the garment's centre line, with the top edge of the artwork starting just below the collar - roughly one tenth of the way down the garment's visible height from the shoulder seam - and the artwork spanning about half the garment's visible chest width. Do not place it on a sleeve, shoulder, collar, hem, or side seam, do not let it cross the neckline, and do not rotate, mirror, crop, or extend it.",
    "The only visible change between the original first image and the result should be the design printed on the original garment.",
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
