export async function safeImagePreviewDataUrl(blob:Blob,maxPixels=1200,preserveTransparency=true){
  const bitmap=await createImageBitmap(blob,{resizeWidth:maxPixels,resizeQuality:"high"});
  const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext("2d");if(!context){bitmap.close();throw new Error("Goldie could not prepare a safe visual preview.")}
  if(!preserveTransparency){context.fillStyle="#ffffff";context.fillRect(0,0,canvas.width,canvas.height)}
  context.drawImage(bitmap,0,0);bitmap.close();
  return canvas.toDataURL(preserveTransparency?"image/png":"image/jpeg",preserveTransparency?undefined:.86);
}
