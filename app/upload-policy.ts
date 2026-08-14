export const MAX_FILE_BYTES = 60 * 1024 * 1024;

export function isPermanentUploadError(message:string){
  return /\b(?:400|401|403|413)\b|post data is too large|file is too large|token|template product was not found|not a recognized|could not be decoded|could not be read|valid PNG or JPG|file contents do not match|does not belong to the signed-in account|batch session expired/i.test(message);
}

export function oversizedFileMessage(name:string,size:number){
  return `${name} is ${(size/1024/1024).toFixed(1)} MB. Printify cannot accept this upload format at that size. Export an optimized PNG or JPG under 60 MB without reducing the pixel dimensions needed for 300 DPI.`;
}
