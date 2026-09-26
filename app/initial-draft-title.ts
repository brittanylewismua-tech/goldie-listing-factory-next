/** A filename is a temporary provider title, not seller-written listing copy.
 * Printify rejects excessive capitals, including ordinary ALL_CAPS uploads.
 * Normalize only the fallback; preserve every explicit seller title. */
export function initialDraftTitle(title: string | undefined, fileName: string): string {
  if (title?.trim()) return title.trim().slice(0, 255);
  const name = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const letters = name.match(/\p{L}/gu) ?? [];
  const capitals = letters.filter(letter => letter !== letter.toLocaleLowerCase()).length;
  const readable = letters.length > 3 && capitals / letters.length > 0.6
    ? name.toLocaleLowerCase().replace(/^\p{L}/u, letter => letter.toLocaleUpperCase())
    : name;
  return readable.slice(0, 255) || "Untitled design";
}
