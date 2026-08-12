export function base64FromBytes(bytes: Uint8Array) {
  let encoded = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    encoded += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(encoded);
}

export function printifyUploadPayload(fileName: string, bytes: Uint8Array) {
  return { file_name: fileName, contents: base64FromBytes(bytes) };
}
