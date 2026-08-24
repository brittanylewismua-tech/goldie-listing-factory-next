export function parseCsvRow(line: string) {
  const cells: string[] = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (character === '"') quoted = !quoted;
    else if ((character === "," || character === "\t") && !quoted) { cells.push(value.trim()); value = ""; }
    else value += character;
  }
  cells.push(value.trim());
  return cells;
}

const HEADER = /^(keyword|keywords|phrase|search term|tag|title)$/i;

export function phrasesFromErank(raw: string) {
  const rows = raw.split(/\r?\n/).map((line) => parseCsvRow(line)).filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  const headerIndex = rows[0].findIndex((cell) => HEADER.test(cell.trim()));
  let values: string[];
  if (headerIndex >= 0) values = rows.slice(1).map((row) => row[headerIndex] || "");
  else if (rows.length > 1 && rows.filter((row) => row.length > 1 && row.slice(1).some((cell) => /^[$%\d,.]+$/.test(cell))).length >= Math.ceil(rows.length / 2)) values = rows.map((row) => row[0]);
  else values = rows.flat();
  /* D450 · Two things a real paste puts in here, both found by pasting one.
   *
   * Duplicates are exact matches only. A plural is not a duplicate of its
   * singular, and a deliberate misspelling is not a duplicate of the correct
   * spelling - those are separate keywords with their own eRank data, and
   * collapsing them would throw away research she paid for. Case is left alone
   * here for the same reason: what she typed is what her bank keeps.
   *
   * Two tags differing only by case would be refused by Etsy, so that collision
   * is resolved where tags are chosen for a listing, not by editing her bank.
   *
   * And a phrase longer than a title can hold is not a keyword. An Etsy title is
   * 140 characters; her longest real phrase is 33. A 113-character line pasted by
   * accident used to be stored and could be selected, taking most of the title on
   * its own. */
  const MAX_PHRASE = 60;
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const value of values) {
    const phrase = value.trim();
    if (!phrase || HEADER.test(phrase) || /^[$%\d,.]+$/.test(phrase)) continue;
    if (phrase.length > MAX_PHRASE) continue;
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    phrases.push(phrase);
  }
  return phrases;
}

export function tagsFromTitle(title: string) {
  const phrases = title.split(/[,|]/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  // Etsy treats a tag as one phrase. Splitting a validated bank phrase creates
  // fragments the seller never researched, so long phrases stay title-only.
  return [...new Set(phrases.filter((phrase) => phrase.length > 1 && phrase.length <= 20))].slice(0, 13);
}

export function titlesFromCsv(raw: string) {
  const rows = raw.split(/\r?\n/).map((line) => parseCsvRow(line)).filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  const titleIndex = rows[0].findIndex((cell) => /^title$/i.test(cell.trim()));
  return (titleIndex >= 0 ? rows.slice(1).map((row) => row[titleIndex]) : rows.map((row) => row[0]))
    .map((value) => value?.trim()).filter(Boolean) as string[];
}
