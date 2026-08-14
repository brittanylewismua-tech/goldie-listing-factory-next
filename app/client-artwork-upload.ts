export const MAX_DIRECT_PRINTIFY_BYTES = 40 * 1024 * 1024;

function jpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Goldie could not optimize this artwork.")),
    "image/jpeg",
    quality,
  ));
}

export async function prepareArtworkFile(file: File, hasTransparency: boolean) {
  if (file.size <= MAX_DIRECT_PRINTIFY_BYTES) return { blob: file as Blob, fileName: file.name };
  if (hasTransparency) throw new Error("This transparent PNG is too large for Printify's upload request. Export an optimized transparent PNG under 40 MB; keep the same pixel dimensions so the DPI does not change.");

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("Goldie could not optimize this artwork."); }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  let blob = await jpegBlob(canvas, .94);
  if (blob.size > MAX_DIRECT_PRINTIFY_BYTES) blob = await jpegBlob(canvas, .86);
  if (blob.size > MAX_DIRECT_PRINTIFY_BYTES) throw new Error("This artwork is still too large after safe optimization. Export an optimized JPG under 40 MB; keep the same pixel dimensions so the DPI does not change.");
  return { blob, fileName: file.name.replace(/\.[^.]+$/, "") + "-goldie-optimized.jpg" };
}
