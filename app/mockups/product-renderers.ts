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
    hasReference ? "@image3 is this exact product with this exact artwork already placed on it by Printify. That placement is the specification and it is not yours to improve. Reproduce it: the artwork must sit at the same position on the product's printable area, cover the same proportion of that area, and carry the same orientation and cropping as it does in @image3. Measure both position and size against the product itself - its own edges, width and height - never against the photo frame. Take nothing else from @image3: not its product colour, not its background, not its lighting, not its angle." : "Place the artwork on the product's main printable area, centred on it, at the size a print shop would use for that product - about half the visible width of the printable area. Do not place it on a sleeve, edge, seam, handle, or fold, and do not rotate, mirror, crop, or extend it.",
    "The only visible change between the original first image and the result should be the design printed on the original garment.",
  ].join(" ");
  if (kind === "soft-goods") return [
    "Put the exact design from the second image onto the soft product in the first image.",
    "Preserve every word, letter, color, shape, spacing, and design detail exactly.",
    "Make the print follow the product fabric, seams, folds, perspective, lighting, and shadows naturally.",
    hasReference ? "the third image is this exact product with this exact artwork already placed on it by Printify. That placement is the specification and it is not yours to improve. Reproduce it: the artwork must sit at the same position on the product's printable area, cover the same proportion of that area, and carry the same orientation and cropping as it does in the third image. Measure both position and size against the product itself - its own edges, width and height - never against the photo frame. Take nothing else from the third image: not its product colour, not its background, not its lighting, not its angle." : "Use a centered, commercially realistic printable placement.",
    "Keep the product, scene, and composition unchanged. Do not add, remove, rewrite, restyle, crop, or regenerate any part of the design.",
  ].join(" ");
  return [
    "Apply the exact design from the second image to the product in the first image.",
    "Preserve every word, letter, color, shape, spacing, and design detail exactly.",
    kind === "curved" ? "Wrap it naturally around the visible curved printable surface with correct perspective, lighting, highlights, and shadows." : "Conform it naturally to the visible product shape and printable surface with correct perspective, lighting, and shadows.",
    hasReference ? "the third image is this exact product with this exact artwork already placed on it by Printify. That placement is the specification and it is not yours to improve. Reproduce it: the artwork must sit at the same position on the product's printable area, cover the same proportion of that area, and carry the same orientation and cropping as it does in the third image. Measure both position and size against the product itself - its own edges, width and height - never against the photo frame. Take nothing else from the third image: not its product colour, not its background, not its lighting, not its angle." : "Use a centered, commercially realistic placement.",
    "Keep the scene and product unchanged. Do not add, remove, rewrite, restyle, crop, or regenerate any part of the design.",
  ].join(" ");
}
