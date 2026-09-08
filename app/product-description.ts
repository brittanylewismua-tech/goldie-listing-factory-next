export function normalizeProductDescription(value:string|undefined|null){
  return String(value||"")
    .replace(/\r\n?/g,"\n")
    .replace(/\s*\.\:\s*/g,"\n• ")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}
